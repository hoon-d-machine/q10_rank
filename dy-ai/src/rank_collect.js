/* Q10 랭킹 수집 (Cloudflare cron) — 예전 csv_logger.py 를 옮긴 것. 결과는 CSV 가 아니라 Supabase q10_rank_log 에 바로 쓴다.
 *   일간: 매일 데일리 뷰티 베스트셀러 200위
 *   주간: 월요일(KST) 공식 랭킹 6개 카테고리 (표가 비어 있으면 요일과 상관없이 한 번)
 *   월간: 매월 1일(KST)
 * 쓰기는 서비스 키(secret SUPABASE_SERVICE_KEY)로. 표는 잠겨 있어 이 키로만 쓸 수 있다 (supabase/rank_log.sql).
 */

const HEADERS = {
  "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  accept: "application/json, text/plain, */*",
  referer: "https://m.qoo10.jp/",
};
const CATEGORIES = [ // [이름, gdlcCd, gdmcCd, gdscCd]
  ["전체", null, null, null],
  ["스킨케어", "120000012", null, null],
  ["스킨케어>화장수", "120000012", "220000159", "320001619"],
  ["스킨케어>미용액", "120000012", "220000159", "320001623"],
  ["베이스", "120000013", null, null],
  ["베이스>루스파우더", "120000013", "220000166", "320001665"],
];
const DAILY_URL = "https://m.qoo10.jp/gmkt.inc/BestSellers/?g=2";
const OFFICIAL_URL = "https://m.qoo10.jp/gmkt.inc/Mobile/Beauty/OfficialRanking.aspx/GetBestSellerBeautyOfficialRanking";

export function kstParts(ms) { // 한국 날짜·요일(월=0)·일
  const d = new Date(ms + 9 * 3600 * 1000);
  return { date: d.toISOString().slice(0, 10), weekday: (d.getUTCDay() + 6) % 7, day: d.getUTCDate() };
}

// ---- 일간 베스트셀러 (HTML) ----
export async function fetchDaily(date) {
  const res = await fetch(DAILY_URL, { headers: HEADERS });
  if (res.status !== 200) throw new Error("일일 베스트셀러 HTTP " + res.status);
  const items = [];
  let cur = null;
  // select_one 처럼 한 상품 안에서는 처음 나온 요소의 글자만 쓴다
  const field = (sel, key) => ({
    element() { if (cur) { cur["n_" + key] = (cur["n_" + key] || 0) + 1; } },
    text(t) { if (cur && cur["n_" + key] === 1) cur[key] = (cur[key] || "") + t.text; },
  });
  const buf = await new HTMLRewriter()
    .on("li[data_gd_no]", { element() { cur = {}; items.push(cur); } })
    .on(".rank_current", field(".rank_current", "rank"))
    .on(".common_ui_seller_brand", field(".common_ui_seller_brand", "brand"))
    .on(".list_v2_title", field(".list_v2_title", "title"))
    .on(".price_final_value", field(".price_final_value", "price"))
    .transform(res).arrayBuffer();
  const rows = [];
  for (const it of items) {
    const rank = parseInt((it.rank || "").trim(), 10);
    const price = parseInt((it.price || "").trim().replace(/,/g, ""), 10);
    const title = (it.title || "").trim();
    if (!Number.isFinite(rank) || rank > 200 || !title || !Number.isFinite(price)) continue;
    rows.push({ rank_date: date, category: "데일리 뷰티", rank, brand: (it.brand || "").trim(), product_name: title, price, period: "daily" });
  }
  if (!rows.length) throw new Error("일일 베스트셀러 상품 0개 (응답 " + buf.byteLength.toLocaleString() + "B, 점검·차단 페이지일 수 있음)");
  return rows;
}

// ---- 공식 주간·월간 랭킹 (JSON) ----
export async function fetchOfficial(period, date) { // period: "W" | "M"
  const periodName = period === "W" ? "주간" : "월간";
  const rows = [];
  for (const [name, gdlc, gdmc, gdsc] of CATEGORIES) {
    const res = await fetch(OFFICIAL_URL, {
      method: "POST",
      headers: { ...HEADERS, "content-type": "application/json" },
      body: JSON.stringify({ gdlcCd: gdlc, gdmcCd: gdmc, gdscCd: gdsc, period, pageNo: 1, pageSize: 100, showMegaoshi: "Y", ___cache_expire___: String(Date.now()) }),
    });
    const text = await res.text();
    let goods;
    try { goods = (JSON.parse(text).d || {}).goods || []; } catch (e) {
      throw new Error(`공식 랭킹(${name}_${periodName}) 응답이 JSON이 아님: HTTP ${res.status}, ${text.length.toLocaleString()}B (점검·차단 페이지일 수 있음)`);
    }
    const seen = new Set();
    for (const it of goods) {
      const rank = parseInt(it.ROW_NUMBER, 10);
      if (!Number.isFinite(rank) || seen.has(rank)) continue;
      seen.add(rank);
      rows.push({
        rank_date: date, category: `${name}_${periodName}`, rank,
        brand: (it.BRAND_INFO && it.BRAND_INFO.BRAND_NM) || "", product_name: it.GD_NM || "",
        price: parseInt(it.FINAL_PRICE || 0, 10) || 0, period: period === "W" ? "weekly" : "monthly",
      });
    }
  }
  if (!rows.length) throw new Error(`공식 랭킹(${periodName}) 모든 카테고리 결과가 비어 있음`);
  return rows;
}

// ---- Supabase ----
function sb(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY 가 없어요");
  return { url: env.SUPABASE_URL.replace(/\/$/, ""), key: env.SUPABASE_SERVICE_KEY };
}

export async function upsertRows(env, rows) {
  const { url, key } = sb(env);
  for (let i = 0; i < rows.length; i += 1000) {
    const res = await fetch(`${url}/rest/v1/q10_rank_log?on_conflict=rank_date,category,rank`, {
      method: "POST",
      headers: { apikey: key, authorization: "Bearer " + key, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + 1000)),
    });
    if (!res.ok) throw new Error("q10_rank_log 업서트 실패 " + res.status + ": " + (await res.text()).slice(0, 200));
  }
}

async function tableEmpty(env, period) {
  const { url, key } = sb(env);
  const res = await fetch(`${url}/rest/v1/q10_rank_log?select=rank_date&period=eq.${period}&limit=1`, { headers: { apikey: key, authorization: "Bearer " + key } });
  if (!res.ok) return false;
  return (await res.json()).length === 0;
}

// 한 번 실행. opt.dry 면 DB 에 쓰지 않고 개수만, opt.only 로 일간/주간/월간 하나만.
export async function collectRank(env, now = Date.now(), opt = {}) {
  const { date, weekday, day } = kstParts(now);
  const out = { date, steps: [], failures: [] };
  const step = async (label, fn) => {
    try {
      const rows = await fn();
      if (!opt.dry) await upsertRows(env, rows);
      out.steps.push({ label, rows: rows.length, sample: opt.dry ? rows.slice(0, 2) : undefined });
    } catch (e) {
      out.failures.push({ label, error: String((e && e.message) || e) });
    }
  };
  const want = (k) => !opt.only || opt.only === k;
  if (want("daily")) await step("일일 베스트셀러", () => fetchDaily(date));
  if (want("weekly") && (weekday === 0 || opt.only === "weekly" || (!opt.dry && await tableEmpty(env, "weekly")))) await step("주간 공식 랭킹", () => fetchOfficial("W", date));
  if (want("monthly") && (day === 1 || opt.only === "monthly" || (!opt.dry && await tableEmpty(env, "monthly")))) await step("월간 공식 랭킹", () => fetchOfficial("M", date));
  return out;
}

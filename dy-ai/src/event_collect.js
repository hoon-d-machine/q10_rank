/* Q10 메가와리(행사) 랭킹 수집 (Cloudflare cron) — 예전 collector.py(GitHub Actions + cron-job.org)를 옮긴 것.
 * 행사 번호(SID)는 secret 이 아니라 DB 의 dy_event_config 에 두고 사이트(행사 랭킹 화면)에서 바꾼다. 꺼져 있거나 비어 있으면 건너뜀.
 * 결과는 qoo10_rankings 에 쌓는다 (collected_at 은 예전처럼 UTC 기준 시각, 화면에서 +9시간).
 */

const UA_MAIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0";
const UA_GOODS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) Gecko/20100101 Firefox/148.0";
const MAX_DETAIL = 150;   // 한 번에 상세 페이지를 열어 보는 새 상품 수 상한 (넘으면 다음 수집 때)
const RANK_TYPES = [["Q", "누적건수"], ["T", "누적금액"]];
const AGES = [0, 10, 20, 30, 40, 50];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sb(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY 가 없어요");
  const url = env.SUPABASE_URL.replace(/\/$/, "");
  const h = { apikey: env.SUPABASE_SERVICE_KEY, "content-type": "application/json" };
  return { url, h };
}
async function rpc(env, name, args) {
  const { url, h } = sb(env);
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, { method: "POST", headers: h, body: JSON.stringify(args || {}) });
  if (!res.ok) throw new Error(`${name} 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// 쿠키 보관 (Worker 의 fetch 에는 쿠키 저장소가 없어서 직접 이어 붙인다)
class Jar {
  constructor() { this.c = {}; }
  absorb(res) {
    const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const line of list) { const kv = line.split(";")[0]; const i = kv.indexOf("="); if (i > 0) this.c[kv.slice(0, i).trim()] = kv.slice(i + 1); }
  }
  header() { return Object.entries(this.c).map(([k, v]) => k + "=" + v).join("; "); }
}

async function getDetail(jar, goodsNo) { // [브랜드, 카테고리 4단, 리뷰수] 중 알아낸 것만
  try {
    const res = await fetch("https://www.qoo10.jp/gmkt.inc/goods/goods.aspx?goodscode=" + encodeURIComponent(goodsNo), {
      headers: { "user-agent": UA_GOODS, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7", cookie: jar.header() },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status !== 200) return null;
    let brandTitle = null, brandText = "", cats = [], review = "";
    let nBrand = 0, nReview = 0;
    await new HTMLRewriter()
      .on("a.title_brand", { element(e) { nBrand++; if (nBrand === 1) brandTitle = e.getAttribute("title"); }, text(t) { if (nBrand === 1) brandText += t.text; } })
      .on("ul.category_depth_list li span", { element() { cats.push(""); }, text(t) { if (cats.length) cats[cats.length - 1] += t.text; } })
      .on(".review_count span", { element() { nReview++; }, text(t) { if (nReview === 1) review += t.text; } })
      .transform(res).arrayBuffer();
    const out = {};
    const brand = (brandTitle || brandText || "").trim();
    if (brand) out.brand = brand;
    const cc = cats.map((s) => s.trim()).filter((s, i) => s || i < cats.length);
    if (cc.length) { while (cc.length < 4) cc.push(""); out.cats = cc.slice(0, 4); }
    const txt = review.trim().replace(/[,()]/g, "");
    if (/^\d+$/.test(txt)) out.review = parseInt(txt, 10);
    return out;
  } catch (e) { return null; }
}

// 한 번 실행. opt.sid 로 SID 지정, opt.dry 면 DB 에 쓰지 않음, opt.force 면 최근 수집 여부와 상관없이
export async function collectEvent(env, now = Date.now(), opt = {}) {
  const out = { steps: [], failures: [] };
  if (opt.probe) return { probe: await getDetail(new Jar(), opt.probe) };   // 상세 페이지 파싱만 시험
  let sid = opt.sid;
  if (!sid) {
    const cfg = await rpc(env, "dy_event_config_read");
    if (!cfg || !cfg.enabled || !cfg.event_sid) { out.skipped = "행사 수집이 꺼져 있거나 SID 가 비어 있어요"; return out; }
    sid = String(cfg.event_sid);
  }
  out.sid = sid;
  const nowTs = new Date(now).toISOString().replace("Z", "");   // UTC, 예전 datetime.now().isoformat() 과 같은 꼴

  if (!opt.dry && !opt.force) { // 같은 행사를 3시간 안에 이미 수집했으면 중복 방지
    const recent = await rpc(env, "dy_event_recent_count", { p_sid: sid, p_since: new Date(now - 3 * 3600 * 1000).toISOString().replace("Z", "") });
    if (recent > 0) { out.skipped = "3시간 안에 이미 수집됨"; return out; }
  }

  const jar = new Jar();
  const hMain = {
    "user-agent": UA_MAIN, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3", "upgrade-insecure-requests": "1",
  };
  const init = await fetch("https://www.qoo10.jp/gmkt.inc/Special/Special.aspx?sid=" + encodeURIComponent(sid), { headers: hMain });
  jar.absorb(init);
  const text = await init.text();
  out.initStatus = init.status;
  if (!init.url.includes("Special.aspx")) { out.skipped = "현재 이벤트 기간이 아니에요 (리다이렉트 발생)"; return out; }
  if (text.includes("Queue-it")) throw new Error("Queue-it 대기열 페이지가 떴어요 (Cloudflare IP 가 차단됐거나 대기열)");

  const hApi = {
    ...hMain, accept: "application/json, text/javascript, */*; q=0.01", "content-type": "application/json; charset=UTF-8",
    origin: "https://www.qoo10.jp", referer: "https://www.qoo10.jp/gmkt.inc/Special/Special.aspx?sid=" + sid, "x-requested-with": "XMLHttpRequest",
  };

  // 기존 상품 정보 캐시 (DB 함수가 상품별 최신 값을 돌려줌): { 상품번호: [브랜드, 대, 중, 소, 리뷰수] }
  let cache = {};
  try { cache = await rpc(env, "dy_event_goods_cache") || {}; } catch (e) { out.cacheWarn = String(e.message || e); }

  const dbRows = [];
  let detailLeft = MAX_DETAIL;
  const fetchOne = async (rCode, rName, groupCode, age, sName) => {
    const payload = { mobileYn: "N", type: rCode, tab: groupCode === 2 ? "C" : "A", groupCode, age, ___cache_expire___: String(Date.now()) };
    const res = await fetch("https://www.qoo10.jp/gmkt.inc/swe_SpecialAjaxService.asmx/GetPromotionRankingData", {
      method: "POST", headers: { ...hApi, cookie: jar.header() }, body: JSON.stringify(payload),
    });
    jar.absorb(res);
    if (res.status !== 200) throw new Error(`${rName}-${sName} HTTP ${res.status}`);
    const d = await res.json();
    let root = null;
    if ("d" in d) root = typeof d.d === "string" ? JSON.parse(d.d) : d.d; else root = d;
    const items = [];
    if (root) {
      if (root.firstItem) items.push(root.firstItem.goods);
      if (root.items) for (const i of root.items) items.push(i.goods);
    }
    if (!items.length) return 0;

    // 처음 보는 상품은 상세 페이지에서 브랜드·카테고리·리뷰 수를 가져온다 (4개씩 동시에)
    const missing = [...new Set(items.map((i) => String(i.GD_NO)))].filter((g) => !(g in cache)).slice(0, Math.max(detailLeft, 0));
    detailLeft -= missing.length;
    for (let i = 0; i < missing.length; i += 4) {
      const part = missing.slice(i, i + 4);
      const got = await Promise.all(part.map((g) => getDetail(jar, g)));
      part.forEach((g, k) => { const r = got[k] || {}; cache[g] = [r.brand || "", r.cats ? r.cats[1] : "", r.cats ? r.cats[2] : "", r.cats ? r.cats[3] : "", r.review || 0]; });
    }

    items.forEach((item, idx) => {
      const g = String(item.GD_NO || "");
      const c = cache[g] || ["", "", "", "", 0];
      let sale = item.FINAL_PRICE || 0;
      if (item.PROMOTION_INFO && item.PROMOTION_INFO[0] && item.PROMOTION_INFO[0].PROMOTION_PRICE) sale = item.PROMOTION_INFO[0].PROMOTION_PRICE;
      dbRows.push({
        event_sid: sid, collected_at: nowTs, rank_type: rName, category: sName, rank: idx + 1,
        brand: c[0], goods_no: g, goods_name: item.GD_NM || "", sale_price: sale, review_count: c[4],
        large_category: c[1], medium_category: c[2], small_category: c[3],
      });
    });
    return items.length;
  };

  for (const [rCode, rName] of RANK_TYPES) {
    const targets = [[2, 0, "뷰티전체"], ...AGES.map((a) => [0, a, a === 0 ? "전연령" : a < 50 ? a + "대" : "50대이상"])];
    for (const [g, a, s] of targets) {
      try { out.steps.push({ label: `${rName}-${s}`, rows: await fetchOne(rCode, rName, g, a, s) }); }
      catch (e) { out.failures.push({ label: `${rName}-${s}`, error: String((e && e.message) || e) }); }
      await sleep(1000);
    }
  }
  out.rows = dbRows.length;
  out.detailFetched = MAX_DETAIL - detailLeft;
  if (!dbRows.length) { out.failures.push({ label: "저장", error: "수집된 데이터가 없습니다" }); return out; }
  if (opt.dry) { out.sample = dbRows.slice(0, 2); return out; }

  const { url, h } = sb(env);
  for (let i = 0; i < dbRows.length; i += 1000) {
    const res = await fetch(`${url}/rest/v1/qoo10_rankings`, {
      method: "POST", headers: { ...h, authorization: "Bearer " + env.SUPABASE_SERVICE_KEY, prefer: "return=minimal" }, body: JSON.stringify(dbRows.slice(i, i + 1000)),
    });
    if (!res.ok) throw new Error("qoo10_rankings 저장 실패 " + res.status + ": " + (await res.text()).slice(0, 200));
  }
  return out;
}

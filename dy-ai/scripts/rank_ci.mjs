/* Q10 랭킹 수집 — GitHub Actions 에서 실행 (.github/workflows/q10-rank.yml)
 * Worker cron 은 Qoo10 이 클라우드플레어 IP 를 막아 523 이 나서, Actions 러너에서 돌린다.
 * 수집 규칙은 src/rank_collect.js 와 같다: 일간은 매일, 주간은 월요일(KST) 또는 표가 비었을 때, 월간은 1일 또는 표가 비었을 때.
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_KEY (필수), ONLY=daily|weekly|monthly (선택), DRY=1 (DB 쓰기 없이 개수만)
 * 사이트 부담을 줄이려고 요청은 순서대로 천천히(robots.txt Crawl-delay 2초), 실패해도 재시도하지 않는다.
 */
import * as cheerio from "cheerio";
import { fetchOfficial, upsertRows, tableEmpty, kstParts } from "../src/rank_collect.js";

const DAILY_URL = "https://m.qoo10.jp/gmkt.inc/BestSellers/?g=2";
const HEADERS = {
  "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  accept: "text/html,application/xhtml+xml",
  referer: "https://m.qoo10.jp/",
};
const DELAY_MS = 2000;

async function fetchDailyNode(date) {
  const res = await fetch(DAILY_URL, { headers: HEADERS });
  const html = await res.text();
  if (res.status !== 200) throw new Error(`일일 베스트셀러 HTTP ${res.status} (${html.length}B)`);
  const $ = cheerio.load(html);
  const first = (el, sel) => $(el).find(sel).first().text().trim();
  const rows = [];
  $("li[data_gd_no]").each((_, li) => {
    const rank = parseInt(first(li, ".rank_current"), 10);
    const price = parseInt(first(li, ".price_final_value").replace(/,/g, ""), 10);
    const title = first(li, ".list_v2_title");
    if (!Number.isFinite(rank) || rank > 200 || !title || !Number.isFinite(price)) return;
    rows.push({ rank_date: date, category: "데일리 뷰티", rank, brand: first(li, ".common_ui_seller_brand"), product_name: title, price, period: "daily" });
  });
  if (!rows.length) throw new Error(`일일 베스트셀러 상품 0개 (HTTP ${res.status}, ${html.length}B, 제목 "${($("title").text() || "").trim().slice(0, 40)}")`);
  return rows;
}

const env = process.env;
const only = env.ONLY || "";
const dry = env.DRY === "1";
const { date, weekday, day } = kstParts(Date.now());
const want = (k) => !only || only === k;
const failures = [];

async function step(label, fn) {
  try {
    const rows = await fn();
    if (!dry) await upsertRows(env, rows);
    console.log(`${label}: ${rows.length}행${dry ? " (DRY, 저장 안 함)" : " 저장"}`);
  } catch (e) {
    console.error(`${label} 실패: ${(e && e.message) || e}`);
    failures.push(label);
  }
}

console.log(`기준일(KST) ${date}, 요일 ${weekday}(월=0), 일 ${day}, only=${only || "-"}, dry=${dry}`);
let ranAny = false;
if (want("daily")) { await step("일일 베스트셀러", () => fetchDailyNode(date)); ranAny = true; }
if (want("weekly") && (weekday === 0 || only === "weekly" || (!dry && await tableEmpty(env, "weekly")))) {
  if (ranAny) await new Promise((r) => setTimeout(r, DELAY_MS));
  await step("주간 공식 랭킹", () => fetchOfficial("W", date, DELAY_MS)); ranAny = true;
}
if (want("monthly") && (day === 1 || only === "monthly" || (!dry && await tableEmpty(env, "monthly")))) {
  if (ranAny) await new Promise((r) => setTimeout(r, DELAY_MS));
  await step("월간 공식 랭킹", () => fetchOfficial("M", date, DELAY_MS));
}
if (failures.length) { console.error("실패:", failures.join(", ")); process.exit(1); } // 실패하면 Actions 가 실패 메일을 보낸다

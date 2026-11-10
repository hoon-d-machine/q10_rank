/* 주간 랭킹 리포트 메일 (Cloudflare cron) — 예전 notifier.py 를 옮긴 것.
 * DB(q10_rank_log)의 일간·주간·월간 랭킹 전체를 시트 3개짜리 xlsx 로 만들어 Resend 로 보낸다.
 * secret: SUPABASE_SERVICE_KEY, RESEND_API_KEY, RECEIVER_EMAIL (쉼표로 여러 명)
 */
import "../extension/xlsx-writer.js";   // self.dyXlsx.buildXlsx (사이트와 같은 xlsx 생성기)
import { kstParts } from "./rank_collect.js";

const SHEETS = [["Daily_All", "daily"], ["Weekly_All", "weekly"], ["Monthly_All", "monthly"]];
const HEADER = ["일자", "카테고리", "순위", "브랜드", "상품명", "가격"];

async function exportRows(env, period) { // 표 안의 그 구분 전체 (DB 함수 dy_rank_export, 서비스 키 전용)
  const url = env.SUPABASE_URL.replace(/\/$/, "");
  const res = await fetch(url + "/rest/v1/rpc/dy_rank_export", {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_KEY, "content-type": "application/json" },
    body: JSON.stringify({ p_period: period }),
  });
  if (!res.ok) throw new Error("dy_rank_export 실패 " + res.status + ": " + (await res.text()).slice(0, 200));
  return res.json();
}

function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function sendResend(env, subject, html, attachments) {
  if (!env.RESEND_API_KEY || !env.RECEIVER_EMAIL) throw new Error("RESEND_API_KEY / RECEIVER_EMAIL secret 이 없어요");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      from: "onboarding@resend.dev",
      to: env.RECEIVER_EMAIL.split(",").map((s) => s.trim()).filter(Boolean),
      subject, html, attachments,
    }),
  });
  if (!res.ok) throw new Error("Resend 실패 " + res.status + ": " + (await res.text()).slice(0, 200));
  return res.json();
}

export async function sendWeeklyReport(env, now = Date.now(), opt = {}) {
  const { date } = kstParts(now);
  const sheets = [];
  for (const [name, period] of SHEETS) sheets.push({ name, header: HEADER, rows: await exportRows(env, period) });
  const counts = sheets.map((s) => s.name + " " + s.rows.length.toLocaleString("ko-KR") + "행");
  if (!sheets.some((s) => s.rows.length)) throw new Error("보낼 랭킹 데이터가 없어요");
  const bytes = await self.dyXlsx.buildXlsx(sheets);
  if (opt.dry) return { date, counts, bytes: bytes.length };
  const r = await sendResend(env, `🚀 Qoo10 누적 데이터 리포트 (${date})`,
    `<p>${date} 기준 리포트입니다.</p><p>${counts.join(" · ")}</p>`,
    [{ content: toBase64(bytes), filename: "Qoo10_Full_Data_Report.xlsx" }]);
  return { date, counts, bytes: bytes.length, id: r.id };
}

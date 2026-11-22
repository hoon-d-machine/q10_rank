/* Q10 행사(메가와리) 랭킹 수집 — GitHub Actions 에서 실행 (.github/workflows/q10-event.yml)
 * Worker cron 은 Qoo10 이 클라우드플레어 IP 를 막아 523 이 나서, 랭킹 수집(rank_ci.mjs)처럼 Actions 러너에서 돌린다.
 * 수집 규칙은 src/event_collect.js 그대로: 행사 기간이 아니면 건너뛰고, SID 가 비었거나 닫혀 있으면 자동 탐색, 3시간 안 중복 수집 방지.
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_KEY (필수), SID (선택, 지정 시 설정·기간 무시), FORCE=1, DRY=1 (DB 쓰기 없이 개수만)
 * 실패가 하나라도 있으면 종료 코드 1 → Actions 실패 알림 메일이 간다.
 */
import { collectEvent } from "../src/event_collect.js";

const env = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY };
const opt = {
  dry: process.env.DRY === "1",
  force: process.env.FORCE === "1",
  sid: (process.env.SID || "").trim() || undefined,
};

try {
  const r = await collectEvent(env, Date.now(), opt);
  const { sample, ...rest } = r;
  console.log(JSON.stringify(rest, null, 2));
  if (sample) console.log("sample", JSON.stringify(sample));
  if (r.skipped) console.log("건너뜀:", r.skipped);
  else console.log(`저장 ${opt.dry ? "(시험, 저장 안 함) " : ""}${r.rows || 0}건 · SID ${r.sid}`);
  if (r.failures && r.failures.length) {
    console.error("실패:\n" + r.failures.map((f) => " - " + f.label + ": " + f.error).join("\n"));
    process.exit(1);
  }
} catch (e) {
  console.error("행사 랭킹 수집 실패:", (e && e.message) || e);
  process.exit(1);
}

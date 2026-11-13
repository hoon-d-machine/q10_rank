/* DY-AI 추가 수집 결과 → Supabase (확장 0.5.0~ 의 extra.js 가 만든 작업 목록을 로그인 사용자 권한으로 반영)
 *   dyQ10Extra.run(extra, log) → Promise<{ done, failed: [{name, message}], errors: [{name, message}], total }>
 *   extra = { jobs: [{ name, fn, args, expect }], errors: [{ name, message }] }   (확장이 수집 중 실패한 묶음은 errors)
 *   - 작업마다 DB 함수(inni_replace_* / inni_upsert_mega_events, supabase/web_collector.sql 3번 구간) 호출 → 반영 행수를 expect 와 비교
 *   - 한 작업이 실패해도 나머지는 계속한다
 * 필요: auth.js(dyAuth), q10-log.js 의 run (없어도 됨)
 */
(function () {
  "use strict";

  function fmt(n) { return Number(n).toLocaleString("ko-KR"); }
  function same(got, expect) {
    if (expect && typeof expect === "object") return Object.keys(expect).every(function (k) { return got && got[k] === expect[k]; });
    return got === expect;
  }
  function show(v) { return v && typeof v === "object" ? JSON.stringify(v) : String(v); }

  async function run(extra, log) {
    var L = log || { step: function () {} };
    var out = { done: 0, failed: [], errors: (extra && extra.errors) || [], total: 0 };
    if (!extra) return out;
    var jobs = extra.jobs || [];
    out.total = jobs.length;
    out.errors.forEach(function (e) { L.step("추가 수집 · " + e.name, "error", "수집 실패: " + e.message); });
    if (!window.dyAuth || !window.dyAuth.client) { out.failed.push({ name: "전체", message: "Supabase 설정이 없어요" }); return out; }
    for (var i = 0; i < jobs.length; i++) {
      var j = jobs[i];
      L.step("추가 · " + j.name, "info", j.fn + " 호출 (" + (typeof j.expect === "number" ? fmt(j.expect) + "행" : show(j.expect)) + ")");
      try {
        var res = await window.dyAuth.client.rpc(j.fn, j.args);
        if (res.error) {
          var m = res.error.message || String(res.error);
          if (/permission denied|Could not find the function/i.test(m)) m += " (Supabase 에 supabase/web_collector.sql 3번 구간을 실행해야 해요)";
          throw new Error(m);
        }
        if (!same(res.data, j.expect)) throw new Error("보낸 " + show(j.expect) + " 중 " + show(res.data) + " 만 반영됐어요");
        out.done++;
        L.step("추가 · " + j.name, "ok", (typeof j.expect === "number" ? fmt(j.expect) + "행" : show(j.expect)) + " 반영 완료");
      } catch (e) {
        out.failed.push({ name: j.name, message: (e && e.message) || String(e) });
        L.step("추가 · " + j.name, "error", (e && e.message) || String(e));
      }
    }
    return out;
  }

  window.dyQ10Extra = { run: run };
})();

/* DY-AI 수집 로그 → Supabase (dy_collect_runs / dy_collect_steps, supabase/web_collector.sql)
 *   var run = dyLog.start({ start, end });       // 수집 한 건
 *   run.step("수집", "info", "메시지", {상세});   // 단계 기록 (level: info | ok | warn | error)
 *   run.end("ok" | "partial" | "error" | "cancel", "요약");
 * 기록은 순서대로 한 줄씩 보낸다. 로그 저장이 실패해도 수집·저장은 멈추지 않는다.
 * 필요: auth.js(dyAuth.client)
 */
(function () {
  "use strict";

  var warned = false;

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, function (c) {
      return (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16);
    });
  }

  function start(info) {
    var client = window.dyAuth && window.dyAuth.client;
    var id = uuid();
    var chain = Promise.resolve();
    var broken = !client;
    var last = "";

    function send(fn) {
      chain = chain.then(function () {
        if (broken) return;
        return fn().then(function (res) {
          if (res && res.error) throw res.error;
        });
      }).catch(function (e) {
        broken = true; // 테이블이 없거나 권한이 없으면 이번 건은 더 보내지 않음
        if (!warned) { warned = true; console.warn("[DY-AI 로그] 저장 실패:", e && (e.message || e)); }
      });
      return chain;
    }

    send(function () {
      return client.from("dy_collect_runs").insert({
        id: id,
        period_start: (info && info.start) || null,
        period_end: (info && info.end) || null
      });
    });

    return {
      id: id,
      step: function (step, level, message, detail) {
        // 같은 진행 문구가 연달아 오면 한 번만
        var key = step + "|" + message;
        if (key === last && !detail) return chain;
        last = key;
        return send(function () {
          return client.from("dy_collect_steps").insert({
            run_id: id, step: step, level: level || "info",
            message: message == null ? null : String(message).slice(0, 2000),
            detail: detail == null ? null : detail,
            ts: new Date().toISOString()
          });
        });
      },
      period: function (s, e) {
        return send(function () {
          return client.from("dy_collect_runs").update({ period_start: s || null, period_end: e || null }).eq("id", id);
        });
      },
      end: function (status, summary) {
        return send(function () {
          return client.from("dy_collect_runs")
            .update({ status: status, summary: summary ? String(summary).slice(0, 1000) : null, ended_at: new Date().toISOString() })
            .eq("id", id);
        });
      }
    };
  }

  window.dyLog = { start: start };
})();

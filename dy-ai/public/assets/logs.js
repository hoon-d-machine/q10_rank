/* DY-AI 수집 로그 화면: Supabase dy_collect_runs(+dy_collect_steps)를 날짜별 묶음으로 보여 줌
 * 묶음(<details>)을 누르면 단계가 펼쳐지고, 단계에 상세(detail)가 있으면 그 안에서 한 번 더 펼침
 */
(function () {
  "use strict";

  var PAGE = 30;
  var STALE_MS = 2 * 60 * 60 * 1000; // 2시간 넘게 "진행 중"이면 중단된 것으로 표시
  var list = document.querySelector(".js-list");
  var more = document.querySelector(".js-more");
  var countEl = document.querySelector(".js-count");
  var oldest = null;
  var total = 0;
  var lastDay = null;

  var STATUS = {
    running: ["진행 중", "run"], ok: ["완료", "ok"], partial: ["일부 실패", "warn"],
    error: ["실패", "err"], cancel: ["취소", "mute"], stale: ["중단됨", "mute"]
  };
  var LEVEL = { info: "정보", ok: "완료", warn: "주의", error: "오류" };
  var DAYS = ["일", "월", "화", "수", "목", "금", "토"];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function dayKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function dayLabel(d) {
    var today = dayKey(new Date());
    var y = new Date(); y.setDate(y.getDate() - 1);
    var k = dayKey(d);
    var name = k === today ? "오늘" : k === dayKey(y) ? "어제" : "";
    return k + " (" + DAYS[d.getDay()] + ")" + (name ? " · " + name : "");
  }
  function hm(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function hms(d) { return hm(d) + ":" + pad(d.getSeconds()); }
  function took(a, b) {
    if (!b) return "";
    var s = Math.max(0, Math.round((new Date(b) - new Date(a)) / 1000));
    return s < 60 ? s + "초" : Math.floor(s / 60) + "분 " + (s % 60) + "초";
  }

  function statusOf(r) {
    if (r.status === "running" && Date.now() - new Date(r.started_at) > STALE_MS) return "stale";
    return STATUS[r.status] ? r.status : "running";
  }

  function renderRun(r) {
    var st = statusOf(r);
    var started = new Date(r.started_at);
    var steps = (r.dy_collect_steps || []).slice().sort(function (a, b) { return a.id - b.id; });
    var errs = steps.filter(function (s) { return s.level === "error"; }).length;
    var warns = steps.filter(function (s) { return s.level === "warn"; }).length;

    var d = el("details", "log-run is-" + STATUS[st][1]);
    var sum = el("summary", "log-sum");
    sum.appendChild(el("span", "log-time", hm(started)));
    var badge = el("span", "log-badge", STATUS[st][0]);
    sum.appendChild(badge);
    var main = el("span", "log-main");
    main.appendChild(el("span", "log-summary", r.summary || (st === "running" ? "수집 중…" : st === "stale" ? "끝나지 않은 채 멈췄어요 (창을 닫았거나 오류)" : "-")));
    var meta = [];
    if (r.period_start) meta.push("기간 " + r.period_start + " ~ " + (r.period_end || ""));
    if (r.user_email) meta.push(r.user_email.replace(/@dy-ai\.local$/, ""));
    if (r.ended_at) meta.push(took(r.started_at, r.ended_at) + " 걸림");
    meta.push("단계 " + steps.length + (errs ? " · 오류 " + errs : "") + (warns ? " · 주의 " + warns : ""));
    main.appendChild(el("span", "log-meta", meta.join(" · ")));
    sum.appendChild(main);
    sum.appendChild(el("span", "log-chev"));
    d.appendChild(sum);

    var ol = el("ol", "log-steps");
    if (!steps.length) ol.appendChild(el("li", "log-step-empty", "남은 단계 기록이 없어요"));
    steps.forEach(function (s) {
      var li = el("li", "log-step lv-" + s.level);
      li.appendChild(el("span", "log-step-time", hms(new Date(s.ts))));
      var dot = el("span", "log-dot");
      dot.title = LEVEL[s.level] || s.level;
      li.appendChild(dot);
      var body = el("div", "log-step-body");
      var head = el("p", "log-step-head");
      head.appendChild(el("b", null, s.step));
      head.appendChild(el("span", "log-lv", LEVEL[s.level] || s.level));
      body.appendChild(head);
      if (s.message) body.appendChild(el("p", "log-step-msg", s.message));
      if (s.detail != null) {
        var dd = el("details", "log-detail");
        dd.appendChild(el("summary", null, "상세 보기"));
        dd.appendChild(el("pre", null, JSON.stringify(s.detail, null, 2)));
        body.appendChild(dd);
      }
      li.appendChild(body);
      ol.appendChild(li);
    });
    d.appendChild(ol);
    return d;
  }

  function append(rows) {
    rows.forEach(function (r) {
      var day = dayKey(new Date(r.started_at));
      if (day !== lastDay) {
        lastDay = day;
        var sec = el("section", "log-day");
        sec.appendChild(el("h2", "log-day-title", dayLabel(new Date(r.started_at))));
        sec.appendChild(el("div", "log-day-runs"));
        list.appendChild(sec);
      }
      list.lastChild.querySelector(".log-day-runs").appendChild(renderRun(r));
    });
  }

  function fail(e) {
    var m = (e && e.message) || String(e);
    var hint = /does not exist|relation|schema cache|dy_collect/i.test(m)
      ? "로그 테이블이 아직 없어요. Supabase SQL Editor 에서 dy-ai/supabase/web_collector.sql 을 실행해 주세요."
      : "로그를 불러오지 못했어요: " + m;
    list.innerHTML = "";
    list.appendChild(el("p", "logs-empty is-err", hint));
    list.setAttribute("aria-busy", "false");
  }

  function load(reset) {
    var client = window.dyAuth && window.dyAuth.client;
    if (!client) return fail(new Error("Supabase 설정이 없어요"));
    if (reset) { oldest = null; total = 0; lastDay = null; }
    list.setAttribute("aria-busy", "true");
    more.disabled = true;
    var q = client.from("dy_collect_runs")
      .select("id, started_at, ended_at, user_email, status, period_start, period_end, summary, dy_collect_steps(id, ts, step, level, message, detail)")
      .order("started_at", { ascending: false })
      .limit(PAGE);
    if (oldest) q = q.lt("started_at", oldest);
    return q.then(function (res) {
      if (res.error) throw res.error;
      var rows = res.data || [];
      if (reset) list.innerHTML = "";
      if (reset && !rows.length) list.appendChild(el("p", "logs-empty", "아직 수집 기록이 없어요. 수집기에서 Q10 수집을 누르면 여기에 남아요."));
      append(rows);
      total += rows.length;
      if (rows.length) oldest = rows[rows.length - 1].started_at;
      more.hidden = rows.length < PAGE;
      countEl.textContent = total ? "최근 " + total + "건" : "";
      list.setAttribute("aria-busy", "false");
    }).catch(fail).then(function () { more.disabled = false; });
  }

  document.querySelector(".js-refresh").addEventListener("click", function () { load(true); });
  more.addEventListener("click", function () { load(false); });

  window.dyAuth.requireLogin().then(function (s) { if (s) load(true); });
})();

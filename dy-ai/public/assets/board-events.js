/* 보드 · 행사 비교·예측: 행사 달력(메가와리·메가포) × 일별 매출
 *   행사마다: 일수 · 총매출 · 하루 평균 · 평소(행사 직전 28일, 다른 행사일 제외) 하루 평균 · 배수(= 행사 하루 평균 ÷ 평소) · 행사 후 7일 평균이 평소 대비 얼마나 빠지는지(dip)
 *   예측: 예측 대상 행사 시작 전까지의 평소 하루 평균 × 같은 종류 최근 k회 배수의 중앙값 × 행사 일수, 범위는 k회 배수의 최소~최대. Day별 모양은 참고 행사들의 Day별 비중 중앙값.
 *   예정 행사는 오늘까지의 데이터로, 지난 행사를 고르면 그 행사 시작 전 데이터만으로 예측해 실제와 비교(되돌아보기)한다. 요일·계절·재고 등은 반영하지 않는다.
 */
(function () {
  "use strict";
  var B = window.dyBoard, D = window.dyDash; if (!B) return;
  var U = B.util;

  function avgDaily(days, a, b, evDay) { // a~b 중 데이터가 있고 행사일이 아닌 날의 하루 평균 매출
    var s = 0, n = 0; for (var d = a; d <= b; d = U.addD(d, 1)) { var r = days[d]; if (!r || evDay[d]) continue; s += r.net_sales || 0; n++; } return n >= 7 ? s / n : null;
  }
  function evStats(e, days, evDay, asOf) {
    var end = e.end < asOf ? e.end : asOf, n = 0, s = 0, pv = 0, qty = 0, series = [];
    for (var d = e.start; d <= end; d = U.addD(d, 1)) { var r = days[d]; series.push(r ? r.net_sales || 0 : null); if (r) { n++; s += r.net_sales || 0; pv += r.total_pv || 0; qty += r.net_qty || 0; } }
    var base = avgDaily(days, U.addD(e.start, -28), U.addD(e.start, -1), evDay), avg = n ? s / n : null;
    var pre = avgDaily(days, U.addD(e.start, -7), U.addD(e.start, -1), evDay), post = e.end < asOf ? avgDaily(days, U.addD(e.end, 1), U.addD(e.end, 7), evDay) : null;
    return { e: e, label: B.evLabel(e), n: n, len: U.diffD(e.end, e.start) + 1, total: s, avg: avg, base: base, mult: base && avg ? avg / base : null, pre: pre && base ? pre / base : null, post: post && base ? post / base : null, pv: pv, qty: qty, series: series, done: e.end <= asOf };
  }
  function shapeAt(ref, i, nT) { // 참고 행사의 Day 비중을 nT 일로 늘이거나 줄여서 i 번째 비중
    var m = ref.series.length, tot = U.sum(ref.series, function (v) { return v || 0; }); if (!tot) return null;
    var idx = Math.min(m - 1, Math.floor(i * m / nT)); return (ref.series[idx] || 0) / tot * (m / nT);
  }

  B.define({
    id: "events", label: "행사 비교", title: "행사 비교와 예측", eyebrow: "Events × forecast", unit: "(K JPY) · 순매출 기준 · 행사 달력(메가와리·메가포) × 일별 매출",
    chartNote: "참고할 행사 수(최근 k회)는 위쪽 ‘참고 행사 수’에서 정해요. 여기서는 예측 그래프에 비교선을 보일지만 정해요.",
    selects: [{ key: "lines", label: "그래프의 참고 행사 선", options: [["all", "참고 행사 모두"], ["last", "가장 최근 참고 행사만"], ["none", "예측선만"]], def: "all" }],
    help: [
      ["이 화면은", ["지난 행사들이 평소보다 얼마나 팔렸는지(배수), 행사 끝난 뒤 매출이 얼마나 빠지는지, 그 기록으로 다음 행사(예: 11/20 메가와리)의 매출을 어느 정도로 잡으면 되는지를 보여 줘요. 행사 일정은 광고센터 행사 달력에서 자동으로 와요.",
        "위에서 ‘예측 대상 행사’(기본: 가장 가까운 예정 행사)와 ‘참고 행사 수’를 골라요. 지난 행사를 고르면 그 행사 시작 전 데이터만으로 예측해서 실제와 비교하는 ‘되돌아보기’가 돼요."]],
      ["계산 방식", ["평소 = 행사 시작 직전 28일(다른 행사일 제외)의 하루 평균 매출. 배수 = 행사 기간 하루 평균 ÷ 평소. 행사 후 7일 평균 ÷ 평소 −1 = 행사 후 하락(당겨 사는 효과).",
        "예측 총매출 = (예측 대상 시작 전까지의 평소 하루 평균) × (같은 종류 참고 행사 최근 k회 배수의 중앙값) × 행사 일수. 범위 = k회 배수의 최소~최대. Day별 예측은 참고 행사들의 Day별 비중(중앙값)으로 나눈 값이에요.",
        "요일·계절·재고·광고 투입량은 반영하지 않은 단순한 추정이에요. 참고할 이전 행사가 부족하거나 평소 기간에 데이터가 없으면 계산하지 않아요."]],
      ["코멘트 기준 (자동)", ["1) 예측 대상 행사의 예상 매출과 범위. 2) 참고 행사별 배수. 3) 행사 후 하락 평균. 4) 월 목표 대비(목표가 있을 때). 5) 되돌아보기일 때 실제와 예측의 차이. ‘코멘트 입력’에서 직접 쓴 코멘트는 이 화면에 하나 저장돼요."]]
    ],
    setup: function () {
      return Promise.all([B.events(), D.loadBounds()]).then(function (r) {
        var anchor = D.anchor(), up = r[0].filter(function (e) { return e.start > anchor; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; }), past = r[0].filter(function (e) { return e.start <= anchor && e.start >= "2024-03-01"; }).slice(0, 10);
        var opts = up.concat(past).map(function (e) { return [e.no, B.evLabel(e) + " (" + U.md(e.start) + "~" + U.md(e.end) + ")" + (e.start > anchor ? " · 예정" : e.end > anchor ? " · 진행 중" : "")]; });
        return [{ id: "event", label: "예측 대상 행사", options: opts, value: opts[0][0] }, { id: "k", label: "참고 행사 수", options: [["2", "최근 2회"], ["3", "최근 3회"], ["4", "최근 4회"]], value: "3" }];
      });
    },
    noteKey: function (ctx, d) { return d ? U.mk(d.T.start) : U.mk(D.anchor()); },
    load: function (ctx) {
      return Promise.all([B.events(), D.loadBounds()]).then(function (r) {
        var anchor = D.anchor(), T = r[0].filter(function (e) { return String(e.no) === String(ctx.v.event); })[0] || r[0][0], from = D.minDate() || "2024-01-01";
        var tf = U.mk(T.start), tt = U.monthEnd(tf);
        return Promise.all([D.query({ metrics: ["net_sales", "total_pv", "net_qty"], grain: "day", range: { from: from, to: anchor } }), U.rpc("dy_inni_targets_get", { p_from: tf, p_to: tt })]).then(function (x) {
          return { T: T, events: r[0], anchor: anchor, days: x[0].rows, target: ((x[1] || [])[0] || {}).v || null };
        });
      });
    },
    view: function (d, ctx) {
      var T = d.T, k = +ctx.v.k || 3, anchor = d.anchor, asOf = T.start > anchor ? anchor : U.addD(T.start, -1), evDay = {};
      d.events.forEach(function (e) { for (var dd = e.start; dd <= e.end; dd = U.addD(dd, 1)) evDay[dd] = 1; });
      var same = d.events.filter(function (e) { return e.type === T.type && e.no !== T.no; });
      var refs = same.filter(function (e) { return e.end < T.start && e.end <= anchor && e.start >= "2024-02-01"; }).sort(function (a, b) { return a.start < b.start ? 1 : -1; }).slice(0, k).map(function (e) { return evStats(e, d.days, evDay, anchor); }).filter(function (s) { return s.mult != null; });
      var past = same.concat([T]).filter(function (e) { return e.start <= anchor && e.start >= "2024-02-01"; }).sort(function (a, b) { return a.start < b.start ? 1 : -1; }).slice(0, 14).map(function (e) { return evStats(e, d.days, evDay, anchor); });
      var nT = U.diffD(T.end, T.start) + 1, baseT = avgDaily(d.days, U.addD(asOf, -27), asOf, evDay);
      var mults = refs.map(function (s) { return s.mult; }), mMed = U.median(mults), mMin = mults.length ? Math.min.apply(null, mults) : null, mMax = mults.length ? Math.max.apply(null, mults) : null;
      var ok = baseT != null && mMed != null, fcTotal = ok ? baseT * mMed * nT : null, fcLow = ok ? baseT * mMin * nT : null, fcHigh = ok ? baseT * mMax * nT : null;
      var actual = evStats(T, d.days, evDay, anchor), hasActual = T.start <= anchor && actual.n > 0;
      var dips = refs.filter(function (s) { return s.post != null; }).map(function (s) { return s.post - 1; }), dipAvg = U.avg(dips);
      // Day별 예측
      var daysF = [];
      if (ok) for (var i = 0; i < nT; i++) {
        var sh = refs.map(function (s) { return shapeAt(s, i, nT); }).filter(function (v) { return v != null; }), share = U.median(sh) || 1 / nT;
        daysF.push({ i: i, d: U.addD(T.start, i), share: share });
      }
      var shSum = U.sum(daysF, function (x) { return x.share; }) || 1;
      daysF.forEach(function (x) { x.fc = fcTotal * x.share / shSum; x.low = fcLow * x.share / shSum; x.high = fcHigh * x.share / shSum; x.act = d.days[x.d] ? d.days[x.d].net_sales || 0 : null; });
      var L = [], fk = function (v) { return U.kv(v) + "K"; };
      if (!ok) L.push({ t: "예측하지 못했어요 — " + (baseT == null ? "예측 기준일 직전 28일의 평소 데이터가 부족하거나" : "") + (mMed == null ? " 같은 종류의 참고 행사가 없어요." : ""), c: "is-neg" });
      else {
        L.push({ t: B.evLabel(T) + " (" + U.md(T.start) + "~" + U.md(T.end) + ", " + nT + "일) 예상 매출 " + U.mil(fcTotal) + " (범위 " + U.mil(fcLow) + " ~ " + U.mil(fcHigh) + ") — 평소 하루 " + fk(baseT) + " × 최근 " + refs.length + "회 배수 중앙값 " + mMed.toFixed(1) + "배 × " + nT + "일" });
        L.push({ t: "참고 행사 배수: " + refs.map(function (s) { return s.label.replace(/^\d{4} /, "") + " " + s.mult.toFixed(1) + "배"; }).join(" · ") + (T.type === "MEGAWARI" ? " (메가와리는 첫날 오후 시작 포함)" : "") });
        if (dipAvg != null) L.push({ t: "참고 행사가 끝난 뒤 7일 평균은 평소(행사 직전 28일) 대비 평균 " + U.gs(dipAvg * 100) + (dipAvg < 0 ? " — 행사 뒤 매출이 평소보다 빠졌어요(당겨 사는 효과)" : " — 행사 뒤에도 평소보다 높게 유지됐어요(행사 직전 평소가 낮은 편이라 그럴 수 있어요)"), c: dipAvg < 0 ? "is-neg" : "" });
        if (d.target) L.push({ t: T.start.slice(0, 7) + " 월 목표 " + U.mil(d.target) + " 대비 예상 행사 매출 " + U.pct(fcTotal / d.target * 100, 0) + " (행사 기간 매출만)" });
        if (hasActual && T.start <= anchor) {
          var part = T.end > anchor; L.push({ t: (part ? "진행 중 실제(" + U.md(anchor) + "까지 " + actual.n + "일) " : "실제 ") + U.mil(actual.total) + " — " + (part ? "같은 " + actual.n + "일 예측 " + U.mil(U.sum(daysF.slice(0, actual.n), function (x) { return x.fc; })) + " 대비 " + U.gs(U.growth(actual.total, U.sum(daysF.slice(0, actual.n), function (x) { return x.fc; }))) : "예측 " + U.mil(fcTotal) + " 대비 " + U.gs(U.growth(actual.total, fcTotal))) });
        }
      }
      var chart1 = function (light) {
        var tk = U.tick(light), labels = []; for (var i = 0; i < nT; i++) labels.push("Day " + (i + 1));
        var sets = [];
        if (ok) {
          sets.push({ label: "예측(" + B.evLabel(T) + ")", data: daysF.map(function (x) { return Math.round(x.fc / 1000); }), borderColor: "#2b6fd6", backgroundColor: "#2b6fd6", borderDash: [6, 4], borderWidth: 3 });
          sets.push({ label: "예측 하한", data: daysF.map(function (x) { return Math.round(x.low / 1000); }), borderColor: "rgba(43,111,214,.35)", backgroundColor: "rgba(43,111,214,.35)", borderWidth: 1, pointRadius: 0 });
          sets.push({ label: "예측 상한", data: daysF.map(function (x) { return Math.round(x.high / 1000); }), borderColor: "rgba(43,111,214,.35)", backgroundColor: "rgba(43,111,214,.35)", borderWidth: 1, pointRadius: 0 });
        }
        if (hasActual) sets.push({ label: "실제", data: daysF.length ? daysF.map(function (x) { return x.act == null ? null : Math.round(x.act / 1000); }) : labels.map(function (_, i) { var v = d.days[U.addD(T.start, i)]; return v ? Math.round((v.net_sales || 0) / 1000) : null; }), borderColor: "#e06b2b", backgroundColor: "#e06b2b", borderWidth: 3 });
        var shown = ctx.cfg.sel.lines === "none" ? [] : ctx.cfg.sel.lines === "last" ? refs.slice(0, 1) : refs, pal = ["#f2a33a", "#8c8c8c", "#4fa88a", "#d65f5f"];
        shown.forEach(function (s, j) { sets.push({ label: s.label, data: labels.map(function (_, i) { var v = s.series[i]; return v == null ? null : Math.round(v / 1000); }), borderColor: pal[j % 4], backgroundColor: pal[j % 4], borderWidth: 2 }); });
        sets.forEach(function (s) { s.tension = .25; if (s.pointRadius == null) s.pointRadius = 3; s.spanGaps = false; });
        return { type: "line", data: { labels: labels, datasets: sets }, options: { responsive: !light, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { labels: { color: tk } } },
          scales: { x: { ticks: { color: tk }, grid: { display: false } }, y: { beginAtZero: true, min: 0, ticks: { color: tk }, title: { display: true, text: "일 매출(K)", color: tk } } } } };
      };
      var hist = past.filter(function (s) { return s.e.type === T.type; });
      var chart2 = function (light) {
        var tk = U.tick(light), hs = hist.slice().reverse();
        return { data: { labels: hs.map(function (s) { return s.label.replace(/^\d{4} /, "'" + s.e.start.slice(2, 4) + " "); }), datasets: [
          { type: "bar", label: "배수(행사 하루 평균 ÷ 평소)", data: hs.map(function (s) { return s.mult == null ? null : +s.mult.toFixed(2); }), backgroundColor: hs.map(function (s) { return s.e.no === T.no ? "#e06b2b" : "#8aa4d6"; }), yAxisID: "y" },
          { type: "line", label: "행사 후 7일 평균 vs 평소(%)", data: hs.map(function (s) { return s.post == null ? null : +((s.post - 1) * 100).toFixed(0); }), borderColor: "#d65f5f", backgroundColor: "#d65f5f", yAxisID: "y1", tension: .25 }] },
          options: { responsive: !light, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: tk } } }, scales: { x: { ticks: { color: tk }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: tk }, title: { display: true, text: "배수(배)", color: tk } }, y1: { position: "right", grid: { drawOnChartArea: false }, ticks: { color: tk, callback: function (v) { return v + "%"; } } } } } };
      };
      var fcRows = daysF.map(function (x) { var diff = x.act != null && x.fc ? U.growth(x.act, x.fc) : null; return { id: "d" + x.i, vals: { day: "Day " + (x.i + 1), date: U.md(x.d), fc: x.fc, low: x.low, high: x.high, act: x.act, diff: diff } }; });
      if (daysF.length) fcRows.push({ id: "sum", strong: true, vals: { day: "합계", date: nT + "일", fc: fcTotal, low: fcLow, high: fcHigh, act: hasActual ? U.sum(daysF, function (x) { return x.act || 0; }) : null, diff: hasActual && T.end <= anchor ? U.growth(actual.total, fcTotal) : null } });
      var hRows = hist.map(function (s) { return { id: s.e.no, cls: s.e.no === T.no ? "is-flag" : "", vals: { ev: s.label + (s.done ? "" : " (진행 중)"), per: U.md(s.e.start) + "~" + U.md(s.e.end), n: s.n, total: s.total, avg: s.avg, base: s.base, mult: s.mult, pre: s.pre, post: s.post, dip: s.post != null ? (s.post - 1) * 100 : null } }; });
      return {
        title: "행사 비교와 예측 · " + B.evLabel(T), comments: L,
        notice: (T.start > anchor ? "예정 행사예요. " + U.md(anchor) + "까지의 데이터로 예측해요(행사 시작 전 마지막 며칠은 아직 없어요). " : T.end > anchor ? "진행 중인 행사예요. 행사 시작 전 데이터로 예측하고 지금까지의 실제와 비교해요. " : "지난 행사라 행사 시작 전 데이터만으로 예측한 ‘되돌아보기’예요. ") + (refs.length < k ? "참고할 이전 " + (T.type === "MEGAWARI" ? "메가와리" : "메가포") + " 행사가 " + refs.length + "회뿐이에요. " : "") + "요일·계절·재고·광고 투입은 반영하지 않은 단순 추정이에요.",
        sections: [
          { type: "kpi", items: [
            { label: "예상 행사 매출", value: ok ? U.kv(fcTotal) + "K" : "-", sub: ok ? "범위 " + U.kv(fcLow) + " ~ " + U.kv(fcHigh) + "K" : "예측 불가" },
            { label: "평소 하루 매출", value: baseT != null ? U.kv(baseT) + "K" : "-", sub: U.md(U.addD(asOf, -27)) + "~" + U.md(asOf) + " (행사일 제외)" },
            { label: "적용 배수 (중앙값)", value: mMed != null ? mMed.toFixed(1) + "배" : "-", sub: mults.length ? "범위 " + mMin.toFixed(1) + " ~ " + mMax.toFixed(1) + "배 (" + mults.length + "회)" : "" },
            { label: "예상 하루 평균", value: ok ? U.kv(fcTotal / nT) + "K" : "-", sub: nT + "일간" },
            { label: "월 목표 대비", value: ok && d.target ? U.pct(fcTotal / d.target * 100, 0) : "-", sub: d.target ? T.start.slice(0, 7) + " 목표 " + U.kv(d.target) + "K" : "그 달 목표 미입력" },
            { label: "행사 후 7일 vs 평소", value: dipAvg != null ? U.gs(dipAvg * 100) : "-", sub: "참고 행사 평균 (음수 = 행사 뒤 하락)" }] },
          { type: "chart", id: "curve", title: "일별 매출 모양: 예측 · 실제 · 참고 행사", config: chart1 },
          { type: "chart", id: "mult", title: "행사별 배수와 행사 후 하락 (주황 = 예측 대상)", config: chart2, small: true },
          { type: "table", id: "fc", title: "Day별 예측" + (hasActual ? " vs 실제" : ""), cols: [{ id: "day", label: "DAY", type: "text" }, { id: "date", label: "날짜", type: "text" }, { id: "fc", label: "예측(K)", type: "k" }, { id: "low", label: "하한(K)", type: "k" }, { id: "high", label: "상한(K)", type: "k" }, { id: "act", label: "실제(K)", type: "k" }, { id: "diff", label: "실제 vs 예측", type: "gr" }], rows: fcRows },
          { type: "table", id: "hist", title: "행사 기록 (같은 종류, 최근 14회)", cols: [{ id: "ev", label: "행사", type: "text" }, { id: "per", label: "기간", type: "text" }, { id: "n", label: "일수", type: "int" }, { id: "total", label: "총매출(K)", type: "k" }, { id: "avg", label: "하루 평균(K)", type: "k" }, { id: "base", label: "평소 하루(K)", type: "k" }, { id: "mult", label: "배수", type: "dec1" }, { id: "dip", label: "행사 후 7일 vs 평소", type: "gr" }], rows: hRows, note: "평소 = 행사 직전 28일(다른 행사일 제외) 하루 평균. 주황 줄 = 예측 대상 행사. 진행 중인 행사는 데이터가 있는 날까지예요." }
        ]
      };
    }
  });
})();

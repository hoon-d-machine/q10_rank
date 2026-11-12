/* 보드 · 고객 구조: 일별 신규·기존 구매자, 팔로워, 샵 방문(판매자센터 customer/table/date) × 매출 × 행사 달력
 *   신규 비중 = 신규 구매자 ÷ 구매자 수, 구매자당 매출 = 순매출 ÷ 구매자 수, 샵 방문당 구매자 = 구매자 ÷ 샵 방문(PV)
 *   행사 효과: 행사 기간의 신규 비중·하루 평균 팔로워 증감을 행사 직전 30일(다른 행사일 제외)과 비교
 *   진행 중인 달은 전월·작년의 같은 일수와 비교한다. 팔로워 수는 월말(마지막 데이터 날) 값.
 */
(function () {
  "use strict";
  var B = window.dyBoard, D = window.dyDash; if (!B) return;
  var U = B.util;
  var MET = ["c_new", "c_exist", "c_buyers", "c_follow_inc", "c_follow_cnt", "c_shop_pv", "net_sales"];

  function sumDays(days, a, b) { // a~b 날짜의 합계 + 마지막 팔로워 수
    var t = { nw: 0, ex: 0, buy: 0, inc: 0, shop: 0, sales: 0, fol: null, days: 0 };
    for (var d = a; d <= b; d = U.addD(d, 1)) { var r = days[d]; if (!r) continue; t.days++; t.nw += r.c_new || 0; t.ex += r.c_exist || 0; t.buy += r.c_buyers || 0; t.inc += r.c_follow_inc || 0; t.shop += r.c_shop_pv || 0; t.sales += r.net_sales || 0; if (r.c_follow_cnt) t.fol = r.c_follow_cnt; }
    t.share = t.buy ? t.nw / t.buy * 100 : null; t.per = t.buy ? t.sales / t.buy : null; t.conv = t.shop ? t.buy / t.shop * 100 : null;
    return t;
  }

  B.define({
    id: "customer", label: "고객 구조", title: "고객 구조 (신규 · 기존 · 팔로워)", eyebrow: "Customers", unit: "구매자 수 · 팔로워 · (K JPY)",
    chartNote: "월별 그래프·표에 보일 개월 수를 정해요.",
    selects: [{ key: "months", label: "월별 그래프·표 기간", options: [["6", "최근 6개월"], ["12", "최근 12개월"], ["18", "최근 18개월"]], def: "12" }],
    help: [
      ["이 화면은", ["매출이 신규 고객 덕인지 재구매 덕인지, 팔로워가 늘고 있는지, 행사 때 신규·팔로워가 평소보다 얼마나 늘었는지 보는 화면이에요. 판매자센터의 고객 데이터(일별 신규·기존 구매자, 팔로워, 샵 방문)에 매출과 행사 달력을 겹쳤어요.",
        "기준 월을 고르면 그 달(진행 중이면 데이터가 있는 마지막 날까지)을 전월·작년 같은 일수와 비교해요."]],
      ["숫자 정의", ["신규 비중 = 신규 구매자 ÷ 구매자 수, 구매자당 매출 = 순매출 ÷ 구매자 수(엔), 샵 방문당 구매자 = 구매자 ÷ 샵 방문(PV). 팔로워 증감은 기간 합계, 팔로워 수는 기간 마지막 날 값이에요.",
        "행사 효과: 행사 기간의 신규 비중과 하루 평균 팔로워 증감을, 행사 직전 30일(다른 행사일은 제외)의 값과 비교해요. 배수 = 행사 기간 하루 평균 ÷ 평소 하루 평균."]],
      ["코멘트 기준 (자동)", ["1) 구매자·신규·기존·신규 비중(전월·작년). 2) 팔로워 증감과 팔로워 수. 3) 구매자당 매출. 4) 가장 최근에 끝난 행사의 신규 비중·팔로워 증가 배수. 5) 신규 비중이 직전 개월 평균과 얼마나 다른지. ‘코멘트 입력’에서 직접 쓴 코멘트는 이 화면에 하나 저장돼요."]],
      ["알아둘 점", ["고객 데이터는 판매자센터가 나중에 값을 고치는 경우가 있어요. 팔로워 수는 일별 값이 비어 있는 날이 있으면 그 전 값을 써요."]]
    ],
    setup: function () {
      return B.bounds().then(function (b) {
        var r = b.customer; if (!r || !r.min) throw new Error("고객 데이터가 아직 없어요.");
        var ms = B.months(r.min, r.max).reverse();
        return [{ id: "month", label: "기준 월", options: ms.map(function (k) { return [k, k.slice(0, 4) + " " + k.slice(5, 7) + (k === U.mk(r.max) && +r.max.slice(8, 10) < U.lastDay(k) ? " (진행 중)" : "")]; }), value: ms[0] }];
      });
    },
    noteKey: function (ctx) { return ctx.v.month; },
    load: function (ctx) {
      var k = ctx.v.month;
      return B.bounds().then(function (b) {
        var maxd = b.customer.max, to = maxd < U.monthEnd(k) ? maxd : U.monthEnd(k), from = U.addM(k, -29), minD = b.customer.min;   // 최근 18개월 + 작년 같은 달 비교
        if (from < minD) from = minD;
        return Promise.all([D.query({ metrics: MET, grain: "day", range: { from: from, to: to } }), B.events()]).then(function (x) {
          return { k: k, to: to, from: from, part: to < U.monthEnd(k), days: x[0].rows, events: x[1] };
        });
      });
    },
    view: function (d, ctx) {
      var k = d.k, n = U.diffD(d.to, k) + 1, pk = U.addM(k, -1), pto = U.addD(pk, Math.min(n, U.lastDay(pk)) - 1), lk = U.addM(k, -12), lto = U.addD(lk, Math.min(n, U.lastDay(lk)) - 1);
      var c = sumDays(d.days, k, d.to), p = sumDays(d.days, pk, pto), y = sumDays(d.days, lk, lto);
      var M = +ctx.cfg.sel.months || 12, months = B.months(U.addM(k, -(M - 1)), k);
      var ms = months.map(function (m) { var t = sumDays(d.days, m, m === k ? d.to : U.monthEnd(m)); t.m = m; return t; });
      var pp = function (a, b) { return a != null && b != null ? (a - b >= 0 ? "+" : "") + (a - b).toFixed(1) + "%p" : "-"; };
      var avgShare = U.avg(ms.filter(function (t) { return t.buy && t.m !== k; }).map(function (t) { return t.share; }));
      var evDay = {}; d.events.forEach(function (e) { for (var dd = e.start; dd <= e.end; dd = U.addD(dd, 1)) evDay[dd] = 1; });
      var evs = d.events.filter(function (e) { return e.start >= d.from && e.start <= d.to; }).map(function (e) {
        var end = e.end < d.to ? e.end : d.to, t = sumDays(d.days, e.start, end), b = { nw: 0, buy: 0, inc: 0, days: 0 };
        for (var dd = U.addD(e.start, -30); dd < e.start; dd = U.addD(dd, 1)) { var r = d.days[dd]; if (!r || evDay[dd]) continue; b.days++; b.nw += r.c_new || 0; b.buy += r.c_buyers || 0; b.inc += r.c_follow_inc || 0; }
        var bs = b.buy ? b.nw / b.buy * 100 : null, bi = b.days ? b.inc / b.days : null, ei = t.days ? t.inc / t.days : null;
        return { e: e, t: t, label: B.evLabel(e), bshare: bs, binc: bi, einc: ei, mult: bi > 0 ? ei / bi : null, done: e.end <= d.to };
      }).filter(function (o) { return o.t.days > 0 && o.t.buy > 0; });
      var L = [];
      L.push({ t: "구매자 " + U.num(c.buy) + "명 (전월" + (d.part ? " 같은 일수" : "") + " " + U.gs(U.growth(c.buy, p.buy)) + " · 작년 " + U.gs(U.growth(c.buy, y.buy)) + ") · 신규 " + U.num(c.nw) + "명(" + U.pct(c.share, 1) + ", 전월 " + pp(c.share, p.share) + ") · 기존 " + U.num(c.ex) + "명" });
      L.push({ t: "팔로워 " + (c.inc >= 0 ? "+" : "") + U.num(c.inc) + "명 증가 (전월 " + (p.inc >= 0 ? "+" : "") + U.num(p.inc) + "명) · 현재 팔로워 " + U.num(c.fol) + "명", c: c.inc < 0 ? "is-neg" : "" });
      L.push({ t: "구매자당 매출 " + U.num(c.per) + "엔 (전월 " + U.num(p.per) + "엔 · 작년 " + U.num(y.per) + "엔) · 샵 방문당 구매자 " + U.pct(c.conv, 2) + " (전월 " + U.pct(p.conv, 2) + ")" });
      var lastEv = evs.filter(function (o) { return o.done; }).sort(function (a, b) { return a.e.start < b.e.start ? 1 : -1; })[0];
      if (lastEv) L.push({ t: "최근 행사 " + lastEv.label + "(" + U.md(lastEv.e.start) + "~" + U.md(lastEv.e.end) + "): 신규 비중 " + U.pct(lastEv.t.share, 1) + " (평소 " + U.pct(lastEv.bshare, 1) + ", " + pp(lastEv.t.share, lastEv.bshare) + ") · 하루 평균 팔로워 " + (lastEv.einc >= 0 ? "+" : "") + U.num(lastEv.einc) + "명" + (lastEv.mult != null ? " (평소의 " + lastEv.mult.toFixed(1) + "배)" : "") });
      if (avgShare != null && c.share != null) L.push({ t: "이번 달 신규 비중 " + U.pct(c.share, 1) + " — 직전 " + (ms.length - 1) + "개월 평균 " + U.pct(avgShare, 1) + " 대비 " + pp(c.share, avgShare), c: c.share < avgShare - 3 ? "is-neg" : "" });
      var chart1 = function (light) {
        var tk = U.tick(light);
        return { data: { labels: ms.map(function (t) { return U.ml(t.m) + (t.m === k && d.part ? "*" : ""); }), datasets: [
          { type: "bar", label: "신규 구매자", data: ms.map(function (t) { return t.nw; }), backgroundColor: "#f2a33a", stack: "s", yAxisID: "y" },
          { type: "bar", label: "기존 구매자", data: ms.map(function (t) { return t.ex; }), backgroundColor: "#8aa4d6", stack: "s", yAxisID: "y" },
          { type: "line", label: "신규 비중(%)", data: ms.map(function (t) { return t.share == null ? null : +t.share.toFixed(1); }), borderColor: "#2b9a73", backgroundColor: "#2b9a73", yAxisID: "y1", tension: .25 }] },
          options: { responsive: !light, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: tk } } },
            scales: { x: { stacked: true, ticks: { color: tk }, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { color: tk }, title: { display: true, text: "구매자 수", color: tk } },
              y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { color: tk, callback: function (v) { return v + "%"; } } } } } };
      };
      var chart2 = function (light) {
        var tk = U.tick(light);
        return { data: { labels: ms.map(function (t) { return U.ml(t.m); }), datasets: [
          { type: "bar", label: "팔로워 증감", data: ms.map(function (t) { return t.inc; }), backgroundColor: ms.map(function (t) { return t.inc >= 0 ? "#4fa88a" : "#d65f5f"; }), yAxisID: "y" },
          { type: "line", label: "팔로워 수(월말)", data: ms.map(function (t) { return t.fol; }), borderColor: "#2b6fd6", backgroundColor: "#2b6fd6", yAxisID: "y1", tension: .25 }] },
          options: { responsive: !light, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: tk } } },
            scales: { x: { ticks: { color: tk }, grid: { display: false } }, y: { ticks: { color: tk }, title: { display: true, text: "증감(명)", color: tk } }, y1: { position: "right", grid: { drawOnChartArea: false }, ticks: { color: tk }, title: { display: true, text: "팔로워 수", color: tk } } } } };
      };
      var mRows = ms.slice().reverse().map(function (t) { return { id: t.m, vals: { m: U.ml(t.m) + (t.m === k && d.part ? "*" : ""), buy: t.buy, nw: t.nw, ex: t.ex, share: t.share, inc: t.inc, fol: t.fol, shop: t.shop, conv: t.conv, per: t.per, sales: t.sales } }; });
      var eRows = evs.slice().sort(function (a, b) { return a.e.start < b.e.start ? 1 : -1; }).map(function (o) {
        return { id: o.e.no, vals: { ev: o.label + (o.done ? "" : " (진행 중)"), per: U.md(o.e.start) + "~" + U.md(o.e.end), days: o.t.days, buy: o.t.buy, daily: o.t.days ? o.t.buy / o.t.days : null, share: o.t.share, bshare: o.bshare, dsh: o.t.share != null && o.bshare != null ? o.t.share - o.bshare : null, inc: o.t.inc, einc: o.einc, binc: o.binc, mult: o.mult } };
      });
      return {
        title: "고객 구조 · " + k.slice(0, 4) + " " + k.slice(5, 7) + (d.part ? " (" + U.md(d.to) + "까지)" : ""), comments: L,
        notice: d.part ? "진행 중인 달이라 " + U.md(d.to) + "까지이고, 전월·작년은 같은 일수와 비교해요." : "",
        sections: [
          { type: "kpi", items: [
            { label: "구매자 수", value: U.num(c.buy) + "명", sub: "전월 " + U.gs(U.growth(c.buy, p.buy)) + " · 작년 " + U.gs(U.growth(c.buy, y.buy)), cls: p.buy && c.buy >= p.buy ? "is-up" : p.buy ? "is-down" : "" },
            { label: "신규 비중", value: U.pct(c.share, 1), sub: "전월 " + U.pct(p.share, 1) + " (" + pp(c.share, p.share) + ")" },
            { label: "팔로워 증감", value: (c.inc >= 0 ? "+" : "") + U.num(c.inc) + "명", sub: "전월 " + (p.inc >= 0 ? "+" : "") + U.num(p.inc) + "명", cls: c.inc >= 0 ? "is-up" : "is-down" },
            { label: "팔로워 수", value: U.num(c.fol), sub: "기간 마지막 날" },
            { label: "구매자당 매출", value: U.num(c.per) + "엔", sub: "전월 " + U.num(p.per) + "엔" },
            { label: "샵 방문당 구매자", value: U.pct(c.conv, 2), sub: "샵 방문 " + U.num(c.shop) + " (전월 " + U.pct(p.conv, 2) + ")" }] },
          { type: "chart", id: "buyers", title: "신규·기존 구매자와 신규 비중", config: chart1 },
          { type: "chart", id: "follow", title: "팔로워 증감과 팔로워 수", config: chart2 },
          { type: "table", id: "month", title: "월별 고객 지표", cols: [{ id: "m", label: "월", type: "text" }, { id: "buy", label: "구매자", type: "int" }, { id: "nw", label: "신규", type: "int" }, { id: "ex", label: "기존", type: "int" }, { id: "share", label: "신규 비중", type: "pct1" }, { id: "inc", label: "팔로워 증감", type: "int", cls: function (v) { return v >= 0 ? "is-up" : "is-down"; } }, { id: "fol", label: "팔로워 수", type: "int" }, { id: "shop", label: "샵 방문", type: "int" }, { id: "conv", label: "샵 방문당 구매자", type: "pct1" }, { id: "per", label: "구매자당 매출(엔)", type: "int" }, { id: "sales", label: "매출(K)", type: "k" }], rows: mRows },
          { type: "table", id: "event", title: "행사별 고객 효과 (평소 = 행사 직전 30일, 다른 행사일 제외)", cols: [{ id: "ev", label: "행사", type: "text" }, { id: "per", label: "기간", type: "text" }, { id: "days", label: "일수", type: "int" }, { id: "buy", label: "구매자", type: "int" }, { id: "daily", label: "하루 평균 구매자", type: "int" }, { id: "share", label: "신규 비중", type: "pct1" }, { id: "bshare", label: "평소 신규 비중", type: "pct1" }, { id: "dsh", label: "차이(%p)", type: "dec1", cls: function (v) { return v >= 0 ? "is-up" : "is-down"; } }, { id: "inc", label: "팔로워 증감", type: "int" }, { id: "einc", label: "하루 평균 증감", type: "dec1" }, { id: "binc", label: "평소 하루 평균", type: "dec1" }, { id: "mult", label: "배수", type: "dec1" }], rows: eRows, note: "배수 = 행사 기간 하루 평균 팔로워 증감 ÷ 평소 하루 평균. 평소 값이 0 이하면 배수는 비워요. 진행 중인 행사는 데이터가 있는 날까지예요." }
        ]
      };
    }
  });
})();

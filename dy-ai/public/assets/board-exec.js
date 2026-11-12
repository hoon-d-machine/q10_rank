/* 보드 · 경영 요약: 한 장으로 보는 월 요약 — 매출·목표 달성률 · 광고비 투입율과 전체 ROI · 신규 구매자 비중 · CVR·AOV·PV · 상위 5개 상품 · 최근/다음 행사
 *   SALES 탭과 같은 정의: SALES = 순매출, ORDERS = 구매수(pageview purchase_cnt), CVR = ORDERS ÷ PV, AOV = SALES ÷ ORDERS
 *   광고비 합계 = 광고센터 유형별 광고비 + Beauty Brand AD(CPM) + 직접 입력(Spotlight·Singleone, 월 단위). 투입율 = 광고비 ÷ 스토어 총매출, 전체 ROI = 총매출 ÷ 광고비.
 *   진행 중인 달은 전월·작년의 같은 일수와 비교한다(광고 비율은 광고 데이터가 있는 달만).
 */
(function () {
  "use strict";
  var B = window.dyBoard, D = window.dyDash; if (!B) return;
  var U = B.util, AD_FROM = "2026-02-01";
  var MET = ["net_sales", "total_pv", "purchases", "c_new", "c_buyers"];

  function sumDays(days, a, b) {
    var t = { sales: 0, pv: 0, orders: 0, nw: 0, buy: 0, days: 0 };
    for (var d = a; d <= b; d = U.addD(d, 1)) { var r = days[d]; if (!r) continue; t.days++; t.sales += r.net_sales || 0; t.pv += r.total_pv || 0; t.orders += r.purchases || 0; t.nw += r.c_new || 0; t.buy += r.c_buyers || 0; }
    t.cvr = t.pv ? t.orders / t.pv * 100 : null; t.aov = t.orders ? t.sales / t.orders : null; t.share = t.buy ? t.nw / t.buy * 100 : null; return t;
  }

  B.define({
    id: "exec", label: "경영 요약", title: "경영 요약", eyebrow: "Executive summary", unit: "(K JPY) · 한 장 요약 — 매출·목표·광고·고객·상품·행사",
    chartNote: "월별 그래프에 보일 개월 수를 정해요.",
    selects: [{ key: "months", label: "월별 그래프 기간", options: [["6", "최근 6개월"], ["12", "최근 12개월"]], def: "12" }],
    help: [
      ["이 화면은", ["한 달의 결과를 한 장으로 보는 요약이에요: 매출과 목표 달성률, 광고비 투입율·전체 ROI, 신규 구매자 비중, 전환(CVR)·객단가(AOV)·PV, 매출 상위 5개 상품, 최근 행사와 다음 행사. 엑셀로 내려받아 그대로 공유하기 좋게 만들었어요.",
        "기준 월을 고르면 그 달(진행 중이면 데이터가 있는 마지막 날까지)을 전월·작년 같은 일수와 비교해요."]],
      ["숫자 정의", ["SALES = 순매출(취소 제외), ORDERS = 구매수, CVR = ORDERS ÷ PV, AOV = SALES ÷ ORDERS (SALES 탭과 같아요). 목표 달성률 = 매출 ÷ 그 달 목표(‘SALES’ 탭의 월별 목표 입력). 진행 중인 달은 지금까지 매출과, 일평균으로 한 달을 환산한 값을 같이 보여 줘요.",
        "광고비 합계 = 광고센터 유형별 광고비 + Beauty Brand AD(CPM) + 직접 입력한 Spotlight AD·Singleone(월 단위). 투입율 = 광고비 ÷ 스토어 총매출, 전체 ROI = 총매출 ÷ 광고비. 광고 데이터는 2026-02부터라 그 이전 달은 비어 있어요. 직접 입력 항목은 월 단위라 진행 중인 달에는 그 달에 입력한 값이 그대로 들어가요."]],
      ["코멘트 기준 (자동)", ["1) 월 매출(전월·작년)과 목표 달성률. 2) 광고비·투입율·ROI. 3) 신규 구매자 비중. 4) CVR·AOV. 5) 상위 3개 상품 점유와 1위 상품. 6) 최근 완료 행사 결과와 다음 행사까지 남은 날. ‘코멘트 입력’에서 직접 쓴 코멘트는 이 화면에 하나 저장돼요."]]
    ],
    setup: function () {
      return D.loadBounds().then(function () {
        return B.bounds().then(function (b) {
          var r = b.sales; if (!r || !r.min) throw new Error("판매 데이터가 아직 없어요.");
          var ms = B.months(r.min, r.max).reverse();
          return [{ id: "month", label: "기준 월", options: ms.map(function (k) { return [k, k.slice(0, 4) + " " + k.slice(5, 7) + (k === U.mk(r.max) && +r.max.slice(8, 10) < U.lastDay(k) ? " (진행 중)" : "")]; }), value: ms[0] }];
        });
      });
    },
    noteKey: function (ctx) { return ctx.v.month; },
    load: function (ctx) {
      var k = ctx.v.month;
      return Promise.all([B.bounds(), B.products(), B.events()]).then(function (r) {
        var maxd = r[0].sales.max, to = maxd < U.monthEnd(k) ? maxd : U.monthEnd(k), from = U.addM(k, -17), minD = r[0].sales.min; if (from < minD) from = minD;
        var n = U.diffD(to, k) + 1, lk = U.addM(k, -12), lto = U.addD(lk, Math.min(n, U.lastDay(lk)) - 1), adF = U.addM(k, -17) < AD_FROM ? AD_FROM : U.addM(k, -17);
        var topQ = function (a, z) { return D.query({ metrics: ["g_net_amt", "g_net_qty", "g_pv"], grain: "all", range: { from: a, to: z }, dim: "gd_no", top: 200, topMetric: "g_net_amt" }); };
        return Promise.all([D.query({ metrics: MET, grain: "day", range: { from: from, to: to } }), U.rpc("dy_inni_targets_get", { p_from: U.addM(k, -17), p_to: U.monthEnd(k) }),
          adF <= to ? B.agg("ad", "month", adF, to, ["ad_price", "ad_sales", "total_sales"], "ad_type") : Promise.resolve([]),
          adF <= to ? B.agg("cpm", "month", adF, to, ["ad_cost"]) : Promise.resolve([]), U.rpc("dy_inni_ad_manual_get", { p_from: adF, p_to: U.monthEnd(k) }),
          topQ(k, to), topQ(lk, lto)]).then(function (x) {
          var tg = {}; (x[1] || []).forEach(function (t) { tg[String(t.ym).slice(0, 10)] = t.v; });
          var ad = {}; (x[2] || []).forEach(function (a) { var m = String(a.p).slice(0, 10), o = ad[m] = ad[m] || { api: 0, total: 0 }; if (a.d === "all") o.total = a.total_sales || 0; else o.api += a.ad_price || 0; });
          (x[3] || []).forEach(function (a) { var m = String(a.p).slice(0, 10), o = ad[m] = ad[m] || { api: 0, total: 0 }; o.cpm = a.ad_cost || 0; });
          (x[4] || []).forEach(function (a) { var m = String(a.ym).slice(0, 10), o = ad[m] = ad[m] || { api: 0, total: 0 }; o.man = (o.man || 0) + (a.v || 0); });
          return { k: k, to: to, n: n, lk: lk, lto: lto, part: to < U.monthEnd(k), days: x[0].rows, tg: tg, ad: ad, top: x[5], topLy: x[6], master: r[1], events: r[2], from: from };
        });
      });
    },
    view: function (d, ctx) {
      var k = d.k, n = d.n, pk = U.addM(k, -1), pto = U.addD(pk, Math.min(n, U.lastDay(pk)) - 1), c = sumDays(d.days, k, d.to), p = sumDays(d.days, pk, pto), y = sumDays(d.days, d.lk, d.lto);
      var tg = d.tg[k] || null, pace = d.part && c.days ? c.sales / c.days * U.lastDay(k) : null, g = U.growth, pp = function (a, b) { return a != null && b != null ? (a - b >= 0 ? "+" : "") + (a - b).toFixed(1) + "%p" : "-"; };
      var adOf = function (m) { var o = d.ad[m]; if (!o || !o.total) return null; var spend = (o.api || 0) + (o.cpm || 0) + (o.man || 0); return { spend: spend, rate: spend / o.total * 100, roi: spend ? o.total / spend * 100 : null, total: o.total }; };
      var aC = adOf(k), aP = adOf(pk), aY = adOf(d.lk);
      var M = +ctx.cfg.sel.months || 12, months = B.months(U.addM(k, -(M - 1)), k);
      var ms = months.map(function (m) { var t = sumDays(d.days, m, m === k ? d.to : U.monthEnd(m)); t.m = m; t.ad = adOf(m); t.tg = d.tg[m] || null; return t; });
      // 상품
      var tops = Object.keys(d.top.rows).map(function (gd) { var v = d.top.rows[gd], m = d.master[gd] || {}; return { gd: gd, name: m.product_name || d.top.labels[gd] || gd, sales: v.g_net_amt || 0, qty: v.g_net_qty || 0, pv: v.g_pv || 0, ly: (d.topLy.rows[gd] || {}).g_net_amt || 0 }; })
        .filter(function (o) { return o.sales > 0; }).sort(function (a, b) { return b.sales - a.sales; });
      var totS = U.sum(tops, function (o) { return o.sales; }), t5 = tops.slice(0, 5);
      // 행사
      var anchor = d.to, done = d.events.filter(function (e) { return e.end <= anchor; }).slice(0, 3), next = d.events.filter(function (e) { return e.start > anchor; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; })[0];
      var evRows = done.map(function (e) { var t = sumDays(d.days, e.start, e.end); return { id: e.no, vals: { ev: B.evLabel(e), per: U.md(e.start) + "~" + U.md(e.end), total: t.sales, avg: t.days ? t.sales / t.days : null, note: "완료" } }; });
      if (next) evRows.unshift({ id: next.no, cls: "is-flag", vals: { ev: B.evLabel(next), per: U.md(next.start) + "~" + U.md(next.end), total: null, avg: null, note: "D-" + U.diffD(next.start, anchor) + " 예정" } });
      var L = [];
      L.push({ t: "월 매출 " + U.mil(c.sales) + " (전월" + (d.part ? " 같은 일수" : "") + " " + U.gs(g(c.sales, p.sales)) + " · 작년 " + U.gs(g(c.sales, y.sales)) + ")" + (tg ? " · 목표 " + U.mil(tg) + " 대비 " + U.pct(c.sales / tg * 100, 0) + (pace ? " (일평균 환산 " + U.mil(pace) + ", " + U.pct(pace / tg * 100, 0) + ")" : "") : " · 이 달 목표 미입력"), c: p.sales && c.sales < p.sales ? "is-neg" : "" });
      if (aC) L.push({ t: "광고비 " + U.mil(aC.spend) + " · 투입율 " + U.pct(aC.rate, 1) + (aP ? " (전월 " + U.pct(aP.rate, 1) + ")" : "") + " · 전체 ROI " + U.pct(aC.roi, 0) + (aP ? " (전월 " + U.pct(aP.roi, 0) + ")" : "") + (d.part ? " — 진행 중인 달이라 직접 입력 항목은 입력된 값 기준" : "") });
      L.push({ t: "구매자 " + U.num(c.buy) + "명 중 신규 " + U.pct(c.share, 1) + " (전월 " + pp(c.share, p.share) + ", 작년 " + pp(c.share, y.share) + ")" });
      L.push({ t: "CVR " + U.pct(c.cvr, 2) + " (전월 " + U.pct(p.cvr, 2) + ") · AOV " + U.num(c.aov) + "엔 (전월 " + U.num(p.aov) + "엔, 작년 " + U.num(y.aov) + "엔) · PV " + U.man(c.pv) + " (전월 " + U.gs(g(c.pv, p.pv)) + ")" });
      if (t5.length >= 3) L.push({ t: "상위 3개 상품이 매출의 " + U.pct(U.sum(t5.slice(0, 3), function (o) { return o.sales; }) / totS * 100, 0) + " — 1위 " + U.short(t5[0].name, 18) + " " + U.mil(t5[0].sales) + (t5[0].ly ? " (작년 " + U.gs(g(t5[0].sales, t5[0].ly)) + ")" : "") });
      var lastEv = done[0];
      if (lastEv || next) L.push({ t: (lastEv ? "최근 행사 " + B.evLabel(lastEv) + " 매출 " + U.mil(sumDays(d.days, lastEv.start, lastEv.end).sales) : "") + (lastEv && next ? " · " : "") + (next ? "다음 행사 " + B.evLabel(next) + " (" + U.md(next.start) + "~" + U.md(next.end) + ", D-" + U.diffD(next.start, anchor) + ")" : "") });
      var chart1 = function (light) {
        var tk = U.tick(light);
        return { data: { labels: ms.map(function (t) { return U.ml(t.m) + (t.m === k && d.part ? "*" : ""); }), datasets: [
          { type: "bar", label: "매출(K)", data: ms.map(function (t) { return Math.round(t.sales / 1000); }), backgroundColor: ms.map(function (t) { return t.m === k ? "#e06b2b" : "#8aa4d6"; }), yAxisID: "y" },
          { type: "line", label: "목표(K)", data: ms.map(function (t) { return t.tg == null ? null : Math.round(t.tg / 1000); }), borderColor: "#2b9a73", backgroundColor: "#2b9a73", yAxisID: "y", tension: .2, spanGaps: false }] },
          options: { responsive: !light, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: tk } } }, scales: { x: { ticks: { color: tk }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: tk }, title: { display: true, text: "K JPY", color: tk } } } } };
      };
      var chart2 = function (light) {
        var tk = U.tick(light);
        return { type: "line", data: { labels: ms.map(function (t) { return U.ml(t.m); }), datasets: [
          { label: "광고 투입율(%)", data: ms.map(function (t) { return t.ad ? +t.ad.rate.toFixed(1) : null; }), borderColor: "#d65f5f", backgroundColor: "#d65f5f", tension: .25 },
          { label: "신규 구매자 비중(%)", data: ms.map(function (t) { return t.share == null ? null : +t.share.toFixed(1); }), borderColor: "#f2a33a", backgroundColor: "#f2a33a", tension: .25 },
          { label: "CVR(%)", data: ms.map(function (t) { return t.cvr == null ? null : +t.cvr.toFixed(2); }), borderColor: "#2b6fd6", backgroundColor: "#2b6fd6", tension: .25 }] },
          options: { responsive: !light, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: tk } } }, scales: { x: { ticks: { color: tk }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: tk, callback: function (v) { return v + "%"; } } } } } };
      };
      var gr = function (a, b) { return b ? g(a, b) : null; };
      var kRows = [
        { id: "sales", vals: { m: "매출(K)", c: c.sales, p: p.sales, mom: gr(c.sales, p.sales), y: y.sales, yoy: gr(c.sales, y.sales) }, type: "k" },
        { id: "pv", vals: { m: "PV", c: c.pv, p: p.pv, mom: gr(c.pv, p.pv), y: y.pv, yoy: gr(c.pv, y.pv) } },
        { id: "orders", vals: { m: "ORDERS(구매수)", c: c.orders, p: p.orders, mom: gr(c.orders, p.orders), y: y.orders, yoy: gr(c.orders, y.orders) } },
        { id: "cvr", vals: { m: "CVR(%)", c: c.cvr, p: p.cvr, mom: pp(c.cvr, p.cvr), y: y.cvr, yoy: pp(c.cvr, y.cvr) } },
        { id: "aov", vals: { m: "AOV(엔)", c: c.aov, p: p.aov, mom: gr(c.aov, p.aov), y: y.aov, yoy: gr(c.aov, y.aov) } },
        { id: "buy", vals: { m: "구매자 수", c: c.buy, p: p.buy, mom: gr(c.buy, p.buy), y: y.buy, yoy: gr(c.buy, y.buy) } },
        { id: "share", vals: { m: "신규 구매자 비중(%)", c: c.share, p: p.share, mom: pp(c.share, p.share), y: y.share, yoy: pp(c.share, y.share) } },
        { id: "spend", vals: { m: "광고비(K, 월)", c: aC ? aC.spend : null, p: aP ? aP.spend : null, mom: aC && aP ? gr(aC.spend, aP.spend) : null, y: aY ? aY.spend : null, yoy: aC && aY ? gr(aC.spend, aY.spend) : null } },
        { id: "rate", vals: { m: "광고 투입율(%)", c: aC ? aC.rate : null, p: aP ? aP.rate : null, mom: aC && aP ? pp(aC.rate, aP.rate) : null, y: aY ? aY.rate : null, yoy: aC && aY ? pp(aC.rate, aY.rate) : null } },
        { id: "roi", vals: { m: "전체 ROI(%)", c: aC ? aC.roi : null, p: aP ? aP.roi : null, mom: aC && aP ? pp(aC.roi, aP.roi) : null, y: aY ? aY.roi : null, yoy: aC && aY ? pp(aC.roi, aY.roi) : null } }];
      // 표시 형식을 행마다 다르게 쓰기 위해 이번·전월·작년 칸은 문자열로 만든다
      var fmtRow = function (r) {
        var f = { sales: function (v) { return U.kv(v); }, spend: function (v) { return U.kv(v); }, cvr: function (v) { return U.pct(v, 2); }, share: function (v) { return U.pct(v, 1); }, rate: function (v) { return U.pct(v, 1); }, roi: function (v) { return U.pct(v, 0); } }[r.id] || U.num;
        ["c", "p", "y"].forEach(function (c2) { r.vals[c2] = r.vals[c2] == null ? null : f(r.vals[c2]); }); return r;
      };
      kRows = kRows.map(fmtRow);
      var tRows = t5.map(function (o, i) { return { id: o.gd, vals: { no: i + 1, name: o.name, sales: o.sales, share: totS ? o.sales / totS * 100 : null, yoy: o.ly ? g(o.sales, o.ly) : null, pv: o.pv, cvr: o.pv ? o.qty / o.pv * 100 : null } }; });
      return {
        title: "경영 요약 · " + k.slice(0, 4) + " " + k.slice(5, 7) + (d.part ? " (" + U.md(d.to) + "까지)" : ""), comments: L,
        notice: (d.part ? "진행 중인 달이라 " + U.md(d.to) + "까지이고, 전월·작년은 같은 일수와 비교해요. " : "") + (aC ? "" : "광고 데이터는 2026-02부터라 이 달은 광고 지표가 없어요. ") + "목표는 SALES 탭의 ‘월별 목표 입력’ 값이에요.",
        sections: [
          { type: "kpi", items: [
            { label: "월 매출", value: U.kv(c.sales) + "K", sub: "전월 " + U.gs(g(c.sales, p.sales)) + " · 작년 " + U.gs(g(c.sales, y.sales)), cls: p.sales && c.sales >= p.sales ? "is-up" : p.sales ? "is-down" : "" },
            { label: "목표 달성률", value: tg ? U.pct(c.sales / tg * 100, 0) : "-", sub: tg ? "목표 " + U.kv(tg) + "K" + (pace ? " · 환산 " + U.pct(pace / tg * 100, 0) : "") : "목표 미입력", cls: tg && c.sales >= tg ? "is-up" : "" },
            { label: "광고 투입율", value: aC ? U.pct(aC.rate, 1) : "-", sub: aC ? "전체 ROI " + U.pct(aC.roi, 0) + (aP ? " (전월 " + U.pct(aP.roi, 0) + ")" : "") : "광고 데이터 없음" },
            { label: "신규 구매자 비중", value: U.pct(c.share, 1), sub: "구매자 " + U.num(c.buy) + "명 · 전월 " + pp(c.share, p.share) },
            { label: "CVR · AOV", value: U.pct(c.cvr, 2) + " · " + U.num(c.aov) + "엔", sub: "전월 " + U.pct(p.cvr, 2) + " · " + U.num(p.aov) + "엔" },
            { label: "PV", value: U.man(c.pv), sub: "전월 " + U.gs(g(c.pv, p.pv)) + " · 작년 " + U.gs(g(c.pv, y.pv)) }] },
          { type: "chart", id: "sales", title: "월 매출과 목표", config: chart1 },
          { type: "chart", id: "rates", title: "광고 투입율 · 신규 구매자 비중 · CVR", config: chart2, small: true },
          { type: "table", id: "kpi", title: "핵심 지표", cols: [{ id: "m", label: "지표", type: "text" }, { id: "c", label: "이번 달", type: "text" }, { id: "p", label: "전월", type: "text" }, { id: "mom", label: "전월 대비", type: "gr" }, { id: "y", label: "작년 같은 달", type: "text" }, { id: "yoy", label: "작년 대비", type: "gr" }], rows: kRows, note: "비율 지표(CVR·신규 비중·투입율·ROI)의 대비는 %p 차이예요. 진행 중인 달은 전월·작년을 같은 일수로 비교해요(광고비는 월 단위 값)." },
          { type: "table", id: "top", title: "매출 상위 5개 상품", cols: [{ id: "no", label: "No.", type: "int" }, { id: "name", label: "상품", type: "text" }, { id: "sales", label: "매출(K)", type: "k" }, { id: "share", label: "비중", type: "pct" }, { id: "yoy", label: "작년 동기 대비", type: "gr" }, { id: "pv", label: "PV", type: "int" }, { id: "cvr", label: "CVR", type: "pct1" }], rows: tRows },
          { type: "table", id: "ev", title: "최근 행사와 다음 행사", cols: [{ id: "ev", label: "행사", type: "text" }, { id: "per", label: "기간", type: "text" }, { id: "total", label: "총매출(K)", type: "k" }, { id: "avg", label: "하루 평균(K)", type: "k" }, { id: "note", label: "상태", type: "text" }], rows: evRows }
        ]
      };
    }
  });
})();

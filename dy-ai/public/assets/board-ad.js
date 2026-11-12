/* 보드 · 광고 효율(상품별): 상품별 광고비·광고 매출(광고센터) + 판매·PV(판매자센터) + 상품코드표
 *   ROAS = 광고 매출 ÷ 광고비, 광고 의존도 = 광고 매출 ÷ 상품 매출, 상품 CVR = 판매수량 ÷ PV
 *   (광고센터의 상품별 응답은 노출·클릭·장바구니·구매가 항상 0 으로 와서 상품 단위 CTR·광고 전환은 보여 주지 않는다. 필요하면 conversion API 를 상품마다 불러 따로 모아야 한다)
 *   분류(광고비 3만 엔 이상 기준): 확대 후보(ROAS 300%↑ & 의존도 60%↓) · 광고 의존 높음(의존도 60%↑) · 비효율(ROAS 100%↓) · 효율 보통 / 광고비 3만 엔 미만: 자연 판매 강자(매출 10위 이내) · 관찰
 * 광고 데이터는 2026-02 부터 있고, 광고센터가 상품에 묶지 않는 광고분은 상품 표에서 빠진다.
 */
(function () {
  "use strict";
  var B = window.dyBoard, D = window.dyDash; if (!B) return;
  var U = B.util, MIN_SPEND = 30000;
  var MET = ["g_net_amt", "g_net_qty", "g_pv", "ad_spend", "ad_sales"];

  function seg(it, topSales) {
    if (it.spend >= MIN_SPEND) {
      if (it.roas != null && it.roas < 100) return "비효율";
      if (it.dep != null && it.dep >= 60) return "광고 의존 높음";
      if (it.roas != null && it.roas >= 300) return "확대 후보";
      return "효율 보통";
    }
    return it.sales >= topSales ? "자연 판매 강자" : "관찰";
  }
  function totals(rows) {
    var t = { sales: 0, qty: 0, pv: 0, spend: 0, adSales: 0 };
    rows.forEach(function (r) { Object.keys(t).forEach(function (k) { t[k] += r[k]; }); });
    t.roas = t.spend ? t.adSales / t.spend * 100 : null; t.dep = t.sales ? t.adSales / t.sales * 100 : null; t.cvr = t.pv ? t.qty / t.pv * 100 : null;
    return t;
  }

  B.define({
    id: "ad", label: "광고 효율", title: "상품별 광고 효율", eyebrow: "Ad efficiency · by product", unit: "(K JPY) · 광고센터 상품별 광고 + 판매자센터 판매",
    chartNote: "상위 상품 그래프에 보이는 상품 수를 정해요.",
    selects: [{ key: "topn", label: "그래프에 보일 상품 수", options: [["8", "8개"], ["12", "12개"], ["16", "16개"]], def: "12" }],
    help: [
      ["이 화면은", ["상품마다 광고비를 얼마 쓰고 광고로 얼마를 팔았는지(ROAS), 매출이 광고에 얼마나 기대는지(광고 의존도)를 한 표에서 보는 화면이에요. 광고비를 늘릴 상품, 줄일 상품, 광고 없이도 팔리는 상품을 가려내는 용도예요.",
        "기준 월을 고르면 그 달(진행 중이면 데이터가 있는 마지막 날까지)을 직전 달 같은 일수와 비교해요. 광고센터 데이터는 2026-02부터라 그 이전 달은 고를 수 없어요."]],
      ["숫자 정의", ["광고비·광고 매출 = 광고센터가 상품에 묶어 준 값(스토어 전체 광고비보다 조금 작아요: 구좌형 광고 등 상품에 안 묶이는 분이 빠져요). 매출·PV·수량 = 판매자센터의 상품별 값(순매출).",
        "ROAS = 광고 매출 ÷ 광고비. 광고 의존도 = 광고 매출 ÷ 상품 매출(100%를 넘으면 광고 클릭 후 며칠 뒤 구매까지 광고 매출로 잡히는 시차 때문이에요). 상품 CVR = 판매수량 ÷ PV. 광고센터가 상품별로는 노출·클릭·구매를 주지 않아서 상품 단위 광고 클릭률·광고 전환은 없어요."]],
      ["분류 기준", ["광고비 3만 엔 이상인 상품: ROAS 100% 미만이면 ‘비효율’, 광고 의존도 60% 이상이면 ‘광고 의존 높음’, ROAS 300% 이상이면서 의존도가 낮으면 ‘확대 후보’, 나머지는 ‘효율 보통’.",
        "광고비 3만 엔 미만인 상품: 그 달 매출 10위 이내면 ‘자연 판매 강자’(광고 없이도 팔림), 나머지는 ‘관찰’. 분류는 단순 규칙이라 참고용이에요."]],
      ["코멘트 기준 (자동)", ["1) 광고비·광고 매출·ROAS(전월 대비). 2) 광고 의존도와 상품 CVR. 3) ROAS 가장 높은·낮은 상품(광고비 3만 엔 이상). 4) 확대 후보·비효율 상품 이름. 5) 자연 판매 강자.",
        "‘코멘트 입력’에서 직접 쓴 코멘트는 이 화면에 하나 저장돼요."]],
      ["알아둘 점", ["상품 이름은 상품코드표 기준이고 없으면 판매자센터 이름이에요. 상품명이 시기마다 달라서 여러 코드가 있는 상품은 코드별로 따로 나와요."]]
    ],
    setup: function () {
      return B.bounds().then(function (b) {
        var r = b && b.adgoods; if (!r || !r.min) throw new Error("광고 데이터가 아직 없어요. 수집기에서 Q10 수집을 한 번 하면 채워져요.");
        var ms = B.months(r.min, r.max).reverse();
        return [{ id: "month", label: "기준 월", options: ms.map(function (k) { return [k, k.slice(0, 4) + " " + k.slice(5, 7) + (k === U.mk(r.max) && +r.max.slice(8, 10) < U.lastDay(k) ? " (진행 중)" : "")]; }), value: ms[0] }];
      });
    },
    noteKey: function (ctx) { return ctx.v.month; },
    load: function (ctx) {
      var k = ctx.v.month;
      return Promise.all([B.bounds(), B.products()]).then(function (r) {
        var maxd = r[0].adgoods.max, to = maxd < U.monthEnd(k) ? maxd : U.monthEnd(k), n = U.diffD(to, k) + 1, pk = U.addM(k, -1), pto = U.addD(pk, Math.min(n, U.lastDay(pk)) - 1);
        var q = function (a, b, dim) { return D.query({ metrics: MET, grain: "all", range: { from: a, to: b }, dim: dim ? "gd_no" : undefined, top: dim ? 200 : undefined, topMetric: dim ? "g_net_amt" : undefined }); };
        return Promise.all([q(k, to, true), q(pk, pto, false)]).then(function (x) {
          var master = r[1], cur = x[0], prev = x[1].rows[pk] || {};
          var items = Object.keys(cur.rows).map(function (gd) {
            var v = cur.rows[gd], m = master[gd] || {}, o = { gd: gd, name: m.product_name || cur.labels[gd] || gd, line: m.line || "", sales: v.g_net_amt || 0, qty: v.g_net_qty || 0, pv: v.g_pv || 0, spend: v.ad_spend || 0, adSales: v.ad_sales || 0 };
            o.roas = o.spend ? o.adSales / o.spend * 100 : null; o.dep = o.sales > 0 ? o.adSales / o.sales * 100 : null; o.cvr = o.pv ? o.qty / o.pv * 100 : null;
            return o;
          }).filter(function (o) { return o.sales > 0 || o.spend > 0; }).sort(function (a, b) { return b.sales - a.sales; });
          var top10 = items.length >= 10 ? items[9].sales : (items.length ? items[items.length - 1].sales : 0);
          items.forEach(function (o, i) { o.no = i + 1; o.seg = seg(o, top10); });
          var pt = { sales: prev.g_net_amt || 0, spend: prev.ad_spend || 0, adSales: prev.ad_sales || 0 }; pt.roas = pt.spend ? pt.adSales / pt.spend * 100 : null;
          return { k: k, to: to, part: to < U.monthEnd(k), items: items, tot: totals(items), prev: pt, pk: pk, pto: pto };
        });
      });
    },
    view: function (d, ctx) {
      var items = d.items, t = d.tot, p = d.prev, topn = +ctx.cfg.sel.topn || 12, MIN = MIN_SPEND;
      var growth = U.growth;
      var kp = [
        { label: "상품 광고비", value: U.kv(t.spend) + "K", sub: p.spend ? "전월 같은 일수 대비 " + U.gs(growth(t.spend, p.spend)) : "" },
        { label: "광고 매출", value: U.kv(t.adSales) + "K", sub: p.adSales ? "전월 대비 " + U.gs(growth(t.adSales, p.adSales)) : "" },
        { label: "ROAS", value: U.pct(t.roas), sub: p.roas != null ? "전월 " + U.pct(p.roas) : "", cls: t.roas != null && p.roas != null ? (t.roas >= p.roas ? "is-up" : "is-down") : "" },
        { label: "광고 의존도", value: U.pct(t.dep, 1), sub: "상품 매출 " + U.kv(t.sales) + "K 중 광고 매출" },
        { label: "상품 CVR", value: U.pct(t.cvr, 2), sub: "판매수량 " + U.num(t.qty) + " ÷ PV " + U.num(t.pv) },
        { label: "광고 집행 상품", value: items.filter(function (o) { return o.spend > 0; }).length + "개", sub: "광고비 3만 엔 이상 " + items.filter(function (o) { return o.spend >= MIN; }).length + "개" }
      ];
      // 코멘트
      var L = [], big = items.filter(function (o) { return o.spend >= MIN && o.roas != null; }).sort(function (a, b) { return b.roas - a.roas; });
      L.push({ t: "상품 광고비 " + U.mil(t.spend) + (p.spend ? " (전월 " + U.gs(growth(t.spend, p.spend)) + ")" : "") + " · 광고 매출 " + U.mil(t.adSales) + " · ROAS " + U.pct(t.roas) + (p.roas != null ? " (전월 " + U.pct(p.roas) + ")" : "") });
      L.push({ t: "광고 의존도 " + U.pct(t.dep, 1) + " (상품 매출 " + U.mil(t.sales) + " 중 광고 매출) · 상품 CVR " + U.pct(t.cvr, 2) });
      if (big.length >= 2) L.push({ t: "ROAS 가장 높은 상품 " + U.short(big[0].name, 18) + " " + U.pct(big[0].roas) + " (광고비 " + U.kv(big[0].spend) + "K) · 가장 낮은 상품 " + U.short(big[big.length - 1].name, 18) + " " + U.pct(big[big.length - 1].roas) + " (광고비 " + U.kv(big[big.length - 1].spend) + "K)", c: big[big.length - 1].roas < 100 ? "is-neg" : "" });
      var ex = items.filter(function (o) { return o.seg === "확대 후보"; }), bad = items.filter(function (o) { return o.seg === "비효율"; }), nat = items.filter(function (o) { return o.seg === "자연 판매 강자"; });
      if (ex.length) L.push({ t: "광고 확대 후보 " + ex.length + "개: " + ex.slice(0, 4).map(function (o) { return U.short(o.name, 14) + " (ROAS " + U.pct(o.roas) + ")"; }).join(", ") });
      if (bad.length) L.push({ t: "비효율 " + bad.length + "개(광고비 " + U.kv(U.sum(bad, function (o) { return o.spend; })) + "K, ROAS 100% 미만): " + bad.slice(0, 4).map(function (o) { return U.short(o.name, 14) + " " + U.pct(o.roas); }).join(", "), c: "is-neg" });
      if (nat.length) L.push({ t: "광고 없이도 잘 팔리는 상품: " + nat.slice(0, 4).map(function (o) { return U.short(o.name, 14) + " (" + U.kv(o.sales) + "K)"; }).join(", ") });
      // 그래프
      var bySpend = items.filter(function (o) { return o.spend > 0; }).sort(function (a, b) { return b.spend - a.spend; }).slice(0, topn), bySales = items.slice(0, topn);
      var chart1 = function (light) {
        var tk = U.tick(light);
        return { data: { labels: bySpend.map(function (o) { return U.short(o.name, 10); }), datasets: [
          { type: "bar", label: "광고비(K)", data: bySpend.map(function (o) { return Math.round(o.spend / 1000); }), backgroundColor: "#8aa4d6", yAxisID: "y" },
          { type: "bar", label: "광고 매출(K)", data: bySpend.map(function (o) { return Math.round(o.adSales / 1000); }), backgroundColor: "#f2b35e", yAxisID: "y" },
          { type: "line", label: "ROAS(%)", data: bySpend.map(function (o) { return o.roas == null ? null : Math.round(o.roas); }), borderColor: "#2b9a73", backgroundColor: "#2b9a73", yAxisID: "y1" }] },
          options: { responsive: !light, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: tk } } },
            scales: { x: { ticks: { color: tk, maxRotation: 60 }, grid: { display: false } }, y: { beginAtZero: true, min: 0, ticks: { color: tk }, title: { display: true, text: "K JPY", color: tk } },
              y1: { position: "right", beginAtZero: true, min: 0, grid: { drawOnChartArea: false }, ticks: { color: tk, callback: function (v) { return v + "%"; } } } } } };
      };
      var chart2 = function (light) {
        var tk = U.tick(light);
        return { type: "bar", data: { labels: bySales.map(function (o) { return U.short(o.name, 14); }), datasets: [
          { label: "광고 매출(K)", data: bySales.map(function (o) { return Math.round(Math.min(o.adSales, o.sales) / 1000); }), backgroundColor: "#f2b35e" },
          { label: "그 외 매출(K)", data: bySales.map(function (o) { return Math.round(Math.max(o.sales - o.adSales, 0) / 1000); }), backgroundColor: "#8aa4d6" }] },
          options: { indexAxis: "y", responsive: !light, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: tk } } },
            scales: { x: { stacked: true, beginAtZero: true, ticks: { color: tk }, title: { display: true, text: "K JPY", color: tk } }, y: { stacked: true, ticks: { color: tk }, grid: { display: false } } } } };
      };
      var cols = [{ id: "no", label: "No.", type: "int" }, { id: "name", label: "상품", type: "text" }, { id: "seg", label: "분류", type: "text" }, { id: "sales", label: "매출(K)", type: "k" }, { id: "spend", label: "광고비(K)", type: "k" },
        { id: "adSales", label: "광고 매출(K)", type: "k" }, { id: "roas", label: "ROAS", type: "pct" }, { id: "dep", label: "광고 의존도", type: "pct" },
        { id: "qty", label: "판매수량", type: "int" }, { id: "pv", label: "PV", type: "int" }, { id: "cvr", label: "상품 CVR", type: "pct1" }];
      var rows = items.slice(0, 40).map(function (o) { return { id: o.gd, vals: { no: o.no, name: o.name, seg: o.seg, sales: o.sales, spend: o.spend || null, adSales: o.spend ? o.adSales : null, roas: o.roas, dep: o.spend ? o.dep : null, qty: o.qty, pv: o.pv, cvr: o.cvr } }; });
      var SEGS = ["확대 후보", "효율 보통", "광고 의존 높음", "비효율", "자연 판매 강자", "관찰"];
      var segRows = SEGS.map(function (s) {
        var m = items.filter(function (o) { return o.seg === s; }), tt = totals(m);
        return { id: s, vals: { seg: s, n: m.length, sales: tt.sales, spend: tt.spend || null, adSales: tt.spend ? tt.adSales : null, roas: tt.roas } };
      });
      return {
        title: "상품별 광고 효율 · " + d.k.slice(0, 4) + " " + d.k.slice(5, 7) + (d.part ? " (" + U.md(d.to) + "까지)" : ""), comments: L,
        notice: (d.part ? "진행 중인 달이라 " + U.md(d.to) + "까지의 값이고, 전월은 같은 일수(" + U.md(d.pk) + "~" + U.md(d.pto) + ")와 비교해요. " : "") + "광고비는 광고센터가 상품에 묶은 값이라 스토어 전체 광고비보다 작아요.",
        sections: [
          { type: "kpi", items: kp },
          { type: "chart", id: "top", title: "광고비 상위 상품: 광고비 · 광고 매출 · ROAS", config: chart1 },
          { type: "chart", id: "dep", title: "매출 상위 상품: 광고 매출 vs 그 외 매출", config: chart2 },
          { type: "table", id: "seg", title: "분류별 요약", cols: [{ id: "seg", label: "분류", type: "text" }, { id: "n", label: "상품 수", type: "int" }, { id: "sales", label: "매출(K)", type: "k" }, { id: "spend", label: "광고비(K)", type: "k" }, { id: "adSales", label: "광고 매출(K)", type: "k" }, { id: "roas", label: "ROAS", type: "pct" }], rows: segRows },
          { type: "table", id: "prod", title: "상품별 상세 (매출 상위 40개)", cols: cols, rows: rows, note: "분류: 광고비 3만 엔 이상은 ROAS·광고 의존도로, 3만 엔 미만은 매출 10위 이내면 ‘자연 판매 강자’. 광고 매출은 클릭 후 시차 구매까지 잡혀 의존도가 100%를 넘을 수 있어요." }
        ]
      };
    }
  });
})();

/* 보드 · 랭킹·판매 진단: 이니스프리(イニスフリー) 주간 랭킹 진입(q10_rank_log, weekly)과 그 주의 매출·PV·CVR(판매자센터)을 겹쳐 본다.
 * 일간 랭킹(상위 200)에는 이니스프리 상품이 거의 오르지 않고(2026-08-29~ 2회) 주간·월간 랭킹에 진입 기록이 있어서 주간 스냅샷을 기준으로 삼는다.
 * 랭킹의 상품명이 판매 상품명과 시점마다 달라서(28개 중 정확히 일치 2개) 상품 단위 연결은 하지 않고 브랜드(이니스프리 전체) 단위로 비교한다.
 *   스냅샷 날짜 t 마다: 진입 상품 수(중복 없이) · 카테고리 진입 합계 · 최고/평균 순위 ↔ t 이전 7일 매출·PV·CVR, t 다음 7일 매출
 *   상관 = 스냅샷별 값의 피어슨 상관계수(인과 아님). 행사(메가와리·메가포) 기간이 겹치는 주는 기본으로 뺀다.
 */
(function () {
  "use strict";
  var B = window.dyBoard, D = window.dyDash; if (!B) return;
  var U = B.util, BRAND = "イニスフリー";

  B.define({
    id: "rank", label: "랭킹·판매", title: "랭킹 진입과 판매", eyebrow: "Ranking × sales", unit: "(K JPY) · 이니스프리 주간 랭킹 진입 vs 그 주 매출·PV·CVR",
    chartNote: "행사 기간이 겹치는 주를 뺄지 정해요(기본: 뺌). 행사 주에는 진입도 매출도 같이 커져서 상관이 부풀려져요.",
    selects: [{ key: "excl", label: "행사(메가와리·메가포) 기간이 겹치는 주", options: [["yes", "빼고 비교"], ["no", "포함해서 비교"]], def: "yes" }],
    help: [
      ["이 화면은", ["이니스프리 상품이 주간 랭킹(카테고리별)에 얼마나 올라 있던 주에 매출·PV·CVR이 어땠는지 보는 화면이에요. 랭킹 진입이 실제 판매와 맞물리는지, 진입이 많은 주와 적은 주의 차이가 얼마인지 확인해요.",
        "일간 랭킹(상위 200)에는 이니스프리 상품이 거의 오르지 않아서(2026-08-29부터 2번) 주간 랭킹 스냅샷을 기준으로 해요. 랭킹의 상품명이 판매 상품명과 시점마다 달라서 상품 단위 연결은 못 하고 이니스프리 전체(브랜드) 단위로 비교해요."]],
      ["숫자 정의", ["스냅샷 = 주간 랭킹을 수집한 날. 진입 상품 수 = 그날 주간 랭킹에 오른 이니스프리 상품 수(같은 상품이 여러 카테고리에 올라도 한 번), 카테고리 진입 합계 = 카테고리별 진입을 그대로 더한 수, 순위는 낮을수록 좋아요.",
        "‘그 주 매출’ = 스냅샷 날짜까지 7일의 매출, ‘다음 주 매출’ = 그 다음 7일. CVR = 판매수량 ÷ PV. 상관 = 스냅샷별 진입 수와 매출·PV·CVR의 피어슨 상관계수(−1~1)이고 인과가 아니에요. 스냅샷이 5개 미만이면 계산하지 않아요.",
        "행사(메가와리·메가포) 기간이 겹치는 주는 기본으로 빼요(설정에서 바꿀 수 있어요)."]],
      ["코멘트 기준 (자동)", ["1) 분석 기간·스냅샷 수·평균 진입 상품 수·최고 순위. 2) 진입이 많은 주(중앙값 이상)와 적은 주의 평균 매출 차이. 3) 상관계수. 4) 가장 오래 머문 상품. 5) 진입이 가장 많은 카테고리. ‘코멘트 입력’에서 직접 쓴 코멘트는 이 화면에 하나 저장돼요."]],
      ["알아둘 점", ["주간 랭킹은 수집한 날에만 값이 있어서 스냅샷 간격이 일정하지 않아요(보통 1~2주). 월간 랭킹은 표에 카테고리별로만 보여 줘요."]]
    ],
    setup: function () {
      return Promise.resolve([{ id: "days", label: "기간", options: [["180", "최근 6개월"], ["400", "최근 12개월 이상(전체)"]], value: "400" }]);
    },
    noteKey: function (ctx, d) { return U.mk(d ? d.to : D.anchor()); },
    load: function (ctx) {
      var N = +ctx.v.days;
      return D.loadBounds().then(function () {
        var to = D.anchor(), from = U.addD(to, -(N - 1));
        return Promise.all([B.page("rank", U.addD(from, -7), to, BRAND), B.events(), D.query({ metrics: ["net_sales", "total_pv", "net_qty"], grain: "day", range: { from: U.addD(from, -7), to: to } })]).then(function (x) {
          var rows = (x[0] || []).filter(function (q) { return q.brand && q.brand.indexOf(BRAND) >= 0; });
          var evDay = {}; x[1].forEach(function (e) { for (var d = e.start; d <= e.end; d = U.addD(d, 1)) evDay[d] = 1; });
          var daily = rows.filter(function (q) { return q.period === "daily"; }), weekly = rows.filter(function (q) { return q.period === "weekly"; }), monthly = rows.filter(function (q) { return q.period === "monthly"; });
          var S = x[2].rows, win = function (a, b) { var s = 0, p = 0, q = 0, n = 0, ev = false; for (var d = a; d <= b; d = U.addD(d, 1)) { var r = S[d]; if (r) { s += r.net_sales || 0; p += r.total_pv || 0; q += r.net_qty || 0; n++; } if (evDay[d]) ev = true; } return { sales: s, pv: p, qty: q, n: n, ev: ev, cvr: p ? q / p * 100 : null }; };
          var by = {}; weekly.forEach(function (q) { var t = String(q.rank_date).slice(0, 10); (by[t] = by[t] || []).push(q); });
          var snaps = Object.keys(by).sort().filter(function (t) { return t >= from && t <= to; }).map(function (t) {
            var list = by[t], names = {}; list.forEach(function (q) { names[q.product_name] = 1; });
            var ranks = list.map(function (q) { return q.rank; }), w = win(U.addD(t, -6), t), nx = win(U.addD(t, 1), U.addD(t, 7));
            return { t: t, prods: Object.keys(names).length, cats: list.length, best: Math.min.apply(null, ranks), avg: U.avg(ranks), w: w, nx: nx, nxOk: nx.n === 7 && U.addD(t, 7) <= to };
          });
          return { from: from, to: to, snaps: snaps, weekly: weekly, monthly: monthly, daily: daily, N: N };
        });
      });
    },
    view: function (d, ctx) {
      var excl = ctx.cfg.sel.excl === "yes", ok = d.snaps.filter(function (o) { return o.w.n === 7; }), use = excl ? ok.filter(function (o) { return !o.w.ev; }) : ok;
      if (!d.snaps.length) return { title: "랭킹 진입과 판매", notice: "선택한 기간에 주간 랭킹 스냅샷이 없어요.", comments: [{ t: "주간 랭킹 스냅샷이 없는 기간이에요." }], sections: [] };
      var fr = function (r) { return r == null ? "-" : (r >= 0 ? "+" : "") + r.toFixed(2); };
      var X = use.map(function (o) { return o.prods; }), rS = U.pearson(X, use.map(function (o) { return o.w.sales; })), rP = U.pearson(X, use.map(function (o) { return o.w.pv; })),
        rC = U.pearson(X, use.map(function (o) { return o.w.cvr; })), rN = U.pearson(X, use.map(function (o) { return o.nxOk ? o.nx.sales : null; })), rA = U.pearson(use.map(function (o) { return o.avg; }), use.map(function (o) { return o.w.sales; }));
      var med = U.median(X), hi = use.filter(function (o) { return o.prods >= med; }), lo = use.filter(function (o) { return o.prods < med; });
      var aHi = U.avg(hi.map(function (o) { return o.w.sales; })), aLo = U.avg(lo.map(function (o) { return o.w.sales; }));
      var best = Math.min.apply(null, d.snaps.map(function (o) { return o.best; }));
      var L = [];
      L.push({ t: "분석 스냅샷 " + d.snaps.length + "회(" + U.md(d.snaps[0].t) + "~" + U.md(d.snaps[d.snaps.length - 1].t) + ")" + (excl ? ", 행사와 겹친 " + (ok.length - use.length) + "회 제외 → " + use.length + "회" : "") + " · 평균 진입 상품 " + (U.avg(d.snaps.map(function (o) { return o.prods; })) || 0).toFixed(1) + "개 · 최고 순위 " + best + "위" });
      if (hi.length >= 3 && lo.length >= 3 && aLo) L.push({ t: "진입 상품이 많은 주(" + med + "개 이상, " + hi.length + "회) 평균 주간 매출 " + U.kv(aHi) + "K — 적은 주(" + lo.length + "회) " + U.kv(aLo) + "K 대비 " + U.gs(U.growth(aHi, aLo)), c: aHi >= aLo ? "" : "is-neg" });
      L.push({ t: "상관(진입 상품 수 ↔ 그 주 매출 " + fr(rS) + " · 다음 주 매출 " + fr(rN) + " · PV " + fr(rP) + " · CVR " + fr(rC) + " / 평균 순위 ↔ 매출 " + fr(rA) + ") — " + (rS == null ? "스냅샷이 부족해서 계산하지 못했어요" : Math.abs(rS) < .25 ? "진입 수와 그 주 매출의 관계는 약해요" : rS > 0 ? "진입이 많은 주에 매출도 큰 편이에요" : "진입이 많은 주에 오히려 매출이 작았어요") });
      var byP = {}; d.weekly.forEach(function (q) { var k = q.product_name, o = byP[k] = byP[k] || { name: k, ts: {}, best: 999, ranks: [], last: "", cats: {} }; var t = String(q.rank_date).slice(0, 10); o.ts[t] = 1; o.best = Math.min(o.best, q.rank); o.ranks.push(q.rank); o.cats[q.category] = 1; if (t > o.last) o.last = t; });
      var prods = Object.keys(byP).map(function (k) { var o = byP[k]; o.n = Object.keys(o.ts).length; o.avg = U.avg(o.ranks); return o; }).sort(function (a, b) { return b.n - a.n || a.best - b.best; });
      if (prods.length) L.push({ t: "가장 오래 머문 상품 " + U.short(prods[0].name, 22) + " (" + prods[0].n + "회 스냅샷, 최고 " + prods[0].best + "위)" });
      var byC = {}; d.weekly.forEach(function (q) { var o = byC[q.category] = byC[q.category] || { cat: q.category, n: 0, ranks: [], prods: {} }; o.n++; o.ranks.push(q.rank); o.prods[q.product_name] = 1; });
      var cats = Object.keys(byC).map(function (k) { var o = byC[k]; o.avg = U.avg(o.ranks); o.np = Object.keys(o.prods).length; return o; }).sort(function (a, b) { return b.n - a.n; });
      if (cats.length) L.push({ t: "진입이 가장 많은 카테고리 " + cats[0].cat + " (" + cats[0].n + "건, 평균 " + cats[0].avg.toFixed(0) + "위)" });
      var chart1 = function (light) {
        var tk = U.tick(light);
        return { data: { labels: d.snaps.map(function (o) { return U.md(o.t); }), datasets: [
          { type: "bar", label: "이니스프리 진입 상품 수", data: d.snaps.map(function (o) { return o.prods; }), backgroundColor: d.snaps.map(function (o) { return o.w.ev ? "#c9c9c9" : "#8aa4d6"; }), yAxisID: "y" },
          { type: "line", label: "그 주 매출(K)", data: d.snaps.map(function (o) { return o.w.n === 7 ? Math.round(o.w.sales / 1000) : null; }), borderColor: "#e06b2b", backgroundColor: "#e06b2b", yAxisID: "y1", tension: .25, pointRadius: 3 }] },
          options: { responsive: !light, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: tk } } },
            scales: { x: { ticks: { color: tk, maxRotation: 60, autoSkip: true, maxTicksLimit: 18 }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: tk, precision: 0 }, title: { display: true, text: "진입 상품 수", color: tk } },
              y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { color: tk }, title: { display: true, text: "주간 매출(K)", color: tk } } } } };
      };
      var chart2 = function (light) {
        var tk = U.tick(light);
        return { type: "bar", data: { labels: ["진입 많은 주 (" + hi.length + "회)", "진입 적은 주 (" + lo.length + "회)"], datasets: [{ label: "주간 평균 매출(K)", data: [aHi == null ? null : Math.round(aHi / 1000), aLo == null ? null : Math.round(aLo / 1000)], backgroundColor: ["#f2b35e", "#8aa4d6"] }] },
          options: { responsive: !light, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: tk }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: tk }, title: { display: true, text: "K JPY", color: tk } } } } };
      };
      var snapRows = d.snaps.slice().reverse().map(function (o) { return { id: o.t, cls: o.w.ev ? "is-flag" : "", vals: { t: o.t.slice(5) + (o.w.ev ? " (행사 겹침)" : ""), prods: o.prods, cats: o.cats, best: o.best, avg: o.avg, sales: o.w.n === 7 ? o.w.sales : null, pv: o.w.n === 7 ? o.w.pv : null, cvr: o.w.cvr, nx: o.nxOk ? o.nx.sales : null } }; });
      var mCat = {}; d.monthly.forEach(function (q) { var o = mCat[q.category] = mCat[q.category] || { cat: q.category, n: 0, ranks: [] }; o.n++; o.ranks.push(q.rank); });
      var mRows = Object.keys(mCat).map(function (k) { return { cat: k, n: mCat[k].n, avg: U.avg(mCat[k].ranks) }; }).sort(function (a, b) { return b.n - a.n; });
      return {
        title: "랭킹 진입과 판매 · " + U.md(d.snaps[0].t) + "~" + U.md(d.snaps[d.snaps.length - 1].t), comments: L,
        notice: "주간 랭킹 스냅샷 기준이에요. 일간 랭킹(상위 200)에는 이니스프리가 " + d.daily.length + "번만 올라 일 단위 비교는 하지 않았어요. 랭킹 상품명이 판매 상품명과 달라서 상품 단위 연결 없이 브랜드 단위로 비교해요." + (excl ? " 행사와 겹친 주는 상관·구간 비교에서 뺐어요(표에는 노란 줄)." : ""),
        sections: [
          { type: "kpi", items: [
            { label: "스냅샷 수", value: d.snaps.length + "회", sub: use.length + "회 분석에 사용" },
            { label: "평균 진입 상품", value: (U.avg(d.snaps.map(function (o) { return o.prods; })) || 0).toFixed(1) + "개", sub: "스냅샷당 이니스프리" },
            { label: "최고 순위", value: best + "위", sub: "기간 내 이니스프리 최고" },
            { label: "상관: 진입 ↔ 그 주 매출", value: fr(rS), sub: "다음 주 매출 " + fr(rN) },
            { label: "상관: 진입 ↔ CVR", value: fr(rC), sub: "PV " + fr(rP) },
            { label: "진입 많은 주 평균 매출", value: aHi != null ? U.kv(aHi) + "K" : "-", sub: aLo != null ? "적은 주 " + U.kv(aLo) + "K" : "" }] },
          { type: "chart", id: "snap", title: "주간 랭킹 스냅샷별 진입 상품 수와 그 주 매출 (회색 막대 = 행사 겹침)", config: chart1 },
          { type: "chart", id: "split", title: "진입 많은 주 vs 적은 주 평균 매출", config: chart2, small: true },
          { type: "table", id: "corr", title: "진입 수와 판매 지표의 상관 (피어슨, −1~1)", cols: [{ id: "m", label: "비교", type: "text" }, { id: "r", label: "상관계수", type: "dec2" }, { id: "n", label: "스냅샷 수", type: "int" }],
            rows: [["진입 상품 수 ↔ 그 주 매출", rS], ["진입 상품 수 ↔ 다음 주 매출", rN], ["진입 상품 수 ↔ 그 주 PV", rP], ["진입 상품 수 ↔ 그 주 CVR", rC], ["평균 순위 ↔ 그 주 매출", rA]].map(function (x) { return { id: x[0], vals: { m: x[0], r: x[1], n: use.length } }; }),
            note: "상관은 같이 움직였다는 뜻일 뿐 원인을 말하지는 않아요. 스냅샷 수가 적을수록 불안정해요. 평균 순위는 낮을수록 좋아서 음의 상관이 ‘순위가 좋을수록 매출이 큼’이에요." },
          { type: "table", id: "snaps", title: "스냅샷별 상세 (최신순)", cols: [{ id: "t", label: "스냅샷", type: "text" }, { id: "prods", label: "진입 상품", type: "int" }, { id: "cats", label: "카테고리 진입 합계", type: "int" }, { id: "best", label: "최고 순위", type: "int" }, { id: "avg", label: "평균 순위", type: "dec1" },
            { id: "sales", label: "그 주 매출(K)", type: "k" }, { id: "pv", label: "그 주 PV", type: "int" }, { id: "cvr", label: "그 주 CVR", type: "pct1" }, { id: "nx", label: "다음 주 매출(K)", type: "k" }], rows: snapRows },
          { type: "table", id: "prod", title: "주간 랭킹에 오른 이니스프리 상품 (스냅샷 수 순)", cols: [{ id: "name", label: "상품(랭킹 표기)", type: "text" }, { id: "n", label: "진입 스냅샷", type: "int" }, { id: "best", label: "최고 순위", type: "int" }, { id: "avg", label: "평균 순위", type: "dec1" }, { id: "last", label: "마지막 진입일", type: "text" }, { id: "nc", label: "카테고리 수", type: "int" }],
            rows: prods.slice(0, 25).map(function (o, i) { return { id: "p" + i, vals: { name: U.short(o.name, 40), n: o.n, best: o.best, avg: o.avg, last: o.last.slice(5), nc: Object.keys(o.cats).length } }; }) },
          { type: "table", id: "cat", title: "주간 랭킹 카테고리별 진입", cols: [{ id: "cat", label: "카테고리", type: "text" }, { id: "n", label: "진입 건수", type: "int" }, { id: "np", label: "상품 수", type: "int" }, { id: "avg", label: "평균 순위", type: "dec1" }], rows: cats.map(function (o) { return { id: "c" + o.cat, vals: { cat: o.cat, n: o.n, np: o.np, avg: o.avg } }; }) },
          { type: "table", id: "mon", title: "월간 랭킹 카테고리별 진입", cols: [{ id: "cat", label: "카테고리", type: "text" }, { id: "n", label: "진입 건수", type: "int" }, { id: "avg", label: "평균 순위", type: "dec1" }], rows: mRows.map(function (o) { return { id: "m" + o.cat, vals: o }; }) }
        ]
      };
    }
  });
})();

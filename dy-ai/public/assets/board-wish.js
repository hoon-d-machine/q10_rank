/* 보드 · 찜·장바구니 → 행사 준비: 상품별 찜·장바구니 스냅샷(판매자센터 customer/table/goods, 수집한 날의 누적값) × 직전 행사(메가와리 또는 메가포) 상품별 판매 × 상품코드표
 *   스냅샷은 매일 수집하는 날부터 쌓인다(2026-11-11~). 비교 기간 안에 스냅샷이 2개 이상이면 찜·장바구니 증감을, 1개뿐이면 현재 수준만 보여 준다.
 *   준비 우선순위(상품별): 찜 증감(또는 현재 찜)과 직전 행사 판매수량이 둘 다 상위 25% → ‘재고 확보 우선’, 찜만 → ‘찜 급증/관심 높음’, 판매만 → ‘행사 강자’
 *   재고 수량은 이 시스템에 수집되지 않아서 재고 부족 여부는 판단하지 않는다.
 */
(function () {
  "use strict";
  var B = window.dyBoard, D = window.dyDash; if (!B) return;
  var U = B.util;
  function q75(vals) { vals = vals.filter(function (v) { return v != null && isFinite(v); }).sort(function (a, b) { return a - b; }); return vals.length ? vals[Math.floor((vals.length - 1) * 0.75)] : null; }

  B.define({
    id: "wish", label: "찜·장바구니", title: "찜·장바구니와 행사 준비", eyebrow: "Wishlist × event prep", unit: "찜·장바구니 수 · 직전 행사 판매(수량·K JPY)",
    chartNote: "그래프에 보일 상품 수를 정해요.",
    selects: [{ key: "topn", label: "그래프에 보일 상품 수", options: [["10", "10개"], ["15", "15개"], ["20", "20개"]], def: "15" }],
    help: [
      ["이 화면은", ["다음 행사에 재고·광고를 어느 상품에 집중할지 정하는 데 쓰는 화면이에요. 상품별 찜·장바구니(수집한 날의 누적 값)와 직전 같은 종류 행사에서 그 상품이 얼마나 팔렸는지를 겹쳐서 ‘재고 확보 우선’ 상품을 골라 줘요.",
        "찜·장바구니는 판매자센터가 현재 누적 값만 줘서 수집한 날부터 하루 한 번씩 쌓이고 있어요(2026-11-11~). 스냅샷이 2개 이상 쌓이면 ‘비교 기간’ 동안의 증감을, 1개뿐이면 현재 수준만 보여 줘요."]],
      ["우선순위 기준", ["찜 증감(스냅샷이 1개뿐이면 현재 찜 수)과 직전 행사 판매수량이 둘 다 상위 25%면 ‘재고 확보 우선’, 찜만 높으면 ‘찜 급증’(스냅샷 1개일 땐 ‘관심 높음’), 판매만 높으면 ‘행사 강자’예요. 단순 규칙이라 참고용이에요.",
        "재고 수량은 수집하지 않아서 재고가 모자란지는 판단하지 못해요. 직전 행사의 하루 평균 판매수량을 보고 필요한 수량을 가늠해 보세요."]],
      ["코멘트 기준 (자동)", ["1) 스냅샷 수·기간과 찜·장바구니 총량(증감). 2) 재고 확보 우선 상품. 3) 찜 증가가 큰 상품(증감이 있을 때) 또는 찜이 많은 상품. 4) 행사 강자인데 찜이 정체된 상품. ‘코멘트 입력’에서 직접 쓴 코멘트는 이 화면에 하나 저장돼요."]]
    ],
    setup: function () {
      return Promise.all([B.events(), D.loadBounds()]).then(function (r) {
        var anchor = D.anchor(), up = r[0].filter(function (e) { return e.start > anchor; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; })[0];
        return [{ id: "type", label: "참고할 직전 행사", options: [["MEGAWARI", "메가와리"], ["SUPERPOINT", "메가포"]], value: up ? up.type : "MEGAWARI" },
          { id: "days", label: "찜 증감 비교 기간", options: [["7", "최근 7일"], ["14", "최근 14일"], ["28", "최근 28일"]], value: "7" }];
      });
    },
    noteKey: function (ctx, d) { return U.mk(d ? d.L : D.anchor()); },
    load: function (ctx) {
      var N = +ctx.v.days;
      return Promise.all([B.bounds(), B.events(), B.products(), D.loadBounds()]).then(function (r) {
        var cg = r[0].custgoods; if (!cg || !cg.min) throw new Error("찜·장바구니 스냅샷이 아직 없어요. 수집기에서 Q10 수집을 한 번 하면 쌓이기 시작해요.");
        var anchor = D.anchor(), ev = r[1].filter(function (e) { return e.type === ctx.v.type && e.end <= anchor; })[0], master = r[2];
        return B.agg("custgoods", "day", cg.min, cg.max, ["wish_cnt", "basket_cnt"], "gd_no", 200, "wish_cnt").then(function (rows) {
          var dates = {}, by = {}; rows.forEach(function (x) { var p = String(x.p).slice(0, 10); dates[p] = 1; (by[p] = by[p] || {})[x.d] = { wish: x.wish_cnt || 0, basket: x.basket_cnt || 0, name: x.l }; });
          var ds = Object.keys(dates).sort(), L = ds[ds.length - 1], E = ds.filter(function (p) { return p >= U.addD(L, -N) && p < L; })[0] || null;
          var prevQ = ev ? D.query({ metrics: ["g_net_amt", "g_net_qty", "g_pv"], grain: "all", range: { from: ev.start, to: ev.end }, dim: "gd_no", top: 200, topMetric: "g_net_amt" }) : Promise.resolve(null);
          return prevQ.then(function (pq) { return { L: L, E: E, dates: ds, by: by, ev: ev, pq: pq, master: master, N: N }; });
        });
      });
    },
    view: function (d, ctx) {
      var cur = d.by[d.L] || {}, old = d.E ? d.by[d.E] || {} : null, pq = d.pq ? d.pq.rows : {}, evDays = d.ev ? U.diffD(d.ev.end, d.ev.start) + 1 : 0;
      var ids = {}; Object.keys(cur).forEach(function (g) { ids[g] = 1; }); Object.keys(pq).forEach(function (g) { ids[g] = 1; });
      var items = Object.keys(ids).map(function (g) {
        var c = cur[g] || { wish: 0, basket: 0 }, o = old ? old[g] || { wish: 0, basket: 0 } : null, p = pq[g] || {}, m = d.master[g] || {};
        var it = { gd: g, name: m.product_name || (d.pq && d.pq.labels[g]) || (cur[g] && cur[g].name) || g, wish: c.wish, basket: c.basket, dW: o ? c.wish - o.wish : null, dB: o ? c.basket - o.basket : null, dWp: o && o.wish ? U.growth(c.wish, o.wish) : null,
          sales: p.g_net_amt || 0, qty: p.g_net_qty || 0, pv: p.g_pv || 0 };
        it.perDay = evDays ? it.qty / evDays : null; return it;
      }).filter(function (it) { return it.wish > 0 || it.sales > 0; });
      var key = old ? "dW" : "wish", wT = q75(items.map(function (it) { return it[key]; })), qT = q75(items.filter(function (it) { return it.qty > 0; }).map(function (it) { return it.qty; }));
      items.forEach(function (it) {
        var hiW = wT != null && it[key] != null && it[key] >= wT && it[key] > 0, hiQ = qT != null && it.qty >= qT && it.qty > 0;
        it.seg = hiW && hiQ ? "재고 확보 우선" : hiW ? (old ? "찜 급증" : "관심 높음") : hiQ ? "행사 강자" : "";
      });
      items.sort(function (a, b) { return (b.seg === "재고 확보 우선") - (a.seg === "재고 확보 우선") || (b.wish - a.wish); });
      var tot = { wish: U.sum(items, function (i) { return i.wish; }), basket: U.sum(items, function (i) { return i.basket; }), dW: old ? U.sum(items, function (i) { return i.dW; }) : null, dB: old ? U.sum(items, function (i) { return i.dB; }) : null };
      var pri = items.filter(function (i) { return i.seg === "재고 확보 우선"; }), hot = items.filter(function (i) { return i.seg === "찜 급증" || i.seg === "관심 높음"; }), strong = items.filter(function (i) { return i.seg === "행사 강자"; });
      var topn = +ctx.cfg.sel.topn || 15, signed = function (v) { return v == null ? "-" : (v >= 0 ? "+" : "") + U.num(v); };
      var L = [];
      L.push({ t: "스냅샷 " + d.dates.length + "개(" + U.md(d.dates[0]) + "~" + U.md(d.L) + ") · 찜 합계 " + U.num(tot.wish) + (old ? " (" + U.md(d.E) + " 대비 " + signed(tot.dW) + ")" : "") + " · 장바구니 합계 " + U.num(tot.basket) + (old ? " (" + signed(tot.dB) + ")" : "") + (d.ev ? " · 참고 행사 " + B.evLabel(d.ev) + " 매출 " + U.mil(U.sum(items, function (i) { return i.sales; })) : "") });
      if (!old) L.push({ t: "스냅샷이 " + d.dates.length + "개뿐이라 찜·장바구니 증감은 며칠 더 쌓인 뒤(수집 버튼을 누를 때마다 하루 한 개) 계산돼요. 지금은 현재 수준으로 우선순위를 골랐어요." });
      if (pri.length) L.push({ t: "재고 확보 우선 " + pri.length + "개: " + pri.slice(0, 5).map(function (i) { return U.short(i.name, 14) + " (찜 " + U.num(i.wish) + (i.dW != null ? " " + signed(i.dW) : "") + ", 직전 행사 " + U.num(i.qty) + "개)"; }).join(", ") });
      else L.push({ t: "찜과 직전 행사 판매가 둘 다 높은 상품은 아직 없어요." });
      if (hot.length) L.push({ t: (old ? "찜이 크게 늘어난 상품: " : "찜이 많은 상품: ") + hot.slice(0, 4).map(function (i) { return U.short(i.name, 14) + " (" + U.num(i.wish) + (i.dW != null ? ", " + signed(i.dW) : "") + ")"; }).join(", ") });
      if (strong.length) L.push({ t: "직전 행사 강자인데 찜이 정체: " + strong.slice(0, 4).map(function (i) { return U.short(i.name, 14) + " (직전 행사 " + U.num(i.qty) + "개, 하루 " + (i.perDay || 0).toFixed(0) + "개)"; }).join(", ") });
      var byW = items.slice().sort(function (a, b) { return b.wish - a.wish; }).slice(0, topn), byQ = items.filter(function (i) { return i.qty > 0; }).sort(function (a, b) { return b.qty - a.qty; }).slice(0, topn);
      var chart1 = function (light) {
        var tk = U.tick(light);
        return { type: "bar", data: { labels: byW.map(function (i) { return U.short(i.name, 14); }), datasets: [{ label: "찜", data: byW.map(function (i) { return i.wish; }), backgroundColor: "#d65f8a" }, { label: "장바구니", data: byW.map(function (i) { return i.basket; }), backgroundColor: "#8aa4d6" }] },
          options: { indexAxis: "y", responsive: !light, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: tk } } }, scales: { x: { beginAtZero: true, ticks: { color: tk }, title: { display: true, text: "수", color: tk } }, y: { ticks: { color: tk }, grid: { display: false } } } } };
      };
      var chart2 = function (light) {
        var tk = U.tick(light);
        return { data: { labels: byQ.map(function (i) { return U.short(i.name, 10); }), datasets: [
          { type: "bar", label: "직전 행사 판매수량", data: byQ.map(function (i) { return i.qty; }), backgroundColor: "#f2b35e", yAxisID: "y" },
          { type: "line", label: "현재 찜", data: byQ.map(function (i) { return i.wish; }), borderColor: "#d65f8a", backgroundColor: "#d65f8a", yAxisID: "y1", tension: .2 }] },
          options: { responsive: !light, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: tk } } },
            scales: { x: { ticks: { color: tk, maxRotation: 60 }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: tk }, title: { display: true, text: "판매수량(개)", color: tk } }, y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { color: tk }, title: { display: true, text: "찜", color: tk } } } } };
      };
      var rows = items.slice(0, 40).map(function (i, n) { return { id: i.gd, vals: { no: n + 1, name: i.name, seg: i.seg, wish: i.wish, dW: i.dW, dWp: i.dWp, basket: i.basket, dB: i.dB, qty: i.qty, perDay: i.perDay, sales: i.sales, pv: i.pv } }; });
      var sgn = function (v) { return v >= 0 ? "is-up" : "is-down"; };
      return {
        title: "찜·장바구니와 행사 준비 · " + U.md(d.L) + " 기준", comments: L,
        notice: (old ? "" : "스냅샷이 " + d.dates.length + "개뿐이라 증감 없이 현재 수준으로 보여 줘요. ") + "재고 수량은 수집하지 않아서 재고 부족 여부는 판단하지 않아요. " + (d.ev ? "참고 행사: " + B.evLabel(d.ev) + " (" + U.md(d.ev.start) + "~" + U.md(d.ev.end) + ", " + evDays + "일)." : "참고할 이전 행사가 없어요."),
        sections: [
          { type: "kpi", items: [
            { label: "찜 합계", value: U.num(tot.wish), sub: old ? U.md(d.E) + " 대비 " + signed(tot.dW) : "스냅샷 " + d.dates.length + "개", cls: old ? (tot.dW >= 0 ? "is-up" : "is-down") : "" },
            { label: "장바구니 합계", value: U.num(tot.basket), sub: old ? U.md(d.E) + " 대비 " + signed(tot.dB) : "스냅샷 " + d.dates.length + "개" },
            { label: "재고 확보 우선", value: pri.length + "개", sub: pri.length ? U.short(pri[0].name, 14) + " 외" : "해당 없음" },
            { label: "찜 " + (old ? "급증" : "많은") + " 상품", value: hot.length + "개", sub: "행사 강자(찜 정체) " + strong.length + "개" },
            { label: "직전 행사 매출", value: d.ev ? U.kv(U.sum(items, function (i) { return i.sales; })) + "K" : "-", sub: d.ev ? B.evLabel(d.ev) : "" }] },
          { type: "chart", id: "wish", title: "찜이 많은 상품 (찜 · 장바구니)", config: chart1 },
          { type: "chart", id: "prev", title: "직전 행사 판매수량 상위 상품 vs 현재 찜", config: chart2 },
          { type: "table", id: "prod", title: "상품별 준비 현황 (재고 확보 우선 → 찜 순, 상위 40개)", cols: [{ id: "no", label: "No.", type: "int" }, { id: "name", label: "상품", type: "text" }, { id: "seg", label: "구분", type: "text" }, { id: "wish", label: "찜", type: "int" }, { id: "dW", label: "찜 증감", type: "int", cls: sgn }, { id: "dWp", label: "찜 증감률", type: "gr" },
            { id: "basket", label: "장바구니", type: "int" }, { id: "dB", label: "장바구니 증감", type: "int", cls: sgn }, { id: "qty", label: "직전 행사 판매수량", type: "int" }, { id: "perDay", label: "하루 평균 수량", type: "dec1" }, { id: "sales", label: "직전 행사 매출(K)", type: "k" }, { id: "pv", label: "직전 행사 PV", type: "int" }], rows: rows,
            note: "구분: 찜 증감(스냅샷이 1개면 현재 찜)과 직전 행사 판매수량이 둘 다 상위 25% = 재고 확보 우선, 찜만 = 찜 급증/관심 높음, 판매만 = 행사 강자. 재고 수량은 수집하지 않아요." }
        ]
      };
    }
  });
})();

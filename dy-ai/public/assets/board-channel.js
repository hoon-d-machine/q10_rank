/* 보드 · 유입 경로 효율: 일별 유입 경로별 PV(시트 MEGAPO 의 구분·경로와 같은 분류) × 판매 × 광고센터 광고비
 *   구분 = 큐텐 구좌 · 오가닉 · 내부 광고 · 외부 광고 · 구분 불가 (K.CH_SPEC). 구분별 월 추이·비중, 경로 상위, 광고 유형별 PV당 광고비, 구분별 일별 PV ↔ 일별 판매수량 상관.
 *   광고 유형 ↔ PV 열은 이름으로 짝지은 추정: 키워드플러스=검색결과_키워드플러스, 파워랭크업=검색결과_파워랭크업, 스마트세일즈=검색결과_스마트세일즈,
 *   타임세일=홈·검색결과_타임세일, 호리다시모노=홈·프로모션페이지_호리다시모노, Mega AD=프로모션페이지_오늘의메가할인·메가포 (모두 시트에서 ‘내부 광고’ 구분)
 *   진행 중인 달은 전월·작년의 같은 일수와 비교한다. 광고센터 데이터는 2026-02 부터.
 */
(function () {
  "use strict";
  var B = window.dyBoard, D = window.dyDash, K = window.dyInniKit; if (!B || !K) return;
  var U = B.util;
  var GROUPS = ["큐텐 구좌", "오가닉", "내부 광고", "외부 광고", "구분 불가"], GCOL = { "큐텐 구좌": "#7b6fd6", "오가닉": "#4fa88a", "내부 광고": "#f2a33a", "외부 광고": "#d65f5f", "구분 불가": "#b5b5b5" };
  var key = function (col) { return "pv_" + col.replace(/_pv$/, ""); };
  var SPEC = K.CH_SPEC.filter(function (x) { return D.METRICS[key(x[2])]; });       // 틱톡처럼 스토어 전체 열이 없는 경로는 뺀다
  var KEYS = SPEC.map(function (x) { return key(x[2]); });
  var ADMAP = [["keywordplus", "키워드플러스", ["sch_keywordplus_pv"]], ["power_rankup", "파워랭크업", ["sch_powerrank_pv"]], ["cps", "스마트세일즈", ["sch_cps_pv"]],
    ["timesale", "타임세일", ["mn_timesale_pv", "sch_timesale_pv"]], ["horidashimono", "호리다시모노", ["mn_chancedeal_pv", "dl_onedaychance_pv"]], ["mega", "Mega AD", ["dl_todaysmega_pv", "dl_todaysmega_po_pv"]]];

  function groupSums(row) { var g = {}; GROUPS.forEach(function (n) { g[n] = 0; }); SPEC.forEach(function (x) { g[x[0]] = (g[x[0]] || 0) + ((row && row[key(x[2])]) || 0); }); return g; }
  function adMap(rows) { var m = {}; (rows || []).forEach(function (r) { m[r.d] = { price: r.ad_price || 0, sales: r.ad_sales || 0 }; }); return m; }

  B.define({
    id: "channel", label: "유입 경로", title: "유입 경로 효율", eyebrow: "Traffic channels × ads", unit: "PV · (K JPY) · 구분은 시트 MEGAPO 의 유입 경로 분류",
    chartNote: "월별 PV 그래프를 막대(구분 누적) 또는 비중(100% 누적)으로 보여요.",
    selects: [{ key: "mode", label: "월별 PV 그래프", options: [["abs", "PV 수 (누적 막대)"], ["share", "비중 (100% 누적)"]], def: "abs" }],
    help: [
      ["이 화면은", ["스토어로 들어오는 PV가 어느 경로(큐텐 구좌·오가닉·내부 광고·외부 광고)에서 오는지, 그 비중이 어떻게 달라지는지, 광고 유형마다 PV 하나를 얻는 데 광고비가 얼마인지, 어떤 경로의 PV가 실제 판매와 같이 움직이는지를 보여 줘요.",
        "경로 이름과 구분은 시트 MEGAPO 탭의 유입 경로 표와 같아요. 기준 월을 고르면 그 달(진행 중이면 데이터가 있는 마지막 날까지)을 전월·작년 같은 일수와 비교해요."]],
      ["숫자 정의", ["PV = 판매자센터 일별 페이지뷰의 경로별 값(스토어 전체). 비중 = 구분 PV ÷ 총 PV. PV당 광고비 = 광고센터 광고비(그 유형) ÷ 그 광고가 노출되는 경로의 PV(엔). ROAS = 광고 매출 ÷ 광고비.",
        "광고 유형과 PV 경로를 짝지은 것은 이름 기준 추정이에요: 키워드플러스=검색결과_키워드플러스, 파워랭크업=검색결과_파워랭크업, 스마트세일즈=검색결과_스마트세일즈, 타임세일=홈·검색결과_타임세일, 호리다시모노=홈·프로모션페이지_호리다시모노, Mega AD=프로모션페이지_오늘의메가할인·메가포. 광고센터 데이터는 2026-02부터라 그 이전 달은 PV당 광고비가 비어요.",
        "상관 = 최근 90일 일별 구분 PV와 일별 판매수량의 피어슨 상관계수(−1~1). 같이 움직였다는 뜻일 뿐 인과가 아니에요."]],
      ["코멘트 기준 (자동)", ["1) 총 PV와 전월·작년 대비, 구분별 비중. 2) 구분별 전월 대비 상승·하락. 3) PV 증가가 가장 큰 경로와 감소가 가장 큰 경로. 4) 광고 유형 중 PV당 광고비가 가장 낮은·높은 유형. 5) 판매와 가장 같이 움직인 구분. ‘코멘트 입력’에서 직접 쓴 코멘트는 이 화면에 하나 저장돼요."]]
    ],
    setup: function () {
      return D.loadBounds().then(function () {
        return B.bounds().then(function (b) {
          var r = b.pageview; if (!r || !r.min) throw new Error("페이지뷰 데이터가 아직 없어요.");
          var ms = B.months(r.min, r.max).reverse();
          return [{ id: "month", label: "기준 월", options: ms.map(function (k) { return [k, k.slice(0, 4) + " " + k.slice(5, 7) + (k === U.mk(r.max) && +r.max.slice(8, 10) < U.lastDay(k) ? " (진행 중)" : "")]; }), value: ms[0] }];
        });
      });
    },
    noteKey: function (ctx) { return ctx.v.month; },
    load: function (ctx) {
      var k = ctx.v.month;
      return B.bounds().then(function (b) {
        var maxd = b.pageview.max, to = maxd < U.monthEnd(k) ? maxd : U.monthEnd(k), n = U.diffD(to, k) + 1, pk = U.addM(k, -1), pto = U.addD(pk, Math.min(n, U.lastDay(pk)) - 1), lk = U.addM(k, -12), lto = U.addD(lk, Math.min(n, U.lastDay(lk)) - 1);
        var m = KEYS.concat(["total_pv", "net_qty"]), q = function (a, z, grain) { return D.query({ metrics: m, grain: grain || "all", range: { from: a, to: z } }); };
        var adFrom = "2026-02-01", ad = function (a, z) { a = a < adFrom ? adFrom : a; return a > z ? Promise.resolve([]) : B.agg("ad", "all", a, z, ["ad_price", "ad_sales"], "ad_type"); };
        return Promise.all([q(U.addM(k, -11), to, "month"), q(k, to), q(pk, pto), q(lk, lto), q(U.addD(to, -89), to, "day"), ad(k, to), ad(pk, pto), ad(lk, lto)]).then(function (x) {
          return { k: k, to: to, n: n, pk: pk, pto: pto, lk: lk, lto: lto, part: to < U.monthEnd(k), series: x[0].rows, cur: x[1].rows[k] || {}, prev: x[2].rows[pk] || {}, ly: x[3].rows[lk] || {}, daily: x[4].rows,
            ad: adMap(x[5]), adPrev: adMap(x[6]), adLy: adMap(x[7]), adOk: to >= adFrom };
        });
      });
    },
    view: function (d, ctx) {
      var gC = groupSums(d.cur), gP = groupSums(d.prev), gY = groupSums(d.ly), tC = d.cur.total_pv || 0, tP = d.prev.total_pv || 0, tY = d.ly.total_pv || 0;
      var L = [], share = function (g) { return tC ? g / tC * 100 : null; };
      L.push({ t: "총 PV " + U.man(tC) + " (전월" + (d.part ? " 같은 일수" : "") + " " + U.gs(U.growth(tC, tP)) + " · 작년 " + U.gs(U.growth(tC, tY)) + ") · 구분 비중: " + GROUPS.filter(function (g) { return g !== "구분 불가"; }).map(function (g) { return g + " " + U.pct(share(gC[g]), 0); }).join(" · ") });
      var gr = GROUPS.filter(function (g) { return g !== "구분 불가" && gP[g]; }).map(function (g) { return { g: g, q: U.growth(gC[g], gP[g]) }; });
      var up = gr.filter(function (x) { return x.q >= 0; }).sort(function (a, b) { return b.q - a.q; }), dn = gr.filter(function (x) { return x.q < 0; }).sort(function (a, b) { return a.q - b.q; });
      if (up.length) L.push({ t: up.map(function (x) { return x.g; }).join(", ") + (up.length > 1 ? " 각" : "") + " 전월 대비 " + up.map(function (x) { return U.gs(x.q); }).join(", ") + " 상승" });
      if (dn.length) L.push({ t: dn.map(function (x) { return x.g; }).join(", ") + (dn.length > 1 ? " 각" : "") + " 전월 대비 " + dn.map(function (x) { return U.gs(x.q); }).join(", ") + " 하락", c: "is-neg" });
      // 경로
      var paths = SPEC.map(function (x) { var kk = key(x[2]); return { g: x[0], label: x[1], pv: d.cur[kk] || 0, prev: d.prev[kk] || 0 }; });
      paths.forEach(function (p) { p.diff = p.pv - p.prev; p.q = p.prev ? U.growth(p.pv, p.prev) : null; p.share = tC ? p.pv / tC * 100 : null; });
      var byDiff = paths.slice().sort(function (a, b) { return b.diff - a.diff; });
      if (byDiff[0].diff > 0) L.push({ t: "PV 증가가 가장 큰 경로 " + byDiff[0].label + " (" + U.num(byDiff[0].prev) + " → " + U.num(byDiff[0].pv) + ", +" + U.num(byDiff[0].diff) + ") · 감소가 가장 큰 경로 " + byDiff[byDiff.length - 1].label + " (" + U.num(byDiff[byDiff.length - 1].diff) + ")" });
      // 광고 PV당 광고비
      var adRows = ADMAP.map(function (a) {
        var pvSum = function (row) { return U.sum(a[2], function (c) { return row[key(c)] || 0; }); }, c = d.ad[a[0]] || { price: 0, sales: 0 }, p = d.adPrev[a[0]] || { price: 0, sales: 0 }, y = d.adLy[a[0]];
        var pv = pvSum(d.cur), ppv = pvSum(d.prev), cpp = pv ? c.price / pv : null, pcpp = ppv ? p.price / ppv : null;
        return { id: a[0], t: a[1], spend: c.price, pv: pv, cpp: c.price ? cpp : null, sales: c.sales, roas: c.price ? c.sales / c.price * 100 : null, pcpp: p.price ? pcpp : null, chg: c.price && p.price && pcpp ? U.growth(cpp, pcpp) : null };
      });
      var adv = adRows.filter(function (r) { return r.cpp != null && r.spend >= 30000; }).sort(function (a, b) { return a.cpp - b.cpp; });
      if (d.adOk && adv.length >= 2) L.push({ t: "PV당 광고비가 가장 낮은 광고 " + adv[0].t + " " + adv[0].cpp.toFixed(1) + "엔(ROAS " + U.pct(adv[0].roas) + ") · 가장 높은 광고 " + adv[adv.length - 1].t + " " + adv[adv.length - 1].cpp.toFixed(1) + "엔(ROAS " + U.pct(adv[adv.length - 1].roas) + ")" });
      // 상관
      var days = Object.keys(d.daily).sort(), qty = days.map(function (dd) { return d.daily[dd].net_qty || 0; });
      var corr = GROUPS.map(function (g) { var xs = days.map(function (dd) { return groupSums(d.daily[dd])[g]; }); return { g: g, r: U.pearson(xs, qty), avg: U.avg(xs) }; });
      var cTot = U.pearson(days.map(function (dd) { return d.daily[dd].total_pv || 0; }), qty);
      var topc = corr.filter(function (c) { return c.r != null && c.g !== "구분 불가"; }).sort(function (a, b) { return b.r - a.r; })[0];
      if (topc) L.push({ t: "최근 90일 일별 판매수량과 가장 같이 움직인 구분은 " + topc.g + " (상관 " + (topc.r >= 0 ? "+" : "") + topc.r.toFixed(2) + ", 총 PV는 " + (cTot == null ? "-" : (cTot >= 0 ? "+" : "") + cTot.toFixed(2)) + ")" });
      // 월별 표·그래프
      var months = B.months(U.addM(d.k, -11), d.k), ser = months.map(function (m) { var r = d.series[m] || {}; return { m: m, g: groupSums(r), tot: r.total_pv || 0 }; });
      var chart1 = function (light) {
        var tk = U.tick(light), pctMode = ctx.cfg.sel.mode === "share";
        return { type: "bar", data: { labels: ser.map(function (s) { return U.ml(s.m) + (s.m === d.k && d.part ? "*" : ""); }), datasets: GROUPS.map(function (g) { return { label: g, backgroundColor: GCOL[g], data: ser.map(function (s) { return pctMode ? (s.tot ? +(s.g[g] / s.tot * 100).toFixed(1) : null) : s.g[g]; }) }; }) },
          options: { responsive: !light, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: tk } } },
            scales: { x: { stacked: true, ticks: { color: tk }, grid: { display: false } }, y: { stacked: true, beginAtZero: true, max: pctMode ? 100 : undefined, ticks: { color: tk, callback: function (v) { return pctMode ? v + "%" : U.man(v); } }, title: { display: true, text: pctMode ? "비중(%)" : "PV", color: tk } } } } };
      };
      var chart2 = function (light) {
        var tk = U.tick(light), rs = adRows.filter(function (r) { return r.cpp != null || r.pcpp != null; });
        return { type: "bar", data: { labels: rs.map(function (r) { return r.t; }), datasets: [{ label: "이번 달(엔/PV)", data: rs.map(function (r) { return r.cpp == null ? null : +r.cpp.toFixed(2); }), backgroundColor: "#2b6fd6" }, { label: "전월(엔/PV)", data: rs.map(function (r) { return r.pcpp == null ? null : +r.pcpp.toFixed(2); }), backgroundColor: "#f2a33a" }] },
          options: { responsive: !light, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: tk } } }, scales: { x: { ticks: { color: tk }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: tk }, title: { display: true, text: "PV당 광고비(엔)", color: tk } } } } };
      };
      var grpCols = [{ id: "g", label: "구분", type: "text" }].concat(ser.slice(-6).map(function (s) { return { id: s.m, label: U.ml(s.m) + (s.m === d.k && d.part ? "*" : ""), type: "int" }; }), [{ id: "sh", label: "기준 월 비중", type: "pct1" }, { id: "mom", label: "전월 대비", type: "gr" }, { id: "yoy", label: "작년 대비", type: "gr" }]);
      var grpRows = GROUPS.map(function (g) { var v = { g: g, sh: share(gC[g]), mom: gP[g] ? U.growth(gC[g], gP[g]) : null, yoy: gY[g] ? U.growth(gC[g], gY[g]) : null }; ser.slice(-6).forEach(function (s) { v[s.m] = s.g[g]; }); return { id: g, vals: v }; });
      var tv = { g: "합계(총 PV)", sh: 100, mom: tP ? U.growth(tC, tP) : null, yoy: tY ? U.growth(tC, tY) : null }; ser.slice(-6).forEach(function (s) { tv[s.m] = s.tot; });
      grpRows.push({ id: "total", strong: true, vals: tv });
      var pathRows = paths.slice().sort(function (a, b) { return b.pv - a.pv; }).slice(0, 15).map(function (p) { return { id: p.label, vals: { g: p.g, name: p.label, pv: p.pv, sh: p.share, prev: p.prev, diff: p.diff, q: p.q } }; });
      return {
        title: "유입 경로 효율 · " + d.k.slice(0, 4) + " " + d.k.slice(5, 7) + (d.part ? " (" + U.md(d.to) + "까지)" : ""), comments: L,
        notice: (d.part ? "진행 중인 달이라 " + U.md(d.to) + "까지이고, 전월·작년은 같은 일수와 비교해요. " : "") + (d.adOk ? "" : "광고센터 데이터는 2026-02부터라 이 달은 PV당 광고비가 없어요. ") + "광고 유형과 PV 경로의 짝은 이름 기준 추정이에요.",
        sections: [
          { type: "kpi", items: [
            { label: "총 PV", value: U.man(tC), sub: "전월 " + U.gs(U.growth(tC, tP)) + " · 작년 " + U.gs(U.growth(tC, tY)), cls: tP && tC >= tP ? "is-up" : tP ? "is-down" : "" },
            { label: "오가닉 비중", value: U.pct(share(gC["오가닉"]), 1), sub: "전월 " + U.pct(tP ? gP["오가닉"] / tP * 100 : null, 1) },
            { label: "내부 광고 비중", value: U.pct(share(gC["내부 광고"]), 1), sub: "전월 " + U.pct(tP ? gP["내부 광고"] / tP * 100 : null, 1) },
            { label: "외부 광고 비중", value: U.pct(share(gC["외부 광고"]), 1), sub: "전월 " + U.pct(tP ? gP["외부 광고"] / tP * 100 : null, 1) },
            { label: "큐텐 구좌 비중", value: U.pct(share(gC["큐텐 구좌"]), 1), sub: "전월 " + U.pct(tP ? gP["큐텐 구좌"] / tP * 100 : null, 1) },
            { label: "판매수량 ÷ PV", value: U.pct(tC ? (d.cur.net_qty || 0) / tC * 100 : null, 2), sub: "전월 " + U.pct(tP ? (d.prev.net_qty || 0) / tP * 100 : null, 2) }] },
          { type: "chart", id: "trend", title: "구분별 월별 PV (최근 12개월)", config: chart1 },
          { type: "table", id: "grp", title: "구분별 PV", cols: grpCols, rows: grpRows },
          { type: "table", id: "path", title: "경로별 PV 상위 15 (기준 월)", cols: [{ id: "g", label: "구분", type: "text" }, { id: "name", label: "경로", type: "text" }, { id: "pv", label: "PV", type: "int" }, { id: "sh", label: "비중", type: "pct1" }, { id: "prev", label: "전월 PV", type: "int" }, { id: "diff", label: "증감(PV)", type: "int", cls: function (v) { return v >= 0 ? "is-up" : "is-down"; } }, { id: "q", label: "증감률", type: "gr" }], rows: pathRows },
          { type: "chart", id: "cpp", title: "광고 유형별 PV당 광고비 (이번 달 vs 전월)", config: chart2, small: true },
          { type: "table", id: "ad", title: "광고 유형별 PV당 광고비", cols: [{ id: "t", label: "광고 유형", type: "text" }, { id: "spend", label: "광고비(K)", type: "k" }, { id: "pv", label: "해당 경로 PV", type: "int" }, { id: "cpp", label: "PV당 광고비(엔)", type: "dec2" }, { id: "sales", label: "광고 매출(K)", type: "k" }, { id: "roas", label: "ROAS", type: "pct" }, { id: "pcpp", label: "전월 PV당(엔)", type: "dec2" }, { id: "chg", label: "변화", type: "gr" }],
            rows: adRows.map(function (r) { return { id: r.id, vals: r }; }), note: "광고 유형과 PV 경로의 짝은 이름 기준 추정이에요(예: 타임세일 = 홈·검색결과 타임세일 PV). PV당 광고비가 낮고 ROAS가 높은 유형이 효율적이에요." },
          { type: "table", id: "corr", title: "구분별 일별 PV ↔ 일별 판매수량 상관 (최근 90일)", cols: [{ id: "g", label: "구분", type: "text" }, { id: "avg", label: "하루 평균 PV", type: "int" }, { id: "r", label: "상관계수", type: "dec2" }],
            rows: corr.map(function (c) { return { id: c.g, vals: c }; }).concat([{ id: "tot", strong: true, vals: { g: "총 PV", avg: U.avg(days.map(function (dd) { return d.daily[dd].total_pv || 0; })), r: cTot } }]), note: "상관은 같이 움직였다는 뜻일 뿐 인과가 아니에요. 행사 기간에는 모든 경로 PV와 판매가 같이 커져서 상관이 높게 나와요." }
        ]
      };
    }
  });
})();

/* inni 탭 · ONSITE AD 월별 온사이트 광고 리포트 (AP Talk 시트의 ONSITE AD 탭을 DB 로 대체)
 *   - 광고센터(ads.qoo10.jp) 일별 광고비·광고 매출(inni_ad_daily)을 월·광고 종류별로 합산 (dy_dash_agg, source 'ad')
 *   - Beauty AD · Spotlight AD · Singleone(OFF)은 광고센터에 없어서 '월별 광고비 입력'(inni_ad_manual)으로 직접 입력
 *   - 광고비 합계 = 광고센터 + 직접 입력, 광고 매출 합계 = 광고센터(매출이 확인되는 광고만), 합계 ROAS = 광고 매출 ÷ 광고센터 광고비,
 *     전체 ROI = 스토어 총매출 ÷ 광고비 합계, 투입율 = 광고비 합계 ÷ 스토어 총매출, AD Sales % = 광고 매출 ÷ 스토어 총매출
 *   - 코멘트: 자동 생성 + 직접 입력(리포트 'onsite'). 기준 월 이후는 보이지 않는다. 단위: 천 엔
 */
(function () {
  "use strict";
  var D = window.dyDash;
  var pane = document.querySelector('.inni-pane[data-pane="onsite"]');
  if (!D || !pane) return;

  var $ = function (s) { return pane.querySelector(s); };
  var el = {
    mode: $(".js-o-mode"), from: $(".js-o-from"), to: $(".js-o-to"), fy: $(".js-o-fy"), month: $(".js-o-month"), reload: $(".js-o-reload"), manualBtn: $(".js-o-manual"),
    setBtn: $(".js-o-set"), xlsxBtn: $(".js-o-xlsx"), msg: $(".js-o-msg"), notice: $(".js-o-notice"), title: $(".js-o-title"), auto: $(".js-o-auto"),
    manualBox: $(".js-o-manual-box"), manualBody: $(".js-o-manual-body"), manualMeta: $(".js-o-manual-meta"),
    chart: $(".js-o-chart"), spend: $(".js-o-spend"), sales: $(".js-o-sales"), roas: $(".js-o-roas"), note: $(".js-o-note"),
    t1: $(".js-o-t1"), t2: $(".js-o-t2"), t3: $(".js-o-t3")
  };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // 시트와 같은 순서·이름. manual: 광고센터에 없어서 직접 입력하는 항목
  var SPEND_ROWS = [
    { id: "beauty", label: "Beauty AD", cpm: true }, { id: "spotlight", label: "Spotlight AD", manual: true },
    { id: "cps", label: "스마트세일즈 (CPS)" }, { id: "keywordplus", label: "키워드플러스" }, { id: "power_rankup", label: "파워랭크업" },
    { id: "timesale", label: "타임세일" }, { id: "horidashimono", label: "호리다시모노" }, { id: "mega", label: "Mega AD" },
    { id: "singleone", label: "Singleone (OFF)", manual: true }
  ];
  var API_ROWS = SPEND_ROWS.filter(function (r) { return !r.manual && !r.cpm; });
  var KNOWN = {}; API_ROWS.forEach(function (r) { KNOWN[r.id] = 1; });
  var MANUAL_IDS = SPEND_ROWS.filter(function (r) { return r.manual; }).map(function (r) { return r.id; });
  var S = { ready: false, loading: false, mode: "fy", from: null, to: null, fy: null, ym: null, bounds: null, partial: null, ad: {}, man: {}, cpm: {}, prev: null, note: null, cfg: null, rows: null };
  var chart = null;

  // ---------- 날짜·서식 ----------
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ym(y, m) { return y + "-" + pad(m) + "-01"; }
  function yOf(k) { return +k.slice(0, 4); }
  function mOf(k) { return +k.slice(5, 7); }
  function addM(k, n) { var t = yOf(k) * 12 + (mOf(k) - 1) + n; return ym(Math.floor(t / 12), (t % 12) + 1); }
  function lastDay(k) { return new Date(yOf(k), mOf(k), 0).getDate(); }
  function fyOf(k) { return mOf(k) >= 7 ? yOf(k) + 1 : yOf(k); }
  function fyLabel(fy) { return "BY" + String(fy).slice(2); }
  function fyMonths(fy) { var a = []; for (var i = 0; i < 12; i++) a.push(addM(ym(fy - 1, 7), i)); return a; }
  // 지금 보는 달 목록: 회계연도 12달, 또는 기간(시작 연월 ~ 끝 연월, 최대 36개월)
  var MAX_RANGE = 36;
  function monthsList() {
    if (S.mode !== "range" || !S.from || !S.to) return fyMonths(S.fy);
    var a = [], k = S.from;
    while (k <= S.to && a.length < MAX_RANGE) { a.push(k); k = addM(k, 1); }
    return a;
  }
  function periodLabel() { return S.mode === "range" && S.from && S.to ? S.from.slice(0, 7) + " ~ " + S.to.slice(0, 7) : fyLabel(S.fy); }
  function kv(yen) { return yen == null ? "-" : Math.round(yen / 1000).toLocaleString("ko-KR"); }
  function kt(yen) { return Math.round(yen / 1000).toLocaleString("ko-KR") + "K"; }
  function pv(v, d) { return v == null || !isFinite(v) ? "-" : v.toFixed(d || 0) + "%"; }
  function gs(v) { return (v >= 0 ? "+" : "") + v.toFixed(0) + "%"; }
  function h(tag, c, text) { var e = document.createElement(tag); if (c) e.className = c; if (text != null) e.textContent = text; return e; }
  function toast(m) { if (window.dyToast) window.dyToast(m); }
  function showMsg(m) { el.msg.textContent = m || ""; el.msg.hidden = !m; }
  function rpc(name, args) { return window.dyAuth.client.rpc(name, args).then(function (res) { if (res.error) throw res.error; return res.data; }); }
  function friendly(e) {
    var m = (e && e.message) || String(e);
    if (/dy_inni_|dy_dash_|Could not find the function|schema cache|inni_ad/i.test(m)) return "필요한 DB 함수·표가 아직 없어요. Supabase SQL Editor 에서 dy-ai/supabase/inni.sql · dashboard.sql 과 inni_RPA/supabase_schema_ads.sql 을 실행해 주세요.";
    return D.friendly ? D.friendly(e) : "불러오지 못했어요: " + m;
  }

  // ---------- 데이터 ----------
  function load() {
    if (S.loading) return Promise.resolve();
    S.loading = true; showMsg("");
    return window.dyAuth.requireLogin().then(function (sess) {
      if (!sess) return;
      return rpc("dy_dash_bounds", {}).then(function (b) {
        if (!b || !b.ad || !b.ad.min) throw new Error("광고 데이터가 아직 없어요. 수집기에서 Q10 수집을 한 번 하면 채워져요.");
        S.bounds = b.ad; S.ready = true;
        var mx = b.ad.max, mk = mx.slice(0, 8) + "01";
        S.partial = +mx.slice(8, 10) < lastDay(mk) ? mk : null;
      });
    }).catch(function (e) { showMsg(friendly(e)); }).then(function () { S.loading = false; });
  }
  function minYm() { return S.bounds.min.slice(0, 8) + "01"; }
  function maxYm() { return S.bounds.max.slice(0, 8) + "01"; }

  // 회계연도 한 해(+ 전월 비교용 직전 달)의 월 × 광고 종류 값
  function loadFy(fy) { return loadMonths(fyMonths(fy)); }
  function loadView() { return loadMonths(monthsList()); }
  function loadMonths(months) {
    var from = addM(months[0], -1), last = months[months.length - 1], to = last.slice(0, 8) + lastDay(last);
    return Promise.all([
      rpc("dy_dash_agg", { p_source: "ad", p_grain: "month", p_from: from, p_to: to, p_cols: ["ad_price", "ad_sales", "total_sales"], p_dim: "ad_type" }),
      rpc("dy_inni_ad_manual_get", { p_from: from, p_to: to }),
      rpc("dy_dash_agg", { p_source: "cpm", p_grain: "month", p_from: from, p_to: to, p_cols: ["ad_cost"] })
    ]).then(function (r) {
      S.ad = {}; S.man = {}; S.cpm = {};
      (r[2] || []).forEach(function (x) { S.cpm[String(x.p).slice(0, 10)] = x.ad_cost || 0; });
      (r[0] || []).forEach(function (x) {
        var k = String(x.p).slice(0, 10); (S.ad[k] = S.ad[k] || {})[x.d] = { price: x.ad_price || 0, sales: x.ad_sales || 0, total: x.total_sales || 0 };
      });
      (r[1] || []).forEach(function (x) { var k = String(x.ym).slice(0, 10); (S.man[k] = S.man[k] || {})[x.item] = x.v; });
    });
  }

  // 월 한 칸의 값 (없으면 null)
  function has(k) { return !!S.ad[k] && k >= minYm(); }
  function apiPrice(k, id) { var a = S.ad[k]; return a && a[id] ? a[id].price : 0; }
  function apiSales(k, id) { var a = S.ad[k]; return a && a[id] ? a[id].sales : 0; }
  function sumApi(k, f) { var a = S.ad[k] || {}, t = 0; Object.keys(a).forEach(function (id) { if (id !== "all") t += a[id][f]; }); return t; }
  function manual(k, id) { var m = S.man[k]; return m && m[id] != null ? m[id] : null; }
  function cpmCost(k) { return S.cpm[k] || 0; }   // Beauty Brand AD(CPM) 광고비: QSM 에서 수집한 값 (캠페인이 없던 달은 0)
  function manSum(k) { var t = cpmCost(k); MANUAL_IDS.forEach(function (id) { t += manual(k, id) || 0; }); return t; }
  function rowSpend(r, k) { return r.cpm ? cpmCost(k) : r.manual ? manual(k, r.id) : apiPrice(k, r.id); }
  function storeSales(k) { var a = S.ad[k]; return a && a.all ? a.all.total : 0; }
  function mv(k) { return { api: sumApi(k, "price"), man: manSum(k), sales: sumApi(k, "sales"), store: storeSales(k) }; }

  // 보이는 달: 회계연도 달 중 데이터가 있고 기준 월 이하
  function visible(k) { return k <= S.ym && has(k); }

  // ---------- 코멘트 ----------
  function autoLines(k) {
    var L = [], c = mv(k), spend = c.api + c.man, part = k === S.partial;
    var inv = c.store ? spend / c.store * 100 : null, roi = spend ? c.store / spend * 100 : null, share = c.store ? c.sales / c.store * 100 : null;
    L.push({ t: "Onsite AD 광고비 " + kt(spend) + "엔 (투입율 " + pv(inv) + ") · 광고 매출 " + kt(c.sales) + "엔 (스토어 매출의 " + pv(share) + ") · 전체 ROI " + pv(roi) });
    var pk = addM(k, -1);
    if (part) L.push({ t: "진행 중인 달이라 전월 비교는 생략했어요 (" + S.bounds.max.slice(5).replace("-", "/") + "까지)" });
    else if (has(pk)) {
      var p = mv(pk), ps = p.api + p.man, parts = [];
      if (ps) parts.push("광고비 " + gs((spend / ps - 1) * 100));
      if (p.sales) parts.push("광고 매출 " + gs((c.sales / p.sales - 1) * 100));
      if (parts.length) L.push({ t: "전월 대비 " + parts.join(" · ") + " (전월 광고비 " + kt(ps) + ", 광고 매출 " + kt(p.sales) + ")" });
    }
    var cand = API_ROWS.map(function (r) { return { r: r, price: apiPrice(k, r.id), sales: apiSales(k, r.id) }; }).filter(function (x) { return x.price >= 100000; })
      .map(function (x) { x.roas = x.sales / x.price * 100; return x; }).sort(function (a, b) { return b.roas - a.roas; });
    if (cand.length >= 2) {
      var hi = cand[0], lo = cand[cand.length - 1];
      L.push({ t: "ROAS 가장 높은 광고 " + hi.r.label + " " + pv(hi.roas) + " (광고비 " + kt(hi.price) + ") · 가장 낮은 광고 " + lo.r.label + " " + pv(lo.roas) + " (광고비 " + kt(lo.price) + ")", c: lo.roas < 100 ? "is-neg" : "" });
    }
    var all = SPEND_ROWS.map(function (r) { return { r: r, v: rowSpend(r, k) || 0 }; }).sort(function (a, b) { return b.v - a.v; });
    if (spend && all[0].v > 0) L.push({ t: "광고비 비중 1위는 " + all[0].r.label + " " + kt(all[0].v) + "엔 (" + (all[0].v / spend * 100).toFixed(0) + "%)" });
    return L;
  }
  function showManual(c) {
    S.note = c && c.body ? c : null;
    el.manualBox.hidden = !S.note;
    el.manualBody.textContent = S.note ? S.note.body : "";
    el.manualMeta.textContent = S.note ? "직접 입력 · " + (S.note.by || "") + (S.note.at ? " · " + String(S.note.at).slice(0, 16).replace("T", " ") : "") : "";
  }
  function renderComment(k) {
    el.auto.innerHTML = "";
    autoLines(k).forEach(function (l) { var p = h("p"); p.appendChild(h("span", l.c || "", l.t)); el.auto.appendChild(p); });
    showManual(null);
    rpc("dy_inni_comment_get", { p_report: "onsite", p_ym: k }).then(function (c) { if (k === S.ym) showManual(c); })
      .catch(function (e) { el.manualMeta.textContent = friendly(e); el.manualBox.hidden = false; });
  }

  // ---------- 설정 ----------
  var K = window.dyInniKit;
  function normCfg(c) {
    c = c || {};
    return { spend: K.normSpec(c.spend), sales: K.normSpec(c.sales), roas: K.normSpec(c.roas), type: c.type === "line" ? "line" : "bar", roasLine: c.roasLine === "off" ? "off" : "on" };
  }
  function loadCfg(fy) {
    return rpc("dy_inni_settings_get", { p_report: "onsite", p_fy: fy }).then(function (c) { S.cfg = normCfg(c); }).catch(function (e) { S.cfg = normCfg(null); showMsg(friendly(e)); });
  }

  // ---------- 표 ----------
  function monthName(k) { return S.mode === "range" ? String(yOf(k)).slice(2) + "-" + pad(mOf(k)) : MON[mOf(k) - 1]; }
  function monthHead(k) { return monthName(k) + (k === S.partial ? "*" : ""); }
  function table(tbl, rows, key) {
    // rows: [{ id, label, ty, cells: function(k) -> {t, v, cls}|null, total: function() -> {t, v}, strong }]
    var months = monthsList();
    tbl.innerHTML = "";
    var thead = h("thead"), tr = h("tr");
    tr.appendChild(h("th", null, ""));
    months.forEach(function (k) { var th = h("th", null, visible(k) ? monthHead(k) : monthName(k)); th.dataset.col = k; tr.appendChild(th); });
    var tt = h("th", null, "누계"); tt.dataset.col = "total"; tr.appendChild(tt); thead.appendChild(tr); tbl.appendChild(thead);
    var tb = h("tbody");
    rows.forEach(function (r) {
      var row = h("tr", r.strong ? "is-total" : ""); row.dataset.id = r.id;
      row.appendChild(h("td", "t", r.label));
      months.forEach(function (k) {
        var c = visible(k) ? r.cells(k) : null, td = h("td", c && c.cls ? c.cls : "", c ? c.t : ""); td.dataset.col = k; row.appendChild(td);
      });
      var t = r.total(), tdt = h("td", "", t ? t.t : ""); tdt.dataset.col = "total"; row.appendChild(tdt);
      tb.appendChild(row);
    });
    tbl.appendChild(tb);
    if (S.cfg && key) K.applyHl(tbl, S.cfg[key]);
  }
  function vis() { return monthsList().filter(visible); }
  function sumOver(f) { var t = 0; vis().forEach(function (k) { t += f(k); }); return t; }
  // 금액 줄(천 엔) / 비율 줄(합계끼리 나눈 값)
  function krow(id, label, f, o) {
    return { id: id, label: label, strong: o && o.strong, ty: "int",
      cells: function (k) { var v = f(k); return v == null ? { t: "-", cls: "is-empty" } : { t: kv(v), v: v / 1000 }; },
      total: function () { var v = sumOver(function (k) { return f(k) || 0; }); return { t: kv(v), v: v / 1000 }; } };
  }
  function prow(id, label, num, den, o) {
    var rr = function (a, b) { return b ? a / b * 100 : null; };
    return { id: id, label: label, strong: o && o.strong, ty: "pct",
      cells: function (k) { var v = rr(num(k), den(k)); return { t: pv(v), v: v }; },
      total: function () { var v = rr(sumOver(num), sumOver(den)); return { t: pv(v), v: v }; } };
  }

  function buildRows() {
    var other = function (k, f) { var a = S.ad[k] || {}, t = 0; Object.keys(a).forEach(function (id) { if (id !== "all" && !KNOWN[id]) t += a[id][f]; }); return t; };
    var hasOther = vis().some(function (k) { return other(k, "price") || other(k, "sales"); });
    var tot = function (k) { var c = mv(k); return c.api + c.man; }, st = function (k) { return mv(k).sales; }, api = function (k) { return mv(k).api; };
    var rows1 = SPEND_ROWS.map(function (r) { return krow(r.id, r.label, function (k) { return rowSpend(r, k); }); });
    if (hasOther) rows1.push(krow("other", "기타 광고", function (k) { return other(k, "price"); }));
    rows1.push(krow("total", "Total", tot, { strong: true }));
    rows1.push(prow("ratio", "투입율 (광고비 ÷ 총매출)", tot, storeSales));
    var rows2 = API_ROWS.map(function (r) { return krow(r.id, r.label, function (k) { return apiSales(k, r.id); }); });
    if (hasOther) rows2.push(krow("other", "기타 광고", function (k) { return other(k, "sales"); }));
    rows2.push(krow("total", "Total", st, { strong: true }));
    rows2.push(prow("ratio", "AD Sales % (총매출 대비)", st, storeSales));
    var rows3 = API_ROWS.map(function (r) { return prow(r.id, r.label, function (k) { return apiSales(k, r.id); }, function (k) { return apiPrice(k, r.id); }); });
    rows3.push(prow("total", "Total (광고센터 광고비 기준)", st, api, { strong: true }));
    rows3.push(prow("roi", "전체 ROI (총매출 ÷ 광고비 합계)", storeSales, tot));
    return { spend: rows1, sales: rows2, roas: rows3 };
  }

  function renderTables() {
    var fy = S.fy, R = S.rows = buildRows(), pl = periodLabel();
    table(el.spend, R.spend, "spend"); table(el.sales, R.sales, "sales"); table(el.roas, R.roas, "roas");
    el.t1.textContent = "광고비 (Spend) · " + pl;
    el.t2.textContent = "광고 매출 (AD Sales) · " + pl;
    el.t3.textContent = "ROAS (광고 매출 ÷ 광고비) · " + pl;
    el.note.textContent = "단위 천 엔. Beauty AD 는 QSM 의 Beauty Brand AD(CPM) 리포트에서 수집한 값(캠페인이 없던 달은 0), Spotlight AD · Singleone(OFF)은 광고센터에 없어 직접 입력한 값이에요(‘-’ 는 입력 안 한 달). 세 광고 모두 광고 매출은 없어요. 합계 ROAS 는 직접 입력 항목을 뺀 광고센터 광고비 기준, 전체 ROI·투입율은 직접 입력 포함이에요. * 진행 중인 달.";
  }

  // 그래프 설정(light=true 는 엑셀 그림용: 화면 테마와 무관하게 어두운 글자)
  var DC = window.dyColors;
  function chartConfig(light) {
    var ms = vis(), tick = DC.tick(light);
    var labels = ms.map(function (k) { return String(yOf(k)).slice(2) + "-" + pad(mOf(k)) + (k === S.partial ? "*" : ""); });
    var bar = S.cfg.type !== "line", sets = [
      { type: bar ? "bar" : "line", label: "광고비 합계", data: ms.map(function (k) { var c = mv(k); return Math.round((c.api + c.man) / 1000); }), backgroundColor: DC.get("onsite.main", "spend", "#2a8c9a"), borderColor: DC.get("onsite.main", "spend", "#2a8c9a"), yAxisID: "y", tension: .25 },
      { type: bar ? "bar" : "line", label: "광고 매출", data: ms.map(function (k) { return Math.round(mv(k).sales / 1000); }), backgroundColor: DC.get("onsite.main", "sales", DC.GREEN), borderColor: DC.get("onsite.main", "sales", DC.GREEN), yAxisID: "y", tension: .25 }
    ];
    var scales = { x: { ticks: { color: tick }, grid: { display: false } }, y: { beginAtZero: true, min: 0, ticks: { color: tick }, title: { display: true, text: "K JPY", color: tick } } };
    if (S.cfg.roasLine !== "off") {
      sets.push({ type: "line", label: "ROAS(%)", data: ms.map(function (k) { var c = mv(k); return c.api ? Math.round(c.sales / c.api * 100) : null; }), borderColor: DC.get("onsite.main", "roas", "#e5a63a"), backgroundColor: DC.get("onsite.main", "roas", "#e5a63a"), yAxisID: "y1", tension: .25 });
      scales.y1 = { position: "right", beginAtZero: true, min: 0, grid: { drawOnChartArea: false }, ticks: { color: tick, callback: function (v) { return v + "%"; } } };
    }
    return DC.mixed({ data: { labels: labels, datasets: sets }, options: { responsive: !light, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { labels: { color: tick } } }, scales: scales } });
  }
  function drawChart() {
    if (!window.Chart) return;
    if (chart) { chart.destroy(); chart = null; }
    chart = new window.Chart(el.chart, chartConfig(false));
  }

  function renderNotice() {
    var miss = vis().filter(function (k) { return MANUAL_IDS.every(function (id) { return manual(k, id) == null; }); });
    el.notice.hidden = !miss.length;
    el.notice.textContent = miss.length ? "Spotlight AD · Singleone 광고비가 입력되지 않은 달이 있어요: " + miss.map(function (k) { return k.slice(0, 7); }).join(", ") + " (‘월별 광고비 입력’) — 입력 전에는 광고비 합계에 빠져 있어요." : "";
  }

  function recompute() {
    var k = S.ym;
    el.title.textContent = "Qoo10 ON-SITE AD · " + periodLabel() + " · " + k.slice(0, 4) + " " + MON[mOf(k) - 1] + (k === S.partial ? " (" + S.bounds.max.slice(5).replace("-", "/") + "까지)" : "");
    renderNotice(); renderComment(k); renderTables(); drawChart();
  }

  // ---------- 선택 상자 ----------
  function fillFy() {
    var lo = fyOf(minYm()), hi = fyOf(maxYm());
    el.fy.innerHTML = "";
    for (var f = hi; f >= lo; f--) { var o = h("option", null, fyLabel(f) + " (" + (f - 1) + "-07 ~ " + f + "-06)"); o.value = String(f); el.fy.appendChild(o); }
    if (S.fy == null || S.fy > hi || S.fy < lo) S.fy = hi;
    el.fy.value = String(S.fy);
  }
  function fillMonths() {
    var ms = fyMonths(S.fy).filter(function (k) { return k >= minYm() && k <= maxYm(); }), keep = S.ym;
    el.month.innerHTML = "";
    ms.forEach(function (k) { var o = h("option", null, k.slice(0, 4) + " " + MON[mOf(k) - 1] + (k === S.partial ? " (진행 중)" : "")); o.value = k; el.month.appendChild(o); });
    S.ym = ms.indexOf(keep) >= 0 ? keep : ms[ms.length - 1]; el.month.value = S.ym;
  }

  function allMonths() { var a = [], k = minYm(), z = maxYm(); while (k <= z) { a.push(k); k = addM(k, 1); } return a; }
  function fillRange() {
    var ms = allMonths(), lab = function (k) { return k.slice(0, 4) + "-" + k.slice(5, 7) + (k === S.partial ? " (진행 중)" : ""); };
    [el.from, el.to].forEach(function (sel) { sel.innerHTML = ""; ms.forEach(function (k) { var o = h("option", null, lab(k)); o.value = k; sel.appendChild(o); }); });
    if (!S.to || ms.indexOf(S.to) < 0) S.to = S.ym && ms.indexOf(S.ym) >= 0 ? S.ym : ms[ms.length - 1];
    if (!S.from || ms.indexOf(S.from) < 0 || S.from > S.to) { var fm = fyMonths(fyOf(S.to))[0]; S.from = fm < minYm() ? minYm() : fm; }
    el.from.value = S.from; el.to.value = S.to;
  }
  function applyMode() {
    var range = S.mode === "range";
    Array.prototype.forEach.call(pane.querySelectorAll(".js-o-fyg"), function (x) { x.hidden = range; });
    Array.prototype.forEach.call(pane.querySelectorAll(".js-o-rg"), function (x) { x.hidden = !range; });
    el.mode.value = S.mode;
  }
  // 기간을 바꾼 뒤: 기준 월 = 끝 연월, 설정은 끝 연월이 속한 회계연도 것을 쓴다
  function reloadRange() {
    S.ym = S.to; S.fy = fyOf(S.to);
    return Promise.all([loadView(), loadCfg(S.fy)]).then(recompute).catch(function (e) { showMsg(friendly(e)); });
  }

  // ---------- 모달 (월별 광고비 입력) ----------
  function modal(title, desc, build) {
    var prev = document.activeElement, ov = h("div", "inni-modal"), card = h("div", "inni-modal-card is-wide");
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", title);
    card.appendChild(h("h3", null, title)); card.appendChild(h("p", null, desc));
    var err = h("div", "inni-modal-err"), acts = h("div", "inni-modal-acts");
    var gap = h("span", "inni-gap"), cancel = h("button", "dash-btn", "취소"), save = h("button", "dash-btn is-primary", "저장"); cancel.type = save.type = "button";
    function close() { document.removeEventListener("keydown", onKey, true); if (ov.parentNode) ov.parentNode.removeChild(ov); if (prev && prev.focus) prev.focus(); }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
    var api = { card: card, acts: acts, gap: gap, save: save, err: err, close: close, extra: [] };
    var first = build(api);
    card.appendChild(err); api.extra.forEach(function (x) { acts.appendChild(x); }); [gap, cancel, save].forEach(function (x) { acts.appendChild(x); });
    card.appendChild(acts); ov.appendChild(card); document.body.appendChild(ov);
    document.addEventListener("keydown", onKey, true);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    cancel.addEventListener("click", close);
    if (first && first.focus) first.focus();
    return api;
  }

  function openManualModal() {
    var months = monthsList().filter(function (k) { return k >= minYm() && k <= maxYm(); });
    modal("월별 광고비 입력 · " + periodLabel(), "광고센터에 없는 광고의 월별 광고비를 천 엔 단위로 입력해요(예: 300 = 30만 엔). 비워 두면 입력 안 한 달이에요. 모두가 같이 봐요.", function (m) {
      var box = h("div", "inni-scroll"), tbl = h("table", "inni-table inni-input"), thead = h("thead"), tr = h("tr");
      tr.appendChild(h("th", null, "")); months.forEach(function (k) { tr.appendChild(h("th", null, k.slice(2, 7))); }); thead.appendChild(tr); tbl.appendChild(thead);
      var tb = h("tbody"), inputs = {};
      SPEND_ROWS.filter(function (r) { return r.manual; }).forEach(function (r) {
        var row = h("tr"); row.appendChild(h("td", "t", r.label));
        months.forEach(function (k) {
          var td = h("td"), inp = h("input"); inp.type = "text"; inp.inputMode = "numeric"; inp.setAttribute("aria-label", r.label + " " + k.slice(0, 7));
          var v = manual(k, r.id); inp.value = v == null ? "" : String(Math.round(v / 1000));
          inputs[r.id + "|" + k] = { el: inp, orig: inp.value }; td.appendChild(inp); row.appendChild(td);
        }); tb.appendChild(row);
      });
      tbl.appendChild(tb); box.appendChild(tbl); m.card.appendChild(box);
      m.save.addEventListener("click", function () {
        var rows = [], bad = false;
        Object.keys(inputs).forEach(function (key) {
          var x = inputs[key], t = x.el.value.replace(/[,\s]/g, "");
          if (t === x.orig.replace(/[,\s]/g, "")) return;
          var p = key.split("|");
          if (t === "") rows.push({ ym: p[1], item: p[0], v: null });
          else if (!/^\d+(\.\d+)?$/.test(t)) { bad = true; x.el.style.outline = "2px solid var(--dash-down, #d33)"; }
          else rows.push({ ym: p[1], item: p[0], v: Math.round(parseFloat(t) * 1000) });
        });
        if (bad) { m.err.textContent = "숫자만 입력해 주세요 (빨간 칸)."; return; }
        if (!rows.length) { m.close(); return; }
        m.save.disabled = true; m.err.textContent = "";
        rpc("dy_inni_ad_manual_set", { p_rows: rows }).then(function () { return loadView(); }).then(function () { toast("광고비를 저장했어요"); m.close(); recompute(); })
          .catch(function (e) { m.err.textContent = friendly(e); m.save.disabled = false; });
      });
      return inputs[Object.keys(inputs)[0]] && inputs[Object.keys(inputs)[0]].el;
    });
  }

  // ---------- 설정 · 엑셀 ----------
  function openSettingsDlg() {
    var k = S.ym, cols = monthsList().map(function (m) { return [m, m.slice(0, 7)]; }).concat([["total", "누계"]]);
    var def = function (key, title) { return { key: key, title: title, rows: S.rows[key].map(function (r) { return [r.id, r.label]; }), cols: cols }; };
    K.openSettings({
      title: "설정 · ONSITE AD · " + fyLabel(S.fy) + " · " + k.slice(0, 4) + " " + MON[mOf(k) - 1],
      desc: "코멘트는 기준 월마다, 강조와 그래프는 회계연도(" + fyLabel(S.fy) + ")마다 저장돼요. 모두가 같이 봐요.",
      report: "onsite", fy: S.fy, note: { ym: k, body: S.note ? S.note.body : "", label: k.slice(0, 4) + " " + MON[mOf(k) - 1] },
      cfg: S.cfg, tables: [def("spend", "광고비 표"), def("sales", "광고 매출 표"), def("roas", "ROAS 표")],
      selects: [{ key: "type", label: "광고비·광고 매출 표시", options: [["bar", "막대"], ["line", "꺾은선"]] }, { key: "roasLine", label: "ROAS 선", options: [["on", "표시"], ["off", "숨김"]] }],
      chartNote: "월별 광고비·광고 매출 그래프예요.",
      colors: [{ id: "onsite.main", title: "월별 광고비 · 광고 매출 · ROAS", series: [{ key: "spend", label: "광고비 합계", def: "#2a8c9a" }, { key: "sales", label: "광고 매출", def: DC.GREEN }, { key: "roas", label: "ROAS(%) 선", def: "#e5a63a" }] }],
      rpc: rpc, toast: toast, friendly: friendly,
      onNote: function (c) { if (k === S.ym) showManual(c); },
      onCfg: function (draft) { S.cfg = normCfg(draft); renderTables(); drawChart(); }
    });
  }

  function exportXlsx() {
    if (!S.ready || !S.rows) return;
    el.xlsxBtn.disabled = true; var old = el.xlsxBtn.textContent; el.xlsxBtn.textContent = "만드는 중…";
    K.loadExcelJs().then(function () {
      var wb = new window.ExcelJS.Workbook(); wb.creator = "DY-AI"; wb.created = new Date();
      var ws = wb.addWorksheet("ONSITE AD", { views: [{ showGridLines: false }] }), months = monthsList();
      ws.columns = [{ width: 34 }].concat(months.map(function () { return { width: 10.5 }; }), [{ width: 11 }]);
      var r = K.writeHead(ws, 2, { eyebrow: "QOO10 ON-SITE AD", title: el.title.textContent, unit: "(K JPY) · 광고센터 기준 · 총매출 기준 투입율", lines: autoLines(S.ym), note: S.note, width: 14 });
      ws.getCell(r, 1).value = "월별 광고비 · 광고 매출 · ROAS"; ws.getCell(r, 1).font = { size: 12, bold: true }; r++;
      ws.addImage(K.imageOf(wb, chartConfig(true), 900, 340), { tl: { col: 0, row: r - 1 }, ext: { width: 900, height: 340 } }); r += 18;
      var cols = [{ id: "label", label: "", text: true }].concat(months.map(function (m) { return { id: m, label: visible(m) ? monthHead(m) : monthName(m), type: "int" }; }), [{ id: "total", label: "누계", type: "int" }]);
      [["spend", el.t1.textContent], ["sales", el.t2.textContent], ["roas", el.t3.textContent]].forEach(function (t) {
        var rows = S.rows[t[0]].map(function (row) {
          var vals = { label: row.label, total: (row.total() || {}).v };
          months.forEach(function (m) { var c = visible(m) ? row.cells(m) : null; vals[m] = c ? c.v : null; });
          return { id: row.id, vals: vals, strong: row.strong, type: row.ty };
        });
        r = K.writeTable(ws, r, { title: t[1], cols: cols, rows: rows, hl: S.cfg[t[0]] });
      });
      ws.mergeCells(r, 1, r, 14); ws.getCell(r, 1).value = el.note.textContent; ws.getCell(r, 1).font = { size: 9, color: { argb: K.XL.sub } }; ws.getCell(r, 1).alignment = { wrapText: true, vertical: "top" }; ws.getRow(r).height = 42;
      ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
      return K.download(wb, "Qoo10_ONSITE_AD_" + (S.mode === "range" ? S.from.slice(0, 7) + "_" + S.to.slice(0, 7) : fyLabel(S.fy) + "_" + S.ym.slice(0, 7)) + ".xlsx", toast);
    }).catch(function (e) { showMsg("엑셀을 만들지 못했어요: " + ((e && e.message) || e)); })
      .then(function () { el.xlsxBtn.disabled = false; el.xlsxBtn.textContent = old; });
  }

  // ---------- 이벤트 ----------
  el.fy.addEventListener("change", function () { S.fy = +el.fy.value; S.ym = null; fillMonths(); Promise.all([loadView(), loadCfg(S.fy)]).then(recompute).catch(function (e) { showMsg(friendly(e)); }); });
  el.mode.addEventListener("change", function () {
    S.mode = el.mode.value; applyMode();
    if (S.mode === "range") { fillRange(); reloadRange(); }
    else { S.fy = fyOf(S.ym || maxYm()); fillFy(); S.ym = null; fillMonths(); Promise.all([loadView(), loadCfg(S.fy)]).then(recompute).catch(function (e) { showMsg(friendly(e)); }); }
  });
  el.from.addEventListener("change", function () { S.from = el.from.value; if (S.from > S.to) { S.to = S.from; el.to.value = S.to; } clampRange("from"); reloadRange(); });
  el.to.addEventListener("change", function () { S.to = el.to.value; if (S.to < S.from) { S.from = S.to; el.from.value = S.from; } clampRange("to"); reloadRange(); });
  function clampRange(moved) {   // 최대 36개월: 넘으면 움직이지 않은 쪽을 맞춘다
    var span = (yOf(S.to) - yOf(S.from)) * 12 + mOf(S.to) - mOf(S.from) + 1;
    if (span <= MAX_RANGE) return;
    if (moved === "from") { S.to = addM(S.from, MAX_RANGE - 1); el.to.value = S.to; } else { S.from = addM(S.to, -(MAX_RANGE - 1)); el.from.value = S.from; }
    toast("기간은 최대 " + MAX_RANGE + "개월까지 볼 수 있어요");
  }
  el.setBtn.addEventListener("click", function () { if (S.ready && S.cfg && S.rows) openSettingsDlg(); });
  el.xlsxBtn.addEventListener("click", exportXlsx);
  el.month.addEventListener("change", function () { S.ym = el.month.value; recompute(); });
  el.reload.addEventListener("click", function () { D.clearCache(); S.ready = false; start(true); });
  el.manualBtn.addEventListener("click", function () { if (S.ready) openManualModal(); });
  document.addEventListener("dycolors:change", function () { if (S.ready && S.ym && started) drawChart(); });
  document.addEventListener("dy:theme", function () { if (S.ready && S.ym && started) drawChart(); });

  // ---------- 시작 ----------
  var started = false;
  function start(force) {
    if (started && !force) { if (chart) chart.resize(); return Promise.resolve(); }
    started = true;
    return load().then(function () {
      if (!S.ready) { started = false; return; }
      fillFy(); fillMonths(); applyMode();
      if (S.mode === "range") { fillRange(); return reloadRange(); }
      return Promise.all([loadView(), loadCfg(S.fy)]).then(recompute);
    }).catch(function (e) { showMsg(friendly(e)); });
  }
  document.addEventListener("inni:show", function (e) { if (e.detail.view === "inni" && e.detail.sub === "onsite") start(); });
  if (/^#inni\/onsite/.test(location.hash || "")) start();
})();

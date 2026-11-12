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
    fy: $(".js-o-fy"), month: $(".js-o-month"), reload: $(".js-o-reload"), manualBtn: $(".js-o-manual"), noteBtn: $(".js-o-note-btn"),
    msg: $(".js-o-msg"), notice: $(".js-o-notice"), title: $(".js-o-title"), auto: $(".js-o-auto"),
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
  var S = { ready: false, loading: false, fy: null, ym: null, bounds: null, partial: null, ad: {}, man: {}, cpm: {}, prev: null, note: null };
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
  function loadFy(fy) {
    var months = fyMonths(fy), from = addM(months[0], -1), to = ym(yOf(months[11]), mOf(months[11])) ; to = to.slice(0, 8) + lastDay(to);
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
    el.noteBtn.textContent = S.note ? "코멘트 수정" : "코멘트 입력";
  }
  function renderComment(k) {
    el.auto.innerHTML = "";
    autoLines(k).forEach(function (l) { var p = h("p"); p.appendChild(h("span", l.c || "", l.t)); el.auto.appendChild(p); });
    showManual(null);
    rpc("dy_inni_comment_get", { p_report: "onsite", p_ym: k }).then(function (c) { if (k === S.ym) showManual(c); })
      .catch(function (e) { el.manualMeta.textContent = friendly(e); el.manualBox.hidden = false; });
  }

  // ---------- 표 ----------
  function monthHead(k) { return MON[mOf(k) - 1] + (k === S.partial ? "*" : ""); }
  function table(tbl, rows) {
    // rows: [{ label, cells: function(k) -> {t, cls}|null, total: {t, cls}, strong }]
    var months = fyMonths(S.fy);
    tbl.innerHTML = "";
    var thead = h("thead"), tr = h("tr");
    tr.appendChild(h("th", null, ""));
    months.forEach(function (k) { tr.appendChild(h("th", null, visible(k) ? monthHead(k) : MON[mOf(k) - 1])); });
    tr.appendChild(h("th", null, "누계")); thead.appendChild(tr); tbl.appendChild(thead);
    var tb = h("tbody");
    rows.forEach(function (r) {
      var row = h("tr", r.strong ? "is-total" : "");
      row.appendChild(h("td", "t", r.label));
      months.forEach(function (k) {
        var c = visible(k) ? r.cells(k) : null;
        row.appendChild(h("td", c && c.cls ? c.cls : "", c ? c.t : ""));
      });
      var t = r.total();
      row.appendChild(h("td", t && t.cls ? t.cls : "", t ? t.t : ""));
      tb.appendChild(row);
    });
    tbl.appendChild(tb);
  }
  function vis() { return fyMonths(S.fy).filter(visible); }
  function sumOver(f) { var t = 0; vis().forEach(function (k) { t += f(k); }); return t; }

  function renderTables() {
    var fy = S.fy;
    // 1) 광고비
    var rows1 = SPEND_ROWS.map(function (r) {
      var f = function (k) { return rowSpend(r, k); };
      return { label: r.label, cells: function (k) { var v = f(k); return v == null ? { t: "-", cls: "is-empty" } : { t: kv(v) }; },
        total: function () { return { t: kv(sumOver(function (k) { return f(k) || 0; })) }; } };
    });
    // 광고센터에 있는데 위 목록에 없는 광고(데일리딜 등)는 '기타'로 묶는다 (값이 있을 때만)
    var other = function (k, f) { var a = S.ad[k] || {}, t = 0; Object.keys(a).forEach(function (id) { if (id !== "all" && !KNOWN[id]) t += a[id][f]; }); return t; };
    var hasOther = vis().some(function (k) { return other(k, "price") || other(k, "sales"); });
    if (hasOther) rows1.push({ label: "기타 광고", cells: function (k) { return { t: kv(other(k, "price")) }; }, total: function () { return { t: kv(sumOver(function (k) { return other(k, "price"); })) }; } });
    var tot = function (k) { var c = mv(k); return c.api + c.man; };
    rows1.push({ label: "Total", strong: true, cells: function (k) { return { t: kv(tot(k)) }; }, total: function () { return { t: kv(sumOver(tot)) }; } });
    var inv = function (k) { var s = storeSales(k); return s ? tot(k) / s * 100 : null; };
    rows1.push({ label: "투입율 (광고비 ÷ 총매출)", cells: function (k) { return { t: pv(inv(k)) }; },
      total: function () { var s = sumOver(storeSales); return { t: pv(s ? sumOver(tot) / s * 100 : null) }; } });
    table(el.spend, rows1);

    // 2) 광고 매출
    var rows2 = API_ROWS.filter(function (r) { return r.id !== "beauty"; }).map(function (r) {
      return { label: r.label, cells: function (k) { return { t: kv(apiSales(k, r.id)) }; }, total: function () { return { t: kv(sumOver(function (k) { return apiSales(k, r.id); })) }; } };
    });
    if (hasOther) rows2.push({ label: "기타 광고", cells: function (k) { return { t: kv(other(k, "sales")) }; }, total: function () { return { t: kv(sumOver(function (k) { return other(k, "sales"); })) }; } });
    var st = function (k) { return mv(k).sales; };
    rows2.push({ label: "Total", strong: true, cells: function (k) { return { t: kv(st(k)) }; }, total: function () { return { t: kv(sumOver(st)) }; } });
    rows2.push({ label: "AD Sales % (총매출 대비)", cells: function (k) { var s = storeSales(k); return { t: pv(s ? st(k) / s * 100 : null) }; },
      total: function () { var s = sumOver(storeSales); return { t: pv(s ? sumOver(st) / s * 100 : null) }; } });
    table(el.sales, rows2);

    // 3) ROAS
    var rr = function (a, b) { return b ? a / b * 100 : null; };
    var rows3 = API_ROWS.map(function (r) {
      return { label: r.label, cells: function (k) { return { t: pv(rr(apiSales(k, r.id), apiPrice(k, r.id))) }; },
        total: function () { return { t: pv(rr(sumOver(function (k) { return apiSales(k, r.id); }), sumOver(function (k) { return apiPrice(k, r.id); }))) }; } };
    });
    var api = function (k) { return mv(k).api; };
    rows3.push({ label: "Total (광고센터 광고비 기준)", strong: true, cells: function (k) { return { t: pv(rr(st(k), api(k))) }; }, total: function () { return { t: pv(rr(sumOver(st), sumOver(api))) }; } });
    rows3.push({ label: "전체 ROI (총매출 ÷ 광고비 합계)", cells: function (k) { return { t: pv(rr(storeSales(k), tot(k))) }; }, total: function () { return { t: pv(rr(sumOver(storeSales), sumOver(tot))) }; } });
    table(el.roas, rows3);

    el.t1.textContent = "광고비 (Spend) · " + fyLabel(fy);
    el.t2.textContent = "광고 매출 (AD Sales) · " + fyLabel(fy);
    el.t3.textContent = "ROAS (광고 매출 ÷ 광고비) · " + fyLabel(fy);
    el.note.textContent = "단위 천 엔. Beauty AD 는 QSM 의 Beauty Brand AD(CPM) 리포트에서 수집한 값(캠페인이 없던 달은 0), Spotlight AD · Singleone(OFF)은 광고센터에 없어 직접 입력한 값이에요(‘-’ 는 입력 안 한 달). 세 광고 모두 광고 매출은 없어요. 합계 ROAS 는 직접 입력 항목을 뺀 광고센터 광고비 기준, 전체 ROI·투입율은 직접 입력 포함이에요. * 진행 중인 달.";
  }

  function drawChart() {
    if (!window.Chart) return;
    var ms = vis(), cs = getComputedStyle(document.body), tick = cs.color || "#444";
    var labels = ms.map(function (k) { return String(yOf(k)).slice(2) + "-" + pad(mOf(k)) + (k === S.partial ? "*" : ""); });
    var cfg = {
      data: { labels: labels, datasets: [
        { type: "bar", label: "광고비 합계", data: ms.map(function (k) { var c = mv(k); return Math.round((c.api + c.man) / 1000); }), backgroundColor: "#8aa4d6", yAxisID: "y" },
        { type: "bar", label: "광고 매출", data: ms.map(function (k) { return Math.round(mv(k).sales / 1000); }), backgroundColor: "#f2b35e", yAxisID: "y" },
        { type: "line", label: "ROAS(%)", data: ms.map(function (k) { var c = mv(k); return c.api ? Math.round(c.sales / c.api * 100) : null; }), borderColor: "#2b9a73", backgroundColor: "#2b9a73", yAxisID: "y1", tension: .25 }
      ] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { labels: { color: tick } } },
        scales: { x: { ticks: { color: tick }, grid: { display: false } }, y: { beginAtZero: true, min: 0, ticks: { color: tick }, title: { display: true, text: "K JPY", color: tick } },
          y1: { position: "right", beginAtZero: true, min: 0, grid: { drawOnChartArea: false }, ticks: { color: tick, callback: function (v) { return v + "%"; } } } } }
    };
    if (chart) { chart.destroy(); chart = null; }
    chart = new window.Chart(el.chart, cfg);
  }

  function renderNotice() {
    var miss = vis().filter(function (k) { return MANUAL_IDS.every(function (id) { return manual(k, id) == null; }); });
    el.notice.hidden = !miss.length;
    el.notice.textContent = miss.length ? "Spotlight AD · Singleone 광고비가 입력되지 않은 달이 있어요: " + miss.map(function (k) { return k.slice(0, 7); }).join(", ") + " (‘월별 광고비 입력’) — 입력 전에는 광고비 합계에 빠져 있어요." : "";
  }

  function recompute() {
    var k = S.ym;
    el.title.textContent = "Qoo10 ON-SITE AD · " + fyLabel(S.fy) + " · " + k.slice(0, 4) + " " + MON[mOf(k) - 1] + (k === S.partial ? " (" + S.bounds.max.slice(5).replace("-", "/") + "까지)" : "");
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

  // ---------- 모달 (코멘트 · 월별 광고비 입력) ----------
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

  function openNoteModal() {
    var k = S.ym;
    modal("코멘트 입력 · " + k.slice(0, 4) + " " + MON[mOf(k) - 1], "자동 코멘트 아래에 같이 보여요. 줄바꿈은 그대로 보여요.", function (m) {
      var ta = h("textarea"); ta.maxLength = 4000; ta.value = S.note ? S.note.body : ""; m.card.appendChild(ta);
      var del = h("button", "dash-btn", "지우기"); del.type = "button"; del.hidden = !S.note; m.extra.push(del);
      function commit(body) {
        m.save.disabled = del.disabled = true; m.err.textContent = "";
        rpc("dy_inni_comment_set", { p_report: "onsite", p_ym: k, p_body: body }).then(function (c) {
          if (k === S.ym) showManual(c); toast(c ? "코멘트를 저장했어요" : "코멘트를 지웠어요"); m.close();
        }).catch(function (e) { m.err.textContent = friendly(e); m.save.disabled = del.disabled = false; });
      }
      m.save.addEventListener("click", function () { commit(ta.value); });
      del.addEventListener("click", function () { commit(""); });
      ta.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(ta.value); } });
      return ta;
    });
  }

  function openManualModal() {
    var months = fyMonths(S.fy).filter(function (k) { return k >= minYm() && k <= maxYm(); });
    modal("월별 광고비 입력 · " + fyLabel(S.fy), "광고센터에 없는 광고의 월별 광고비를 천 엔 단위로 입력해요(예: 300 = 30만 엔). 비워 두면 입력 안 한 달이에요. 모두가 같이 봐요.", function (m) {
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
        rpc("dy_inni_ad_manual_set", { p_rows: rows }).then(function () { return loadFy(S.fy); }).then(function () { toast("광고비를 저장했어요"); m.close(); recompute(); })
          .catch(function (e) { m.err.textContent = friendly(e); m.save.disabled = false; });
      });
      return inputs[Object.keys(inputs)[0]] && inputs[Object.keys(inputs)[0]].el;
    });
  }

  // ---------- 이벤트 ----------
  el.fy.addEventListener("change", function () { S.fy = +el.fy.value; S.ym = null; fillMonths(); loadFy(S.fy).then(recompute).catch(function (e) { showMsg(friendly(e)); }); });
  el.month.addEventListener("change", function () { S.ym = el.month.value; recompute(); });
  el.reload.addEventListener("click", function () { D.clearCache(); S.ready = false; start(true); });
  el.noteBtn.addEventListener("click", function () { if (S.ready && S.ym) openNoteModal(); });
  el.manualBtn.addEventListener("click", function () { if (S.ready) openManualModal(); });
  document.addEventListener("dy:theme", function () { if (S.ready && S.ym && started) drawChart(); });

  // ---------- 시작 ----------
  var started = false;
  function start(force) {
    if (started && !force) { if (chart) chart.resize(); return Promise.resolve(); }
    started = true;
    return load().then(function () {
      if (!S.ready) { started = false; return; }
      fillFy(); fillMonths();
      return loadFy(S.fy).then(recompute);
    }).catch(function (e) { showMsg(friendly(e)); });
  }
  document.addEventListener("inni:show", function (e) { if (e.detail.view === "inni" && e.detail.sub === "onsite") start(); });
  if (/^#inni\/onsite/.test(location.hash || "")) start();
})();

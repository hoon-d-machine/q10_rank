/* inni 탭 · MEGAPO 행사 리포트 (AP Talk 시트의 MEGAPO 탭을 DB 로 대체)
 *   - 행사 달력(inni_mega_event, 광고센터 /api/calendar/mega)에서 메가포(SUPERPOINT) 행사를 고르면 그 행사 기간(시작일~종료일)의 매출로 리포트를 만든다
 *   - 일별(Day 1~N): SALES · PV · ORDERS · CVR · AOV 를 직전 행사(QoQ)·작년 같은 행사(YoY)와 같은 Day 끼리 비교, 합계(SUM)는 같은 일수끼리
 *   - 상품별 실적(상위 20개): 행사 기간 매출·비중·직전 행사 대비·PV·CVR
 *   - 코멘트: 자동 생성 + 직접 입력(리포트 'megapo', 행사 시작 달 기준). 단위: 천 엔
 * 정의: SALES = 순매출(final_buy_bpv, 취소 제외), PV = 스토어 총 PV, ORDERS = 총상품수량(순)(final_total_buy_cnt), CVR = ORDERS ÷ PV, AOV = SALES ÷ ORDERS
 * 진행 중인 행사는 데이터가 있는 마지막 날까지만 보여 주고 비교도 같은 일수로 한다.
 */
(function () {
  "use strict";
  var D = window.dyDash;
  var pane = document.querySelector('.inni-pane[data-pane="megapo"]');
  if (!D || !pane) return;

  var $ = function (s) { return pane.querySelector(s); };
  var el = {
    ev: $(".js-m-event"), reload: $(".js-m-reload"), noteBtn: $(".js-m-note-btn"), msg: $(".js-m-msg"), notice: $(".js-m-notice"),
    title: $(".js-m-title"), auto: $(".js-m-auto"), manualBox: $(".js-m-manual-box"), manualBody: $(".js-m-manual-body"), manualMeta: $(".js-m-manual-meta"),
    chart: $(".js-m-chart"), daily: $(".js-m-daily"), items: $(".js-m-items"), itemsTitle: $(".js-m-items-title"), note: $(".js-m-note")
  };
  var TOP_N = 20, FLAG_RATE = 0.5;
  var S = { ready: false, loading: false, events: [], ev: null, master: null, anchor: null, data: null, note: null };
  var chart = null;

  // ---------- 날짜·서식 ----------
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function parse(s) { var a = s.split("-"); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function addD(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
  function diffD(a, b) { return Math.round((parse(a) - parse(b)) / 86400000); }
  function md(s) { return +s.slice(5, 7) + "/" + +s.slice(8, 10); }
  function kv(yen) { return yen == null ? "-" : Math.round(yen / 1000).toLocaleString("ko-KR"); }
  function num(v) { return v == null ? "-" : Math.round(v).toLocaleString("ko-KR"); }
  function growth(a, b) { return b ? (a / b - 1) * 100 : null; }
  function gs(v) { return v == null ? "-" : v >= 9999.5 ? ">+9,999%" : (v >= 0 ? "+" : "") + v.toFixed(0) + "%"; }
  function cls(v) { return v == null ? "" : v >= 0 ? "is-up" : "is-down"; }
  function pv1(v) { return v == null || !isFinite(v) ? "-" : v.toFixed(1) + "%"; }
  function mil(yen) { return (yen / 1e6).toFixed(1) + "백만엔"; }
  function man(v) { return v >= 1e4 ? (v / 1e4).toFixed(1) + "만" : Math.round(v).toLocaleString("ko-KR"); }
  function h(tag, c, text) { var e = document.createElement(tag); if (c) e.className = c; if (text != null) e.textContent = text; return e; }
  function toast(m) { if (window.dyToast) window.dyToast(m); }
  function showMsg(m) { el.msg.textContent = m || ""; el.msg.hidden = !m; }
  function rpc(name, args) { return window.dyAuth.client.rpc(name, args).then(function (res) { if (res.error) throw res.error; return res.data; }); }
  function friendly(e) {
    var m = (e && e.message) || String(e);
    if (/dy_inni_|dy_data_page|inni_mega|Could not find the function|schema cache/i.test(m)) return "필요한 DB 함수·표가 아직 없어요. Supabase SQL Editor 에서 dy-ai/supabase/inni.sql · data_view.sql 과 inni_RPA/supabase_schema_ads.sql 을 실행해 주세요.";
    return D.friendly ? D.friendly(e) : "불러오지 못했어요: " + m;
  }

  // ---------- 행사 목록 ----------
  function evLabel(e) { return e.start_dt.slice(0, 4) + " " + e.start_dt.slice(5, 7) + " MEGAPO"; }
  function evRange(e) { return md(e.start_dt) + "~" + md(e.end_dt); }

  function load() {
    if (S.loading) return Promise.resolve();
    S.loading = true; showMsg("");
    return window.dyAuth.requireLogin().then(function (sess) {
      if (!sess) return;
      return Promise.all([D.loadBounds(), rpc("dy_data_page", { p_source: "mega_event", p_from: null, p_to: null, p_q: "SUPERPOINT", p_limit: 1000, p_offset: 0 }),
        rpc("dy_data_page", { p_source: "products", p_from: null, p_to: null, p_q: null, p_limit: 1000, p_offset: 0 })]).then(function (r) {
        S.anchor = D.anchor(); var minD = D.minDate() || "2024-01-01";
        S.events = (r[1].rows || []).map(function (x) { return { no: x.promotion_no, nm: x.promotion_nm, start_dt: String(x.start_dt).slice(0, 10), end_dt: String(x.end_dt).slice(0, 10) }; })
          .filter(function (e) { return e.start_dt <= S.anchor && e.end_dt >= minD; })
          .sort(function (a, b) { return a.start_dt < b.start_dt ? 1 : -1; });   // 최신 행사가 먼저
        S.master = {}; (r[2].rows || []).forEach(function (x) { S.master[String(x.gd_no)] = x; });
        if (!S.events.length) throw new Error("행사 달력이 아직 없어요. 수집기에서 Q10 수집을 한 번 하면 채워져요.");
        S.ready = true;
      });
    }).catch(function (e) { showMsg(friendly(e)); }).then(function () { S.loading = false; });
  }

  // 직전 행사(목록에서 바로 다음), 작년 같은 행사(시작일이 1년 전과 가장 가까운 행사, 40일 이내)
  function prevOf(e) { var i = S.events.indexOf(e); return i >= 0 && i + 1 < S.events.length ? S.events[i + 1] : null; }
  function lyOf(e) {
    var tgt = addD(e.start_dt, -365), best = null, bd = 41;
    S.events.forEach(function (x) { if (x === e) return; var d = Math.abs(diffD(x.start_dt, tgt)); if (d < bd) { bd = d; best = x; } });
    return best;
  }

  // ---------- 집계 ----------
  var DM = ["net_sales", "total_pv", "net_qty", "gmv", "cancel_amt"];
  function eventDays(e, limit) { // 행사 날짜 목록 (limit 일 수까지)
    var out = [], d = e.start_dt; while (d <= e.end_dt && (limit == null || out.length < limit)) { out.push(d); d = addD(d, 1); } return out;
  }
  function seriesOf(e, n) { // e 의 앞 n 일(데이터 있는 날까지)의 일별 값 [{date, sales, pv, orders, gmv, cancel}|null]
    if (!e) return Promise.resolve(null);
    var days = eventDays(e, n).filter(function (d) { return d <= S.anchor; });
    if (!days.length) return Promise.resolve([]);
    return D.query({ metrics: DM, grain: "day", range: { from: days[0], to: days[days.length - 1] } }).then(function (r) {
      return days.map(function (d) { var x = r.rows[d]; return x ? { date: d, sales: x.net_sales || 0, pv: x.total_pv || 0, orders: x.net_qty || 0, gmv: x.gmv || 0, cancel: x.cancel_amt || 0 } : null; });
    });
  }
  function itemsOf(from, to) {
    return D.query({ metrics: ["g_net_amt", "g_pv", "g_net_qty"], grain: "all", range: { from: from, to: to }, dim: "gd_no", top: 200, topMetric: "g_net_amt" });
  }
  function sum(ser, f) { var t = 0; (ser || []).forEach(function (x) { if (x) t += x[f]; }); return t; }
  function cnt(ser) { return (ser || []).filter(Boolean).length; }

  function build() {
    var e = S.ev, p = prevOf(e), l = lyOf(e);
    var days = eventDays(e).filter(function (d) { return d <= S.anchor; }), n = days.length;
    var part = e.end_dt > S.anchor;
    S.busy = true;
    var pRange = p ? [p.start_dt, addD(p.start_dt, Math.min(n, diffD(p.end_dt, p.start_dt) + 1) - 1)] : null;
    return Promise.all([seriesOf(e), seriesOf(p, n), seriesOf(l, n),
      itemsOf(days[0], days[n - 1]), pRange ? itemsOf(pRange[0], pRange[1]) : Promise.resolve(null)]).then(function (r) {
      var cur = r[0], prev = r[1], ly = r[2], it = r[3], itp = r[4];
      var gm = function (x, id, k) { var v = x && x.rows[id]; return v && v[k] ? v[k] : 0; };
      var total = 0; Object.keys(it.rows).forEach(function (id) { total += gm(it, id, "g_net_amt"); });
      var items = Object.keys(it.rows).map(function (id) {
        var m = S.master[id] || {};
        var o = { gd: id, name: m.product_name || it.labels[id] || id, sales: gm(it, id, "g_net_amt"), pv: gm(it, id, "g_pv"), qty: gm(it, id, "g_net_qty") };
        if (itp) { o.pSales = gm(itp, id, "g_net_amt"); o.pPv = gm(itp, id, "g_pv"); }
        return o;
      }).filter(function (o) { return o.sales > 0; }).sort(function (a, b) { return b.sales - a.sales; });
      items.forEach(function (o, i) {
        o.no = i + 1; o.share = total ? o.sales / total * 100 : null;
        o.qoq = itp ? (o.pSales ? growth(o.sales, o.pSales) : "NEW") : null; o.pvQoq = itp ? (o.pPv ? growth(o.pv, o.pPv) : "NEW") : null;
        o.cvr = o.pv ? o.qty / o.pv * 100 : null;
      });
      S.data = { e: e, p: p, l: l, days: days, n: n, part: part, cur: cur, prev: prev, ly: ly, items: items, itemsTotal: total };
    }).then(function () { S.busy = false; }, function (err) { S.busy = false; throw err; });
  }

  // ---------- 코멘트 ----------
  function dayStat(x) { return x ? { sales: x.sales, pv: x.pv, orders: x.orders, cvr: x.pv ? x.orders / x.pv * 100 : null, aov: x.orders ? x.sales / x.orders : null } : null; }
  function sumStat(ser) { var s = { sales: sum(ser, "sales"), pv: sum(ser, "pv"), orders: sum(ser, "orders") }; s.cvr = s.pv ? s.orders / s.pv * 100 : null; s.aov = s.orders ? s.sales / s.orders : null; s.n = cnt(ser); return s; }

  function autoLines() {
    var d = S.data, L = [], c = sumStat(d.cur), p = d.prev ? sumStat(d.prev) : null, y = d.ly ? sumStat(d.ly) : null;
    var qoq = function (a, b) { return p && b ? gs(growth(a, b)) : null; }, yoy = function (a, b) { return y && b ? gs(growth(a, b)) : null; };
    var pair = function (a, pb, yb) { var t = []; if (qoq(a, pb)) t.push("QoQ " + qoq(a, pb)); if (yoy(a, yb)) t.push("YoY " + yoy(a, yb)); return t.length ? " (" + t.join(" · ") + ")" : ""; };
    L.push({ t: "행사기간: " + evRange(d.e) + " (" + d.n + "일간 " + (d.part ? "진행 중 · " + md(d.days[d.n - 1]) + "까지" : "진행") + ")" + (d.p ? " · 직전 행사 " + evLabel(d.p) + (d.l ? " · 작년 " + evLabel(d.l) : "") : "") });
    L.push({ t: "매출액: " + mil(c.sales) + pair(c.sales, p && p.sales, y && y.sales), c: p && p.sales ? (c.sales >= p.sales ? "" : "is-neg") : "" });
    L.push({ t: "PV: " + man(c.pv) + pair(c.pv, p && p.pv, y && y.pv) });
    var bits = ["ORDERS " + num(c.orders) + "건" + pair(c.orders, p && p.orders, y && y.orders), "CVR " + pv1(c.cvr) + (p && p.cvr != null ? " (QoQ " + (c.cvr - p.cvr >= 0 ? "+" : "") + (c.cvr - p.cvr).toFixed(1) + "%p)" : ""),
      "AOV " + num(c.aov) + "엔" + (p && p.aov ? " (QoQ " + (c.aov - p.aov >= 0 ? "+" : "") + Math.round(c.aov - p.aov) + "엔)" : "")];
    L.push({ t: bits.join(" · ") });
    if (d.prev) {
      var neg = [], pos = 0;
      d.cur.forEach(function (x, i) { var q = d.prev[i]; if (!x || !q || !q.sales) return; if (x.sales < q.sales) neg.push(i + 1); else pos++; });
      if (neg.length) L.push({ t: "DAY " + neg.join(",") + "일차는 직전 행사 같은 일차보다 매출이 낮았어요 (QoQ 마이너스)", c: "is-neg" });
      else if (pos) L.push({ t: "모든 날이 직전 행사 같은 일차보다 매출이 높았어요 (QoQ 플러스)" });
    }
    if (d.items.length >= 3) {
      var top = d.items.slice(0, 3), sh = top.reduce(function (t, o) { return t + o.sales; }, 0) / d.itemsTotal * 100;
      L.push({ t: "상위 3개 상품이 " + sh.toFixed(0) + "%: " + top.map(function (o) { return o.name + " " + mil(o.sales); }).join(" · ") });
    }
    var flags = flagged();
    flags.forEach(function (f) { L.push({ t: "※ " + f, c: "is-neg" }); });
    return L;
  }
  // 취소금액이 주문금액의 50% 이상인 날(집계 이상 가능성) — 비교값이 크게 흔들린다
  function flagged() {
    var d = S.data, out = [];
    [["이번 행사", d.cur], ["직전 행사", d.prev], ["작년 행사", d.ly]].forEach(function (pr) {
      (pr[1] || []).forEach(function (x, i) {
        if (x && x.gmv > 0 && x.cancel / x.gmv >= FLAG_RATE) out.push(x.date + " (" + pr[0] + " Day " + (i + 1) + ")은 취소금액이 주문금액의 " + (x.cancel / x.gmv * 100).toFixed(0) + "%라 그 날의 매출·비교값이 크게 흔들려요");
      });
    });
    return out;
  }
  function showManual(c) {
    S.note = c && c.body ? c : null;
    el.manualBox.hidden = !S.note;
    el.manualBody.textContent = S.note ? S.note.body : "";
    el.manualMeta.textContent = S.note ? "직접 입력 · " + (S.note.by || "") + (S.note.at ? " · " + String(S.note.at).slice(0, 16).replace("T", " ") : "") : "";
    el.noteBtn.textContent = S.note ? "코멘트 수정" : "코멘트 입력";
  }
  function noteKey() { return S.ev.start_dt.slice(0, 8) + "01"; }   // 메가포는 한 달에 한 번이라 시작 월로 구분한다
  function renderComment() {
    el.auto.innerHTML = "";
    autoLines().forEach(function (l) { var q = h("p"); q.appendChild(h("span", l.c || "", l.t)); el.auto.appendChild(q); });
    showManual(null);
    var k = noteKey(), ev = S.ev;
    rpc("dy_inni_comment_get", { p_report: "megapo", p_ym: k }).then(function (c) { if (ev === S.ev) showManual(c); })
      .catch(function (e) { el.manualMeta.textContent = friendly(e); el.manualBox.hidden = false; });
  }

  // ---------- 표·그래프 ----------
  function renderDaily() {
    var d = S.data, t = el.daily; t.innerHTML = "";
    var head = ["DAY", "날짜", "SALES", "QoQ", "YoY", "PV", "QoQ", "YoY", "ORDERS", "CVR", "AOV"];
    var thead = h("thead"), tr = h("tr"); head.forEach(function (x) { tr.appendChild(h("th", null, x)); }); thead.appendChild(tr); t.appendChild(thead);
    var tb = h("tbody"), flagDates = {}; flagged().forEach(function (f) { flagDates[f.slice(0, 10)] = 1; });
    function cell(row, text, c) { row.appendChild(h("td", c || "", text)); }
    function line(label, date, c, p, y, strong) {
      var row = h("tr", strong ? "is-total" : ""); cell(row, label, "t"); cell(row, date, "t");
      var s = c, ps = p, ys = y;
      cell(row, kv(s.sales)); cell(row, ps && ps.sales ? gs(growth(s.sales, ps.sales)) : "-", ps && ps.sales ? cls(growth(s.sales, ps.sales)) : "is-empty"); cell(row, ys && ys.sales ? gs(growth(s.sales, ys.sales)) : "-", ys && ys.sales ? cls(growth(s.sales, ys.sales)) : "is-empty");
      cell(row, num(s.pv)); cell(row, ps && ps.pv ? gs(growth(s.pv, ps.pv)) : "-", ps && ps.pv ? cls(growth(s.pv, ps.pv)) : "is-empty"); cell(row, ys && ys.pv ? gs(growth(s.pv, ys.pv)) : "-", ys && ys.pv ? cls(growth(s.pv, ys.pv)) : "is-empty");
      cell(row, num(s.orders)); cell(row, pv1(s.cvr)); cell(row, num(s.aov));
      return row;
    }
    d.cur.forEach(function (x, i) {
      if (!x) return;
      var row = line("Day " + (i + 1), md(x.date), dayStat(x), dayStat(d.prev && d.prev[i]), dayStat(d.ly && d.ly[i]));
      if (flagDates[x.date] || (d.prev && d.prev[i] && flagDates[d.prev[i].date]) || (d.ly && d.ly[i] && flagDates[d.ly[i].date])) row.classList.add("is-flag");
      tb.appendChild(row);
    });
    var cs = sumStat(d.cur), ps = d.prev ? sumStat(d.prev) : null, ys = d.ly ? sumStat(d.ly) : null;
    tb.appendChild(line("SUM", d.n + "일", cs, ps, ys, true));
    t.appendChild(tb);
  }

  function renderItems() {
    var d = S.data, t = el.items; t.innerHTML = "";
    el.itemsTitle.textContent = "상품별 실적 · 상위 " + Math.min(TOP_N, d.items.length) + "개 · 행사 기간 합계 " + kv(d.itemsTotal) + "K";
    var head = ["No.", "상품", "Sales(엔)", "%", "QoQ", "PV", "QoQ", "CVR"];
    var thead = h("thead"), tr = h("tr"); head.forEach(function (x) { tr.appendChild(h("th", null, x)); }); thead.appendChild(tr); t.appendChild(thead);
    var tb = h("tbody");
    d.items.slice(0, TOP_N).forEach(function (o) {
      var row = h("tr"), q = typeof o.qoq === "string" ? o.qoq : o.qoq == null ? "-" : gs(o.qoq), pq = typeof o.pvQoq === "string" ? o.pvQoq : o.pvQoq == null ? "-" : gs(o.pvQoq);
      row.appendChild(h("td", "t", String(o.no))); var nm = h("td", "name", o.name); nm.title = o.name; row.appendChild(nm);
      row.appendChild(h("td", "", num(o.sales))); row.appendChild(h("td", "", o.share == null ? "-" : o.share.toFixed(0) + "%"));
      row.appendChild(h("td", typeof o.qoq === "number" ? cls(o.qoq) : "", q)); row.appendChild(h("td", "", num(o.pv)));
      row.appendChild(h("td", typeof o.pvQoq === "number" ? cls(o.pvQoq) : "", pq)); row.appendChild(h("td", "", pv1(o.cvr)));
      tb.appendChild(row);
    });
    t.appendChild(tb);
  }

  function drawChart() {
    if (!window.Chart) return;
    var d = S.data, tick = getComputedStyle(document.body).color || "#444";
    var N = Math.max(d.n, d.prev ? d.prev.length : 0, d.ly ? d.ly.length : 0), labels = []; for (var i = 0; i < d.n; i++) labels.push("Day " + (i + 1));
    var ser = function (s) { return labels.map(function (_, i) { var x = s && s[i]; return x ? Math.round(x.sales / 1000) : null; }); };
    var sets = [{ label: evLabel(d.e) + " (" + evRange(d.e) + ")", data: ser(d.cur), borderColor: "#2b6fd6", backgroundColor: "#2b6fd6", borderWidth: 3 }];
    if (d.prev) sets.push({ label: "직전 " + evLabel(d.p), data: ser(d.prev), borderColor: "#f2a33a", backgroundColor: "#f2a33a", borderDash: [6, 4] });
    if (d.ly) sets.push({ label: "작년 " + evLabel(d.l), data: ser(d.ly), borderColor: "#8c8c8c", backgroundColor: "#8c8c8c", borderDash: [2, 3] });
    sets.forEach(function (s) { s.tension = .25; s.pointRadius = 3; s.spanGaps = false; });
    if (chart) { chart.destroy(); chart = null; }
    chart = new window.Chart(el.chart, { type: "line", data: { labels: labels, datasets: sets }, options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { color: tick } } },
      scales: { x: { ticks: { color: tick }, grid: { display: false } }, y: { beginAtZero: true, min: 0, ticks: { color: tick }, title: { display: true, text: "SALES (K JPY)", color: tick } } } } });
  }

  function renderNotice() {
    var d = S.data, msgs = [];
    if (d.part) msgs.push("진행 중인 행사예요. 데이터가 있는 " + md(d.days[d.n - 1]) + "까지만 보이고 비교도 같은 일수로 해요.");
    if (!d.p) msgs.push("비교할 직전 행사가 없어요.");
    el.notice.hidden = !msgs.length; el.notice.textContent = msgs.join(" ");
  }

  function renderAll() {
    var d = S.data;
    el.title.textContent = evLabel(d.e) + " · " + evRange(d.e) + (d.part ? " (진행 중)" : "");
    renderNotice(); renderComment(); renderDaily(); drawChart(); renderItems();
    el.note.textContent = "단위: SALES 천 엔(상품 표는 엔). SALES = 순매출(취소 제외), ORDERS = 총상품수량(순), CVR = ORDERS ÷ PV, AOV = SALES ÷ ORDERS. QoQ = 직전 메가포 행사의 같은 일차 대비, YoY = 작년 같은 행사 대비. 노란 줄은 취소금액이 주문금액의 50% 이상인 날(집계 이상 가능성)이 포함된 줄이에요.";
  }
  function recompute() { showMsg(""); return build().then(renderAll).catch(function (e) { showMsg(friendly(e)); }); }

  // ---------- 선택 상자 ----------
  function fillEvents() {
    el.ev.innerHTML = "";
    S.events.forEach(function (e) { var o = h("option", null, evLabel(e) + " (" + evRange(e) + ")" + (e.end_dt > S.anchor ? " · 진행 중" : "")); o.value = String(e.no); el.ev.appendChild(o); });
    if (!S.ev) S.ev = S.events.filter(function (e) { return e.end_dt <= S.anchor; })[0] || S.events[0];   // 기본은 가장 최근에 끝난 행사
    el.ev.value = String(S.ev.no);
  }

  // ---------- 코멘트 입력 모달 ----------
  function openNoteModal() {
    var ev = S.ev, k = noteKey(), prev = document.activeElement, ov = h("div", "inni-modal"), card = h("div", "inni-modal-card");
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "코멘트 입력");
    card.appendChild(h("h3", null, "코멘트 입력 · " + evLabel(ev))); card.appendChild(h("p", null, "자동 코멘트 아래에 같이 보여요. 줄바꿈은 그대로 보여요."));
    var ta = h("textarea"); ta.maxLength = 4000; ta.value = S.note ? S.note.body : ""; card.appendChild(ta);
    var err = h("div", "inni-modal-err"); card.appendChild(err);
    var acts = h("div", "inni-modal-acts"), del = h("button", "dash-btn", "지우기"), gap = h("span", "inni-gap"), cancel = h("button", "dash-btn", "취소"), save = h("button", "dash-btn is-primary", "저장");
    del.type = cancel.type = save.type = "button"; del.hidden = !S.note;
    [del, gap, cancel, save].forEach(function (x) { acts.appendChild(x); }); card.appendChild(acts); ov.appendChild(card); document.body.appendChild(ov);
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    function close() { document.removeEventListener("keydown", onKey, true); if (ov.parentNode) ov.parentNode.removeChild(ov); if (prev && prev.focus) prev.focus(); }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(ta.value); } }
    function commit(body) {
      save.disabled = del.disabled = true; err.textContent = "";
      rpc("dy_inni_comment_set", { p_report: "megapo", p_ym: k, p_body: body }).then(function (c) {
        if (ev === S.ev) showManual(c); toast(c ? "코멘트를 저장했어요" : "코멘트를 지웠어요"); close();
      }).catch(function (e) { err.textContent = friendly(e); save.disabled = del.disabled = false; });
    }
    document.addEventListener("keydown", onKey, true);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    cancel.addEventListener("click", close); save.addEventListener("click", function () { commit(ta.value); }); del.addEventListener("click", function () { commit(""); });
  }

  // ---------- 이벤트 ----------
  el.ev.addEventListener("change", function () { S.ev = S.events.filter(function (e) { return String(e.no) === el.ev.value; })[0]; recompute(); });
  el.reload.addEventListener("click", function () { D.clearCache(); S.ready = false; S.ev = null; start(true); });
  el.noteBtn.addEventListener("click", function () { if (S.ready && S.ev) openNoteModal(); });
  document.addEventListener("dy:theme", function () { if (S.data && started) drawChart(); });

  // ---------- 시작 ----------
  var started = false;
  function start(force) {
    if (started && !force) { if (chart) chart.resize(); return Promise.resolve(); }
    started = true;
    return load().then(function () {
      if (!S.ready) { started = false; return; }
      fillEvents(); return recompute();
    }).catch(function (e) { showMsg(friendly(e)); });
  }
  document.addEventListener("inni:show", function (e) { if (e.detail.view === "inni" && e.detail.sub === "megapo") start(); });
  if (/^#inni\/megapo/.test(location.hash || "")) start();
})();

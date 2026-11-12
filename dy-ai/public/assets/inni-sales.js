/* inni 탭 · SALES 월간 리포트 (AP Talk 시트의 SALES 탭을 DB 로 대체)
 *   - 회계연도(BY, 7월~6월) 단위로 월별 SALES · YoY · 목표 · 달성률 · PV · ORDERS · CVR · AOV, BY 별 월 매출 추이(막대/꺾은선)
 *   - 코멘트(자동 생성 + 직접 입력), 표 강조(행·열·색), 그래프 종류는 '설정' 모달에서 (강조·그래프는 회계연도별로 저장)
 *   - 엑셀 다운로드: 화면과 같은 서식(강조 색 포함)과 그래프 그림, 월별 원본 시트
 *   - 집계는 dash-core.js(window.dyDash.query) 의 월 단위 집계를 그대로 씀. 목표·코멘트·설정은 supabase/inni.sql 의 함수.
 * 정의: SALES = 순매출(final_buy_bpv), PV = 총 PV, ORDERS = 구매수(purchase_cnt), CVR = ORDERS ÷ PV, AOV = SALES ÷ ORDERS
 * 진행 중인 달은 같은 일수끼리 비교(작년 같은 날수, 전월 같은 날수)하고 헤더에 * 를 붙인다. 표·그래프는 기준 월까지만 보인다.
 */
(function () {
  "use strict";
  var D = window.dyDash;
  var pane = document.querySelector('.inni-pane[data-pane="sales"]');
  if (!D || !pane) return;

  var $ = function (s) { return pane.querySelector(s); };
  var el = {
    fy: $(".js-s-fy"), month: $(".js-s-month"), reload: $(".js-s-reload"), tgtBtn: $(".js-s-tgt-btn"), msg: $(".js-s-msg"),
    tgt: $(".js-s-tgt"), tgtTable: $(".js-s-tgt-table"), tgtSave: $(".js-s-tgt-save"), tgtCancel: $(".js-s-tgt-cancel"), tgtNote: $(".js-s-tgt-note"),
    title: $(".js-s-title"), unit: $(".js-s-unit"), auto: $(".js-s-auto"), setBtn: $(".js-s-set"), xlsxBtn: $(".js-s-xlsx"),
    manual: $(".js-s-manual"), manualBody: $(".js-s-manual-body"), manualMeta: $(".js-s-manual-meta"),
    kpiTitle: $(".js-s-kpi-title"), kpi: $(".js-s-kpi"), chart: $(".js-s-chart"), trend: $(".js-s-trend")
  };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var FY_ORDER = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];                      // 회계연도 열 순서
  var DEFAULT_HL = "#fff2b8";
  var PRESETS = ["#fff2b8", "#d9f2e0", "#d6e6ff", "#ffd9d6", "#e8dcff", "#ffe3c2"];
  var EXCELJS = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
  var S = { note: null, cfg: null, ready: false, loading: false, rows: {}, targets: {}, anchor: null, minYm: null, endYm: null, partialYm: null, lyPart: null, pmPart: null, fy: null, ym: null };
  var chart = null;

  // ---------- 날짜 ----------
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ym(y, m) { return y + "-" + pad(m) + "-01"; }
  function yOf(k) { return +k.slice(0, 4); }
  function mOf(k) { return +k.slice(5, 7); }
  function addM(k, n) { var t = yOf(k) * 12 + (mOf(k) - 1) + n; return ym(Math.floor(t / 12), (t % 12) + 1); }
  function lastDay(k) { return new Date(yOf(k), mOf(k), 0).getDate(); }
  function fyOf(k) { return mOf(k) >= 7 ? yOf(k) + 1 : yOf(k); }              // BY27 = 2026-07 ~ 2027-06
  function fyLabel(fy) { return "BY" + String(fy).slice(2); }
  function fyMonths(fy) { var a = []; for (var i = 0; i < 12; i++) a.push(addM(ym(fy - 1, 7), i)); return a; }
  function ymd(k, d) { return k.slice(0, 8) + pad(d); }

  // ---------- 서식 ----------
  function num(v) { return v == null ? "-" : Math.round(v).toLocaleString("ko-KR"); }
  function kj(v) { return v == null ? "-" : Math.round(v / 1000).toLocaleString("ko-KR"); }
  function pctv(v, d) { return v == null || !isFinite(v) ? "-" : (d == null ? v.toFixed(0) : v.toFixed(d)) + "%"; }
  function gv(v) { return v == null || !isFinite(v) ? null : v; }
  function gstr(v) { return v == null ? "-" : (v >= 0 ? "+" : "") + v.toFixed(0) + "%"; }
  function growth(a, b) { return b ? (a / b - 1) * 100 : null; }
  function krw(yen) { // 엔 → 한국식 '약 …' 금액 (4천8백만, 1억2천만, 939만)
    var n = Math.round(yen);
    if (n >= 99500000) { var u = Math.round(n / 1e7) * 1e7, eok = Math.floor(u / 1e8), rest = Math.round((u - eok * 1e8) / 1e7); return eok + "억" + (rest ? rest + "천만" : ""); }
    if (n >= 1e7) { var m = Math.round(n / 1e6), c = Math.floor(m / 10), b = m % 10; return (c ? c + "천" : "") + (b ? b + "백" : "") + "만"; }
    return Math.round(n / 1e4).toLocaleString("ko-KR") + "만";
  }
  function cls(v) { return v == null ? "" : v >= 0 ? "is-up" : "is-down"; }
  function h(tag, c, text) { var e = document.createElement(tag); if (c) e.className = c; if (text != null) e.textContent = text; return e; }
  function toast(m) { if (window.dyToast) window.dyToast(m); }
  function showMsg(m) { el.msg.textContent = m || ""; el.msg.hidden = !m; }
  function rpc(name, args) { return window.dyAuth.client.rpc(name, args).then(function (res) { if (res.error) throw res.error; return res.data; }); }
  function friendly(e) {
    var m = (e && e.message) || String(e);
    if (/dy_inni_|Could not find the function|schema cache/i.test(m)) return "목표·코멘트·설정 함수가 아직 없어요. Supabase SQL Editor 에서 dy-ai/supabase/inni.sql 을 실행해 주세요.";
    return D.friendly ? D.friendly(e) : "불러오지 못했어요: " + m;
  }
  function alpha(c, a) {
    var m = /^#([0-9a-f]{6})$/i.exec(c || ""); if (!m) return c;
    var n = parseInt(m[1], 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  // ---------- 설정(강조·그래프) ----------
  function normCfg(c) {
    c = c || {};
    var d = { chart: c.chart === "line" ? "line" : "bar" };
    ["kpi", "trend"].forEach(function (t) {
      var x = c[t] || {};
      d[t] = { rows: Array.isArray(x.rows) ? x.rows.map(String) : [], cols: Array.isArray(x.cols) ? x.cols.map(String) : [], color: /^#[0-9a-f]{6}$/i.test(x.color || "") ? x.color : DEFAULT_HL };
    });
    return d;
  }
  function loadCfg(fy) {
    return rpc("dy_inni_settings_get", { p_report: "sales", p_fy: fy }).then(function (c) { S.cfg = normCfg(c); }).catch(function (e) { S.cfg = normCfg(null); showMsg(friendly(e)); });
  }

  // ---------- 데이터 ----------
  var MET = ["net_sales", "total_pv", "purchases"];
  function q(from, to) { return D.query({ metrics: MET, grain: "month", range: { from: from, to: to } }); }

  function load() {
    if (S.loading) return Promise.resolve();
    S.loading = true; showMsg("");
    return window.dyAuth.requireLogin().then(function (sess) {
      if (!sess) return;
      return D.loadBounds().then(function () {
        var anchor = D.anchor(), minD = D.minDate() || "2024-01-01";
        S.anchor = anchor; S.minYm = minD.slice(0, 8) + "01";
        var aym = anchor.slice(0, 8) + "01", ad = +anchor.slice(8, 10);
        S.endYm = ym(fyOf(aym), 6);                                  // 목표는 이 회계연도 말(다음 6월)까지 입력
        S.partialYm = ad < lastDay(aym) ? aym : null;
        var jobs = [q(S.minYm, anchor), rpc("dy_inni_targets_get", { p_from: S.minYm, p_to: S.endYm })];
        if (S.partialYm) {                                            // 진행 중인 달: 같은 일수끼리 비교 기준
          var ly = addM(aym, -12), pm = addM(aym, -1);
          jobs.push(q(ly, ymd(ly, Math.min(ad, lastDay(ly)))), q(pm, ymd(pm, Math.min(ad, lastDay(pm)))));
        }
        return Promise.all(jobs).then(function (r) {
          S.rows = r[0].rows || {};
          S.targets = {}; (r[1] || []).forEach(function (t) { S.targets[String(t.ym).slice(0, 10)] = +t.v; });
          if (S.partialYm) { S.lyPart = (r[2].rows || {})[addM(aym, -12)] || null; S.pmPart = (r[3].rows || {})[addM(aym, -1)] || null; }
          S.ready = true;
        });
      });
    }).catch(function (e) { showMsg(friendly(e)); }).then(function () { S.loading = false; });
  }

  // 한 달 지표
  function month(k) {
    var r = S.rows[k];
    if (!r || (!r.net_sales && !r.total_pv)) return null;
    var part = k === S.partialYm;
    var ly = part ? S.lyPart : S.rows[addM(k, -12)], pm = part ? S.pmPart : S.rows[addM(k, -1)];
    var m = { ym: k, partial: part, sales: r.net_sales, pv: r.total_pv, orders: r.purchases };
    m.cvr = m.pv ? m.orders / m.pv * 100 : null; m.aov = m.orders ? m.sales / m.orders : null;
    m.ly = ly || null; m.pm = pm || null;
    m.lyAov = ly && ly.purchases ? ly.net_sales / ly.purchases : null;
    m.yoy = ly ? gv(growth(m.sales, ly.net_sales)) : null;
    m.pvYoy = ly ? gv(growth(m.pv, ly.total_pv)) : null;
    m.aovYoy = m.lyAov && m.aov ? gv(growth(m.aov, m.lyAov)) : null;
    m.mom = pm ? gv(growth(m.sales, pm.net_sales)) : null;
    m.tgt = S.targets[k] != null ? S.targets[k] : null;
    m.tgtPct = m.tgt ? m.sales / m.tgt * 100 : null;
    return m;
  }

  // ---------- 코멘트 ----------
  function streak(k) { // 같은 방향 YoY 가 몇 달 이어졌는지
    var cur = month(k); if (!cur || cur.yoy == null) return 0;
    var sign = cur.yoy >= 0, n = 0, t = k;
    while (true) { var m = month(t); if (!m || m.yoy == null || (m.yoy >= 0) !== sign) break; n++; t = addM(t, -1); }
    return n;
  }
  function autoLines(k) {
    var m = month(k), L = [];
    if (!m) return [{ t: "이 달은 아직 데이터가 없어요." }];
    var head = "Sales 약 " + krw(m.sales) + "엔 (" + [m.mom != null ? "MoM " + gstr(m.mom) : null, m.yoy != null ? "YoY " + gstr(m.yoy) : null].filter(Boolean).join(" ") + ")";
    L.push({ t: head + (m.partial ? " · " + S.anchor.slice(5).replace("-", "/") + "까지 (같은 일수 비교)" : "") });
    if (m.yoy != null) {
      var n = streak(k), neg = m.yoy < 0;
      L.push({ t: n >= 3 ? "YoY " + gstr(m.yoy) + ", " + n + "개월 연속 " + (neg ? "마이너스 — 마이너스 트렌드 지속중" : "플러스 — 성장 트렌드 지속중") : "YoY " + gstr(m.yoy) + (neg ? " 감소" : " 성장"), c: neg ? "is-neg" : "is-pos" });
    }
    L.push({ t: m.tgt ? "목표 " + kj(m.tgt) + "K 대비 " + pctv(m.tgtPct) + " 달성" + (m.partial ? " (진행 중)" : "") : "목표가 입력되지 않았어요 (월별 목표 입력)" });
    L.push({ t: "PV " + num(m.pv) + (m.pvYoy != null ? " (YoY " + gstr(m.pvYoy) + ")" : "") + " · ORDERS " + num(m.orders) + " · CVR " + pctv(m.cvr, 1) + " · AOV ¥" + num(m.aov) + (m.aovYoy != null ? " (YoY " + gstr(m.aovYoy) + ")" : "") });
    return L;
  }
  function showManual(c) {
    S.note = c && c.body ? c : null;
    el.manual.hidden = !S.note;
    el.manualBody.textContent = S.note ? S.note.body : "";
    el.manualMeta.textContent = S.note ? "직접 입력 · " + (S.note.by || "") + (S.note.at ? " · " + String(S.note.at).slice(0, 16).replace("T", " ") : "") : "";
  }
  function renderComment(k) {
    el.auto.innerHTML = "";
    autoLines(k).forEach(function (l) { var p = h("p"); p.appendChild(h("span", l.c || "", l.t)); el.auto.appendChild(p); });
    showManual(null);
    rpc("dy_inni_comment_get", { p_report: "sales", p_ym: k }).then(function (c) {
      if (k === S.ym) showManual(c);
    }).catch(function (e) { el.manualMeta.textContent = friendly(e); el.manual.hidden = false; });
  }

  // ---------- 표 모델 (화면·엑셀이 같이 씀) ----------
  // type: k=천 엔, gr=증감률(%), pct=%, int=정수, cvr=%(소수 2자리), aov=¥
  function kpiModel() {
    var fy = S.fy, months = fyMonths(fy);
    var ms = months.map(function (k) { return k <= S.ym ? month(k) : null; });      // 기준 월 이후는 보이지 않게
    var have = ms.filter(Boolean);
    var sum = function (f) { return have.reduce(function (a, m) { return a + (f(m) || 0); }, 0); };
    var lyAll = have.length && have.every(function (m) { return m.ly; });
    var sSales = sum(function (m) { return m.sales; }), sPv = sum(function (m) { return m.pv; }), sOrd = sum(function (m) { return m.orders; });
    var lySales = lyAll ? sum(function (m) { return m.ly.net_sales; }) : null, lyPv = lyAll ? sum(function (m) { return m.ly.total_pv; }) : null;
    var tgtMonths = months.filter(function (k) { return k <= S.ym && S.targets[k] != null; });
    var sTgt = tgtMonths.reduce(function (a, k) { return a + S.targets[k]; }, 0);
    var tgtBase = tgtMonths.filter(function (k) { return month(k); });
    var sTgtDone = tgtBase.reduce(function (a, k) { return a + S.targets[k]; }, 0), sSalesDone = tgtBase.reduce(function (a, k) { return a + month(k).sales; }, 0);
    var yS = lyAll ? gv(growth(sSales, lySales)) : null, yP = lyAll ? gv(growth(sPv, lyPv)) : null;
    var any = have.length > 0;
    var row = function (id, label, type, fn, sumVal, sub) {
      return { id: id, label: label, type: type, sub: !!sub, vals: months.map(function (k, i) { return fn(ms[i], k); }), sum: sumVal };
    };
    return {
      fy: fy, months: months, ms: ms, rows: [
        row("sales", "SALES", "k", function (m) { return m ? m.sales / 1000 : null; }, any ? sSales / 1000 : null),
        row("sales_yoy", "YoY", "gr", function (m) { return m ? m.yoy : null; }, yS, true),
        row("tgt", "TGT", "k", function (m, k) { return k <= S.ym && S.targets[k] != null ? S.targets[k] / 1000 : null; }, tgtMonths.length ? sTgt / 1000 : null),
        row("tgt_pct", "TGT %", "pct", function (m) { return m ? m.tgtPct : null; }, sTgtDone ? sSalesDone / sTgtDone * 100 : null, true),
        row("pv", "PV", "int", function (m) { return m ? m.pv : null; }, any ? sPv : null),
        row("pv_yoy", "YoY", "gr", function (m) { return m ? m.pvYoy : null; }, yP, true),
        row("orders", "ORDERS", "int", function (m) { return m ? m.orders : null; }, any ? sOrd : null),
        row("cvr", "CVR", "cvr", function (m) { return m ? m.cvr : null; }, sPv ? sOrd / sPv * 100 : null),
        row("aov", "AOV", "aov", function (m) { return m ? m.aov : null; }, sOrd ? sSales / sOrd : null)
      ]
    };
  }
  var HL_LABEL = { sales: "SALES", sales_yoy: "YoY (SALES)", tgt: "TGT", tgt_pct: "TGT %", pv: "PV", pv_yoy: "YoY (PV)", orders: "ORDERS", cvr: "CVR", aov: "AOV" };
  function fmtCell(type, v) {
    if (v == null) return "";
    switch (type) {
      case "k": return Math.round(v).toLocaleString("ko-KR");
      case "gr": return gstr(v);
      case "pct": return pctv(v);
      case "int": return num(v);
      case "cvr": return pctv(v, 2);
      case "aov": return "¥ " + num(v);
    }
    return String(v);
  }

  function trendModel() {
    var fy = S.fy, minFy = fyOf(S.minYm), fys = [fy - 2, fy - 1, fy].filter(function (f) { return f >= minFy; });
    var rows = fys.map(function (f) {
      var vals = fyMonths(f).map(function (k) { if (f === fy && k > S.ym) return null; var m = month(k); return m ? m.sales / 1000 : null; });
      return { id: "by" + f, fy: f, label: fyLabel(f), vals: vals, sum: vals.some(function (v) { return v != null; }) ? vals.reduce(function (a, v) { return a + (v || 0); }, 0) : null };
    });
    var tg = fyMonths(fy).map(function (k) { return k <= S.ym && S.targets[k] != null ? S.targets[k] / 1000 : null; });
    var tgt = tg.some(function (v) { return v != null; }) ? { id: "tgt", label: "TGT " + fyLabel(fy), vals: tg, sub: true, sum: tg.reduce(function (a, v) { return a + (v || 0); }, 0) } : null;
    return { fy: fy, rows: rows, tgt: tgt, fys: fys };
  }

  // ---------- 강조 적용 ----------
  function applyHl(table, spec) {
    var rows = spec.rows || [], cols = spec.cols || [];
    if (!rows.length && !cols.length) return;
    Array.prototype.forEach.call(table.querySelectorAll("tr"), function (tr) {
      var rid = tr.dataset.id, rowHl = rid != null && rows.indexOf(rid) >= 0;
      Array.prototype.forEach.call(tr.children, function (c) {
        var cid = c.dataset.col, on = rowHl || (cid != null && cols.indexOf(cid) >= 0);
        if (!on) return;
        c.style.background = spec.color; c.classList.add("is-hl");
        if (rowHl) c.style.fontWeight = "700";
      });
    });
  }

  // ---------- 화면: 월별 요약 / 추이 ----------
  function renderKpi() {
    var md = kpiModel(), fy = S.fy, months = md.months;
    el.kpiTitle.textContent = "월별 요약 · " + fyLabel(fy) + " (" + months[0].slice(0, 7) + " ~ " + S.ym.slice(0, 7) + " 기준)";
    el.kpi.innerHTML = "";
    var thead = h("thead"), hr = h("tr"); hr.appendChild(h("th", null, fyLabel(fy)));
    months.forEach(function (k, i) {
      var th = h("th", [md.ms[i] && md.ms[i].partial ? "is-part" : "", k === S.ym ? "is-sel" : ""].join(" ").trim(), MON[mOf(k) - 1]);
      th.dataset.col = String(mOf(k));
      if (md.ms[i] && md.ms[i].partial) th.title = S.anchor.slice(5) + "까지 · 같은 일수끼리 비교";
      hr.appendChild(th);
    });
    var ths = h("th", "is-sum", "누계"); ths.dataset.col = "sum"; hr.appendChild(ths);
    thead.appendChild(hr); el.kpi.appendChild(thead);
    var tb = h("tbody");
    md.rows.forEach(function (r) {
      var tr = h("tr", r.sub ? "is-sub" : ""); tr.dataset.id = r.id; tr.appendChild(h("td", null, r.label));
      r.vals.forEach(function (v, i) {
        var k = months[i], td = h("td", [r.type === "gr" ? cls(v) : "", k === S.ym ? "is-sel" : "", v == null ? "is-empty" : ""].join(" ").trim(), v == null ? "·" : fmtCell(r.type, v));
        td.dataset.col = String(mOf(k)); tr.appendChild(td);
      });
      var ts = h("td", ["is-sum", r.type === "gr" ? cls(r.sum) : "", r.sum == null ? "is-empty" : ""].join(" ").trim(), r.sum == null ? "·" : fmtCell(r.type, r.sum)); ts.dataset.col = "sum"; tr.appendChild(ts);
      tb.appendChild(tr);
    });
    el.kpi.appendChild(tb);
    applyHl(el.kpi, S.cfg.kpi);
  }

  function palette() {
    var root = getComputedStyle(pane);
    return [1, 2, 3, 4].map(function (i) { return root.getPropertyValue("--dash-c" + i).trim() || ["#0072e4", "#eb0104", "#06ac78", "#e0a800"][i - 1]; });
  }
  // 그래프 설정 만들기. light=true 면 엑셀 그림용(흰 바탕·진한 글자)
  function chartConfig(md, type, light) {
    var pal = palette();
    var pageStyle = getComputedStyle(pane); var cs = function (n, d) { return pageStyle.getPropertyValue(n).trim() || d; };
    var tick = light ? "#444444" : cs("--dash-tick", "#7a4a1c"), grid = light ? "rgba(0,0,0,.1)" : cs("--dash-grid", "rgba(0,0,0,.08)");
    var cmp = light ? "#888888" : cs("--dash-cmp", "#a19a82");
    var datasets = [];
    md.rows.forEach(function (r, i) {
      var c = pal[(md.rows.length - 1 - i) % 4], cur = r.fy === md.fy;
      var base = { label: r.label, data: r.vals.map(function (v) { return v == null ? null : Math.round(v); }) };
      if (type === "bar") datasets.push(Object.assign(base, { type: "bar", backgroundColor: cur ? c : alpha(c, .55), borderColor: c, borderWidth: 0, borderRadius: 2, order: 2 }));
      else datasets.push(Object.assign(base, { type: "line", borderColor: c, backgroundColor: c, tension: .25, pointRadius: 3, borderWidth: cur ? 2.6 : 1.6, spanGaps: false, order: 2 }));
    });
    if (md.tgt) datasets.push({ type: "line", label: md.tgt.label, data: md.tgt.vals.map(function (v) { return v == null ? null : Math.round(v); }), borderColor: cmp, backgroundColor: cmp, borderDash: [6, 4], tension: 0, pointRadius: 3, borderWidth: 1.6, spanGaps: false, order: 1 });
    return {
      type: type === "bar" ? "bar" : "line",
      data: { labels: FY_ORDER.map(function (mm) { return MON[mm - 1]; }), datasets: datasets },
      options: {
        responsive: !light, maintainAspectRatio: false, animation: { duration: light ? 0 : 300 }, interaction: { mode: "index", intersect: false },
        plugins: { legend: { labels: { color: tick, boxWidth: 10, boxHeight: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: function (c) { return " " + c.dataset.label + ": " + (c.parsed.y == null ? "-" : Math.round(c.parsed.y).toLocaleString("ko-KR")); } } } },
        scales: { x: { ticks: { color: tick }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: tick, callback: function (v) { return v.toLocaleString("ko-KR"); } }, grid: { color: grid } } }
      }
    };
  }

  function renderTrend() {
    var md = trendModel();
    el.trend.innerHTML = "";
    var thead = h("thead"), hr = h("tr"); hr.appendChild(h("th", null, ""));
    FY_ORDER.forEach(function (mm) { var th = h("th", null, MON[mm - 1]); th.dataset.col = String(mm); hr.appendChild(th); });
    var ths = h("th", "is-sum", "합계"); ths.dataset.col = "sum"; hr.appendChild(ths); thead.appendChild(hr); el.trend.appendChild(thead);
    var tb = h("tbody");
    md.rows.concat(md.tgt ? [md.tgt] : []).forEach(function (r) {
      var tr = h("tr", r.sub ? "is-sub" : ""); tr.dataset.id = r.id; tr.appendChild(h("td", null, r.label));
      r.vals.forEach(function (v, i) { var td = h("td", v == null ? "is-empty" : "", v == null ? "·" : Math.round(v).toLocaleString("ko-KR")); td.dataset.col = String(FY_ORDER[i]); tr.appendChild(td); });
      var ts = h("td", "is-sum" + (r.sum == null ? " is-empty" : ""), r.sum == null ? "·" : Math.round(r.sum).toLocaleString("ko-KR")); ts.dataset.col = "sum"; tr.appendChild(ts);
      tb.appendChild(tr);
    });
    el.trend.appendChild(tb);
    applyHl(el.trend, S.cfg.trend);
    if (chart) { chart.destroy(); chart = null; }
    if (window.Chart) chart = new window.Chart(el.chart, chartConfig(md, S.cfg.chart, false));
  }

  function render() {
    var k = S.ym, parts = k.slice(0, 4) + " " + MON[mOf(k) - 1];
    el.title.textContent = "Qoo10 Monthly Report · " + parts + (k === S.partialYm ? " (" + S.anchor.slice(5).replace("-", "/") + "까지)" : "");
    el.unit.textContent = "(K JPY / Unit) · 순매출(GMV) 기준 · 회계연도 " + fyLabel(S.fy) + " (7월~6월) · 데이터 " + S.minYm.slice(0, 7) + " ~ " + S.anchor;
    renderComment(k); renderKpi(); renderTrend();
  }

  // ---------- 선택 상자 ----------
  function fillMonths() {
    var months = fyMonths(S.fy).filter(function (k) { return month(k); });
    el.month.innerHTML = "";
    months.forEach(function (k) { var o = h("option", null, k.slice(0, 4) + " " + MON[mOf(k) - 1] + (k === S.partialYm ? " (진행 중)" : "")); o.value = k; el.month.appendChild(o); });
    var done = months.filter(function (k) { return k !== S.partialYm; });
    var pick = S.ym && months.indexOf(S.ym) >= 0 ? S.ym : (done.length ? done[done.length - 1] : months[months.length - 1]);
    S.ym = pick || fyMonths(S.fy)[0]; el.month.value = S.ym;
  }
  function fillFy() {
    var minFy = fyOf(S.minYm), maxFy = fyOf(S.anchor.slice(0, 8) + "01");
    el.fy.innerHTML = "";
    for (var f = maxFy; f >= minFy; f--) { var o = h("option", null, fyLabel(f) + " (" + (f - 1) + "-07 ~ " + f + "-06)"); o.value = String(f); el.fy.appendChild(o); }
    if (S.fy == null) S.fy = maxFy;
    el.fy.value = String(S.fy);
  }

  // ---------- 설정 모달 (코멘트 · 강조 · 그래프) ----------
  function openSettings(startTab) {
    var k = S.ym, fy = S.fy, prev = document.activeElement;
    var draft = JSON.parse(JSON.stringify(S.cfg)), cfg0 = JSON.stringify(S.cfg), note0 = S.note ? S.note.body : "";
    var ov = h("div", "inni-modal"), card = h("div", "inni-modal-card is-wide");
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "설정");
    card.appendChild(h("h3", null, "설정 · " + fyLabel(fy) + " · " + k.slice(0, 4) + " " + MON[mOf(k) - 1]));
    card.appendChild(h("p", null, "코멘트는 기준 월마다, 강조와 그래프는 회계연도(" + fyLabel(fy) + ")마다 저장돼요. 모두가 같이 봐요."));

    var tabs = h("div", "inni-mtabs"); tabs.setAttribute("role", "tablist");
    var panels = {}, tabBtns = {};
    [["note", "코멘트"], ["hl", "강조"], ["chart", "그래프"]].forEach(function (t) {
      var b = h("button", "inni-mtab", t[1]); b.type = "button"; b.setAttribute("role", "tab"); b.dataset.tab = t[0]; tabBtns[t[0]] = b; tabs.appendChild(b);
      var p = h("div", "inni-mpanel"); p.setAttribute("role", "tabpanel"); panels[t[0]] = p;
    });
    card.appendChild(tabs);

    // 코멘트
    var ta = h("textarea"); ta.maxLength = 4000; ta.value = note0; ta.placeholder = "예: 메가와리 기간 차이로 YoY -17%...";
    panels.note.appendChild(h("p", null, k.slice(0, 4) + " " + MON[mOf(k) - 1] + " 리포트의 직접 입력 코멘트예요. 자동 코멘트 아래에 같이 보여요. 비우고 저장하면 지워져요."));
    panels.note.appendChild(ta);

    // 강조
    var kRows = kpiModel().rows.map(function (r) { return [r.id, HL_LABEL[r.id]]; });
    var tmd = trendModel();
    var tRows = tmd.rows.map(function (r) { return [r.id, r.label]; }).concat(tmd.tgt ? [["tgt", "TGT " + fyLabel(fy)]] : []);
    var monCols = FY_ORDER.map(function (mm) { return [String(mm), MON[mm - 1]]; });
    var tableDefs = [
      { key: "kpi", title: "월별 요약 표", rows: kRows, cols: monCols.concat([["sum", "누계"]]) },
      { key: "trend", title: "전체 매출 추이 표", rows: tRows, cols: monCols.concat([["sum", "합계"]]) }
    ];
    tableDefs.forEach(function (td) {
      var g = h("div", "inni-hl-group"); g.appendChild(h("h4", null, td.title));
      var cr = h("div", "inni-colors"); cr.appendChild(h("small", null, "강조 색"));
      var sw = [], col = h("input");
      var sync = function () { sw.forEach(function (x) { x[0].setAttribute("aria-pressed", String(x[1].toLowerCase() === draft[td.key].color.toLowerCase())); }); };
      PRESETS.forEach(function (c) {
        var b = h("button", "inni-swatch"); b.type = "button"; b.style.background = c; b.title = c; b.setAttribute("aria-label", "강조 색 " + c);
        b.addEventListener("click", function () { draft[td.key].color = c; col.value = c; sync(); }); sw.push([b, c]); cr.appendChild(b);
      });
      col.type = "color"; col.value = draft[td.key].color; col.setAttribute("aria-label", "강조 색 직접 고르기");
      col.addEventListener("input", function () { draft[td.key].color = col.value; sync(); }); cr.appendChild(col);
      sync(); g.appendChild(cr);
      [["rows", "강조할 행", td.rows], ["cols", "강조할 열", td.cols]].forEach(function (grp) {
        g.appendChild(h("h5", null, grp[1]));
        var box = h("div", "inni-checks");
        grp[2].forEach(function (it) {
          var lab = h("label"), cb = h("input"); cb.type = "checkbox"; cb.checked = draft[td.key][grp[0]].indexOf(it[0]) >= 0;
          cb.addEventListener("change", function () {
            var arr = draft[td.key][grp[0]], i = arr.indexOf(it[0]);
            if (cb.checked && i < 0) arr.push(it[0]); else if (!cb.checked && i >= 0) arr.splice(i, 1);
          });
          lab.appendChild(cb); lab.appendChild(document.createTextNode(it[1])); box.appendChild(lab);
        });
        g.appendChild(box);
      });
      var clr = h("button", "dash-btn", "이 표 강조 모두 해제"); clr.type = "button"; clr.style.marginTop = "10px";
      clr.addEventListener("click", function () { draft[td.key].rows = []; draft[td.key].cols = []; Array.prototype.forEach.call(g.querySelectorAll("input[type=checkbox]"), function (c) { c.checked = false; }); });
      g.appendChild(clr); panels.hl.appendChild(g);
    });

    // 그래프
    panels.chart.appendChild(h("p", null, "전체 매출 추이 그래프의 모양이에요. 막대로 두면 목표는 점선으로 겹쳐 보여요."));
    var rd = h("div", "inni-radios");
    [["bar", "막대"], ["line", "꺾은선"]].forEach(function (o) {
      var lab = h("label"), r = h("input"); r.type = "radio"; r.name = "inni-chart-type"; r.value = o[0]; r.checked = draft.chart === o[0];
      r.addEventListener("change", function () { if (r.checked) draft.chart = o[0]; });
      lab.appendChild(r); lab.appendChild(document.createTextNode(o[1])); rd.appendChild(lab);
    });
    panels.chart.appendChild(rd);

    ["note", "hl", "chart"].forEach(function (t) { card.appendChild(panels[t]); });
    function showTab(t) { Object.keys(panels).forEach(function (x) { panels[x].hidden = x !== t; tabBtns[x].setAttribute("aria-selected", String(x === t)); }); if (t === "note") ta.focus(); }
    Object.keys(tabBtns).forEach(function (t) { tabBtns[t].addEventListener("click", function () { showTab(t); }); });

    var err = h("div", "inni-modal-err"); card.appendChild(err);
    var acts = h("div", "inni-modal-acts"), gap = h("span", "inni-gap");
    var cancel = h("button", "dash-btn", "취소"); cancel.type = "button";
    var save = h("button", "dash-btn is-primary", "저장"); save.type = "button";
    [gap, cancel, save].forEach(function (x) { acts.appendChild(x); });
    card.appendChild(acts); ov.appendChild(card); document.body.appendChild(ov);
    showTab(startTab || "note");

    function close() { document.removeEventListener("keydown", onKey, true); if (ov.parentNode) ov.parentNode.removeChild(ov); if (prev && prev.focus) prev.focus(); }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
    }
    function commit() {
      var jobs = [], noteChanged = ta.value !== note0, cfgChanged = JSON.stringify(draft) !== cfg0;
      if (!noteChanged && !cfgChanged) { close(); return; }
      save.disabled = true; err.textContent = "";
      if (noteChanged) jobs.push(rpc("dy_inni_comment_set", { p_report: "sales", p_ym: k, p_body: ta.value }).then(function (c) { if (k === S.ym) showManual(c); }));
      if (cfgChanged) jobs.push(rpc("dy_inni_settings_set", { p_report: "sales", p_fy: fy, p_config: draft }).then(function () { if (fy === S.fy) { S.cfg = normCfg(draft); renderKpi(); renderTrend(); } }));
      Promise.all(jobs).then(function () { toast("설정을 저장했어요"); close(); }).catch(function (e) { err.textContent = friendly(e); save.disabled = false; });
    }
    document.addEventListener("keydown", onKey, true);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    cancel.addEventListener("click", close);
    save.addEventListener("click", commit);
  }

  // ---------- 엑셀 다운로드 ----------
  var excelLoading = null;
  function loadExcelJs() {
    if (window.ExcelJS) return Promise.resolve();
    if (excelLoading) return excelLoading;
    excelLoading = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = EXCELJS; s.onload = res; s.onerror = function () { excelLoading = null; rej(new Error("엑셀 도구를 불러오지 못했어요 (네트워크 확인)")); };
      document.head.appendChild(s);
    });
    return excelLoading;
  }
  var XL = { head: "FF1F3A5F", line: "FFD9D9D9", up: "FF06A06F", down: "FFD0021B", sub: "FF777777" };
  function argb(hex) { return "FF" + hex.replace("#", "").toUpperCase(); }
  var NUMFMT = { k: "#,##0", gr: "+0%;-0%;0%", pct: "0%", int: "#,##0", cvr: "0.00%", aov: '"¥ "#,##0' };
  function xlVal(type, v) { return v == null ? null : (type === "gr" || type === "pct" || type === "cvr") ? v / 100 : v; }
  function fill(hex) { return { type: "pattern", pattern: "solid", fgColor: { argb: hex } }; }

  function exportXlsx() {
    if (!S.ready) return;
    el.xlsxBtn.disabled = true; var oldTxt = el.xlsxBtn.textContent; el.xlsxBtn.textContent = "만드는 중…";
    loadExcelJs().then(function () {
      var wb = new window.ExcelJS.Workbook(); wb.creator = "DY-AI"; wb.created = new Date();
      var k = S.ym, fy = S.fy, md = kpiModel(), tm = trendModel();
      var ws = wb.addWorksheet("SALES", { views: [{ showGridLines: false }] });
      ws.columns = [{ width: 16 }].concat(FY_ORDER.map(function () { return { width: 11.5 }; })).concat([{ width: 14 }]);
      var LAST = 14, thin = { style: "thin", color: { argb: XL.line } };
      var C = function (r, c) { return ws.getCell(r, c); };
      var r = 2, c;
      C(r, 1).value = "QOO10 MONTHLY REPORT"; C(r, 1).font = { size: 9, bold: true, color: { argb: "FF0072E4" } }; r++;
      ws.mergeCells(r, 1, r, LAST); C(r, 1).value = el.title.textContent; C(r, 1).font = { size: 20, bold: true }; ws.getRow(r).height = 30; r++;
      ws.mergeCells(r, 1, r, LAST); C(r, 1).value = el.unit.textContent; C(r, 1).font = { size: 9, color: { argb: XL.sub } }; r += 2;

      // 코멘트
      C(r, 1).value = "코멘트"; C(r, 1).font = { size: 12, bold: true };
      for (c = 1; c <= LAST; c++) C(r, c).border = { bottom: { style: "medium", color: { argb: "FF1F3A5F" } } };
      r++;
      autoLines(k).forEach(function (l) {
        ws.mergeCells(r, 1, r, LAST); var cc = C(r, 1); cc.value = "· " + l.t; cc.alignment = { vertical: "middle", wrapText: true };
        cc.font = { size: 11, bold: !!l.c, color: { argb: l.c === "is-neg" ? XL.down : l.c === "is-pos" ? XL.up : "FF222222" } }; ws.getRow(r).height = 20; r++;
      });
      if (S.note) {
        ws.mergeCells(r, 1, r, LAST); var nc = C(r, 1); nc.value = S.note.body; nc.alignment = { vertical: "top", wrapText: true };
        nc.font = { size: 11 }; nc.fill = fill("FFF7F7F7");
        var lines = S.note.body.split("\n").reduce(function (a, ln) { return a + Math.max(1, Math.ceil(ln.length / 70)); }, 0);
        ws.getRow(r).height = Math.max(20, lines * 16 + 6); r++;
        ws.mergeCells(r, 1, r, LAST); C(r, 1).value = "직접 입력 · " + (S.note.by || "") + (S.note.at ? " · " + String(S.note.at).slice(0, 16).replace("T", " ") : ""); C(r, 1).font = { size: 9, color: { argb: XL.sub } }; r++;
      }
      r++;

      // 월별 요약 표
      C(r, 1).value = el.kpiTitle.textContent; C(r, 1).font = { size: 12, bold: true }; r++;
      var hdrRow = r;
      C(r, 1).value = fyLabel(fy);
      md.months.forEach(function (mk, i) { C(r, 2 + i).value = MON[mOf(mk) - 1] + (md.ms[i] && md.ms[i].partial ? "*" : ""); });
      C(r, LAST).value = "누계";
      for (c = 1; c <= LAST; c++) { var hc = C(r, c); hc.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 }; hc.fill = fill(XL.head); hc.alignment = { horizontal: c === 1 ? "left" : "right", vertical: "middle" }; }
      ws.getRow(r).height = 20; r++;
      var hlK = S.cfg.kpi;
      md.rows.forEach(function (row) {
        C(r, 1).value = row.label;
        row.vals.concat([row.sum]).forEach(function (v, i) {
          var cc = C(r, 2 + i), col = i < 12 ? String(mOf(md.months[i])) : "sum";
          cc.value = xlVal(row.type, v); cc.numFmt = NUMFMT[row.type]; cc.alignment = { horizontal: "right", vertical: "middle" };
          var f = { size: 10, bold: i === 12 };
          if (row.type === "gr" && v != null) f.color = { argb: v >= 0 ? XL.up : XL.down };
          if (row.sub && !f.color) f.color = { argb: XL.sub };
          cc.font = f;
          if (hlK.rows.indexOf(row.id) >= 0 || hlK.cols.indexOf(col) >= 0) {
            cc.fill = fill(argb(hlK.color)); cc.font = { size: 10, bold: i === 12 || hlK.rows.indexOf(row.id) >= 0, color: { argb: "FF1B1B1B" } };
          }
        });
        var lc = C(r, 1); lc.font = { bold: true, size: 10, color: { argb: row.sub ? XL.sub : "FF222222" } }; lc.alignment = { vertical: "middle" };
        if (hlK.rows.indexOf(row.id) >= 0) { lc.fill = fill(argb(hlK.color)); lc.font = { bold: true, size: 10, color: { argb: "FF1B1B1B" } }; }
        for (c = 1; c <= LAST; c++) C(r, c).border = { bottom: thin };
        ws.getRow(r).height = 19; r++;
      });
      md.months.forEach(function (mk, i) { if (hlK.cols.indexOf(String(mOf(mk))) >= 0) { var hh = C(hdrRow, 2 + i); hh.fill = fill(argb(hlK.color)); hh.font = { bold: true, size: 10, color: { argb: "FF1B1B1B" } }; } });
      if (hlK.cols.indexOf("sum") >= 0) { var hs = C(hdrRow, LAST); hs.fill = fill(argb(hlK.color)); hs.font = { bold: true, size: 10, color: { argb: "FF1B1B1B" } }; }
      r++;

      // 그래프 그림 (엑셀용: 흰 바탕·진한 글자)
      C(r, 1).value = "전체 매출 추이 (K JPY)"; C(r, 1).font = { size: 12, bold: true }; r++;
      var imgId = null;
      if (window.Chart) {
        var cv = document.createElement("canvas"); cv.width = 1100; cv.height = 380; cv.style.cssText = "position:fixed;left:-3000px;top:0;width:1100px;height:380px";
        document.body.appendChild(cv);
        var cfg = chartConfig(tm, S.cfg.chart, true);
        cfg.plugins = [{ id: "bg", beforeDraw: function (ch) { var x = ch.ctx; x.save(); x.globalCompositeOperation = "destination-over"; x.fillStyle = "#ffffff"; x.fillRect(0, 0, ch.width, ch.height); x.restore(); } }];
        cfg.options.responsive = false; cfg.options.devicePixelRatio = 1;
        var tmp = new window.Chart(cv, cfg); tmp.update("none");
        imgId = wb.addImage({ base64: tmp.toBase64Image("image/png", 1), extension: "png" });
        tmp.destroy(); document.body.removeChild(cv);
      }
      if (imgId != null) { ws.addImage(imgId, { tl: { col: 0, row: r - 1 }, ext: { width: 980, height: 338 } }); r += 18; }

      // 추이 표
      var hlT = S.cfg.trend, hdr2 = r;
      FY_ORDER.forEach(function (mm, i) { C(r, 2 + i).value = MON[mm - 1]; });
      C(r, LAST).value = "합계";
      for (c = 1; c <= LAST; c++) { var h2 = C(r, c); h2.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 }; h2.fill = fill(XL.head); h2.alignment = { horizontal: c === 1 ? "left" : "right", vertical: "middle" }; }
      FY_ORDER.forEach(function (mm, i) { if (hlT.cols.indexOf(String(mm)) >= 0) { var q1 = C(hdr2, 2 + i); q1.fill = fill(argb(hlT.color)); q1.font = { bold: true, size: 10, color: { argb: "FF1B1B1B" } }; } });
      if (hlT.cols.indexOf("sum") >= 0) { var q2 = C(hdr2, LAST); q2.fill = fill(argb(hlT.color)); q2.font = { bold: true, size: 10, color: { argb: "FF1B1B1B" } }; }
      r++;
      tm.rows.concat(tm.tgt ? [tm.tgt] : []).forEach(function (row) {
        C(r, 1).value = row.label;
        row.vals.concat([row.sum]).forEach(function (v, i) {
          var cc = C(r, 2 + i), col = i < 12 ? String(FY_ORDER[i]) : "sum";
          cc.value = v == null ? null : Math.round(v); cc.numFmt = "#,##0"; cc.alignment = { horizontal: "right" };
          cc.font = { size: 10, bold: i === 12, color: { argb: row.sub ? XL.sub : "FF222222" } };
          if (hlT.rows.indexOf(row.id) >= 0 || hlT.cols.indexOf(col) >= 0) { cc.fill = fill(argb(hlT.color)); cc.font = { size: 10, bold: i === 12 || hlT.rows.indexOf(row.id) >= 0, color: { argb: "FF1B1B1B" } }; }
        });
        var l2 = C(r, 1); l2.font = { bold: true, size: 10, color: { argb: row.sub ? XL.sub : "FF222222" } };
        if (hlT.rows.indexOf(row.id) >= 0) { l2.fill = fill(argb(hlT.color)); l2.font = { bold: true, size: 10, color: { argb: "FF1B1B1B" } }; }
        for (c = 1; c <= LAST; c++) C(r, c).border = { bottom: thin };
        ws.getRow(r).height = 19; r++;
      });
      ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

      // 월별 원본 시트
      var w2 = wb.addWorksheet("월별 데이터", { views: [{ state: "frozen", ySplit: 1 }] });
      var heads = [["월", 10], ["회계연도", 10], ["SALES(엔)", 14], ["YoY", 9], ["MoM", 9], ["TGT(엔)", 14], ["TGT %", 9], ["PV", 12], ["PV YoY", 9], ["ORDERS", 10], ["CVR", 9], ["AOV(엔)", 10], ["비고", 24]];
      w2.columns = heads.map(function (x) { return { width: x[1] }; });
      var hr2 = w2.getRow(1);
      heads.forEach(function (x, i) { var c1 = hr2.getCell(i + 1); c1.value = x[0]; c1.font = { bold: true, color: { argb: "FFFFFFFF" } }; c1.fill = fill(XL.head); c1.alignment = { horizontal: i < 2 ? "left" : "right" }; });
      var rr = 2, mk = S.minYm, lastYm = S.anchor.slice(0, 8) + "01";
      var fm = [null, null, "#,##0", "+0%;-0%;0%", "+0%;-0%;0%", "#,##0", "0%", "#,##0", "+0%;-0%;0%", "#,##0", "0.00%", "#,##0", null];
      while (mk <= lastYm) {
        var m = month(mk);
        if (m) {
          var pc = function (v) { return v == null ? null : v / 100; };
          var vals = [mk.slice(0, 7), fyLabel(fyOf(mk)), m.sales, pc(m.yoy), pc(m.mom), m.tgt, pc(m.tgtPct), m.pv, pc(m.pvYoy), m.orders, pc(m.cvr), m.aov, m.partial ? S.anchor.slice(5) + "까지 (같은 일수 비교)" : ""];
          vals.forEach(function (v, i) {
            var c2 = w2.getCell(rr, i + 1); c2.value = v; if (fm[i]) c2.numFmt = fm[i];
            if ((i === 3 || i === 4 || i === 8) && v != null) c2.font = { color: { argb: v >= 0 ? XL.up : XL.down } };
          });
          rr++;
        }
        mk = addM(mk, 1);
      }
      return wb.xlsx.writeBuffer().then(function (buf) {
        var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
        a.download = "Qoo10_Monthly_Report_" + fyLabel(fy) + "_" + k.slice(0, 7) + ".xlsx";
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
        toast("엑셀을 내려받았어요");
      });
    }).catch(function (e) { showMsg("엑셀을 만들지 못했어요: " + ((e && e.message) || e)); })
      .then(function () { el.xlsxBtn.disabled = false; el.xlsxBtn.textContent = oldTxt; });
  }

  // ---------- 월별 목표 입력 ----------
  var tgtLoaded = {};
  function buildTargets() {
    var minFy = fyOf(S.minYm), maxFy = fyOf(S.endYm);
    el.tgtTable.innerHTML = ""; tgtLoaded = {};
    var thead = h("thead"), hr = h("tr"); hr.appendChild(h("th", null, ""));
    FY_ORDER.forEach(function (mm) { hr.appendChild(h("th", null, MON[mm - 1])); });
    hr.appendChild(h("th", "is-sum", "합계")); thead.appendChild(hr); el.tgtTable.appendChild(thead);
    var tb = h("tbody");
    for (var f = minFy; f <= maxFy; f++) {
      var tr = h("tr"); tr.appendChild(h("td", null, fyLabel(f)));
      fyMonths(f).forEach(function (k) {
        var td = h("td"), inp = h("input"); inp.type = "number"; inp.min = "0"; inp.step = "100"; inp.inputMode = "numeric"; inp.dataset.ym = k;
        inp.setAttribute("aria-label", k.slice(0, 7) + " 목표(천 엔)");
        var inRange = k >= S.minYm && k <= S.endYm;
        if (!inRange) inp.disabled = true;
        var v = S.targets[k] != null ? Math.round(S.targets[k] / 1000) : "";
        inp.value = v; tgtLoaded[k] = v;
        inp.addEventListener("input", function () { inp.classList.toggle("is-changed", String(inp.value) !== String(tgtLoaded[k])); sumRow(tr); });
        td.appendChild(inp); tr.appendChild(td);
      });
      var st = h("td", "is-sum"); st.dataset.sum = "1"; tr.appendChild(st); sumRow(tr); tb.appendChild(tr);
    }
    el.tgtTable.appendChild(tb); el.tgtNote.textContent = "";
  }
  function sumRow(tr) {
    var t = 0, any = false;
    Array.prototype.forEach.call(tr.querySelectorAll("input"), function (i) { if (i.value !== "") { t += +i.value; any = true; } });
    tr.querySelector("td[data-sum]").textContent = any ? t.toLocaleString("ko-KR") : "·";
  }
  function saveTargets() {
    var rows = [];
    Array.prototype.forEach.call(el.tgtTable.querySelectorAll("input"), function (i) {
      if (i.disabled || String(i.value) === String(tgtLoaded[i.dataset.ym])) return;
      if (i.value !== "" && !(+i.value >= 0)) return;
      rows.push({ ym: i.dataset.ym, v: i.value === "" ? null : Math.round(+i.value * 1000) });
    });
    if (!rows.length) { el.tgtNote.textContent = "바뀐 칸이 없어요."; return; }
    el.tgtSave.disabled = true; el.tgtNote.textContent = "저장하는 중…";
    rpc("dy_inni_targets_set", { p_rows: rows }).then(function () {
      rows.forEach(function (r) { if (r.v == null) delete S.targets[r.ym]; else S.targets[r.ym] = r.v; });
      toast("목표 " + rows.length + "개월을 저장했어요"); buildTargets(); render();
    }).catch(function (e) { el.tgtNote.textContent = friendly(e); }).then(function () { el.tgtSave.disabled = false; });
  }

  // ---------- 이벤트 ----------
  el.fy.addEventListener("change", function () { S.fy = +el.fy.value; S.ym = null; fillMonths(); loadCfg(S.fy).then(render); });
  el.month.addEventListener("change", function () { S.ym = el.month.value; render(); });
  el.reload.addEventListener("click", function () { D.clearCache(); S.ready = false; start(true); });
  el.tgtBtn.addEventListener("click", function () {
    var open = el.tgt.hidden; el.tgt.hidden = !open; el.tgtBtn.setAttribute("aria-expanded", String(open));
    el.tgtBtn.textContent = open ? "월별 목표 닫기" : "월별 목표 입력"; if (open) buildTargets();
  });
  el.tgtCancel.addEventListener("click", function () { el.tgt.hidden = true; el.tgtBtn.setAttribute("aria-expanded", "false"); el.tgtBtn.textContent = "월별 목표 입력"; });
  el.tgtSave.addEventListener("click", saveTargets);
  el.setBtn.addEventListener("click", function () { if (S.ready && S.cfg) openSettings("note"); });
  el.xlsxBtn.addEventListener("click", exportXlsx);

  // ---------- 시작 ----------
  var started = false;
  function start(force) {
    if (started && !force) { if (chart) chart.resize(); return Promise.resolve(); }
    started = true;
    return load().then(function () {
      if (!S.ready) { started = false; return; }
      fillFy(); fillMonths();
      return loadCfg(S.fy).then(render);
    });
  }
  document.addEventListener("inni:show", function (e) { if (e.detail.view === "inni" && e.detail.sub === "sales") start(); });
  var h0 = location.hash || "";
  if (h0 === "#inni" || /^#inni\/sales/.test(h0)) start();
})();

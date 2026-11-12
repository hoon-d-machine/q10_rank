/* inni 탭 · PRODUCT 상품별 월간 리포트 (AP Talk 시트의 PRODUCT 탭을 DB 로 대체)
 *   - 라인별·카테고리별 요약(당월 vs 작년 동월, 누계 vs 작년 누계) + 그래프
 *   - 상품별 상세: 매출·수량·PV·CVR·온사이트 광고·회계연도 누계(YTD), 작년 동월 비교
 *   - 코멘트(자동 생성 + 직접 입력), 표 강조, 그래프 설정은 '설정' 모달, 엑셀 다운로드 (SALES 와 같은 방식)
 * 정의: 매출 = 상품 순수금액(net_bpv), 수량 = 순수량(net_cnt), PV = 상품 PV, CVR = 수량 ÷ PV, 누계 = 회계연도 시작(7월)~기준 월
 * 진행 중인 달은 같은 일수끼리 비교한다 (작년 같은 날수). 라인·카테고리는 상품코드표(inni_product_codes) 기준.
 * 온사이트 광고(Spend·AD Sales·ROAS)는 DB 에 데이터가 없어서 '-' 로 두고, 광고 데이터가 연결되면 채운다.
 */
(function () {
  "use strict";
  var D = window.dyDash;
  var pane = document.querySelector('.inni-pane[data-pane="product"]');
  if (!D || !pane) return;

  var $ = function (s) { return pane.querySelector(s); };
  var el = {
    fy: $(".js-p-fy"), month: $(".js-p-month"), reload: $(".js-p-reload"), setBtn: $(".js-p-set"), xlsxBtn: $(".js-p-xlsx"), msg: $(".js-p-msg"), notice: $(".js-p-notice"),
    title: $(".js-p-title"), unit: $(".js-p-unit"), auto: $(".js-p-auto"), manual: $(".js-p-manual"), manualBody: $(".js-p-manual-body"), manualMeta: $(".js-p-manual-meta"),
    line: $(".js-p-line"), cat: $(".js-p-cat"), lineSub: $(".js-p-line-sub"), catSub: $(".js-p-cat-sub"), chartLine: $(".js-p-chart-line"), chartCat: $(".js-p-chart-cat"),
    items: $(".js-p-items"), itemsTitle: $(".js-p-items-title"), itemsNote: $(".js-p-items-note")
  };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DEFAULT_HL = "#fff2b8";
  var PRESETS = ["#fff2b8", "#d9f2e0", "#d6e6ff", "#ffd9d6", "#e8dcff", "#ffe3c2"];
  var EXCELJS = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
  // 상품코드표의 영문 카테고리 → 리포트에 쓰는 한글 이름 (시트와 같은 표기)
  var CAT_KO = { "SERUM": "세럼", "POWDER": "파우더", "CREAM": "크림", "TONER": "토너", "LOTION": "로션", "SHEET MASK": "마스크", "CLAY MASK": "클레이마스크", "CLEANSING": "클렌징", "SUN": "UV" };
  var UNCLASS = "(미분류)";
  var S = { ready: false, loading: false, anchor: null, minYm: null, fy: null, ym: null, partialYm: null, master: null, data: null, cfg: null, note: null, busy: false };
  var charts = { line: null, cat: null };

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
  function ymd(k, d) { return k.slice(0, 8) + pad(d); }
  function num(v) { return v == null ? "-" : Math.round(v).toLocaleString("ko-KR"); }
  function pctv(v, d) { return v == null || !isFinite(v) ? "-" : (d == null ? v.toFixed(0) : v.toFixed(d)) + "%"; }
  function gstr(v) { return v == null ? "-" : v >= 9999.5 ? ">+9,999%" : v <= -9999.5 ? "<-9,999%" : (v >= 0 ? "+" : "") + v.toFixed(0) + "%"; }   // 작년 값이 아주 작을 때의 터무니없는 증감률은 상한 표시
  function growth(a, b) { return b ? (a / b - 1) * 100 : null; }
  function cls(v) { return v == null ? "" : v >= 0 ? "is-up" : "is-down"; }
  function krw(yen) {
    var n = Math.round(yen);
    if (n >= 99500000) { var u = Math.round(n / 1e7) * 1e7, eok = Math.floor(u / 1e8), rest = Math.round((u - eok * 1e8) / 1e7); return eok + "억" + (rest ? rest + "천만" : ""); }
    if (n >= 1e7) { var m = Math.round(n / 1e6), c = Math.floor(m / 10), b = m % 10; return (c ? c + "천" : "") + (b ? b + "백" : "") + "만"; }
    return Math.round(n / 1e4).toLocaleString("ko-KR") + "만";
  }
  function h(tag, c, text) { var e = document.createElement(tag); if (c) e.className = c; if (text != null) e.textContent = text; return e; }
  function toast(m) { if (window.dyToast) window.dyToast(m); }
  function showMsg(m) { el.msg.textContent = m || ""; el.msg.hidden = !m; }
  function rpc(name, args) { return window.dyAuth.client.rpc(name, args).then(function (res) { if (res.error) throw res.error; return res.data; }); }
  function friendly(e) {
    var m = (e && e.message) || String(e);
    if (/dy_inni_|dy_data_page|Could not find the function|schema cache/i.test(m)) return "필요한 DB 함수가 아직 없어요. Supabase SQL Editor 에서 dy-ai/supabase/inni.sql · data_view.sql 을 실행해 주세요.";
    return D.friendly ? D.friendly(e) : "불러오지 못했어요: " + m;
  }
  function alpha(c, a) { var m = /^#([0-9a-f]{6})$/i.exec(c || ""); if (!m) return c; var n = parseInt(m[1], 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
  function tyLabel() { return String(yOf(S.ym)).slice(2) + "년 " + pad(mOf(S.ym)) + "월"; }
  function lyLabel() { return String(yOf(S.ym) - 1).slice(2) + "년 " + pad(mOf(S.ym)) + "월"; }

  // ---------- 설정 ----------
  function normSpec(x) { x = x || {}; return { rows: Array.isArray(x.rows) ? x.rows.map(String) : [], cols: Array.isArray(x.cols) ? x.cols.map(String) : [], color: /^#[0-9a-f]{6}$/i.test(x.color || "") ? x.color : DEFAULT_HL }; }
  function normCfg(c) {
    c = c || {};
    return { basis: c.basis === "ytd" ? "ytd" : "month", dir: c.dir === "v" ? "v" : "h", lines: normSpec(c.lines), cats: normSpec(c.cats), items: normSpec(c.items) };
  }
  function loadCfg(fy) {
    return rpc("dy_inni_settings_get", { p_report: "product", p_fy: fy }).then(function (c) { S.cfg = normCfg(c); }).catch(function (e) { S.cfg = normCfg(null); showMsg(friendly(e)); });
  }

  // ---------- 데이터 ----------
  var MET = ["g_net_amt", "g_net_qty", "g_pv"];
  function qr(from, to) { return D.query({ metrics: MET, grain: "all", range: { from: from, to: to }, dim: "gd_no", top: 200, topMetric: "g_net_amt" }); }

  function loadMaster() {
    if (S.master) return Promise.resolve();
    return rpc("dy_data_page", { p_source: "products", p_from: null, p_to: null, p_q: null, p_limit: 1000, p_offset: 0 }).then(function (r) {
      S.master = {}; (r.rows || []).forEach(function (x) { S.master[String(x.gd_no)] = x; });
    });
  }
  function load() {
    if (S.loading) return Promise.resolve();
    S.loading = true; showMsg("");
    return window.dyAuth.requireLogin().then(function (sess) {
      if (!sess) return;
      return Promise.all([D.loadBounds(), loadMaster()]).then(function () {
        var anchor = D.anchor(), minD = D.minDate() || "2024-01-01", aym = anchor.slice(0, 8) + "01";
        S.anchor = anchor; S.minYm = minD.slice(0, 8) + "01";
        S.partialYm = +anchor.slice(8, 10) < lastDay(aym) ? aym : null;
        S.ready = true;
      });
    }).catch(function (e) { showMsg(friendly(e)); }).then(function () { S.loading = false; });
  }

  // 기준 월에 대한 상품별 집계 (당월·작년 동월·누계·작년 누계)
  function build() {
    var k = S.ym, part = k === S.partialYm, dayEnd = part ? +S.anchor.slice(8, 10) : lastDay(k);
    var tyFrom = k, tyTo = ymd(k, dayEnd);
    var lk = addM(k, -12), lyFrom = lk, lyTo = ymd(lk, Math.min(dayEnd, lastDay(lk)));
    var fyStart = ym(S.fy - 1, 7), ytdFrom = fyStart, lyYtdFrom = addM(fyStart, -12);
    S.busy = true;
    return Promise.all([qr(tyFrom, tyTo), qr(lyFrom, lyTo), qr(ytdFrom, tyTo), qr(lyYtdFrom, lyTo)]).then(function (r) {
      var ty = r[0], ly = r[1], ytd = r[2], lyy = r[3], ids = {};
      [ty, ly, ytd, lyy].forEach(function (x) { Object.keys(x.rows).forEach(function (id) { ids[id] = 1; }); });
      var nameOf = function (id) { var m = S.master[id]; return (m && m.product_name) || ty.labels[id] || ytd.labels[id] || ly.labels[id] || lyy.labels[id] || id; };
      var g = function (x, id, key) { var v = x.rows[id]; return v && v[key] ? v[key] : 0; };
      var items = Object.keys(ids).map(function (id) {
        var m = S.master[id] || {};
        var it = {
          gd: id, name: nameOf(id), line: m.line || UNCLASS, cat: m.category ? (CAT_KO[m.category] || m.category) : UNCLASS,
          sales: g(ty, id, "g_net_amt"), qty: g(ty, id, "g_net_qty"), pv: g(ty, id, "g_pv"),
          lySales: g(ly, id, "g_net_amt"), lyQty: g(ly, id, "g_net_qty"), lyPv: g(ly, id, "g_pv"),
          ytd: g(ytd, id, "g_net_amt"), lyYtd: g(lyy, id, "g_net_amt")
        };
        return it;
      }).filter(function (it) { return it.sales > 0; });                       // 당월 매출이 있는 상품만 (시트와 같음)
      items.sort(function (a, b) { return b.sales - a.sales; });
      var ytdTotal = 0, tyAll = 0; Object.keys(ids).forEach(function (id) { ytdTotal += g(ytd, id, "g_net_amt"); });
      items.forEach(function (it, i) {
        it.no = i + 1; it.yoy = it.lySales ? growth(it.sales, it.lySales) : null; it.pvYoy = it.lyPv ? growth(it.pv, it.lyPv) : null;
        it.cvr = it.pv ? it.qty / it.pv * 100 : null; it.lyCvr = it.lyPv ? it.lyQty / it.lyPv * 100 : null;
        it.gap = it.cvr != null && it.lyCvr != null ? it.cvr - it.lyCvr : null;
        it.ytdYoy = it.lyYtd ? growth(it.ytd, it.lyYtd) : null; it.share = ytdTotal ? it.ytd / ytdTotal * 100 : null;
      });
      // 합계 (당월 매출이 있는 상품 기준)
      var T = { sales: 0, qty: 0, pv: 0, lySales: 0, lyQty: 0, lyPv: 0, ytd: 0, lyYtd: 0 };
      items.forEach(function (it) { Object.keys(T).forEach(function (f) { T[f] += it[f]; }); });
      // 라인·카테고리 요약 (분류 합산은 당월 매출이 있는 상품 + 작년·누계만 있는 상품도 포함해서 모든 상품)
      var allIt = Object.keys(ids).map(function (id) {
        var m = S.master[id] || {};
        return { gd: id, line: m.line || UNCLASS, cat: m.category ? (CAT_KO[m.category] || m.category) : UNCLASS, sales: g(ty, id, "g_net_amt"), lySales: g(ly, id, "g_net_amt"), ytd: g(ytd, id, "g_net_amt"), lyYtd: g(lyy, id, "g_net_amt") };
      });
      var group = function (key) {
        var map = {};
        allIt.forEach(function (it) { var n = it[key], d = map[n] || (map[n] = { name: n, ty: 0, ly: 0, ytd: 0, lyytd: 0 }); d.ty += it.sales; d.ly += it.lySales; d.ytd += it.ytd; d.lyytd += it.lyYtd; });
        return Object.keys(map).map(function (n) { var d = map[n]; d.yoy = d.ly ? growth(d.ty, d.ly) : null; d.ytdyoy = d.lyytd ? growth(d.ytd, d.lyytd) : null; return d; })
          .filter(function (d) { return d.ty || d.ly || d.ytd || d.lyytd; });
      };
      S.data = { part: part, tyFrom: tyFrom, tyTo: tyTo, lyTo: lyTo, items: items, total: T, lines: group("line"), cats: group("cat"), ytdTotal: ytdTotal };
      S.data.lines.sort(function (a, b) { return b.ty - a.ty; }); S.data.cats.sort(function (a, b) { return b.ty - a.ty; });
    }).then(function () { S.busy = false; }, function (e) { S.busy = false; throw e; });
  }

  // ---------- 코멘트 ----------
  function autoLines() {
    var d = S.data, T = d.total, L = [];
    if (!d.items.length) return [{ t: "이 달은 상품 매출 데이터가 아직 없어요." }];
    var top3 = d.items.slice(0, 3), share = T.sales ? top3.reduce(function (a, i) { return a + i.sales; }, 0) / T.sales * 100 : 0;
    var yoy = T.lySales ? growth(T.sales, T.lySales) : null;
    L.push({ t: "상품 매출 합계 약 " + krw(T.sales) + "엔 (" + (yoy != null ? "YoY " + gstr(yoy) : "작년 비교 없음") + ") · 상위 3개 상품이 " + share.toFixed(0) + "%" + (d.part ? " · " + S.anchor.slice(5).replace("-", "/") + "까지 (같은 일수 비교)" : ""), c: yoy != null ? (yoy < 0 ? "is-neg" : "is-pos") : "" });
    var minBase = Math.max(500000, T.lySales * 0.02);
    var best = function (arr, name) {
      var c = arr.filter(function (x) { return x.ly >= minBase && x.yoy != null && x.name !== UNCLASS; });
      if (c.length < 2) return null;
      c.sort(function (a, b) { return b.yoy - a.yoy; });
      var up = c[0], dn = c[c.length - 1];
      return name + ": " + up.name + " " + gstr(up.yoy) + "(약 " + krw(up.ty) + "엔)로 가장 크게 " + (up.yoy >= 0 ? "성장" : "선방") + ", " + dn.name + " " + gstr(dn.yoy) + "로 가장 크게 " + (dn.yoy < 0 ? "하락" : "낮은 성장");
    };
    var bl = best(d.lines, "라인별"), bc = best(d.cats, "카테고리별");
    if (bl) L.push({ t: bl }); if (bc) L.push({ t: bc });
    L.push({ t: "TOP3: " + top3.map(function (i) { return i.name + " " + krw(i.sales) + "엔" + (i.yoy != null ? "(YoY " + gstr(i.yoy) + ")" : "(신규)"); }).join(" · ") });
    var nw = d.items.filter(function (i) { return !i.lySales; });
    if (nw.length) L.push({ t: "신규 상품(작년 동월 매출 없음) " + nw.length + "개 · 합계 약 " + krw(nw.reduce(function (a, i) { return a + i.sales; }, 0)) + "엔" });
    return L;
  }
  function showManual(c) {
    S.note = c && c.body ? c : null;
    el.manual.hidden = !S.note; el.manualBody.textContent = S.note ? S.note.body : "";
    el.manualMeta.textContent = S.note ? "직접 입력 · " + (S.note.by || "") + (S.note.at ? " · " + String(S.note.at).slice(0, 16).replace("T", " ") : "") : "";
  }
  function renderComment() {
    var k = S.ym;
    el.auto.innerHTML = "";
    autoLines().forEach(function (l) { var p = h("p"); p.appendChild(h("span", l.c || "", l.t)); el.auto.appendChild(p); });
    showManual(null);
    rpc("dy_inni_comment_get", { p_report: "product", p_ym: k }).then(function (c) { if (k === S.ym) showManual(c); })
      .catch(function (e) { el.manualMeta.textContent = friendly(e); el.manual.hidden = false; });
  }

  // ---------- 표 ----------
  function applyHl(table, spec) {
    var rows = spec.rows || [], cols = spec.cols || [];
    if (!rows.length && !cols.length) return;
    Array.prototype.forEach.call(table.querySelectorAll("tr"), function (tr) {
      var rid = tr.dataset.id, rowHl = rid != null && rows.indexOf(rid) >= 0;
      Array.prototype.forEach.call(tr.children, function (c) {
        var cid = c.dataset.col, on = rowHl || (cid != null && cols.indexOf(cid) >= 0);
        if (!on) return;
        c.style.background = spec.color; c.classList.add("is-hl"); if (rowHl) c.style.fontWeight = "700";
      });
    });
  }
  // 요약표 열: 당월 · 작년 동월 · YoY · 누계 · 작년 누계 · YoY
  var SUM_COLS = [["ty", "당월", "yen"], ["ly", "작년 동월", "yen"], ["yoy", "YoY", "gr"], ["ytd", "누계", "yen"], ["lyytd", "작년 누계", "yen"], ["ytdyoy", "누계 YoY", "gr"]];
  function fmtSum(type, v) { return v == null ? "" : type === "gr" ? gstr(v) : num(v); }
  function renderSummary(table, rows, title, spec) {
    table.innerHTML = "";
    var thead = h("thead"), hr = h("tr"); hr.appendChild(h("th", null, title));
    SUM_COLS.forEach(function (c) { var th = h("th", null, c[1]); th.dataset.col = c[0]; hr.appendChild(th); });
    thead.appendChild(hr); table.appendChild(thead);
    var tb = h("tbody");
    rows.forEach(function (r) {
      var tr = h("tr"); tr.dataset.id = r.name; tr.appendChild(h("td", null, r.name));
      SUM_COLS.forEach(function (c) { var v = r[c[0]]; var td = h("td", c[2] === "gr" ? cls(v) : "", v == null ? "-" : fmtSum(c[2], v)); td.dataset.col = c[0]; tr.appendChild(td); });
      tb.appendChild(tr);
    });
    var tot = rows.reduce(function (a, r) { ["ty", "ly", "ytd", "lyytd"].forEach(function (f) { a[f] += r[f]; }); return a; }, { ty: 0, ly: 0, ytd: 0, lyytd: 0 });
    var ft = h("tfoot"), fr = h("tr"); fr.appendChild(h("td", null, "합계"));
    var tv = { ty: tot.ty, ly: tot.ly, yoy: tot.ly ? growth(tot.ty, tot.ly) : null, ytd: tot.ytd, lyytd: tot.lyytd, ytdyoy: tot.lyytd ? growth(tot.ytd, tot.lyytd) : null };
    SUM_COLS.forEach(function (c) { var v = tv[c[0]]; fr.appendChild(h("td", c[2] === "gr" ? cls(v) : "", v == null ? "-" : fmtSum(c[2], v))); });
    ft.appendChild(fr); table.appendChild(tb); table.appendChild(ft);
    applyHl(table, spec);
  }

  // 상품별 상세 표의 열 정의
  function itemCols() {
    var ty = tyLabel(), ly = lyLabel();
    return [
      { id: "no", label: "No.", type: "int", w: 6, text: true }, { id: "gd", label: "상품번호", w: 13, text: true }, { id: "line", label: "라인", w: 12, text: true }, { id: "cat", label: "카테고리", w: 12, text: true }, { id: "name", label: "상품명", w: 36, text: true },
      { id: "sales", label: ty, group: "Sales", type: "yen" }, { id: "qty", label: "상품수량", group: "Sales", type: "int" }, { id: "lyqty", label: "LY 상품수량", group: "Sales", type: "int" }, { id: "lysales", label: ly, group: "Sales", type: "yen" }, { id: "yoy", label: "YoY", group: "Sales", type: "gr" },
      { id: "pv", label: ty, group: "PV", type: "int" }, { id: "lypv", label: ly, group: "PV", type: "int" }, { id: "pvyoy", label: "YoY", group: "PV", type: "gr" },
      { id: "cvr", label: ty, group: "CVR", type: "cvr" }, { id: "lycvr", label: ly, group: "CVR", type: "cvr" }, { id: "cvrgap", label: "YoY GAP(%p)", group: "CVR", type: "gap" },
      { id: "spend", label: "Spend", group: "On Site AD", type: "yen" }, { id: "adsales", label: "AD Sales", group: "On Site AD", type: "yen" }, { id: "roas", label: "ROAS", group: "On Site AD", type: "pct" },
      { id: "ytd", label: "Sales", group: "YTD", type: "yen" }, { id: "lyytd", label: "LY", group: "YTD", type: "yen" }, { id: "ytdyoy", label: "YoY", group: "YTD", type: "gr" }, { id: "share", label: "%", group: "YTD", type: "pct1" }
    ];
  }
  function itemVal(it, id) {
    switch (id) {
      case "no": return it.no; case "gd": return it.gd; case "line": return it.line; case "cat": return it.cat; case "name": return it.name;
      case "sales": return it.sales; case "qty": return it.qty; case "lyqty": return it.lyQty || null; case "lysales": return it.lySales || null; case "yoy": return it.yoy;
      case "pv": return it.pv; case "lypv": return it.lyPv || null; case "pvyoy": return it.pvYoy;
      case "cvr": return it.cvr; case "lycvr": return it.lyCvr; case "cvrgap": return it.gap;
      case "spend": case "adsales": case "roas": return null;                          // 광고 데이터 연결 전
      case "ytd": return it.ytd; case "lyytd": return it.lyYtd || null; case "ytdyoy": return it.ytdYoy; case "share": return it.share;
    }
    return null;
  }
  function fmtItem(type, v) {
    if (v == null) return "-";
    switch (type) {
      case "yen": case "int": return num(v);
      case "gr": return gstr(v);
      case "cvr": return pctv(v, 2);
      case "gap": return (v >= 0 ? "+" : "") + v.toFixed(1) + "%p";
      case "pct": return pctv(v);
      case "pct1": return pctv(v, 1);
    }
    return String(v);
  }
  function totalVal(T, id) {
    var cvr = T.pv ? T.qty / T.pv * 100 : null, lyCvr = T.lyPv ? T.lyQty / T.lyPv * 100 : null;
    switch (id) {
      case "sales": return T.sales; case "qty": return T.qty; case "lyqty": return T.lyQty || null; case "lysales": return T.lySales || null; case "yoy": return T.lySales ? growth(T.sales, T.lySales) : null;
      case "pv": return T.pv; case "lypv": return T.lyPv || null; case "pvyoy": return T.lyPv ? growth(T.pv, T.lyPv) : null;
      case "cvr": return cvr; case "lycvr": return lyCvr; case "cvrgap": return cvr != null && lyCvr != null ? cvr - lyCvr : null;
      case "ytd": return T.ytd; case "lyytd": return T.lyYtd || null; case "ytdyoy": return T.lyYtd ? growth(T.ytd, T.lyYtd) : null; case "share": return 100;
    }
    return null;
  }
  function renderItems() {
    var d = S.data, cols = itemCols();
    el.itemsTitle.textContent = "상품별 상세 · " + tyLabel() + (d.part ? " (" + S.anchor.slice(5).replace("-", "/") + "까지)" : "") + " · " + d.items.length + "개 상품";
    el.items.innerHTML = "";
    var thead = h("thead"), r1 = h("tr"), r2 = h("tr");
    var i = 0;
    while (i < cols.length) {
      var c = cols[i];
      if (!c.group) { var th = h("th", "is-grp", c.label); th.rowSpan = 2; th.dataset.col = c.id; r1.appendChild(th); i++; continue; }
      var j = i; while (j < cols.length && cols[j].group === c.group) j++;
      var g = h("th", "is-grp", c.group); g.colSpan = j - i; r1.appendChild(g);
      for (var x = i; x < j; x++) { var t2 = h("th", null, cols[x].label); t2.dataset.col = cols[x].id; r2.appendChild(t2); }
      i = j;
    }
    thead.appendChild(r1); thead.appendChild(r2); el.items.appendChild(thead);
    var tb = h("tbody");
    d.items.forEach(function (it) {
      var tr = h("tr"); tr.dataset.id = it.gd;
      cols.forEach(function (c) {
        var v = itemVal(it, c.id), td = h("td", [c.id === "name" ? "name" : c.text ? "t" : "", c.type === "gr" || c.type === "gap" ? cls(v) : "", v == null ? "is-empty" : ""].join(" ").trim(), c.text ? (v == null ? "" : String(v)) : fmtItem(c.type, v));
        if (c.id === "name") td.title = it.name; td.dataset.col = c.id; tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    el.items.appendChild(tb);
    var tf = h("tfoot"), fr = h("tr");
    cols.forEach(function (c, k) {
      var v = c.text ? (k === 4 ? "합계" : "") : totalVal(d.total, c.id);
      var td = h("td", c.text ? "t" : (c.type === "gr" || c.type === "gap" ? cls(v) : ""), c.text ? v : (c.id === "spend" || c.id === "adsales" || c.id === "roas" ? "-" : fmtItem(c.type, v)));
      td.dataset.col = c.id; fr.appendChild(td);
    });
    tf.appendChild(fr); el.items.appendChild(tf);
    applyHl(el.items, S.cfg.items);
    el.itemsNote.textContent = "온사이트 광고(Spend · AD Sales · ROAS)는 아직 DB 에 광고 데이터가 없어서 '-' 로 비어 있어요. 라인·카테고리는 상품코드표 기준(분류가 없는 상품은 " + UNCLASS + "), CVR = 상품수량 ÷ PV, 누계 = " + fyLabel(S.fy) + " 7월부터 기준 월까지.";
  }

  // ---------- 그래프 ----------
  function chartConfig(rows, basis, dir, light) {
    var root = getComputedStyle(pane), cs = function (n, d) { return root.getPropertyValue(n).trim() || d; };
    var tick = light ? "#444444" : cs("--dash-tick", "#7a4a1c"), grid = light ? "rgba(0,0,0,.1)" : cs("--dash-grid", "rgba(0,0,0,.08)");
    var c1 = cs("--dash-c1", "#0072e4"), cmp = light ? "#b0b0b0" : cs("--dash-cmp", "#a19a82");
    var kt = basis === "ytd" ? "ytd" : "ty", kl = basis === "ytd" ? "lyytd" : "ly";
    var list = rows.slice(0, 12);
    var horiz = dir !== "v";
    var valAxis = { beginAtZero: true, ticks: { color: tick, callback: function (v) { return v >= 1e6 ? (v / 1e6) + "M" : v >= 1e3 ? (v / 1e3) + "K" : v; } }, grid: { color: grid } };
    var catAxis = { ticks: { color: tick }, grid: { display: false } };
    return {
      type: "bar",
      data: { labels: list.map(function (r) { return r.name; }), datasets: [
        { label: basis === "ytd" ? "누계" : "당월", data: list.map(function (r) { return Math.round(r[kt]); }), backgroundColor: c1, borderRadius: 2 },
        { label: basis === "ytd" ? "작년 누계" : "작년 동월", data: list.map(function (r) { return Math.round(r[kl]); }), backgroundColor: alpha(cmp.charAt(0) === "#" ? cmp : "#a19a82", .75), borderRadius: 2 }
      ] },
      options: {
        indexAxis: horiz ? "y" : "x", responsive: !light, maintainAspectRatio: false, animation: { duration: light ? 0 : 300 }, interaction: { mode: "index", intersect: false },
        plugins: { legend: { labels: { color: tick, boxWidth: 10, boxHeight: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: function (c) { return " " + c.dataset.label + ": " + Math.round(c.parsed[horiz ? "x" : "y"]).toLocaleString("ko-KR"); } } } },
        scales: horiz ? { x: valAxis, y: catAxis } : { x: catAxis, y: valAxis }
      }
    };
  }
  function drawCharts() {
    ["line", "cat"].forEach(function (k) { if (charts[k]) { charts[k].destroy(); charts[k] = null; } });
    if (!window.Chart) return;
    var basis = S.cfg.basis, dir = S.cfg.dir;
    var lc = chartConfig(S.data.lines, basis, dir, false), cc = chartConfig(S.data.cats, basis, dir, false);
    charts.line = new window.Chart(el.chartLine, lc); charts.cat = new window.Chart(el.chartCat, cc);
  }

  function renderAll() {
    var k = S.ym, d = S.data;
    el.title.textContent = "Qoo10 by Product · " + k.slice(0, 4) + " " + MON[mOf(k) - 1] + (d.part ? " (" + S.anchor.slice(5).replace("-", "/") + "까지)" : "");
    el.unit.textContent = "(JPY) · 상품 순수금액 기준 · 회계연도 " + fyLabel(S.fy) + " (7월~6월) · 비교: " + d.tyFrom.slice(5) + "~" + d.tyTo.slice(5) + " vs 작년 같은 기간";
    var basisTxt = S.cfg.basis === "ytd" ? "그래프: 누계 vs 작년 누계" : "그래프: 당월 vs 작년 동월";
    el.lineSub.textContent = basisTxt; el.catSub.textContent = basisTxt;
    var unc = d.items.filter(function (i) { return i.line === UNCLASS || i.cat === UNCLASS; });
    el.notice.hidden = !unc.length;
    if (unc.length) el.notice.textContent = "상품코드표에 라인 또는 카테고리가 없는 상품이 " + unc.length + "개 있어요(" + UNCLASS + "로 표시): " + unc.slice(0, 4).map(function (i) { return i.name; }).join(", ") + (unc.length > 4 ? " 외" : "") + ". 분류가 시트와 다르게 보이면 상품코드표를 고쳐 주세요.";
    renderComment(); renderTables();
  }
  function renderTables() { // 설정(강조·그래프)만 바뀐 때는 코멘트는 다시 읽지 않는다 (코멘트 저장과 겹치지 않게)
    var d = S.data;
    var basisTxt = S.cfg.basis === "ytd" ? "그래프: 누계 vs 작년 누계" : "그래프: 당월 vs 작년 동월";
    el.lineSub.textContent = basisTxt; el.catSub.textContent = basisTxt;
    renderSummary(el.line, d.lines, "라인", S.cfg.lines); renderSummary(el.cat, d.cats, "카테고리", S.cfg.cats); renderItems(); drawCharts();
  }
  function recompute() {
    if (S.busy) return Promise.resolve();
    el.itemsTitle.textContent = "상품별 상세 · 불러오는 중…";
    return build().then(renderAll).catch(function (e) { showMsg(friendly(e)); });
  }

  // ---------- 선택 상자 ----------
  function fillFy() {
    var minFy = fyOf(S.minYm), maxFy = fyOf(S.anchor.slice(0, 8) + "01");
    el.fy.innerHTML = "";
    for (var f = maxFy; f >= minFy; f--) { var o = h("option", null, fyLabel(f) + " (" + (f - 1) + "-07 ~ " + f + "-06)"); o.value = String(f); el.fy.appendChild(o); }
    if (S.fy == null) S.fy = maxFy; el.fy.value = String(S.fy);
  }
  function fillMonths() {
    var aym = S.anchor.slice(0, 8) + "01";
    var months = fyMonths(S.fy).filter(function (k) { return k >= S.minYm && k <= aym; });
    el.month.innerHTML = "";
    months.forEach(function (k) { var o = h("option", null, k.slice(0, 4) + " " + MON[mOf(k) - 1] + (k === S.partialYm ? " (진행 중)" : "")); o.value = k; el.month.appendChild(o); });
    var done = months.filter(function (k) { return k !== S.partialYm; });
    var pick = S.ym && months.indexOf(S.ym) >= 0 ? S.ym : (done.length ? done[done.length - 1] : months[months.length - 1]);
    S.ym = pick || fyMonths(S.fy)[0]; el.month.value = S.ym;
  }

  // ---------- 설정 모달 (코멘트 · 강조 · 그래프) ----------
  function openSettings() {
    var k = S.ym, fy = S.fy, prev = document.activeElement;
    var draft = JSON.parse(JSON.stringify(S.cfg)), cfg0 = JSON.stringify(S.cfg), note0 = S.note ? S.note.body : "";
    var ov = h("div", "inni-modal"), card = h("div", "inni-modal-card is-wide");
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "설정");
    card.appendChild(h("h3", null, "설정 · PRODUCT · " + fyLabel(fy) + " · " + k.slice(0, 4) + " " + MON[mOf(k) - 1]));
    card.appendChild(h("p", null, "코멘트는 기준 월마다, 강조와 그래프는 회계연도(" + fyLabel(fy) + ")마다 저장돼요. 모두가 같이 봐요."));
    var tabs = h("div", "inni-mtabs"); tabs.setAttribute("role", "tablist");
    var panels = {}, tabBtns = {};
    [["note", "코멘트"], ["hl", "강조"], ["chart", "그래프"]].forEach(function (t) {
      var b = h("button", "inni-mtab", t[1]); b.type = "button"; b.setAttribute("role", "tab"); tabBtns[t[0]] = b; tabs.appendChild(b);
      var p = h("div", "inni-mpanel"); p.setAttribute("role", "tabpanel"); panels[t[0]] = p;
    });
    card.appendChild(tabs);

    var ta = h("textarea"); ta.maxLength = 4000; ta.value = note0; ta.placeholder = "예: 노세범 대용량 QoQ +80%, 포어블러 파우더 절품으로 매출 손실...";
    panels.note.appendChild(h("p", null, k.slice(0, 4) + " " + MON[mOf(k) - 1] + " 리포트의 직접 입력 코멘트예요. 자동 코멘트 아래에 같이 보여요. 비우고 저장하면 지워져요."));
    panels.note.appendChild(ta);

    var sumCols = SUM_COLS.map(function (c) { return [c[0], c[1]]; });
    var itemCfgCols = itemCols().filter(function (c) { return !c.text; }).map(function (c) { return [c.id, (c.group ? c.group + " · " : "") + c.label]; });
    var tableDefs = [
      { key: "lines", title: "라인별 표", rows: S.data.lines.map(function (r) { return [r.name, r.name]; }), cols: sumCols },
      { key: "cats", title: "카테고리별 표", rows: S.data.cats.map(function (r) { return [r.name, r.name]; }), cols: sumCols },
      { key: "items", title: "상품별 상세 표", rows: S.data.items.map(function (r) { return [r.gd, r.no + ". " + r.name.slice(0, 28)]; }), cols: itemCfgCols, scroll: true }
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
        var box = h("div", "inni-checks" + (td.scroll && grp[0] === "rows" ? " is-scroll" : ""));
        grp[2].forEach(function (it) {
          var lab = h("label"), cb = h("input"); cb.type = "checkbox"; cb.checked = draft[td.key][grp[0]].indexOf(it[0]) >= 0;
          cb.addEventListener("change", function () { var arr = draft[td.key][grp[0]], i = arr.indexOf(it[0]); if (cb.checked && i < 0) arr.push(it[0]); else if (!cb.checked && i >= 0) arr.splice(i, 1); });
          lab.appendChild(cb); lab.appendChild(document.createTextNode(it[1])); box.appendChild(lab);
        });
        g.appendChild(box);
      });
      var clr = h("button", "dash-btn", "이 표 강조 모두 해제"); clr.type = "button"; clr.style.marginTop = "10px";
      clr.addEventListener("click", function () { draft[td.key].rows = []; draft[td.key].cols = []; Array.prototype.forEach.call(g.querySelectorAll("input[type=checkbox]"), function (c) { c.checked = false; }); });
      g.appendChild(clr); panels.hl.appendChild(g);
    });

    panels.chart.appendChild(h("p", null, "라인별·카테고리별 그래프예요. 상위 12개까지 보여요."));
    [["basis", "비교 기준", [["month", "당월 vs 작년 동월"], ["ytd", "누계 vs 작년 누계"]]], ["dir", "막대 방향", [["h", "가로 막대"], ["v", "세로 막대"]]]].forEach(function (grp) {
      panels.chart.appendChild(h("h5", null, grp[1]));
      var rd = h("div", "inni-radios");
      grp[2].forEach(function (o) {
        var lab = h("label"), r = h("input"); r.type = "radio"; r.name = "inni-p-" + grp[0]; r.value = o[0]; r.checked = draft[grp[0]] === o[0];
        r.addEventListener("change", function () { if (r.checked) draft[grp[0]] = o[0]; });
        lab.appendChild(r); lab.appendChild(document.createTextNode(o[1])); rd.appendChild(lab);
      });
      panels.chart.appendChild(rd);
    });

    ["note", "hl", "chart"].forEach(function (t) { card.appendChild(panels[t]); });
    function showTab(t) { Object.keys(panels).forEach(function (x) { panels[x].hidden = x !== t; tabBtns[x].setAttribute("aria-selected", String(x === t)); }); if (t === "note") ta.focus(); }
    Object.keys(tabBtns).forEach(function (t) { tabBtns[t].addEventListener("click", function () { showTab(t); }); });
    var err = h("div", "inni-modal-err"); card.appendChild(err);
    var acts = h("div", "inni-modal-acts"), gap = h("span", "inni-gap");
    var cancel = h("button", "dash-btn", "취소"); cancel.type = "button";
    var save = h("button", "dash-btn is-primary", "저장"); save.type = "button";
    [gap, cancel, save].forEach(function (x) { acts.appendChild(x); });
    card.appendChild(acts); ov.appendChild(card); document.body.appendChild(ov); showTab("note");

    function close() { document.removeEventListener("keydown", onKey, true); if (ov.parentNode) ov.parentNode.removeChild(ov); if (prev && prev.focus) prev.focus(); }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); } }
    function commit() {
      var jobs = [], noteChanged = ta.value !== note0, cfgChanged = JSON.stringify(draft) !== cfg0;
      if (!noteChanged && !cfgChanged) { close(); return; }
      save.disabled = true; err.textContent = "";
      if (noteChanged) jobs.push(rpc("dy_inni_comment_set", { p_report: "product", p_ym: k, p_body: ta.value }).then(function (c) { if (k === S.ym) showManual(c); }));
      if (cfgChanged) jobs.push(rpc("dy_inni_settings_set", { p_report: "product", p_fy: fy, p_config: draft }).then(function () { if (fy === S.fy) { S.cfg = normCfg(draft); renderTables(); } }));
      Promise.all(jobs).then(function () { toast("설정을 저장했어요"); close(); }).catch(function (e) { err.textContent = friendly(e); save.disabled = false; });
    }
    document.addEventListener("keydown", onKey, true);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    cancel.addEventListener("click", close); save.addEventListener("click", commit);
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
  function fill(c) { return { type: "pattern", pattern: "solid", fgColor: { argb: c } }; }
  var XFMT = { yen: "#,##0", int: "#,##0", gr: "+0%;-0%;0%", cvr: "0.00%", gap: '+0.0"%p";-0.0"%p";0.0"%p"', pct: "0%", pct1: "0.0%" };
  function xv(type, v) { return v == null ? null : (type === "gr" || type === "cvr" || type === "pct" || type === "pct1") ? v / 100 : v; }
  function imageOf(wb, rows) {
    var cv = document.createElement("canvas"); cv.width = 760; cv.height = 340; cv.style.cssText = "position:fixed;left:-3000px;top:0;width:760px;height:340px";
    document.body.appendChild(cv);
    var cfg = chartConfig(rows, S.cfg.basis, S.cfg.dir, true);
    cfg.plugins = [{ id: "bg", beforeDraw: function (ch) { var x = ch.ctx; x.save(); x.globalCompositeOperation = "destination-over"; x.fillStyle = "#ffffff"; x.fillRect(0, 0, ch.width, ch.height); x.restore(); } }];
    cfg.options.responsive = false; cfg.options.devicePixelRatio = 1;
    var tmp = new window.Chart(cv, cfg); tmp.update("none");
    var id = wb.addImage({ base64: tmp.toBase64Image("image/png", 1), extension: "png" });
    tmp.destroy(); document.body.removeChild(cv); return id;
  }

  function exportXlsx() {
    if (!S.ready || !S.data || S.busy) return;
    el.xlsxBtn.disabled = true; var oldTxt = el.xlsxBtn.textContent; el.xlsxBtn.textContent = "만드는 중…";
    loadExcelJs().then(function () {
      var wb = new window.ExcelJS.Workbook(); wb.creator = "DY-AI"; wb.created = new Date();
      var d = S.data, cols = itemCols(), k = S.ym, fy = S.fy;
      var ws = wb.addWorksheet("PRODUCT", { views: [{ showGridLines: false }] });
      ws.columns = cols.map(function (c) { return { width: c.text ? c.w : 12.5 }; });
      var LAST = cols.length, thin = { style: "thin", color: { argb: XL.line } }, C = function (r, c) { return ws.getCell(r, c); };
      var r = 2, c;
      C(r, 1).value = "BY PRODUCT · QOO10"; C(r, 1).font = { size: 9, bold: true, color: { argb: "FF0072E4" } }; r++;
      ws.mergeCells(r, 1, r, 12); C(r, 1).value = el.title.textContent; C(r, 1).font = { size: 20, bold: true }; ws.getRow(r).height = 30; r++;
      ws.mergeCells(r, 1, r, 12); C(r, 1).value = el.unit.textContent; C(r, 1).font = { size: 9, color: { argb: XL.sub } }; r += 2;
      C(r, 1).value = "코멘트"; C(r, 1).font = { size: 12, bold: true };
      for (c = 1; c <= 12; c++) C(r, c).border = { bottom: { style: "medium", color: { argb: "FF1F3A5F" } } };
      r++;
      autoLines().forEach(function (l) {
        ws.mergeCells(r, 1, r, 12); var cc = C(r, 1); cc.value = "· " + l.t; cc.alignment = { vertical: "middle", wrapText: true };
        cc.font = { size: 11, bold: !!l.c, color: { argb: l.c === "is-neg" ? XL.down : l.c === "is-pos" ? XL.up : "FF222222" } }; ws.getRow(r).height = 20 + (l.t.length > 90 ? 16 : 0); r++;
      });
      if (S.note) {
        ws.mergeCells(r, 1, r, 12); var nc = C(r, 1); nc.value = S.note.body; nc.alignment = { vertical: "top", wrapText: true }; nc.font = { size: 11 }; nc.fill = fill("FFF7F7F7");
        var lines = S.note.body.split("\n").reduce(function (a, ln) { return a + Math.max(1, Math.ceil(ln.length / 100)); }, 0);
        ws.getRow(r).height = Math.max(20, lines * 16 + 6); r++;
        ws.mergeCells(r, 1, r, 12); C(r, 1).value = "직접 입력 · " + (S.note.by || "") + (S.note.at ? " · " + String(S.note.at).slice(0, 16).replace("T", " ") : ""); C(r, 1).font = { size: 9, color: { argb: XL.sub } }; r++;
      }
      r++;

      // 라인별·카테고리별: 그림 + 표
      [["라인", d.lines, "lines", imageOf(wb, d.lines)], ["카테고리", d.cats, "cats", imageOf(wb, d.cats)]].forEach(function (blk) {
        var title = blk[0], rows = blk[1], spec = S.cfg[blk[2]], img = blk[3];
        C(r, 1).value = title + "별 · " + (S.cfg.basis === "ytd" ? "누계 vs 작년 누계" : "당월 vs 작년 동월") + " (그래프)"; C(r, 1).font = { size: 12, bold: true }; r++;
        ws.addImage(img, { tl: { col: 0, row: r - 1 }, ext: { width: 720, height: 322 } }); r += 17;
        C(r, 1).value = title; SUM_COLS.forEach(function (sc, i) { C(r, 3 + i).value = sc[1]; });
        for (c = 1; c <= 8; c++) { var hc = C(r, c); hc.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 }; hc.fill = fill(XL.head); hc.alignment = { horizontal: c <= 2 ? "left" : "right", vertical: "middle" }; }
        ws.mergeCells(r, 1, r, 2);
        SUM_COLS.forEach(function (sc, i) { if (spec.cols.indexOf(sc[0]) >= 0) { var q = C(r, 3 + i); q.fill = fill(argb(spec.color)); q.font = { bold: true, size: 10, color: { argb: "FF1B1B1B" } }; } });
        r++;
        var sums = { ty: 0, ly: 0, ytd: 0, lyytd: 0 };
        rows.forEach(function (row) {
          ws.mergeCells(r, 1, r, 2); C(r, 1).value = row.name;
          var rowHl = spec.rows.indexOf(row.name) >= 0;
          SUM_COLS.forEach(function (sc, i) {
            var cc = C(r, 3 + i), v = row[sc[0]]; cc.value = xv(sc[2] === "gr" ? "gr" : "yen", v); cc.numFmt = XFMT[sc[2] === "gr" ? "gr" : "yen"]; cc.alignment = { horizontal: "right" };
            cc.font = { size: 10, color: { argb: sc[2] === "gr" && v != null ? (v >= 0 ? XL.up : XL.down) : "FF222222" } };
            if (rowHl || spec.cols.indexOf(sc[0]) >= 0) { cc.fill = fill(argb(spec.color)); cc.font = { size: 10, bold: rowHl, color: { argb: "FF1B1B1B" } }; }
          });
          ["ty", "ly", "ytd", "lyytd"].forEach(function (f) { sums[f] += row[f]; });
          var lc = C(r, 1); lc.font = { bold: true, size: 10 }; if (rowHl) { lc.fill = fill(argb(spec.color)); C(r, 2).fill = fill(argb(spec.color)); }
          for (c = 1; c <= 8; c++) C(r, c).border = { bottom: thin };
          r++;
        });
        ws.mergeCells(r, 1, r, 2); C(r, 1).value = "합계"; C(r, 1).font = { bold: true, size: 10 };
        var tv = { ty: sums.ty, ly: sums.ly, yoy: sums.ly ? growth(sums.ty, sums.ly) : null, ytd: sums.ytd, lyytd: sums.lyytd, ytdyoy: sums.lyytd ? growth(sums.ytd, sums.lyytd) : null };
        SUM_COLS.forEach(function (sc, i) { var cc = C(r, 3 + i), v = tv[sc[0]]; cc.value = xv(sc[2] === "gr" ? "gr" : "yen", v); cc.numFmt = XFMT[sc[2] === "gr" ? "gr" : "yen"]; cc.font = { bold: true, size: 10 }; cc.alignment = { horizontal: "right" }; });
        for (c = 1; c <= 8; c++) C(r, c).border = { top: { style: "thin", color: { argb: "FF888888" } }, bottom: { style: "medium", color: { argb: "FF888888" } } };
        r += 2;
      });

      // 상품별 상세
      C(r, 1).value = el.itemsTitle.textContent; C(r, 1).font = { size: 12, bold: true }; r++;
      var g1 = r, g2 = r + 1, hl = S.cfg.items;
      var i = 0;
      while (i < cols.length) {
        var cd = cols[i];
        if (!cd.group) { ws.mergeCells(g1, i + 1, g2, i + 1); C(g1, i + 1).value = cd.label; i++; continue; }
        var j = i; while (j < cols.length && cols[j].group === cd.group) j++;
        ws.mergeCells(g1, i + 1, g1, j); C(g1, i + 1).value = cd.group;
        for (var x = i; x < j; x++) C(g2, x + 1).value = cols[x].label;
        i = j;
      }
      [g1, g2].forEach(function (rr) { for (c = 1; c <= LAST; c++) { var hh = C(rr, c); hh.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 }; hh.fill = fill(XL.head); hh.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; hh.border = { left: { style: "thin", color: { argb: "FF4A6285" } } }; } ws.getRow(rr).height = 20; });
      cols.forEach(function (cd, ci) { if (hl.cols.indexOf(cd.id) >= 0 && !cd.text) { var q = C(g2, ci + 1); q.fill = fill(argb(hl.color)); q.font = { bold: true, size: 10, color: { argb: "FF1B1B1B" } }; } });
      r = g2 + 1;
      d.items.forEach(function (it) {
        var rowHl = hl.rows.indexOf(it.gd) >= 0;
        cols.forEach(function (cd, ci) {
          var cc = C(r, ci + 1), v = itemVal(it, cd.id);
          if (cd.text) { cc.value = v == null ? null : (cd.id === "no" ? v : String(v)); cc.alignment = { horizontal: cd.id === "no" ? "center" : "left", vertical: "middle" }; cc.font = { size: 10 }; }
          else { cc.value = xv(cd.type, v); cc.numFmt = XFMT[cd.type]; cc.alignment = { horizontal: "right", vertical: "middle" };
            cc.font = { size: 10, color: { argb: (cd.type === "gr" || cd.type === "gap") && v != null ? (v >= 0 ? XL.up : XL.down) : "FF222222" } }; }
          if (rowHl || hl.cols.indexOf(cd.id) >= 0) { cc.fill = fill(argb(hl.color)); cc.font = { size: 10, bold: rowHl, color: { argb: "FF1B1B1B" } }; }
          cc.border = { bottom: thin };
        });
        ws.getRow(r).height = 18; r++;
      });
      cols.forEach(function (cd, ci) {
        var cc = C(r, ci + 1); cc.font = { bold: true, size: 10 }; cc.border = { top: { style: "thin", color: { argb: "FF888888" } }, bottom: { style: "medium", color: { argb: "FF888888" } } };
        if (cd.text) { if (cd.id === "name") cc.value = "합계"; return; }
        var v = (cd.id === "spend" || cd.id === "adsales" || cd.id === "roas") ? null : totalVal(d.total, cd.id);
        cc.value = xv(cd.type, v); cc.numFmt = XFMT[cd.type]; cc.alignment = { horizontal: "right" };
      });
      r += 2;
      ws.mergeCells(r, 1, r, 12); C(r, 1).value = el.itemsNote.textContent; C(r, 1).font = { size: 9, color: { argb: XL.sub } }; C(r, 1).alignment = { wrapText: true, vertical: "top" }; ws.getRow(r).height = 30;
      ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
      return wb.xlsx.writeBuffer().then(function (buf) {
        var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
        a.download = "Qoo10_by_Product_" + fyLabel(fy) + "_" + k.slice(0, 7) + ".xlsx";
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
        toast("엑셀을 내려받았어요");
      });
    }).catch(function (e) { showMsg("엑셀을 만들지 못했어요: " + ((e && e.message) || e)); })
      .then(function () { el.xlsxBtn.disabled = false; el.xlsxBtn.textContent = oldTxt; });
  }

  // ---------- 이벤트 ----------
  el.fy.addEventListener("change", function () { S.fy = +el.fy.value; S.ym = null; fillMonths(); loadCfg(S.fy).then(recompute); });
  el.month.addEventListener("change", function () { S.ym = el.month.value; recompute(); });
  el.reload.addEventListener("click", function () { D.clearCache(); S.ready = false; S.master = null; start(true); });
  el.setBtn.addEventListener("click", function () { if (S.ready && S.cfg && S.data) openSettings(); });
  el.xlsxBtn.addEventListener("click", exportXlsx);

  // ---------- 시작 ----------
  var started = false;
  function start(force) {
    if (started && !force) { Object.keys(charts).forEach(function (k) { if (charts[k]) charts[k].resize(); }); return Promise.resolve(); }
    started = true;
    return load().then(function () {
      if (!S.ready) { started = false; return; }
      fillFy(); fillMonths();
      return loadCfg(S.fy).then(recompute);
    });
  }
  document.addEventListener("inni:show", function (e) { if (e.detail.view === "inni" && e.detail.sub === "product") start(); });
  var h0 = location.hash || "";
  if (/^#inni\/product/.test(h0)) start();
})();

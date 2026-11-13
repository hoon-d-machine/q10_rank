/* 대시보드 > 하위 탭 보드 엔진: 수집된 데이터를 조합한 분석 대시보드(광고 효율 · 랭킹·판매 · 유입 경로 · 고객 구조 · 행사 비교 · 찜·장바구니 · 경영 요약)를 같은 틀로 그린다.
 * 각 보드는 board-*.js 에서 window.dyBoard.define({...}) 로 등록한다:
 *   id, label(탭 이름), title, eyebrow, unit, help: [[제목, [문단...]]],
 *   selects: [{ key, label, options:[[값,이름]], def }]            그래프·표 표시 설정(설정 모달 '그래프' 탭, 값은 ctx.cfg.sel[key])
 *   setup(B)   → Promise<[{ id, label, options:[[값,이름]], value }]>   위쪽 선택 상자(기준 월 등). 값은 ctx.v[id]
 *   load(ctx)  → Promise<data>                                          DB 에서 읽어 오기 (선택이 바뀔 때마다 부름)
 *   view(data, ctx) → { notice, comments:[{t,c}], sections:[...] }       화면 구성 (설정이 바뀔 때는 load 없이 다시 부름)
 *      section: { type:'kpi', items:[{label,value,sub,cls}] } | { type:'chart', id, title, config:(light)=>ChartJS설정 }
 *             | { type:'table', id, title, cols:[{id,label,type}], rows:[{id,vals,strong,cls}], note }  type: text|int|k|yen|pct|pct1|gr|dec1|dec2
 *   noteKey(ctx, data) → 'YYYY-MM-01'  직접 입력 코멘트 저장 키 (보드마다 하나)
 * 코멘트(자동+직접 입력)·설정(강조·그래프)·엑셀·설명 모달·새로고침은 엔진이 맡는다. 저장: 코멘트 report 'board_<id>', 설정 report 'board_<id>' fy 2001(공통).
 */
(function () {
  "use strict";
  var D = window.dyDash, K = window.dyInniKit;
  if (!D || !K) return;
  var B = window.dyBoard = { defs: {}, order: [], inst: {} };
  var SETTINGS_FY = 2001;

  // ---------- 공용 도구 ----------
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function parse(s) { var a = String(s).slice(0, 10).split("-"); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function addD(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
  function diffD(a, b) { return Math.round((parse(a) - parse(b)) / 86400000); }
  function md(s) { return +String(s).slice(5, 7) + "/" + +String(s).slice(8, 10); }
  function mk(s) { return String(s).slice(0, 8) + "01"; }                       // 그 달 1일
  function addM(k, n) { var y = +k.slice(0, 4), m = +k.slice(5, 7) - 1 + n; return Math.floor(m / 12) + y + "-" + pad(((m % 12) + 12) % 12 + 1) + "-01"; }
  function lastDay(k) { return +ymd(new Date(+k.slice(0, 4), +k.slice(5, 7), 0)).slice(8, 10); }
  function monthEnd(k) { return k.slice(0, 8) + pad(lastDay(k)); }
  function fyOf(s) { return +s.slice(5, 7) >= 7 ? +s.slice(0, 4) + 1 : +s.slice(0, 4); }
  function ml(k) { return k.slice(0, 4) + "-" + k.slice(5, 7); }                  // 2026-08
  function num(v) { return v == null || !isFinite(v) ? "-" : Math.round(v).toLocaleString("ko-KR"); }
  function kv(yen) { return yen == null || !isFinite(yen) ? "-" : Math.round(yen / 1000).toLocaleString("ko-KR"); }
  function pct(v, d) { return v == null || !isFinite(v) ? "-" : v.toFixed(d || 0) + "%"; }
  function growth(a, b) { return b ? (a / b - 1) * 100 : null; }
  function gs(v) { return v == null || !isFinite(v) ? "-" : v >= 9999.5 ? ">+9,999%" : (v >= 0 ? "+" : "") + v.toFixed(0) + "%"; }
  function mil(yen) { return (yen / 1e6).toFixed(1) + "백만엔"; }
  function man(v) { return v >= 1e4 ? (v / 1e4).toFixed(1) + "만" : Math.round(v).toLocaleString("ko-KR"); }
  function sum(a, f) { var t = 0; (a || []).forEach(function (x) { var v = f ? f(x) : x; if (v != null && isFinite(v)) t += v; }); return t; }
  function avg(a) { a = (a || []).filter(function (v) { return v != null && isFinite(v); }); return a.length ? sum(a) / a.length : null; }
  function median(a) { a = (a || []).filter(function (v) { return v != null && isFinite(v); }).sort(function (x, y) { return x - y; }); if (!a.length) return null; var m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
  function pearson(xs, ys) {
    var p = []; for (var i = 0; i < xs.length; i++) if (xs[i] != null && ys[i] != null && isFinite(xs[i]) && isFinite(ys[i])) p.push([xs[i], ys[i]]);
    if (p.length < 5) return null;
    var mx = avg(p.map(function (q) { return q[0]; })), my = avg(p.map(function (q) { return q[1]; })), sxy = 0, sxx = 0, syy = 0;
    p.forEach(function (q) { sxy += (q[0] - mx) * (q[1] - my); sxx += Math.pow(q[0] - mx, 2); syy += Math.pow(q[1] - my, 2); });
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }
  function h(tag, c, text) { var e = document.createElement(tag); if (c) e.className = c; if (text != null) e.textContent = text; return e; }
  function toast(m) { if (window.dyToast) window.dyToast(m); }
  function rpc(name, args) { return window.dyAuth.client.rpc(name, args || {}).then(function (res) { if (res.error) throw res.error; return res.data; }); }
  function friendly(e) {
    var m = (e && e.message) || String(e);
    if (/dy_inni_|dy_dash_|dy_data_page|Could not find the function|schema cache/i.test(m)) return "필요한 DB 함수가 아직 없어요. Supabase SQL Editor 에서 dy-ai/supabase 의 inni.sql · dashboard.sql · data_view.sql 을 실행해 주세요.";
    return D.friendly ? D.friendly(e) : "불러오지 못했어요: " + m;
  }
  function short(s, n) { s = String(s || "").replace(/【[^】]*】/g, "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) + "…" : s; }
  function tick(light) { return light ? "#333333" : (getComputedStyle(document.body).color || "#444"); }

  // 집계 함수 (dy_dash_agg) · 원본 표 페이지 읽기 (dy_data_page) · 경계 · 상품코드표 · 행사 달력 — 보드 공용(캐시)
  var cache = {};
  function once(key, fn) { if (!cache[key]) cache[key] = fn().catch(function (e) { delete cache[key]; throw e; }); return cache[key]; }
  function agg(src, grain, from, to, cols, dim, top, topCol) {
    var args = { p_source: src, p_grain: grain, p_from: from, p_to: to, p_cols: cols.slice().sort() };
    if (dim) args.p_dim = dim; if (top) { args.p_top = top; args.p_top_col = topCol || cols[0]; }
    return rpc("dy_dash_agg", args);
  }
  function page(src, from, to, q, cap) {
    var out = [], off = 0; cap = cap || 20000;
    function next() {
      return rpc("dy_data_page", { p_source: src, p_from: from, p_to: to, p_q: q || null, p_limit: 1000, p_offset: off }).then(function (r) {
        out = out.concat(r.rows || []); off += 1000;
        return off < r.total && off < cap ? next() : out;
      });
    }
    return next();
  }
  B.util = { pad: pad, parse: parse, ymd: ymd, addD: addD, diffD: diffD, md: md, mk: mk, addM: addM, lastDay: lastDay, monthEnd: monthEnd, fyOf: fyOf, ml: ml, num: num, kv: kv, pct: pct, growth: growth, gs: gs,
    mil: mil, man: man, sum: sum, avg: avg, median: median, pearson: pearson, h: h, short: short, tick: tick, rpc: rpc, toast: toast };
  B.agg = agg; B.page = page; B.once = once;
  B.bounds = function () { return once("bounds", function () { return rpc("dy_dash_bounds"); }); };
  B.products = function () {
    return once("products", function () { return page("products", null, null, null).then(function (rows) { var m = {}; rows.forEach(function (x) { m[String(x.gd_no)] = x; }); return m; }); });
  };
  B.events = function () {   // 메가와리·메가포 행사 달력 (최신순)
    return once("events", function () {
      return page("mega_event", null, null, null).then(function (rows) {
        return rows.map(function (x) { return { no: x.promotion_no, nm: x.promotion_nm, type: x.promotion_type, start: String(x.start_dt).slice(0, 10), end: String(x.end_dt).slice(0, 10) }; })
          .sort(function (a, b) { return a.start < b.start ? 1 : -1; });
      });
    });
  };
  B.evLabel = function (e) {
    if (e.type === "MEGAWARI") { var mid = addD(e.start, Math.floor(diffD(e.end, e.start) / 2)); return mid.slice(0, 4) + " " + mid.slice(5, 7) + " MEGAWARI"; }
    return e.start.slice(0, 4) + " " + e.start.slice(5, 7) + " MEGAPO";
  };
  B.months = function (from, to) { var out = [], k = mk(from); while (k <= mk(to)) { out.push(k); k = addM(k, 1); } return out; };
  B.clearCache = function () { cache = {}; D.clearCache(); };

  // ---------- 서식 ----------
  var XT = { text: "text", int: "int", k: "int", yen: "int", pct: "pct", pct1: "pct1", gr: "gr", dec1: "dec1", dec2: "dec2" };   // 엑셀 서식
  function cellText(col, v) {
    if (v == null || v === "") return "-";
    if (typeof v === "string") return v;
    switch (col.type) {
      case "k": return kv(v); case "int": case "yen": return num(v); case "pct": return pct(v, 0); case "pct1": return pct(v, 1); case "gr": return gs(v);
      case "dec1": return isFinite(v) ? v.toFixed(1) : "-"; case "dec2": return isFinite(v) ? v.toFixed(2) : "-";
    }
    return String(v);
  }
  function xlVal(col, v) { return col.type === "k" && typeof v === "number" ? v / 1000 : v; }

  // ---------- 보드 인스턴스 ----------
  B.define = function (def) { B.defs[def.id] = def; B.order.push(def.id); };

  function Board(def, pane) {
    var S = { def: def, pane: pane, started: false, busy: false, ctrl: {}, data: null, view: null, cfg: { tables: {}, sel: {} }, note: null, charts: {}, runSeq: 0 };
    var el = {};
    var ctx = { v: S.ctrl, B: B, cfg: S.cfg };

    function build() {
      pane.innerHTML = "";
      var bar = h("div", "inni-bar"); bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", def.label + " 설정");
      el.ctrls = h("span", "board-ctrls"); bar.appendChild(el.ctrls); bar.appendChild(h("span", "dash-bar-gap"));
      [["help", "설명", "이 화면과 코멘트 기준 설명"], ["set", "설정", "코멘트 · 강조 · 그래프 설정"], ["xlsx", "엑셀 다운로드", "서식이 들어간 엑셀로 내려받기"], ["reload", "새로고침", "DB 에서 다시 불러오기"]].forEach(function (b) {
        var btn = h("button", "dash-btn js-b-" + b[0], b[1]); btn.type = "button"; btn.title = b[2]; if (b[0] !== "reload" && b[0] !== "xlsx") btn.setAttribute("aria-haspopup", "dialog"); el[b[0]] = btn; bar.appendChild(btn);
      });
      pane.appendChild(bar);
      el.msg = h("p", "dash-msg"); el.msg.setAttribute("role", "alert"); el.msg.hidden = true; pane.appendChild(el.msg);
      el.notice = h("p", "inni-notice"); el.notice.setAttribute("role", "status"); el.notice.hidden = true; pane.appendChild(el.notice);
      var card = h("div", "inni-card inni-report"), head = h("header", "inni-rhead");
      head.appendChild(h("p", "logs-eyebrow", def.eyebrow || def.label)); el.title = h("h2", null, def.title); head.appendChild(el.title); el.unit = h("p", "inni-unit", def.unit || ""); head.appendChild(el.unit); card.appendChild(head);
      var cm = h("div", "inni-comment"), ch = h("div", "inni-comment-head"); ch.appendChild(h("h3", null, "코멘트")); cm.appendChild(ch);
      el.auto = h("div", "inni-auto"); cm.appendChild(el.auto);
      el.manualBox = h("div", "inni-manual"); el.manualBox.hidden = true; el.manualBody = h("p", "inni-manual-body"); el.manualMeta = h("small", "inni-note");
      el.manualBox.appendChild(el.manualBody); el.manualBox.appendChild(el.manualMeta); cm.appendChild(el.manualBox); card.appendChild(cm);
      el.body = h("div", "board-body"); card.appendChild(el.body);
      pane.appendChild(card);
      el.help.addEventListener("click", openHelp);
      el.set.addEventListener("click", function () { if (S.view) openSettings(); }); el.xlsx.addEventListener("click", exportXlsx);
      el.reload.addEventListener("click", function () { B.clearCache(); run(true); });
    }
    function showMsg(m) { el.msg.textContent = m || ""; el.msg.hidden = !m; }
    function key() { return def.noteKey ? def.noteKey(ctx, S.data) : mk(D.anchor ? D.anchor() : ymd(new Date())); }

    // ----- 설정 (강조 · 그래프) -----
    // 저장 형식(평평): { <표 id>: { rows, cols, color }, <선택 key>: 값 } — 설정 모달(inni-kit)이 쓰는 모양 그대로
    function normCfg(c) {
      c = c || {}; var out = { tables: {}, sel: {} };
      Object.keys(c).forEach(function (k) { if (c[k] && typeof c[k] === "object" && (c[k].rows || c[k].cols)) out.tables[k] = K.normSpec(c[k]); });
      (def.selects || []).forEach(function (sl) { var v = c[sl.key]; out.sel[sl.key] = sl.options.some(function (o) { return o[0] === v; }) ? v : sl.def; });
      return out;
    }
    function loadCfg() {
      return rpc("dy_inni_settings_get", { p_report: "board_" + def.id, p_fy: SETTINGS_FY }).then(function (c) { S.cfg = normCfg(c); }).catch(function () { S.cfg = normCfg(null); }).then(function () { ctx.cfg = S.cfg; });
    }

    // ----- 코멘트 -----
    function showManual(c) {
      S.note = c && c.body ? c : null; el.manualBox.hidden = !S.note; el.manualBody.textContent = S.note ? S.note.body : "";
      el.manualMeta.textContent = S.note ? "직접 입력 · " + (S.note.by || "") + (S.note.at ? " · " + String(S.note.at).slice(0, 16).replace("T", " ") : "") : "";
    }
    function renderComments() {
      el.auto.innerHTML = "";
      (S.view.comments || []).forEach(function (l) { var p = h("p"); p.appendChild(h("span", l.c || "", l.t)); el.auto.appendChild(p); });
      showManual(null);
      var k = key(), seq = S.runSeq;
      rpc("dy_inni_comment_get", { p_report: "board_" + def.id, p_ym: k }).then(function (c) { if (seq === S.runSeq) showManual(c); }).catch(function (e) { el.manualMeta.textContent = friendly(e); el.manualBox.hidden = false; });
    }

    // ----- 본문 -----
    function cfgOf(sec, light) { return window.dyColors.decorate("b." + def.id + "." + sec.id, sec.config(light)); }
    function renderBody() {
      Object.keys(S.charts).forEach(function (k) { if (S.charts[k]) S.charts[k].destroy(); }); S.charts = {};
      el.body.innerHTML = "";
      (S.view.sections || []).forEach(function (sec) {
        if (sec.title && sec.type !== "table" && sec.type !== "chart") el.body.appendChild(h("h3", null, sec.title));
        if (sec.type === "kpi") {
          var g = h("div", "board-kpis");
          sec.items.forEach(function (it) { var c = h("div", "board-kpi " + (it.cls || "")); c.appendChild(h("small", null, it.label)); c.appendChild(h("strong", null, it.value)); if (it.sub) c.appendChild(h("span", null, it.sub)); g.appendChild(c); });
          el.body.appendChild(g);
        } else if (sec.type === "chart") {
          el.body.appendChild(h("h3", null, sec.title)); var w = h("div", "inni-chart" + (sec.small ? " is-sm" : "")), cv = h("canvas"); w.appendChild(cv); el.body.appendChild(w);
          if (window.Chart) S.charts[sec.id] = new window.Chart(cv, cfgOf(sec, false));
        } else if (sec.type === "table") {
          el.body.appendChild(h("h3", null, sec.title));
          var sc = h("div", "inni-scroll"), t = h("table", "inni-table"), th = h("thead"), tr = h("tr");
          sec.cols.forEach(function (c) { var x = h("th", c.type === "text" ? "t" : "", c.label); x.dataset.col = c.id; tr.appendChild(x); }); th.appendChild(tr); t.appendChild(th);
          var tb = h("tbody");
          sec.rows.forEach(function (r) {
            var row = h("tr", (r.strong ? "is-total " : "") + (r.cls || "")); if (r.id != null) row.dataset.id = String(r.id);
            sec.cols.forEach(function (c) {
              var v = r.vals[c.id], tc = c.type === "text" ? "t" : (c.type === "gr" && typeof v === "number" ? (v >= 0 ? "is-up" : "is-down") : (v == null ? "is-empty" : ""));
              if (c.cls && typeof v === "number") tc += " " + (c.cls(v, r) || "");
              var td = h("td", tc, c.type === "text" ? (v == null ? "" : String(v)) : cellText(c, v)); td.dataset.col = c.id; if (c.type === "text" && v != null && String(v).length > 28) td.title = String(v); row.appendChild(td);
            });
            tb.appendChild(row);
          });
          t.appendChild(tb); sc.appendChild(t); el.body.appendChild(sc); if (S.cfg.tables[sec.id]) K.applyHl(t, S.cfg.tables[sec.id]);
          if (sec.note) el.body.appendChild(h("p", "inni-note", sec.note));
        } else if (sec.type === "text") {
          (sec.paras || []).forEach(function (p) { el.body.appendChild(h("p", "inni-note", p)); });
        }
      });
    }
    function render() {
      el.title.textContent = S.view.title || def.title; if (S.view.unit) el.unit.textContent = S.view.unit;
      el.notice.hidden = !S.view.notice; el.notice.textContent = S.view.notice || "";
      renderComments(); renderBody();
    }
    function rebuildView() { S.view = def.view(S.data, ctx); render(); }

    // ----- 실행 -----
    function run(force) {
      if (S.busy && !force) return Promise.resolve();
      S.busy = true; var seq = ++S.runSeq; showMsg("");
      el.body.classList.add("is-loading");
      return def.load(ctx).then(function (data) {
        if (seq !== S.runSeq) return; S.data = data; S.view = def.view(data, ctx); render();
      }).catch(function (e) { if (window.console) console.error("[board " + def.id + "]", (e && e.message) || e); showMsg(friendly(e)); }).then(function () { S.busy = false; el.body.classList.remove("is-loading"); });
    }
    function start() {
      if (S.started) { Object.keys(S.charts).forEach(function (k) { if (S.charts[k]) S.charts[k].resize(); }); return; }
      S.started = true; build();
      window.dyAuth.requireLogin().then(function (sess) {
        if (!sess) { S.started = false; return; }
        return Promise.all([def.setup ? def.setup(B) : Promise.resolve([]), loadCfg()]).then(function (r) {
          el.ctrls.innerHTML = "";
          (r[0] || []).forEach(function (c) {
            S.ctrl[c.id] = c.value; var lab = h("label", "dash-bar-item"), sel = h("select"); lab.appendChild(h("span", null, c.label));
            c.options.forEach(function (o) { var op = h("option", null, o[1]); op.value = String(o[0]); sel.appendChild(op); }); sel.value = String(c.value);
            sel.addEventListener("change", function () { S.ctrl[c.id] = sel.value; if (def.onChange) def.onChange(c.id, ctx); run(true); });
            lab.appendChild(sel); el.ctrls.appendChild(lab);
          });
          return run(true);
        });
      }).catch(function (e) { S.started = false; build(); showMsg(friendly(e)); });
    }

    // ----- 모달 -----
    function modal(label, cls, buildFn) {
      var prev = document.activeElement, ov = h("div", "inni-modal"), card = h("div", "inni-modal-card " + (cls || ""));
      ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", label);
      function close() { document.removeEventListener("keydown", onKey, true); if (ov.parentNode) ov.parentNode.removeChild(ov); if (prev && prev.focus) prev.focus(); }
      function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
      var first = buildFn(card, close); ov.appendChild(card); document.body.appendChild(ov);
      document.addEventListener("keydown", onKey, true); ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); }); if (first && first.focus) first.focus();
    }
    function openHelp() {
      modal(def.label + " 설명", "is-wide inni-help", function (card, close) {
        card.appendChild(h("h3", null, def.label + " 설명"));
        (def.help || []).forEach(function (sec) { card.appendChild(h("h4", null, sec[0])); var ul = h("ul"); sec[1].forEach(function (t) { ul.appendChild(h("li", null, t)); }); card.appendChild(ul); });
        var acts = h("div", "inni-modal-acts"), ok = h("button", "dash-btn is-primary", "닫기"); ok.type = "button"; acts.appendChild(h("span", "inni-gap")); acts.appendChild(ok); card.appendChild(acts); ok.addEventListener("click", close); return ok;
      });
    }
    function openSettings() {
      var tables = (S.view.sections || []).filter(function (s) { return s.type === "table"; }).map(function (s) {
        var tc = s.cols.filter(function (c) { return c.type === "text"; })[0];
        return { key: s.id, title: s.title, rows: s.rows.slice(0, 60).map(function (r) { return [String(r.id), String(r.vals[tc ? tc.id : "name"] != null ? r.vals[tc ? tc.id : "name"] : r.id).slice(0, 30)]; }),
          cols: s.cols.filter(function (c) { return c.type !== "text"; }).map(function (c) { return [c.id, c.label]; }), scroll: s.rows.length > 12 };
      });
      var cfg = {};
      tables.forEach(function (t) { cfg[t.key] = S.cfg.tables[t.key] || K.normSpec(null); });
      (def.selects || []).forEach(function (sl) { cfg[sl.key] = S.cfg.sel[sl.key]; });
      K.openSettings({
        title: "설정 · " + def.label, desc: "코멘트는 화면마다, 강조와 그래프는 이 보드 전체에 저장돼요. 모두가 같이 봐요.",
        report: "board_" + def.id, fy: SETTINGS_FY, note: { ym: key(), body: S.note ? S.note.body : "", label: def.label }, cfg: cfg,
        tables: tables, selects: def.selects || [], chartNote: def.chartNote || "", colors: window.dyColors.boardCharts(def.id, S.charts, S.view.sections),
        rpc: rpc, toast: toast, friendly: friendly,
        onNote: function (c) { showManual(c); },
        onCfg: function (draft) { S.cfg = normCfg(draft); ctx.cfg = S.cfg; if (S.data) rebuildView(); }
      });
    }
    // ----- 엑셀 -----
    function exportXlsx() {
      if (!S.view || S.busy) return;
      el.xlsx.disabled = true; var old = el.xlsx.textContent; el.xlsx.textContent = "만드는 중…";
      K.loadExcelJs().then(function () {
        var wb = new window.ExcelJS.Workbook(); wb.creator = "DY-AI"; wb.created = new Date();
        var ws = wb.addWorksheet(def.label.slice(0, 28), { views: [{ showGridLines: false }] });
        ws.columns = [{ width: 34 }].concat(Array.apply(null, Array(15)).map(function () { return { width: 13 }; }));
        var r = K.writeHead(ws, 2, { eyebrow: (def.eyebrow || def.label).toUpperCase(), title: S.view.title || def.title, unit: S.view.unit || def.unit || "", width: 12, noComment: true });
        r = K.writeComment(ws, r, { title: "코멘트", lines: S.view.comments, note: S.note, width: 12 }) + 1;
        (S.view.sections || []).forEach(function (sec) {
          if (sec.type === "kpi") {
            r = K.writeTable(ws, r, { title: sec.title || "핵심 지표", cols: [{ id: "l", label: "지표", text: true }, { id: "v", label: "값", text: true }, { id: "s", label: "비교", text: true }],
              rows: sec.items.map(function (it, i) { return { id: i, vals: { l: it.label, v: it.value, s: it.sub || "" } }; }) });
          } else if (sec.type === "chart") {
            ws.getCell(r, 1).value = sec.title; ws.getCell(r, 1).font = { size: 12, bold: true }; r++;
            ws.addImage(K.imageOf(wb, cfgOf(sec, true), 900, 320), { tl: { col: 0, row: r - 1 }, ext: { width: 900, height: 320 } }); r += 17;
          } else if (sec.type === "table") {
            var cols = sec.cols.map(function (c) { return { id: c.id, label: c.label, type: XT[c.type] || "int", text: c.type === "text" }; });
            r = K.writeTable(ws, r, { title: sec.title, cols: cols, hl: S.cfg.tables[sec.id],
              rows: sec.rows.map(function (row) { var vals = {}; sec.cols.forEach(function (c) { vals[c.id] = xlVal(c, row.vals[c.id]); }); return { id: row.id, vals: vals, strong: row.strong }; }) });
            if (sec.note) { ws.mergeCells(r - 1, 1, r - 1, 12); ws.getCell(r - 1, 1).value = sec.note; ws.getCell(r - 1, 1).font = { size: 9, color: { argb: K.XL.sub } }; ws.getCell(r - 1, 1).alignment = { wrapText: true, vertical: "top" }; ws.getRow(r - 1).height = 30; r++; }
          }
        });
        ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
        var stamp = (S.ctrl.month || S.ctrl.base || key()).toString().slice(0, 7);
        return K.download(wb, "Qoo10_" + def.id + "_" + stamp + ".xlsx", toast);
      }).catch(function (e) { showMsg("엑셀을 만들지 못했어요: " + ((e && e.message) || e)); }).then(function () { el.xlsx.disabled = false; el.xlsx.textContent = old; });
    }

    // 테마가 바뀌면 그래프를 다시 그린다
    document.addEventListener("dy:theme", function () { if (S.view && S.started) renderBody(); });
    document.addEventListener("dycolors:change", function () { if (S.view && S.started) renderBody(); });
    return { start: start, S: S };
  }

  // ---------- 탭 연결 ----------
  function paneOf(id) { return document.querySelector('.board-pane[data-bpane="' + id + '"]'); }
  function show(id) {
    if (!B.defs[id]) return;
    var p = paneOf(id); if (!p) return;
    if (!B.inst[id]) B.inst[id] = Board(B.defs[id], p);
    B.inst[id].start();
  }
  B.show = show;
  document.addEventListener("board:show", function (e) { show(e.detail.id); });
  // 보드 스크립트가 모두 등록된 뒤(맨 마지막 보드 파일이 B.ready() 를 부름)에 처음 주소가 보드를 가리키면 연다
  B.ready = function () { var m = /^#board\/([a-z]+)/.exec(location.hash || ""); if (m) show(m[1]); };
})();

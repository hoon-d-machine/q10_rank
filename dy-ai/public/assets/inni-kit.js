/* inni 탭 공용 도구: 설정 모달(코멘트 · 강조 · 그래프) + 표 강조 적용 + 엑셀(ExcelJS) 만들기 도우미
 * ONSITE AD · MEGAPO 가 쓴다 (SALES · PRODUCT 는 자기 파일 안에 같은 기능이 따로 있다). window.dyInniKit 로 내보냄.
 *
 * openSettings(o): 설정 모달
 *   o.title, o.desc, o.report('onsite'|'megapo'|'megawari'), o.fy
 *   o.note   : { ym: 'YYYY-MM-01', body, label } | null      코멘트 탭 (null 이면 탭 없음)
 *   o.notes  : [{ key, label, ym, report, body }]               코멘트가 여러 칸(예: 요약·일별·제품별·PV)일 때 — 있으면 o.note 대신 쓴다. 칸마다 report 이름이 따로다
 *   o.cfg    : 현재 설정 객체 { <표키>: { rows:[], cols:[], color }, <선택키>: 값 }
 *   o.tables : [{ key, title, rows:[[id, 이름]], cols:[[id, 이름]], scroll }]    강조 탭
 *   o.selects: [{ key, label, options:[[값, 이름]] }]                           그래프 탭 (o.chartNote: 안내 문구)
 *   o.rpc(name, args) → Promise, o.toast(msg), o.friendly(err)
 *   o.onNote(c, key)  : 코멘트 저장 후 (key 는 o.notes 의 칸 이름), o.onCfg(draft) : 설정 저장 후 (화면 갱신)
 * 엑셀: loadExcelJs() → ExcelJS, header/comment/table 쓰기 도우미, imageOf(wb, chartConfig, w, h), download(wb, 파일명)
 */
(function () {
  "use strict";
  var DEFAULT_HL = "#fff2b8";
  var PRESETS = ["#fff2b8", "#d9f2e0", "#d6e6ff", "#ffd9d6", "#e8dcff", "#ffe3c2"];
  var EXCELJS = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";

  function h(tag, c, text) { var e = document.createElement(tag); if (c) e.className = c; if (text != null) e.textContent = text; return e; }
  function normSpec(x) {
    x = x || {};
    return { rows: Array.isArray(x.rows) ? x.rows.map(String) : [], cols: Array.isArray(x.cols) ? x.cols.map(String) : [], color: /^#[0-9a-f]{6}$/i.test(x.color || "") ? x.color : DEFAULT_HL };
  }
  // table 의 tr[data-id] / td·th[data-col] 에 강조 색을 입힌다
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

  // ---------- 설정 모달 ----------
  function openSettings(o) {
    var prev = document.activeElement, draft = JSON.parse(JSON.stringify(o.cfg)), cfg0 = JSON.stringify(o.cfg);
    var notes = o.notes || (o.note ? [{ key: "", label: o.note.label, ym: o.note.ym, report: o.report, body: o.note.body || "" }] : []);
    var ov = h("div", "inni-modal"), card = h("div", "inni-modal-card is-wide");
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "설정");
    card.appendChild(h("h3", null, o.title)); card.appendChild(h("p", null, o.desc));
    var tabs = h("div", "inni-mtabs"); tabs.setAttribute("role", "tablist");
    var panels = {}, tabBtns = {}, order = [];
    var defs = []; if (notes.length) defs.push(["note", "코멘트"]); if (o.tables && o.tables.length) defs.push(["hl", "강조"]); if (o.selects && o.selects.length) defs.push(["chart", "그래프"]);
    defs.forEach(function (t) {
      var b = h("button", "inni-mtab", t[1]); b.type = "button"; b.setAttribute("role", "tab"); tabBtns[t[0]] = b; tabs.appendChild(b); order.push(t[0]);
      var p = h("div", "inni-mpanel"); p.setAttribute("role", "tabpanel"); panels[t[0]] = p;
    });
    card.appendChild(tabs);

    var tas = [];
    if (notes.length) {
      panels.note.appendChild(h("p", null, (o.note ? (o.note.label || "") + " 리포트의 " : "") + "직접 입력 코멘트예요. 자동 코멘트 아래에 같이 보여요. 비우고 저장하면 지워져요."));
      notes.forEach(function (n) {
        if (notes.length > 1) panels.note.appendChild(h("h5", null, n.label));
        var t = h("textarea"); t.maxLength = 4000; t.value = n.body || ""; t.setAttribute("aria-label", n.label || "코멘트"); if (notes.length > 1) t.style.minHeight = "84px";
        panels.note.appendChild(t); tas.push([n, t]);
      });
    }
    (o.tables || []).forEach(function (td) {
      if (!draft[td.key]) draft[td.key] = normSpec(null);
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
    if (panels.chart) {
      if (o.chartNote) panels.chart.appendChild(h("p", null, o.chartNote));
      o.selects.forEach(function (grp) {
        panels.chart.appendChild(h("h5", null, grp.label));
        var rd = h("div", "inni-radios");
        grp.options.forEach(function (op) {
          var lab = h("label"), r = h("input"); r.type = "radio"; r.name = "inni-k-" + grp.key; r.value = op[0]; r.checked = draft[grp.key] === op[0];
          r.addEventListener("change", function () { if (r.checked) draft[grp.key] = op[0]; });
          lab.appendChild(r); lab.appendChild(document.createTextNode(op[1])); rd.appendChild(lab);
        });
        panels.chart.appendChild(rd);
      });
    }
    order.forEach(function (t) { card.appendChild(panels[t]); });
    function showTab(t) { order.forEach(function (x) { panels[x].hidden = x !== t; tabBtns[x].setAttribute("aria-selected", String(x === t)); }); if (t === "note" && tas.length) tas[0][1].focus(); }
    order.forEach(function (t) { tabBtns[t].addEventListener("click", function () { showTab(t); }); });
    var err = h("div", "inni-modal-err"); card.appendChild(err);
    var acts = h("div", "inni-modal-acts"), gap = h("span", "inni-gap"), cancel = h("button", "dash-btn", "취소"), save = h("button", "dash-btn is-primary", "저장");
    cancel.type = save.type = "button"; [gap, cancel, save].forEach(function (x) { acts.appendChild(x); });
    card.appendChild(acts); ov.appendChild(card); document.body.appendChild(ov); showTab(order[0]);

    function close() { document.removeEventListener("keydown", onKey, true); if (ov.parentNode) ov.parentNode.removeChild(ov); if (prev && prev.focus) prev.focus(); }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); } }
    function commit() {
      var jobs = [], changed = tas.filter(function (x) { return x[1].value !== (x[0].body || ""); }), cfgChanged = JSON.stringify(draft) !== cfg0;
      if (!changed.length && !cfgChanged) { close(); return; }
      save.disabled = true; err.textContent = "";
      changed.forEach(function (x) { jobs.push(o.rpc("dy_inni_comment_set", { p_report: x[0].report, p_ym: x[0].ym, p_body: x[1].value }).then(function (c) { if (o.onNote) o.onNote(c, x[0].key); })); });
      if (cfgChanged) jobs.push(o.rpc("dy_inni_settings_set", { p_report: o.report, p_fy: o.fy, p_config: draft }).then(function () { if (o.onCfg) o.onCfg(draft); }));
      Promise.all(jobs).then(function () { o.toast("설정을 저장했어요"); close(); }).catch(function (e) { err.textContent = o.friendly(e); save.disabled = false; });
    }
    document.addEventListener("keydown", onKey, true);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    cancel.addEventListener("click", close); save.addEventListener("click", commit);
  }

  // ---------- 엑셀 ----------
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
  // 열 종류별 엑셀 서식: text | int | gr(증감률, 값은 %) | pct1(%, 소수 1자리) | pct(%, 정수)
  var XFMT = { int: "#,##0", gr: "+0%;-0%;0%", pct1: "0.0%", pct: "0%" };
  function xv(type, v) { return v == null ? null : (type === "gr" || type === "pct1" || type === "pct") ? v / 100 : v; }

  // 머리글(눈썹글·제목·단위) + 코멘트(자동·직접 입력). 반환: 다음 행 번호
  function writeHead(ws, r, o) {
    var C = function (rr, c) { return ws.getCell(rr, c); }, W = o.width || 12, c;
    C(r, 1).value = o.eyebrow; C(r, 1).font = { size: 9, bold: true, color: { argb: "FF0072E4" } }; r++;
    ws.mergeCells(r, 1, r, W); C(r, 1).value = o.title; C(r, 1).font = { size: 20, bold: true }; ws.getRow(r).height = 30; r++;
    ws.mergeCells(r, 1, r, W); C(r, 1).value = o.unit; C(r, 1).font = { size: 9, color: { argb: XL.sub } }; r += 2;
    if (o.noComment) return r + 1;
    return writeComment(ws, r, { title: "코멘트", lines: o.lines, note: o.note, width: W }) + 1;
  }
  // 코멘트 한 칸(제목 + 자동 코멘트 줄 + 직접 입력). 반환: 다음 행 번호
  function writeComment(ws, r, o) {
    var C = function (rr, c) { return ws.getCell(rr, c); }, W = o.width || 12, c;
    C(r, 1).value = o.title; C(r, 1).font = { size: 12, bold: true };
    for (c = 1; c <= W; c++) C(r, c).border = { bottom: { style: "medium", color: { argb: "FF1F3A5F" } } };
    r++;
    (o.lines || []).forEach(function (l) {
      ws.mergeCells(r, 1, r, W); var cc = C(r, 1); cc.value = "· " + l.t; cc.alignment = { vertical: "middle", wrapText: true };
      cc.font = { size: 11, bold: !!l.c, color: { argb: l.c === "is-neg" ? XL.down : l.c === "is-pos" ? XL.up : "FF222222" } }; ws.getRow(r).height = 20 + (l.t.length > 90 ? 16 : 0); r++;
    });
    if (o.note) {
      ws.mergeCells(r, 1, r, W); var nc = C(r, 1); nc.value = o.note.body; nc.alignment = { vertical: "top", wrapText: true }; nc.font = { size: 11 }; nc.fill = fill("FFF7F7F7");
      var lines = o.note.body.split("\n").reduce(function (a, ln) { return a + Math.max(1, Math.ceil(ln.length / 100)); }, 0);
      ws.getRow(r).height = Math.max(20, lines * 16 + 6); r++;
      ws.mergeCells(r, 1, r, W); C(r, 1).value = "직접 입력 · " + (o.note.by || "") + (o.note.at ? " · " + String(o.note.at).slice(0, 16).replace("T", " ") : ""); C(r, 1).font = { size: 9, color: { argb: XL.sub } }; r++;
    }
    return r;
  }
  // 표 쓰기. spec: { title, cols:[{id,label,type,text,align}], rows:[{id, vals:{열id:값}, strong, hidden}], hl:{rows,cols,color}, foot:true 이면 마지막 행을 합계 줄로 }
  function writeTable(ws, r, spec) {
    var C = function (rr, c) { return ws.getCell(rr, c); }, thin = { style: "thin", color: { argb: XL.line } }, cols = spec.cols, hl = spec.hl || { rows: [], cols: [], color: DEFAULT_HL };
    if (spec.title) { C(r, 1).value = spec.title; C(r, 1).font = { size: 12, bold: true }; r++; }
    cols.forEach(function (cd, ci) {
      var hh = C(r, ci + 1); hh.value = cd.label; hh.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 }; hh.fill = fill(XL.head);
      hh.alignment = { horizontal: ci === 0 || cd.text ? "left" : "center", vertical: "middle", wrapText: true };
      if (hl.cols.indexOf(cd.id) >= 0 && !cd.text) { hh.fill = fill(argb(hl.color)); hh.font = { bold: true, size: 10, color: { argb: "FF1B1B1B" } }; }
    });
    ws.getRow(r).height = 20; r++;
    spec.rows.forEach(function (row) {
      var rowHl = row.id != null && hl.rows.indexOf(String(row.id)) >= 0;
      cols.forEach(function (cd, ci) {
        var cc = C(r, ci + 1), v = row.vals[cd.id], ty = row.type || cd.type;
        if (cd.text) { cc.value = v == null ? null : v; cc.alignment = { horizontal: "left", vertical: "middle" }; cc.font = { size: 10, bold: !!row.strong }; }
        else {
          cc.value = typeof v === "string" ? v : xv(ty, v); cc.numFmt = XFMT[ty] || XFMT.int; cc.alignment = { horizontal: "right", vertical: "middle" };
          cc.font = { size: 10, bold: !!row.strong, color: { argb: ty === "gr" && typeof v === "number" ? (v >= 0 ? XL.up : XL.down) : "FF222222" } };
        }
        if (rowHl || hl.cols.indexOf(cd.id) >= 0) { cc.fill = fill(argb(hl.color)); cc.font = { size: 10, bold: rowHl || !!row.strong, color: { argb: "FF1B1B1B" } }; }
        cc.border = row.strong ? { top: { style: "thin", color: { argb: "FF888888" } }, bottom: thin } : { bottom: thin };
      });
      ws.getRow(r).height = 18; r++;
    });
    return r + 1;
  }
  // Chart.js 설정으로 그림 만들어 통합문서에 넣고 id 를 돌려준다 (흰 배경, 화면 크기와 무관하게 고정 크기)
  function imageOf(wb, cfg, w, hh) {
    var cv = document.createElement("canvas"); cv.width = w; cv.height = hh; cv.style.cssText = "position:fixed;left:-3000px;top:0;width:" + w + "px;height:" + hh + "px";
    document.body.appendChild(cv);
    cfg.plugins = (cfg.plugins || []).concat([{ id: "bg", beforeDraw: function (ch) { var x = ch.ctx; x.save(); x.globalCompositeOperation = "destination-over"; x.fillStyle = "#ffffff"; x.fillRect(0, 0, ch.width, ch.height); x.restore(); } }]);
    cfg.options = cfg.options || {}; cfg.options.responsive = false; cfg.options.devicePixelRatio = 1; cfg.options.animation = false;
    var tmp = new window.Chart(cv, cfg); tmp.update("none");
    var id = wb.addImage({ base64: tmp.toBase64Image("image/png", 1), extension: "png" });
    tmp.destroy(); document.body.removeChild(cv); return id;
  }
  function download(wb, filename, toast) {
    return wb.xlsx.writeBuffer().then(function (buf) {
      var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
      if (toast) toast("엑셀을 내려받았어요");
    });
  }

  window.dyInniKit = { DEFAULT_HL: DEFAULT_HL, PRESETS: PRESETS, normSpec: normSpec, applyHl: applyHl, openSettings: openSettings,
    loadExcelJs: loadExcelJs, XL: XL, argb: argb, fill: fill, xv: xv, writeHead: writeHead, writeComment: writeComment, writeTable: writeTable, imageOf: imageOf, download: download };
})();

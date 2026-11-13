/* 대시보드 '상품코드관리' 탭: 상품번호 · 상품명 · 라인 · 카테고리 · 비고 를 보고 고친다
 *   - 데이터(판매·PV·광고·찜)에 새 상품번호가 들어오면 DB 가 자동으로 등록한다(상품명·라인·카테고리는 비어 있음 → '신규'로 위에 모아 보여 줌)
 *   - 표에서 바로 고치거나, 엑셀에서 복사해 붙여넣어 여러 건을 한 번에 등록·수정한다 (헤더가 있으면 열 이름으로, 없으면 위 순서로)
 *   - 읽기 dy_codes_list · 저장 dy_codes_save · 삭제 dy_codes_delete (권한 dash.codes / edit.codes 를 DB 가 확인)
 * 열: gd_no(상품번호) · product_name(상품명, 화면·엑셀에 쓰는 이름) · line(라인) · category(카테고리) · note(비고) / 참고용: 원본 상품명 · 마지막 판매일
 */
(function () {
  "use strict";
  var pane = document.querySelector("#view-codes");
  if (!pane) return;
  var $ = function (s) { return pane.querySelector(s); };
  var el = { q: $(".js-c-q"), filter: $(".js-c-filter"), add: $(".js-c-add"), paste: $(".js-c-paste"), xlsx: $(".js-c-xlsx"), save: $(".js-c-save"), undo: $(".js-c-undo"),
    del: $(".js-c-del"), reload: $(".js-c-reload"), msg: $(".js-c-msg"), count: $(".js-c-count"), body: $(".js-c-body"), more: $(".js-c-more"), all: $(".js-c-all") };
  var FIELDS = ["product_name", "line", "category", "note"];
  var LABEL = { gd_no: "상품번호", product_name: "상품명", line: "라인", category: "카테고리", note: "비고" };
  var PAGE = 200;
  var S = { rows: [], by: {}, edits: {}, added: [], sel: {}, shown: PAGE, loaded: false, busy: false, canEdit: true };

  function h(tag, c, text) { var e = document.createElement(tag); if (c) e.className = c; if (text != null) e.textContent = text; return e; }
  function toast(m, ms) { if (window.dyToast) window.dyToast(m, ms || 3500); }
  function showMsg(t) { el.msg.textContent = t || ""; el.msg.hidden = !t; }
  function rpc(name, args) { return window.dyAuth.client.rpc(name, args || {}).then(function (r) { if (r.error) throw new Error(r.error.message); return r.data; }); }
  function friendly(e) { var m = String((e && e.message) || e || ""); return /no permission/i.test(m) ? "권한이 없어요" : /login required/i.test(m) ? "다시 로그인해 주세요" : m; }
  function val(v) { return v == null ? "" : String(v); }
  function cur(r, f) { var e = S.edits[r.gd_no]; return e && f in e ? e[f] : val(r[f]); }
  function dirtyCount() { return Object.keys(S.edits).length + S.added.filter(function (a) { return a.gd_no.trim(); }).length; }

  // ---------- 불러오기 ----------
  function load() {
    if (S.busy) return Promise.resolve();
    S.busy = true; showMsg(""); el.body.innerHTML = '<tr><td colspan="9" class="codes-empty">불러오는 중…</td></tr>';
    return rpc("dy_codes_list").then(function (rows) {
      S.rows = rows || []; S.by = {}; S.rows.forEach(function (r) { S.by[r.gd_no] = r; });
      S.edits = {}; S.added = []; S.sel = {}; S.shown = PAGE; S.loaded = true;
      render();
    }).catch(function (e) { el.body.innerHTML = '<tr><td colspan="9" class="codes-empty">불러오지 못했어요</td></tr>'; showMsg(friendly(e)); })
      .then(function () { S.busy = false; });
  }

  // ---------- 표 ----------
  function matches(r, q, f) {
    var unclass = !val(cur(r, "line")).trim() || !val(cur(r, "category")).trim();
    if (f === "new" && !r.auto_added) return false;
    if (f === "unclass" && !unclass) return false;
    if (f === "dirty" && !S.edits[r.gd_no]) return false;
    if (!q) return true;
    var hay = [r.gd_no, cur(r, "product_name"), cur(r, "line"), cur(r, "category"), cur(r, "note"), r.src_name].join(" ").toLowerCase();
    return q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  }
  function cellInput(val0, onChange, ph, dis) {
    var i = h("input"); i.type = "text"; i.value = val0; i.maxLength = 200; if (ph) i.placeholder = ph; i.disabled = !!dis; i.addEventListener("input", function () { onChange(i.value, i); }); return i;
  }
  function setEdit(r, f, v, input) {
    var base = val(r[f]), e = S.edits[r.gd_no] || (S.edits[r.gd_no] = {});
    if (v === base) delete e[f]; else e[f] = v;
    if (!Object.keys(e).length) delete S.edits[r.gd_no];
    if (input && input.closest("tr")) input.closest("tr").classList.toggle("is-dirty", !!S.edits[r.gd_no]);
    updateBar();
  }
  function render() {
    var q = el.q.value.trim().toLowerCase(), f = el.filter.value, list = S.rows.filter(function (r) { return matches(r, q, f); });
    var tb = el.body; tb.innerHTML = "";
    // 새로 추가한 행(저장 전)은 맨 위
    S.added.forEach(function (a, i) {
      var tr = h("tr", "is-dirty is-add"), td0 = h("td", "c-chk"); tr.appendChild(td0);
      tr.appendChild(h("td", null, "추가"));
      var td = h("td"); td.appendChild(cellInput(a.gd_no, function (v) { a.gd_no = v; updateBar(); }, "상품번호")); tr.appendChild(td);
      FIELDS.forEach(function (fl) { var t = h("td"); t.appendChild(cellInput(a[fl] || "", function (v) { a[fl] = v; }, LABEL[fl])); tr.appendChild(t); });
      tr.appendChild(h("td", "c-ref", "")); tr.appendChild(h("td", "c-ref", ""));
      var rm = h("button", "dash-btn", "취소"); rm.type = "button"; rm.addEventListener("click", function () { S.added.splice(i, 1); render(); });
      var tdr = h("td"); tdr.appendChild(rm); tr.appendChild(tdr);
      tb.appendChild(tr);
    });
    list.slice(0, S.shown).forEach(function (r) {
      var tr = h("tr", (S.edits[r.gd_no] ? "is-dirty " : "") + (r.auto_added ? "is-new" : "")), tdc = h("td", "c-chk"), cb = h("input"); cb.type = "checkbox"; cb.checked = !!S.sel[r.gd_no]; cb.disabled = !S.canEdit;
      cb.addEventListener("change", function () { if (cb.checked) S.sel[r.gd_no] = 1; else delete S.sel[r.gd_no]; updateBar(); }); tdc.appendChild(cb); tr.appendChild(tdc);
      var st = h("td"); if (r.auto_added) st.appendChild(h("span", "codes-badge", "신규")); tr.appendChild(st);
      tr.appendChild(h("td", "c-no", r.gd_no));
      FIELDS.forEach(function (fl) {
        var t = h("td"); t.appendChild(cellInput(cur(r, fl), function (v, inp) { setEdit(r, fl, v, inp); }, fl === "product_name" && r.src_name ? r.src_name : "", !S.canEdit)); tr.appendChild(t);
      });
      var ref = h("td", "c-ref", val(r.src_name)); ref.title = val(r.src_name); tr.appendChild(ref);
      tr.appendChild(h("td", "c-ref", val(r.last_date).slice(0, 10)));
      tr.appendChild(h("td"));
      tb.appendChild(tr);
    });
    if (!list.length && !S.added.length) tb.innerHTML = '<tr><td colspan="9" class="codes-empty">' + (S.rows.length ? "조건에 맞는 상품이 없어요." : "등록된 상품코드가 없어요.") + "</td></tr>";
    el.more.hidden = list.length <= S.shown;
    el.more.textContent = "더 보기 (" + Math.min(PAGE, list.length - S.shown) + "개, 전체 " + list.length + "개 중 " + S.shown + "개 표시 중)";
    updateBar(list.length);
  }
  function updateBar(n) {
    var d = dirtyCount(), sel = Object.keys(S.sel).length, newN = S.rows.filter(function (r) { return r.auto_added; }).length;
    el.save.disabled = !S.canEdit || !d || S.busy; el.save.textContent = d ? "저장 (" + d + "건)" : "저장";
    el.undo.disabled = !d; el.del.disabled = !S.canEdit || !sel; el.del.textContent = sel ? "선택 삭제 (" + sel + ")" : "선택 삭제";
    el.add.disabled = !S.canEdit; el.paste.disabled = !S.canEdit;
    if (n != null || !el.count.textContent) el.count.textContent = "전체 " + S.rows.length + "개" + (newN ? " · 신규(자동 등록) " + newN + "개" : "") + (n != null && n !== S.rows.length ? " · 조건에 맞는 " + n + "개" : "");
  }

  // ---------- 저장 · 삭제 ----------
  function chunks(arr, n) { var o = []; for (var i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; }
  function saveRows(rows) {
    return chunks(rows, 500).reduce(function (p, c) { return p.then(function (acc) { return rpc("dy_codes_save", { p_rows: c }).then(function (r) { acc.inserted += r.inserted; acc.updated += r.updated; return acc; }); }); }, Promise.resolve({ inserted: 0, updated: 0 }));
  }
  function save() {
    var rows = [];
    for (var i = 0; i < S.added.length; i++) {
      var a = S.added[i], g = a.gd_no.trim();
      if (!g) continue;
      if (!/^[0-9A-Za-z_-]{1,40}$/.test(g)) { showMsg("상품번호 형식이 올바르지 않아요: " + g); return; }
      var o = { gd_no: g }; FIELDS.forEach(function (f) { o[f] = a[f] || ""; }); rows.push(o);
    }
    Object.keys(S.edits).forEach(function (gd) { var o = { gd_no: gd }; Object.keys(S.edits[gd]).forEach(function (f) { o[f] = S.edits[gd][f]; }); rows.push(o); });
    if (!rows.length) return;
    S.busy = true; updateBar(); showMsg("");
    saveRows(rows).then(function (r) { toast("저장했어요 · 새로 " + r.inserted + "건 · 수정 " + r.updated + "건"); S.busy = false; return load(); })
      .catch(function (e) { S.busy = false; updateBar(); showMsg("저장하지 못했어요: " + friendly(e)); });
  }
  function del() {
    var ids = Object.keys(S.sel);
    if (!ids.length) return;
    window.dyModal({ tone: "warn", title: ids.length + "개 상품코드를 삭제할까요?", body: [ids.slice(0, 5).join(", ") + (ids.length > 5 ? " 외 " + (ids.length - 5) + "개" : ""),
      { note: "코드표에서만 지워지고 판매 데이터는 그대로예요. 그 상품번호가 데이터에 다시 들어오면 ‘신규’로 다시 자동 등록돼요." }],
      actions: [{ label: "삭제", value: "ok", kind: "primary" }, { label: "취소", value: null, kind: "quiet" }] }).then(function (v) {
      if (v !== "ok") return;
      rpc("dy_codes_delete", { p_gd_nos: ids }).then(function (n) { toast(n + "개 삭제했어요"); return load(); }).catch(function (e) { showMsg("삭제하지 못했어요: " + friendly(e)); });
    });
  }

  // ---------- 엑셀 붙여넣기 ----------
  var HEAD = { "상품번호": "gd_no", "상품 번호": "gd_no", "gd_no": "gd_no", "상품코드": "gd_no", "상품명": "product_name", "제품명": "product_name", "product_name": "product_name",
    "라인": "line", "제품명 라인": "line", "제품명라인": "line", "제품라인": "line", "line": "line", "카테고리": "category", "category": "category", "비고": "note", "note": "note", "메모": "note" };
  function parseTsv(text) {
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"' && !cell) q = true;
      else if (ch === "\t") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some(function (x) { return x.trim() !== ""; })) rows.push(row); row = []; }
      else cell += ch;
    }
    row.push(cell); if (row.some(function (x) { return x.trim() !== ""; })) rows.push(row);
    return rows;
  }
  // → { rows:[{gd_no, …}], errors:[문자열], mapped:[열이름…], header:boolean }
  function interpret(text) {
    var grid = parseTsv(text), errors = [], order = ["gd_no", "product_name", "line", "category", "note"], header = false;
    if (!grid.length) return { rows: [], errors: [], mapped: order, header: false };
    var first = grid[0].map(function (x) { return HEAD[x.trim().toLowerCase()] || HEAD[x.trim()] || null; });
    if (first.indexOf("gd_no") >= 0) { header = true; order = first; grid = grid.slice(1); }
    else if (grid[0].length >= 6) order = ["gd_no", null, "product_name", "line", "category", "note"];   // 상품번호 · (원본)상품명 · 이름 · 라인 · 카테고리 · 비고 형태
    var seen = {}, rows = [];
    grid.forEach(function (c, i) {
      var o = {}; order.forEach(function (f, k) { if (f && k < c.length) o[f] = c[k].trim(); });
      var g = (o.gd_no || "").replace(/\.0$/, "");
      if (!g) { errors.push((i + 1 + (header ? 1 : 0)) + "행: 상품번호가 비어 있어요"); return; }
      if (!/^[0-9A-Za-z_-]{1,40}$/.test(g)) { errors.push((i + 1 + (header ? 1 : 0)) + "행: 상품번호 형식이 올바르지 않아요 (" + g.slice(0, 20) + ")"); return; }
      o.gd_no = g;
      if (seen[g] != null) { rows[seen[g]] = o; errors.push("상품번호 " + g + " 가 여러 번 있어서 마지막 줄을 썼어요"); return; }
      seen[g] = rows.length; rows.push(o);
    });
    return { rows: rows, errors: errors, mapped: order.filter(Boolean), header: header };
  }
  function openPaste() {
    var prev = document.activeElement, ov = h("div", "inni-modal"), card = h("div", "inni-modal-card is-wide codes-modal");
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "엑셀 붙여넣기");
    card.appendChild(h("h3", null, "엑셀에서 붙여넣어 등록·수정"));
    card.appendChild(h("p", null, "엑셀에서 표를 복사(Ctrl+C)해 아래 칸에 붙여넣으세요. 첫 줄에 열 이름(상품번호 · 상품명 · 라인 · 카테고리 · 비고)이 있으면 그 순서대로, 없으면 상품번호 · 상품명 · 라인 · 카테고리 · 비고 순서로 읽어요. 이미 있는 상품번호는 수정, 없으면 새로 등록해요."));
    var ta = h("textarea"); ta.placeholder = "상품번호\t상품명\t라인\t카테고리\t비고\n1105218484\t레티놀 PDRN 세럼\t피디알엔\tSERUM\t"; ta.style.minHeight = "130px"; card.appendChild(ta);
    var opt = h("div", "codes-opt"), cb = h("input"); cb.type = "checkbox"; var lab = h("label"); lab.appendChild(cb); lab.appendChild(document.createTextNode(" 붙여넣은 칸이 비어 있으면 기존 값도 지움 (끄면 빈 칸은 그대로 둠)")); opt.appendChild(lab); card.appendChild(opt);
    var prevEl = h("div", "codes-prev"); card.appendChild(prevEl);
    var err = h("div", "inni-modal-err"), acts = h("div", "inni-modal-acts"), gap = h("span", "inni-gap"), cancel = h("button", "dash-btn", "취소"), go = h("button", "dash-btn is-primary", "반영"); cancel.type = go.type = "button"; go.disabled = true;
    card.appendChild(err); [gap, cancel, go].forEach(function (x) { acts.appendChild(x); }); card.appendChild(acts); ov.appendChild(card); document.body.appendChild(ov);
    function close() { document.removeEventListener("keydown", onKey, true); ov.remove(); if (prev && prev.focus) prev.focus(); }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
    document.addEventListener("keydown", onKey, true); cancel.addEventListener("click", close);
    var parsed = null;
    function build() {
      parsed = interpret(ta.value); prevEl.innerHTML = ""; err.textContent = "";
      var rows = parsed.rows, nNew = rows.filter(function (r) { return !S.by[r.gd_no]; }).length;
      go.disabled = !rows.length;
      if (!ta.value.trim()) return;
      prevEl.appendChild(h("p", "codes-sum", rows.length + "건 읽음 · 새로 등록 " + nNew + "건 · 수정 " + (rows.length - nNew) + "건 · 읽은 열: " + parsed.mapped.map(function (f) { return LABEL[f]; }).join(" · ") + (parsed.header ? " (첫 줄을 열 이름으로 읽음)" : "")));
      parsed.errors.slice(0, 6).forEach(function (m) { prevEl.appendChild(h("p", "codes-warn", "⚠ " + m)); });
      if (parsed.errors.length > 6) prevEl.appendChild(h("p", "codes-warn", "⚠ 외 " + (parsed.errors.length - 6) + "건"));
      var t = h("table", "codes-table codes-mini"), th = h("thead"), tr = h("tr");
      ["", "상품번호"].concat(FIELDS.map(function (f) { return LABEL[f]; })).forEach(function (x) { tr.appendChild(h("th", null, x)); }); th.appendChild(tr); t.appendChild(th);
      var tb = h("tbody"); rows.slice(0, 8).forEach(function (r) {
        var x = h("tr"); x.appendChild(h("td", null, S.by[r.gd_no] ? "수정" : "신규")); x.appendChild(h("td", "c-no", r.gd_no));
        FIELDS.forEach(function (f) { x.appendChild(h("td", null, f in r ? r[f] : "·")); }); tb.appendChild(x);
      }); t.appendChild(tb); prevEl.appendChild(t);
      if (rows.length > 8) prevEl.appendChild(h("p", "codes-more", "…외 " + (rows.length - 8) + "건"));
    }
    ta.addEventListener("input", build);
    go.addEventListener("click", function () {
      if (!parsed || !parsed.rows.length) return;
      var out = parsed.rows.map(function (r) {
        var o = { gd_no: r.gd_no };
        FIELDS.forEach(function (f) { if (f in r && (r[f] !== "" || cb.checked || !S.by[r.gd_no])) o[f] = r[f]; });
        return o;
      });
      go.disabled = true; err.textContent = "";
      saveRows(out).then(function (r) { toast("반영했어요 · 새로 " + r.inserted + "건 · 수정 " + r.updated + "건"); close(); return load(); })
        .catch(function (e) { err.textContent = "반영하지 못했어요: " + friendly(e); go.disabled = false; });
    });
    ta.focus();
  }

  // ---------- 엑셀 내려받기 ----------
  function exportXlsx() {
    if (!window.dyXlsx) return;
    var header = ["상품번호", "상품명", "라인", "카테고리", "비고", "원본 상품명", "마지막 판매일", "신규(자동 등록)"];
    var rows = S.rows.map(function (r) { return [r.gd_no, cur(r, "product_name"), cur(r, "line"), cur(r, "category"), cur(r, "note"), val(r.src_name), val(r.last_date).slice(0, 10), r.auto_added ? "신규" : ""]; });
    Promise.resolve(window.dyXlsx.buildXlsx([{ name: "상품코드", header: header, rows: rows }])).then(function (bytes) {
      var url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })), a = document.createElement("a"), d = new Date();
      a.href = url; a.download = "DY-AI_상품코드_" + d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2) + ".xlsx"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000); toast("엑셀을 내려받았어요 · " + rows.length + "개");
    }).catch(function (e) { showMsg("엑셀을 만들지 못했어요: " + friendly(e)); });
  }

  // ---------- 연결 ----------
  el.q.addEventListener("input", function () { S.shown = PAGE; render(); });
  el.filter.addEventListener("change", function () { S.shown = PAGE; render(); });
  el.more.addEventListener("click", function () { S.shown += PAGE; render(); });
  el.add.addEventListener("click", function () { S.added.unshift({ gd_no: "" }); render(); var i = el.body.querySelector("tr.is-add input"); if (i) i.focus(); });
  el.paste.addEventListener("click", openPaste);
  el.save.addEventListener("click", save);
  el.undo.addEventListener("click", function () { S.edits = {}; S.added = []; render(); });
  el.del.addEventListener("click", del);
  el.xlsx.addEventListener("click", exportXlsx);
  el.reload.addEventListener("click", function () { load(); });
  el.all.addEventListener("change", function () {
    var q = el.q.value.trim().toLowerCase(), f = el.filter.value;
    S.sel = {}; if (el.all.checked) S.rows.filter(function (r) { return matches(r, q, f); }).forEach(function (r) { S.sel[r.gd_no] = 1; });
    render();
  });
  window.addEventListener("beforeunload", function (e) { if (dirtyCount() && !pane.hidden) { e.preventDefault(); e.returnValue = ""; } });

  // 탭이 처음 열릴 때 불러옴
  document.addEventListener("inni:show", function (e) {
    if (!e.detail || e.detail.view !== "codes" || S.loaded || S.busy) return;
    var go = function () { S.canEdit = !window.dyPerm || window.dyPerm.can("edit.codes"); load(); };
    if (window.dyPerm) window.dyPerm.ready.then(go); else go();
  });
})();

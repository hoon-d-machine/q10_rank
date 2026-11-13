/* 표 열 너비 조절 (window.dyColResize): 사이트의 모든 표(헤더 한 줄짜리)의 열 경계를 끌어서 너비를 바꾼다
 *   - 헤더 오른쪽 경계를 드래그: 그 열 너비 조절 / 더블클릭: 그 표의 너비를 원래대로
 *   - 너비는 계정별로 저장 (DB dy_user_prefs 'colw', 서버 함수가 아직 없으면 이 브라우저 localStorage 에만). 다음 접속 때도 유지
 *   - 표를 식별하는 키 = 화면 + 표 종류 + 헤더 글자들(열 구성이 같으면 같은 표). 표가 다시 그려져도 저장된 너비를 다시 입힌다
 * auth.js 다음에 로드
 */
(function () {
  "use strict";
  var MIN = 40, LS = "dy.colw.", PREF = "colw";
  var saved = {}, uid = null, timer = null, queued = false, dragging = false;

  function page() { return (document.body && document.body.getAttribute("data-page")) || location.pathname.replace(/^\//, "").replace(/\.html$/, "") || "p"; }
  function kindOf(t) {
    var cls = Array.prototype.slice.call(t.classList).filter(function (c) { return c.indexOf("js-") === 0; })[0] || Array.prototype.slice.call(t.classList)[0] || "t";
    var pane = t.closest("[data-pane],[data-bpane],#view-codes,#view-dash,#view-inni");
    var pk = pane ? (pane.dataset.pane || pane.dataset.bpane || pane.id) : "";
    return pk + ":" + cls;
  }
  function headRow(t) {
    var rows = t.tHead ? t.tHead.rows : [];
    return rows.length === 1 ? rows[0] : null;   // 두 줄 이상(묶음 머리글)인 표는 열이 어긋나서 건드리지 않음
  }
  function keyOf(t, hr) {
    var sig = Array.prototype.map.call(hr.cells, function (c) { return (c.textContent || "").trim().slice(0, 12); }).join("|");
    var s = 0; for (var i = 0; i < sig.length; i++) s = (s * 31 + sig.charCodeAt(i)) >>> 0;
    return page() + "|" + kindOf(t) + "|" + hr.cells.length + "." + s.toString(36);
  }

  function ensureCols(t, n) {
    var cg = t.querySelector("colgroup[data-rz]");
    if (!cg) { cg = document.createElement("colgroup"); cg.setAttribute("data-rz", "1"); t.insertBefore(cg, t.firstChild); }
    while (cg.children.length < n) cg.appendChild(document.createElement("col"));
    while (cg.children.length > n) cg.removeChild(cg.lastChild);
    return cg;
  }
  function applyWidths(t, ws) {
    var cg = ensureCols(t, ws.length), sum = 0;
    ws.forEach(function (w, i) { cg.children[i].style.width = w + "px"; sum += w; });
    t.style.tableLayout = "fixed"; t.style.width = sum + "px"; t.style.minWidth = sum + "px"; t.setAttribute("data-rz-fixed", "1");
  }
  function clearWidths(t) {
    var cg = t.querySelector("colgroup[data-rz]"); if (cg) cg.remove();
    t.style.tableLayout = ""; t.style.width = ""; t.style.minWidth = ""; t.removeAttribute("data-rz-fixed");
  }

  // ---------- 저장 ----------
  function cacheLocal() { try { localStorage.setItem(LS + (uid || "anon"), JSON.stringify(saved)); } catch (e) {} }
  function flush() {
    timer = null; cacheLocal();
    var c = window.dyAuth && window.dyAuth.client; if (!c || !uid) return;
    c.rpc("dy_pref_set", { p_key: PREF, p_value: saved }).then(function () {}, function () {});
  }
  function persist() { if (timer) clearTimeout(timer); timer = setTimeout(flush, 800); cacheLocal(); }

  // ---------- 손잡이 ----------
  function addHandles(t, hr, key) {
    Array.prototype.forEach.call(hr.cells, function (th, i) {
      var h = document.createElement("span");
      h.className = "col-rz"; h.title = "끌어서 너비 조절 · 더블클릭하면 원래대로"; h.setAttribute("aria-hidden", "true");
      th.appendChild(h);
      if (getComputedStyle(th).position === "static") th.style.position = "relative";
      h.addEventListener("pointerdown", function (e) { start(e, t, hr, key, i, h); });
      h.addEventListener("dblclick", function (e) { e.preventDefault(); e.stopPropagation(); reset(t, key); });
      h.addEventListener("click", function (e) { e.stopPropagation(); });   // 정렬 등 헤더 클릭과 겹치지 않게
    });
  }
  function reset(t, key) { delete saved[key]; clearWidths(t); persist(); }
  function start(e, t, hr, key, idx, handle) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    // 지금 보이는 너비를 모두 고정해 두고 이 열만 바꾼다
    var ws = Array.prototype.map.call(hr.cells, function (c) { return Math.max(MIN, Math.round(c.getBoundingClientRect().width)); });
    applyWidths(t, ws);
    var x0 = e.clientX, w0 = ws[idx];
    dragging = true; handle.classList.add("is-on"); document.documentElement.classList.add("col-rz-drag");
    try { handle.setPointerCapture(e.pointerId); } catch (er) {}
    function move(ev) { ws[idx] = Math.max(MIN, Math.round(w0 + ev.clientX - x0)); applyWidths(t, ws); }
    function up() {
      handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); handle.removeEventListener("pointercancel", up);
      dragging = false; handle.classList.remove("is-on"); document.documentElement.classList.remove("col-rz-drag");
      saved[key] = ws.slice(); persist();
    }
    handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", up); handle.addEventListener("pointercancel", up);
  }

  // ---------- 표 훑기 ----------
  function scan() {
    queued = false;
    if (dragging) return;
    Array.prototype.forEach.call(document.querySelectorAll("table"), function (t) {
      var hr = headRow(t);
      if (!hr || !hr.cells.length) return;
      if (t.classList.contains("no-resize")) return;
      var key = keyOf(t, hr);
      if (!hr.querySelector(".col-rz")) addHandles(t, hr, key);
      var ws = saved[key];
      if (ws && ws.length === hr.cells.length) { if (t.getAttribute("data-rz-key") !== key || !t.hasAttribute("data-rz-fixed") || !t.querySelector("colgroup[data-rz]")) applyWidths(t, ws); }
      else if (t.hasAttribute("data-rz-fixed") && !ws) { clearWidths(t); }
      t.setAttribute("data-rz-key", key);
    });
  }
  function schedule() { if (queued || dragging) return; queued = true; (window.requestAnimationFrame || setTimeout)(scan); }

  function merge(obj) {
    if (!obj || typeof obj !== "object") return;
    Object.keys(obj).forEach(function (k) { if (Array.isArray(obj[k])) saved[k] = obj[k].map(function (n) { return Math.max(MIN, Math.min(1600, +n || MIN)); }); });
  }
  function init() {
    try { merge(JSON.parse(localStorage.getItem(LS + "anon") || "null")); } catch (e) {}
    scan();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    var A = window.dyAuth;
    if (!A || !A.client) return;
    A.getSession().then(function (s) {
      if (!s) return;
      uid = s.user && s.user.id;
      try { merge(JSON.parse(localStorage.getItem(LS + uid) || "null")); } catch (e) {}
      scan();
      return A.client.rpc("dy_pref_get", { p_key: PREF }).then(function (r) {
        if (r && !r.error && r.data) { merge(r.data); cacheLocal(); }
        scan();
      }, function () {});
    }).catch(function () {});
  }
  if (document.body) init(); else document.addEventListener("DOMContentLoaded", init);

  window.dyColResize = { rescan: scan, reset: function () { saved = {}; persist(); Array.prototype.forEach.call(document.querySelectorAll("table[data-rz-fixed]"), clearWidths); } };
})();

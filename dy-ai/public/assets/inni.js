/* 대시보드의 탭: 큰 탭(대시보드 / inni / 상품코드관리)과 그 아래 하위 탭
 *   대시보드: 커스텀(기존 대시보드, 기본) · 광고 효율 · 랭킹·판매 · 유입 경로 · 고객 구조 · 행사 비교 · 찜·장바구니 · 경영 요약 (inni-board.js 의 보드들)
 *   inni: SALES · PRODUCT · ONSITE AD · MEGAPO (월간 리포트 4종)
 * 주소 해시로 기억한다: (없음)=커스텀, #board/ad, #inni, #inni/product 처럼.
 */
(function () {
  "use strict";
  var SUBS = ["sales", "product", "onsite", "megapo"];
  var BOARDS = ["custom", "ad", "rank", "channel", "customer", "events", "wish", "exec"];
  var $ = function (s) { return document.querySelector(s); };
  var viewDash = $("#view-dash"), viewInni = $("#view-inni"), viewCodes = $("#view-codes");
  var views = Array.prototype.slice.call(document.querySelectorAll(".js-views .inni-tab"));
  var subs = Array.prototype.slice.call(document.querySelectorAll(".js-subs .inni-tab"));
  var panes = Array.prototype.slice.call(document.querySelectorAll(".inni-pane"));
  var btabs = Array.prototype.slice.call(document.querySelectorAll(".js-bsubs .inni-tab"));
  var bpanes = Array.prototype.slice.call(document.querySelectorAll(".board-pane"));
  if (!viewDash || !viewInni) return;

  function parse() { // "#inni/product" → { view: "inni", sub: "product" }, "#board/ad" → { view: "dash", board: "ad" }
    var h = (location.hash || "").replace(/^#/, "").split("/");
    return { view: h[0] === "inni" ? "inni" : h[0] === "codes" ? "codes" : "dash", sub: SUBS.indexOf(h[1]) >= 0 && h[0] === "inni" ? h[1] : "sales", board: h[0] === "board" && BOARDS.indexOf(h[1]) >= 0 ? h[1] : "custom" };
  }
  function show(view, sub, push, board) {
    board = board || "custom";
    views.forEach(function (b) { b.setAttribute("aria-selected", b.dataset.view === view ? "true" : "false"); });
    var inner = document.querySelector(".dash-inner"); if (inner) inner.classList.toggle("is-wide", view === "inni" && sub === "product");   // PRODUCT 화면만 넓게
    viewDash.hidden = view !== "dash";
    viewInni.hidden = view !== "inni";
    if (viewCodes) viewCodes.hidden = view !== "codes";
    subs.forEach(function (b) { b.setAttribute("aria-selected", b.dataset.sub === sub ? "true" : "false"); });
    panes.forEach(function (p) { p.hidden = p.dataset.pane !== sub; });
    btabs.forEach(function (b) { b.setAttribute("aria-selected", b.dataset.board === board ? "true" : "false"); });
    bpanes.forEach(function (p) { p.hidden = p.dataset.bpane !== board; });
    var hash = view === "inni" ? "#inni/" + sub : view === "codes" ? "#codes" : (board !== "custom" ? "#board/" + board : "");
    if (push && (location.hash || "") !== hash) {
      try { history.replaceState(null, "", hash || location.pathname + location.search); } catch (e) {}
    }
    if (view === "dash") window.dispatchEvent(new Event("resize"));   // 숨겨져 있던 그래프 크기 다시 맞춤
    document.dispatchEvent(new CustomEvent("inni:show", { detail: { view: view, sub: sub } }));   // 하위 탭 화면이 처음 열릴 때 불러오도록
    if (view === "dash" && board !== "custom") document.dispatchEvent(new CustomEvent("board:show", { detail: { id: board } }));
  }
  views.forEach(function (b) { b.addEventListener("click", function () { var s = parse(); show(b.dataset.view, s.sub, true, s.board); }); });
  subs.forEach(function (b) { b.addEventListener("click", function () { show("inni", b.dataset.sub, true); }); });
  btabs.forEach(function (b) { b.addEventListener("click", function () { show("dash", "sales", true, b.dataset.board); }); });
  window.addEventListener("hashchange", function () { var s = parse(); show(s.view, s.sub, false, s.board); });
  var s0 = parse(); show(s0.view, s0.sub, false, s0.board);
})();

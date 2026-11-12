/* 대시보드의 inni 탭: 큰 탭(대시보드 / inni)과 inni 안의 하위 탭(SALES · PRODUCT · ONSITE AD · MEGAPO)
 * 주소 해시로 기억한다: #inni, #inni/product 처럼. 각 하위 탭의 화면은 하나씩 만든다 (지금은 틀만).
 */
(function () {
  "use strict";
  var SUBS = ["sales", "product", "onsite", "megapo"];
  var $ = function (s) { return document.querySelector(s); };
  var viewDash = $("#view-dash"), viewInni = $("#view-inni");
  var views = Array.prototype.slice.call(document.querySelectorAll(".js-views .inni-tab"));
  var subs = Array.prototype.slice.call(document.querySelectorAll(".js-subs .inni-tab"));
  var panes = Array.prototype.slice.call(document.querySelectorAll(".inni-pane"));
  if (!viewDash || !viewInni) return;

  function parse() { // "#inni/product" → { view: "inni", sub: "product" }
    var h = (location.hash || "").replace(/^#/, "").split("/");
    return { view: h[0] === "inni" ? "inni" : "dash", sub: SUBS.indexOf(h[1]) >= 0 ? h[1] : "sales" };
  }
  function show(view, sub, push) {
    views.forEach(function (b) { b.setAttribute("aria-selected", b.dataset.view === view ? "true" : "false"); });
    var inner = document.querySelector(".dash-inner"); if (inner) inner.classList.toggle("is-wide", view === "inni" && sub === "product");   // PRODUCT 화면만 넓게
    viewDash.hidden = view !== "dash";
    viewInni.hidden = view !== "inni";
    subs.forEach(function (b) { b.setAttribute("aria-selected", b.dataset.sub === sub ? "true" : "false"); });
    panes.forEach(function (p) { p.hidden = p.dataset.pane !== sub; });
    var hash = view === "inni" ? "#inni/" + sub : "";
    if (push && (location.hash || "") !== hash) {
      try { history.replaceState(null, "", hash || location.pathname + location.search); } catch (e) {}
    }
    if (view === "dash") window.dispatchEvent(new Event("resize"));   // 숨겨져 있던 그래프 크기 다시 맞춤
    document.dispatchEvent(new CustomEvent("inni:show", { detail: { view: view, sub: sub } }));   // 하위 탭 화면이 처음 열릴 때 불러오도록
  }
  views.forEach(function (b) { b.addEventListener("click", function () { show(b.dataset.view, parse().sub, true); }); });
  subs.forEach(function (b) { b.addEventListener("click", function () { show("inni", b.dataset.sub, true); }); });
  window.addEventListener("hashchange", function () { var s = parse(); show(s.view, s.sub, false); });
  var s0 = parse(); show(s0.view, s0.sub, false);
})();

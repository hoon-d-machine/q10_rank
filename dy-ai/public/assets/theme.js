/* DY-AI 테마: 러그(rug) / 풀잎(nature) / 다크(dark)
 * <head> 에서 바로 실행해 저장된 테마를 먼저 입힌다 (화면이 깜빡이지 않게).
 * 고른 테마는 localStorage 에 저장돼 다음 접속의 기본값이 된다.
 * 바꿀 때 document 에 "dy:theme" 이벤트를 보낸다 (dy.js 가 테마별 그림을 바꿔 끼움).
 * 드롭다운 마크업: [data-theme-pick] 안에 .theme-btn / .theme-menu [data-theme-val]
 */
(function () {
  "use strict";

  var KEY = "dy.theme";
  var LIST = ["rug", "nature", "dark"];
  var html = document.documentElement;

  function valid(t) { return LIST.indexOf(t) >= 0; }

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  html.setAttribute("data-theme", valid(saved) ? saved : "rug");

  function get() { return html.getAttribute("data-theme"); }

  function set(t) {
    if (!valid(t) || t === get()) return;
    html.classList.add("theme-anim"); // 색이 부드럽게 바뀌도록 잠깐만 transition (themes.css)
    setTimeout(function () { html.classList.remove("theme-anim"); }, 450);
    html.setAttribute("data-theme", t);
    try { localStorage.setItem(KEY, t); } catch (e) {}
    document.dispatchEvent(new CustomEvent("dy:theme", { detail: t }));
  }

  window.dyTheme = { list: LIST, get: get, set: set };

  // ---------- 드롭다운 ----------
  function initPick(root) {
    var btn = root.querySelector(".theme-btn");
    var menu = root.querySelector(".theme-menu");
    var name = root.querySelector(".theme-name");
    var sw = btn.querySelector(".sw");
    var items = [].slice.call(menu.querySelectorAll("[data-theme-val]"));

    function sync() {
      var cur = get();
      items.forEach(function (it) {
        var on = it.getAttribute("data-theme-val") === cur;
        it.setAttribute("aria-checked", on ? "true" : "false");
        it.tabIndex = on ? 0 : -1;
        if (on) {
          name.textContent = it.querySelector("b").textContent;
          sw.className = "sw sw-" + cur;
        }
      });
    }

    function current() {
      for (var i = 0; i < items.length; i++) if (items[i].getAttribute("aria-checked") === "true") return i;
      return 0;
    }

    function open() {
      menu.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      items[current()].focus();
    }

    function close(focusBtn) {
      if (menu.hidden) return;
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      if (focusBtn) btn.focus();
    }

    btn.addEventListener("click", function () { if (menu.hidden) open(); else close(false); });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(); }
    });

    menu.addEventListener("keydown", function (e) {
      var i = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === "Home") { e.preventDefault(); items[0].focus(); }
      else if (e.key === "End") { e.preventDefault(); items[items.length - 1].focus(); }
      else if (e.key === "Escape") { e.preventDefault(); close(true); }
      else if (e.key === "Tab") { close(false); }
    });

    items.forEach(function (it) {
      it.addEventListener("click", function () {
        set(it.getAttribute("data-theme-val"));
        sync();
        close(true);
      });
    });

    document.addEventListener("click", function (e) { if (!root.contains(e.target)) close(false); });
    document.addEventListener("dy:theme", sync);
    sync();
  }

  function init() { document.querySelectorAll("[data-theme-pick]").forEach(initPick); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

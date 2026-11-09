/* 전통 혼례 식순: 두루마리 펼침 연출, 한 번에 하나씩 펼치기, 예식 정보 채우기 */
(function () {
  "use strict";

  var sheet = document.getElementById("sheet");
  var paper = document.getElementById("paper");
  var list = document.getElementById("steps");
  var allBtn = document.getElementById("toggleAll");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DUR = 2.8; // 두루마리가 펼쳐지는 시간(초)

  // ---- 예식 정보 (config.js) ----
  (function () {
    var c = window.HONRYE || {};
    var el = document.getElementById("couple");
    if (!el || (!c.groom && !c.bride && !c.date && !c.place)) return;
    var names = [c.groom && "신랑 " + c.groom, c.bride && "신부 " + c.bride].filter(Boolean).join("  ·  ");
    var meta = [c.date, c.place].filter(Boolean).join(" · ");
    el.textContent = names;
    if (meta) { var s = document.createElement("small"); s.textContent = meta; el.appendChild(s); }
    el.hidden = false;
  })();

  // ---- 두루마리 펼침 ----
  function unroll() {
    if (!sheet || !paper) return;
    document.documentElement.classList.remove("js");   // 이후엔 높이를 직접 다룸
    if (reduce) { sheet.style.height = "auto"; return; }
    var h = paper.offsetHeight;
    sheet.style.height = "0px";
    sheet.style.overflow = "hidden";
    void sheet.offsetHeight;                           // 시작 높이를 확정
    sheet.style.transition = "height " + DUR + "s cubic-bezier(.45, .05, .2, 1)";
    sheet.style.height = h + "px";
    var done = false;
    function finish() {
      if (done) return; done = true;
      sheet.style.transition = "none";
      sheet.style.height = "auto";                     // 펼침/접힘에 따라 높이가 자연스럽게 바뀌도록
    }
    sheet.addEventListener("transitionend", function (e) { if (e.target === sheet && e.propertyName === "height") finish(); });
    setTimeout(finish, DUR * 1000 + 400);              // transitionend 가 안 올 때 대비
  }

  // 글꼴이 들어온 뒤에 높이를 재야 정확하므로 잠깐 기다림 (너무 오래 걸리면 그냥 시작)
  var started = false;
  function start() { if (started) return; started = true; unroll(); }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(start);
    setTimeout(start, 1200);
  } else {
    window.addEventListener("load", start);
  }

  // ---- 한 번에 하나씩 펼치기 ----
  var all = false;
  var items = Array.prototype.slice.call(list.querySelectorAll("details"));
  items.forEach(function (d) {
    d.addEventListener("toggle", function () {
      if (!d.open || all) return;
      items.forEach(function (o) { if (o !== d) o.open = false; });
      var sum = d.querySelector("summary");
      setTimeout(function () {
        var r = sum.getBoundingClientRect();
        if (r.top < 8 || r.bottom > window.innerHeight) sum.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
      }, 60);
    });
  });

  allBtn.addEventListener("click", function () {
    all = !all;
    items.forEach(function (d) { d.open = all; });
    allBtn.setAttribute("aria-pressed", String(all));
    allBtn.textContent = all ? "모두 접기" : "모두 펼치기";
  });
})();

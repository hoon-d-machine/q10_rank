/* DY-AI 기간 선택 달력 (브라우저 기본 달력 대신, 테마 색을 따름)
 *   dyCal.range({ anchor: 버튼, from, to, min, max }) → Promise<{ from, to } | null>
 *   - 넓은 화면: 버튼 아래 팝오버에 두 달 / 좁은 화면: 아래에서 올라오는 시트에 한 달
 *   - 시작일 → 종료일 순서로 클릭 (종료일이 앞이면 둘을 바꿈), 마우스를 올리면 범위 미리보기
 *   - 키보드: 방향키 하루·한 주 이동, PageUp/PageDown 한 달, Enter 선택, Esc 닫기
 *   - min/max 밖 날짜는 고를 수 없음
 */
(function () {
  "use strict";

  var DOW = ["월", "화", "수", "목", "금", "토", "일"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parse(s) { if (!s) return null; var a = String(s).split("-"); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
  function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function label(s) { var d = parse(s); return d.getFullYear() + "년 " + (d.getMonth() + 1) + "월 " + d.getDate() + "일 (" + DOW[(d.getDay() + 6) % 7] + ")"; }
  function days(a, b) { return Math.round((parse(b) - parse(a)) / 86400000) + 1; }

  var open = null; // 열려 있는 달력 (하나만)

  function range(opt) {
    if (open) open.close(null);
    return new Promise(function (resolve) {
      var min = opt.min || null, max = opt.max || null;
      var a = opt.from || null, b = opt.to || null;   // 확정된 선택
      var picking = null;                             // 시작일만 고른 상태
      var hover = null;
      var focusDay = b || a || max || ymd(new Date());
      var narrow = window.matchMedia("(max-width: 640px)").matches;
      var months = narrow ? 1 : 2;
      var view = addMonths(parse(focusDay), narrow ? 0 : -1); // 오른쪽 달에 종료일이 오게
      if (min && view < addMonths(parse(min), 0)) view = addMonths(parse(min), 0);

      var root = el("div", "dy-cal" + (narrow ? " is-sheet" : ""));
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "true");
      root.setAttribute("aria-label", "기간 선택");
      var shade = el("div", "dy-cal-shade");

      var head = el("div", "dy-cal-head");
      var prev = el("button", "dy-cal-nav", "‹"); prev.type = "button"; prev.setAttribute("aria-label", "이전 달");
      var next = el("button", "dy-cal-nav", "›"); next.type = "button"; next.setAttribute("aria-label", "다음 달");
      var titles = el("div", "dy-cal-titles");
      head.appendChild(prev); head.appendChild(titles); head.appendChild(next);
      var body = el("div", "dy-cal-months");
      var foot = el("div", "dy-cal-foot");
      var sel = el("p", "dy-cal-sel"); sel.setAttribute("aria-live", "polite");
      var acts = el("div", "dy-cal-acts");
      var cancel = el("button", "dy-cal-btn", "취소"); cancel.type = "button";
      var ok = el("button", "dy-cal-btn is-primary", "적용"); ok.type = "button";
      acts.appendChild(cancel); acts.appendChild(ok);
      foot.appendChild(sel); foot.appendChild(acts);
      root.appendChild(head); root.appendChild(body); root.appendChild(foot);

      function inRange(s) { return (!min || s >= min) && (!max || s <= max); }
      function curRange() {
        if (picking) {
          var h = hover || picking;
          return h < picking ? [h, picking] : [picking, h];
        }
        return [a, b];
      }

      function render() {
        titles.innerHTML = ""; body.innerHTML = "";
        var r = curRange();
        for (var m = 0; m < months; m++) {
          var first = addMonths(view, m);
          titles.appendChild(el("span", null, first.getFullYear() + "년 " + (first.getMonth() + 1) + "월"));
          var box = el("div", "dy-cal-month");
          var grid = el("div", "dy-cal-grid"); grid.setAttribute("role", "grid");
          DOW.forEach(function (d, i) { var h = el("span", "dy-cal-dow" + (i >= 5 ? " is-weekend" : ""), d); h.setAttribute("aria-hidden", "true"); grid.appendChild(h); });
          var lead = (first.getDay() + 6) % 7;
          for (var i = 0; i < lead; i++) grid.appendChild(el("span", "dy-cal-pad"));
          var last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
          for (var day = 1; day <= last; day++) {
            var s = ymd(new Date(first.getFullYear(), first.getMonth(), day));
            var btn = el("button", "dy-cal-day", String(day));
            btn.type = "button";
            btn.dataset.d = s;
            btn.setAttribute("aria-label", label(s));
            var dow = (new Date(first.getFullYear(), first.getMonth(), day).getDay() + 6) % 7;
            if (dow >= 5) btn.classList.add("is-weekend");
            if (!inRange(s)) { btn.disabled = true; btn.classList.add("is-out"); }
            if (s === ymd(new Date())) btn.classList.add("is-today");
            if (r[0] && r[1] && s >= r[0] && s <= r[1]) btn.classList.add("is-in");
            if (s === r[0]) btn.classList.add("is-start");
            if (s === r[1]) btn.classList.add("is-end");
            if (s === r[0] || s === r[1]) btn.setAttribute("aria-pressed", "true");
            btn.tabIndex = s === focusDay ? 0 : -1;
            grid.appendChild(btn);
          }
          box.appendChild(grid);
          body.appendChild(box);
        }
        prev.disabled = !!(min && view <= addMonths(parse(min), 0));
        next.disabled = !!(max && addMonths(view, months) > parse(max));
        var rr = curRange();
        sel.textContent = picking ? "종료일을 골라 주세요 · 시작 " + picking
          : rr[0] ? rr[0] + " ~ " + rr[1] + " (" + days(rr[0], rr[1]) + "일)" : "시작일을 골라 주세요";
        ok.disabled = !!picking || !a || !b;
      }

      function pick(s) {
        if (!inRange(s)) return;
        if (!picking) { picking = s; hover = s; a = b = null; }
        else {
          var x = picking, y = s;
          if (y < x) { var t = x; x = y; y = t; }
          a = x; b = y; picking = null; hover = null;
        }
        focusDay = s;
        render();
        focusCurrent();
      }

      function focusCurrent() {
        var f = body.querySelector('[data-d="' + focusDay + '"]');
        if (f && !f.disabled) f.focus(); else { var any = body.querySelector(".dy-cal-day:not([disabled])"); if (any) any.focus(); }
      }

      function moveFocus(n, unit) {
        var d = unit === "m" ? (function () { var x = parse(focusDay); var y = new Date(x.getFullYear(), x.getMonth() + n, 1); y.setDate(Math.min(x.getDate(), new Date(y.getFullYear(), y.getMonth() + 1, 0).getDate())); return y; })() : addDays(parse(focusDay), n);
        var s = ymd(d);
        if (min && s < min) s = min;
        if (max && s > max) s = max;
        focusDay = s;
        var fd = parse(s);
        if (fd < view) view = addMonths(fd, 0);
        else if (fd >= addMonths(view, months)) view = addMonths(fd, -(months - 1));
        if (picking) hover = s;
        render(); focusCurrent();
      }

      body.addEventListener("click", function (e) {
        var t = e.target.closest(".dy-cal-day");
        if (t && !t.disabled) pick(t.dataset.d);
      });
      body.addEventListener("mouseover", function (e) {
        var t = e.target.closest(".dy-cal-day");
        if (picking && t && !t.disabled && t.dataset.d !== hover) { hover = t.dataset.d; render(); }
      });
      root.addEventListener("keydown", function (e) {
        var k = e.key;
        if (k === "Escape") { e.preventDefault(); close(null); return; }
        if (!e.target.classList.contains("dy-cal-day")) return;
        var map = { ArrowLeft: [-1], ArrowRight: [1], ArrowUp: [-7], ArrowDown: [7], PageUp: [-1, "m"], PageDown: [1, "m"] };
        if (map[k]) { e.preventDefault(); moveFocus(map[k][0], map[k][1]); }
        else if (k === "Home") { e.preventDefault(); var d = parse(focusDay); moveFocus(-((d.getDay() + 6) % 7)); }
        else if (k === "End") { e.preventDefault(); var d2 = parse(focusDay); moveFocus(6 - (d2.getDay() + 6) % 7); }
        else if (k === "Tab") {
          // 달력 안에서만 돌기
          var f = [].slice.call(root.querySelectorAll("button:not([disabled])")).filter(function (b0) { return b0.tabIndex >= 0; });
          var i = f.indexOf(document.activeElement);
          if (e.shiftKey && i === 0) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
        }
      });
      prev.addEventListener("click", function () { view = addMonths(view, -1); render(); });
      next.addEventListener("click", function () { view = addMonths(view, 1); render(); });
      cancel.addEventListener("click", function () { close(null); });
      ok.addEventListener("click", function () { close({ from: a, to: b }); });
      shade.addEventListener("click", function () { close(null); });

      function place() {
        if (narrow || !opt.anchor) return;
        var r = opt.anchor.getBoundingClientRect();
        var w = root.offsetWidth, h = root.offsetHeight;
        var left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
        var top = r.bottom + 8;
        if (top + h > window.innerHeight - 8 && r.top - h - 8 > 8) top = r.top - h - 8;
        root.style.left = left + "px";
        root.style.top = Math.max(8, top) + "px";
      }
      function onScroll() { place(); }

      function close(v) {
        if (!open || open.root !== root) return;
        open = null;
        root.remove(); shade.remove();
        window.removeEventListener("resize", onScroll);
        window.removeEventListener("scroll", onScroll, true);
        if (opt.anchor) { opt.anchor.setAttribute("aria-expanded", "false"); opt.anchor.focus(); }
        resolve(v);
      }

      // 모달(<dialog>) 안에서 열면 그 안에 붙여야 맨 위층에 보이고 클릭됨
      var host = (opt.anchor && opt.anchor.closest("dialog[open]")) || document.body;
      host.appendChild(shade);
      host.appendChild(root);
      if (opt.anchor) opt.anchor.setAttribute("aria-expanded", "true");
      render();
      place();
      window.addEventListener("resize", onScroll);
      window.addEventListener("scroll", onScroll, true);
      open = { root: root, close: close };
      focusCurrent();
    });
  }

  window.dyCal = { range: range };
})();

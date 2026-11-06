/* DY-AI 공통: SVG 스프라이트 주입, 포인터 3D 틸트·패럴랙스, 토스트 */
(function () {
  "use strict";

  var SPRITE =
    '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">' +
    // 데이지 (흰 꽃잎 + 노란 웃는 얼굴)
    '<symbol id="daisy" viewBox="0 0 100 100">' +
    '<g fill="#fff" stroke="#111" stroke-width="3.5" stroke-linejoin="round">' +
    [0, 45, 90, 135, 180, 225, 270, 315].map(function (a) {
      return '<ellipse cx="50" cy="19" rx="13" ry="19" transform="rotate(' + a + ' 50 50)"/>';
    }).join("") +
    '</g>' +
    '<circle cx="50" cy="50" r="19" fill="#ffd21f" stroke="#111" stroke-width="3.5"/>' +
    '<circle cx="43" cy="47" r="2.6" fill="#111"/><circle cx="57" cy="47" r="2.6" fill="#111"/>' +
    '<path d="M42 56 Q50 63 58 56" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round"/>' +
    '</symbol>' +
    // 로고 글자 경로 (D Y - A I)
    '<symbol id="dy-logo" viewBox="0 0 520 135">' + logoGroups(false) + '</symbol>' +
    '<symbol id="dy-logo-ink" viewBox="0 0 520 135" class="ink-only">' + logoGroups(true) + '</symbol>' +
    '</svg>';

  function logoGroups(inkOnly) {
    var L = [
      { x: 14,  c: "#1b8fe0", d: "M18 22 H44 C86 22 90 108 44 108 H18 Z" },                         // D
      { x: 124, c: "#f0646a", d: "M14 22 L50 66 L86 22 M50 66 V108" },                              // Y
      { x: 226, c: "#ffd21f", d: "M20 66 H64" },                                                    // -
      { x: 292, c: "#7b4fd6", d: "M12 108 L50 22 L88 108 M27 82 H73" },                             // A
      { x: 404, c: "#0e64b8", d: "M30 22 H70 M30 108 H70 M50 22 V108" }                             // I
    ];
    var out = L.map(function (l, i) {
      // 위치(transform 속성)와 애니메이션(CSS transform)을 다른 그룹으로 분리
      return '<g transform="translate(' + l.x + ' 0)"><g class="ltr" style="--i:' + i + ';--c:' + l.c + '">' +
        '<path class="ink" d="' + l.d + '"/>' +
        (inkOnly ? "" : '<path class="col" d="' + l.d + '"/>') + '</g></g>';
    }).join("");
    if (!inkOnly) {
      out += '<g class="logo-daisy"><use href="#daisy" x="456" y="-6" width="58" height="58"/></g>';
    }
    return out;
  }

  var mount = document.createElement("div");
  mount.innerHTML = SPRITE;
  document.body.insertBefore(mount.firstChild, document.body.firstChild);

  // 로고 마크업 헬퍼: <div data-logo="3d|flat">
  document.querySelectorAll("[data-logo]").forEach(function (el) {
    var svg = function (id) {
      return '<svg viewBox="0 0 520 135" class="logo-svg" aria-hidden="true"><use href="#' + id + '"/></svg>';
    };
    if (el.dataset.logo === "3d") {
      el.classList.add("logo3d");
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", "DY-AI");
      el.innerHTML =
        [1, 2, 3, 4, 5].map(function () { return '<div class="layer">' + svg("dy-logo-ink") + "</div>"; }).join("") +
        '<div class="layer front">' + svg("dy-logo") + "</div>";
    } else {
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", "DY-AI");
      el.innerHTML = svg("dy-logo");
    }
  });

  // ----- 포인터 3D -----
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var tilts = Array.prototype.slice.call(document.querySelectorAll("[data-tilt]"));
  var deeps = Array.prototype.slice.call(document.querySelectorAll("[data-depth]"));
  var tx = 0, ty = 0, cx = 0, cy = 0, raf = null;

  function frame() {
    cx += (tx - cx) * 0.08;
    cy += (ty - cy) * 0.08;
    tilts.forEach(function (el) {
      var max = parseFloat(el.dataset.tilt) || 10;
      el.style.transform = "rotateX(" + (-cy * max).toFixed(2) + "deg) rotateY(" + (cx * max).toFixed(2) + "deg)";
    });
    deeps.forEach(function (el) {
      var d = parseFloat(el.dataset.depth) || 0;
      el.style.transform = "translate3d(" + (cx * d).toFixed(1) + "px," + (cy * d).toFixed(1) + "px," + (d * 2).toFixed(1) + "px)";
    });
    raf = (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) ? requestAnimationFrame(frame) : null;
  }
  if (!reduce) {
    window.addEventListener("pointermove", function (e) {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(frame);
    }, { passive: true });
  }

  // ----- 토스트 -----
  var toast = document.getElementById("toast");
  var timer;
  window.dyToast = function (msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("on");
    clearTimeout(timer);
    timer = setTimeout(function () { toast.classList.remove("on"); }, 2400);
  };
})();

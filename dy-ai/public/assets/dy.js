/* DY-AI 공통: 테마별 SVG 스프라이트 주입, 포인터 3D 틸트·패럴랙스, 토스트, 확인 창(모달) */
(function () {
  "use strict";

  // ----- 테마별 그림 (같은 id 의 심볼을 테마에 맞게 바꿔 끼움) -----
  // 러그: 데이지·반짝이·무지개 / 풀잎: 잎 꽃·이슬·언덕 / 다크: 다이얼·플러스·궤도선
  function petals() {
    return [0, 45, 90, 135, 180, 225, 270, 315].map(function (a) {
      return '<ellipse cx="50" cy="19" rx="13.5" ry="19" transform="rotate(' + a + ' 50 50)"/>';
    }).join("");
  }
  function sprout(x, y, s) {
    return '<g transform="translate(' + x + " " + y + ") scale(" + s + ')">' +
      '<path d="M0 0 V-28" stroke="#0b8a48" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M0 -16 C-14 -18 -24 -30 -22 -40 C-10 -40 0 -30 0 -16 Z" fill="#3cc47c"/>' +
      '<path d="M0 -22 C12 -26 24 -38 22 -48 C10 -48 0 -38 0 -22 Z" fill="#11af5d"/></g>';
  }
  function tree(x, y, s) {
    return '<g transform="translate(' + x + " " + y + ") scale(" + s + ')">' +
      '<rect x="-4" y="-34" width="8" height="36" rx="4" fill="#8a6a4a"/>' +
      '<circle cy="-56" r="30" fill="#3cc47c"/><circle cx="-12" cy="-48" r="16" fill="#11af5d" opacity=".55"/>' +
      '<circle cx="10" cy="-66" r="7" fill="#eafaf0" opacity=".6"/></g>';
  }
  var ART = {
    rug: {
      daisy: // 데이지 (크림 꽃잎 + 노란 웃는 얼굴, 털실 느낌이라 외곽선은 얇게)
        '<g fill="#fbfbf3" stroke="#e6e2c8" stroke-width="2" stroke-linejoin="round">' + petals() + '</g>' +
        '<circle cx="50" cy="50" r="19.5" fill="#fdc916" stroke="#e0a800" stroke-width="2"/>' +
        '<circle cx="43" cy="47" r="2.6" fill="#3b2200"/><circle cx="57" cy="47" r="2.6" fill="#3b2200"/>' +
        '<path d="M42 56 Q50 63 58 56" fill="none" stroke="#3b2200" stroke-width="3" stroke-linecap="round"/>',
      spark: '<path d="M10 0 L12.4 7.6 L20 10 L12.4 12.4 L10 20 L7.6 12.4 L0 10 L7.6 7.6 Z" fill="#fbfbf3"/>',
      rainbow: // 빨강·노랑·초록·파랑 아치 + 초록 언덕
        '<path d="M-20 420 A500 500 0 0 1 1020 420" fill="none" stroke="#eb0104" stroke-width="64"/>' +
        '<path d="M44 420 A436 436 0 0 1 956 420" fill="none" stroke="#fdc916" stroke-width="64"/>' +
        '<path d="M108 420 A372 372 0 0 1 892 420" fill="none" stroke="#06ac78" stroke-width="64"/>' +
        '<path d="M172 420 A308 308 0 0 1 828 420" fill="none" stroke="#0072e4" stroke-width="64"/>' +
        '<ellipse cx="500" cy="440" rx="330" ry="120" fill="#06ac78"/>',
      logo: ["#f7f8ee", "#fdc916", "#eb0104", "#06ac78", "#f7f8ee"]
    },
    nature: {
      daisy: // 잎 여섯 장 + 해 빛깔 가운데
        [0, 60, 120, 180, 240, 300].map(function (a, i) {
          return '<g transform="rotate(' + a + ' 50 50)">' +
            '<path d="M50 50 C35 40 35 17 50 5 C65 17 65 40 50 50 Z" fill="' + (i % 2 ? "#3cc47c" : "#11af5d") + '" stroke="#0b8a48" stroke-width="1.6" stroke-linejoin="round"/>' +
            '<path d="M50 44 V13" stroke="#eafaf0" stroke-width="2" stroke-linecap="round" opacity=".75"/></g>';
        }).join("") +
        '<circle cx="50" cy="50" r="10" fill="#f5c84b" stroke="#d9a520" stroke-width="2"/>',
      spark: // 이슬
        '<path d="M10 1.5 C10 1.5 3.6 9 3.6 12.9 A6.4 6.4 0 0 0 16.4 12.9 C16.4 9 10 1.5 10 1.5 Z" fill="#a8e3c1" stroke="#11af5d" stroke-width="1.2"/>' +
        '<ellipse cx="7.7" cy="12.2" rx="1.5" ry="2.4" fill="#fff" opacity=".9"/>',
      rainbow: // 겹겹 언덕 + 나무·새싹 (러그의 무지개 자리)
        '<path d="M-40 460 V200 C150 120 330 140 500 210 C680 280 850 150 1040 170 V460 Z" fill="#cdeedb"/>' +
        tree(237, 152, 1) + tree(766, 212, 0.8) + tree(300, 146, 0.6) +
        '<path d="M-40 460 V300 C180 230 380 260 560 320 C740 380 900 290 1040 300 V460 Z" fill="#8fd6ab"/>' +
        sprout(275, 264, 1) + sprout(318, 270, 0.7) + sprout(815, 331, 0.85) +
        '<path d="M-40 460 V390 C220 350 440 365 640 400 C820 432 930 385 1040 390 V460 Z" fill="#11af5d"/>' +
        '<path d="M-40 460 V430 C260 410 520 418 760 440 C900 452 980 432 1040 434 V460 Z" fill="#0d9a51"/>',
      logo: ["#ffffff", "#f5c84b", "#11af5d", "#ffffff", "#a6dfbc"]
    },
    dark: {
      daisy: // 다이얼
        '<circle cx="50" cy="50" r="44" fill="none" stroke="#2a3340" stroke-width="2"/>' +
        '<circle cx="50" cy="50" r="30" fill="none" stroke="#252d39" stroke-width="2" stroke-dasharray="4 6"/>' +
        [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(function (a, i) {
          var r = a * Math.PI / 180;
          return '<circle cx="' + (50 + 44 * Math.sin(r)).toFixed(2) + '" cy="' + (50 - 44 * Math.cos(r)).toFixed(2) +
            '" r="' + (i ? 2.4 : 3.8) + '" fill="' + (i ? "#3a4556" : "#4c8dff") + '"/>';
        }).join("") +
        '<circle cx="50" cy="50" r="5" fill="#4c8dff"/>',
      spark: '<path d="M10 3 V17 M3 10 H17" stroke="#4c8dff" stroke-width="2.4" stroke-linecap="round"/>',
      rainbow: // 궤도선 + 은은한 빛
        '<ellipse cx="500" cy="470" rx="440" ry="110" fill="#4c8dff" opacity=".07"/>' +
        '<path d="M-20 420 A500 500 0 0 1 1020 420" fill="none" stroke="#1c232d" stroke-width="2"/>' +
        '<path d="M44 420 A436 436 0 0 1 956 420" fill="none" stroke="#1c232d" stroke-width="2" stroke-dasharray="2 10"/>' +
        '<path d="M108 420 A372 372 0 0 1 892 420" fill="none" stroke="#1c232d" stroke-width="2"/>' +
        '<path d="M172 420 A308 308 0 0 1 828 420" fill="none" stroke="#4c8dff" stroke-opacity=".45" stroke-width="2"/>',
      logo: ["#e8ebf0", "#e8ebf0", "#4c8dff", "#e8ebf0", "#e8ebf0"]
    }
  };

  function theme() {
    var t = document.documentElement.getAttribute("data-theme");
    return ART[t] ? t : "rug";
  }

  function logoGroups(colors, inkOnly) {
    var L = [
      { x: 14,  d: "M18 22 H44 C86 22 90 108 44 108 H18 Z" },                         // D
      { x: 124, d: "M14 22 L50 66 L86 22 M50 66 V108" },                              // Y
      { x: 226, d: "M20 66 H64" },                                                    // -
      { x: 292, d: "M12 108 L50 22 L88 108 M27 82 H73" },                             // A
      { x: 404, d: "M30 22 H70 M30 108 H70 M50 22 V108" }                             // I
    ];
    var out = L.map(function (l, i) {
      // 위치(transform 속성)와 애니메이션(CSS transform)을 다른 그룹으로 분리
      return '<g transform="translate(' + l.x + ' 0)"><g class="ltr" style="--i:' + i + ';--c:' + colors[i] + '">' +
        '<path class="ink" d="' + l.d + '"/>' +
        (inkOnly ? "" : '<path class="col" d="' + l.d + '"/>') + '</g></g>';
    }).join("");
    if (!inkOnly) {
      out += '<g class="logo-daisy"><use href="#daisy" x="456" y="-6" width="58" height="58"/></g>';
    }
    return out;
  }

  function sprite(t) {
    var a = ART[t];
    return '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">' +
      '<symbol id="daisy" viewBox="0 0 100 100">' + a.daisy + '</symbol>' +
      '<symbol id="spark4" viewBox="0 0 20 20">' + a.spark + '</symbol>' +
      '<symbol id="rainbow" viewBox="-40 -140 1080 600">' + a.rainbow + '</symbol>' +
      // 로고 글자 경로 (D Y - A I)
      '<symbol id="dy-logo" viewBox="-10 -30 540 170">' + logoGroups(a.logo, false) + '</symbol>' +
      '<symbol id="dy-logo-ink" viewBox="-10 -30 540 170" class="ink-only">' + logoGroups(a.logo, true) + '</symbol>' +
      '</svg>';
  }

  var spriteEl = null;
  function mountSprite() {
    var box = document.createElement("div");
    box.innerHTML = sprite(theme());
    var el = box.firstChild;
    if (spriteEl) spriteEl.parentNode.replaceChild(el, spriteEl);
    else document.body.insertBefore(el, document.body.firstChild);
    spriteEl = el;
    // <use> 가 바뀐 심볼을 다시 그리도록 참조를 새로 건다
    document.querySelectorAll("use").forEach(function (u) {
      var h = u.getAttribute("href");
      u.removeAttribute("href");
      u.setAttribute("href", h);
    });
  }
  mountSprite();
  document.addEventListener("dy:theme", mountSprite);

  // 로고 마크업 헬퍼: <div data-logo="3d|flat">
  document.querySelectorAll("[data-logo]").forEach(function (el) {
    var svg = function (id) {
      return '<svg viewBox="-10 -30 540 170" class="logo-svg" aria-hidden="true"><use href="#' + id + '"/></svg>';
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
  // ms: 표시 시간 (기본 2.4초, 0이면 다음 토스트가 올 때까지 유지)
  window.dyToast = function (msg, ms) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("on");
    clearTimeout(timer);
    if (ms === 0) return;
    timer = setTimeout(function () { toast.classList.remove("on"); }, ms || 2400);
  };

  // ----- 확인 창 (모달) -----
  // opt: { title, tone: "file" | "warn", body: [문자열 | { file: 파일이름 } | { note: 문자열 }],
  //        actions: [{ label, value, kind: "primary" | "quiet" }], cancelValue }
  // → Promise<누른 버튼의 value>  (Esc·바깥 클릭은 cancelValue, 기본 null)
  // 버튼 클릭 직후에 resolve 하므로, 받은 쪽에서 파일 선택창·권한 요청을 바로 열 수 있다 (사용자 동작 유지)
  var DOC = "M6 2.8h8l4.2 4.2V20a1.2 1.2 0 0 1-1.2 1.2H6A1.2 1.2 0 0 1 4.8 20V4A1.2 1.2 0 0 1 6 2.8Z";
  var ICONS = {
    file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + DOC + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M13.6 3v4.4H18M8.5 13l2.2 2.2 4.6-4.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2 21.6 20H2.4Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M12 9.5v5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.4" r="1.25" fill="currentColor"/></svg>'
  };
  var FILE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + DOC + '" fill="currentColor" opacity=".16"/><path d="' + DOC + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 12h8M8 15.5h8M8 8.5h3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  var modalSeq = 0;

  window.dyModal = function (opt) {
    return new Promise(function (resolve) {
      var id = "dy-modal-t" + (++modalSeq);
      var dlg = document.createElement("dialog");
      dlg.className = "dy-modal is-" + (opt.tone || "file");
      dlg.setAttribute("aria-labelledby", id);

      var box = document.createElement("div");
      box.className = "dy-modal-box";
      var icon = document.createElement("span");
      icon.className = "dy-modal-icon";
      icon.innerHTML = ICONS[opt.tone] || ICONS.file;
      var h = document.createElement("h2");
      h.id = id;
      h.textContent = opt.title;
      box.appendChild(icon);
      box.appendChild(h);

      (opt.body || []).forEach(function (b) {
        var el = document.createElement("p");
        if (b && typeof b === "object" && b.file != null) {
          el.className = "dy-modal-file";
          el.innerHTML = FILE_ICON;
          var n = document.createElement("span");
          n.textContent = b.file;
          el.appendChild(n);
        } else if (b && typeof b === "object" && b.note != null) {
          el.className = "dy-modal-note";
          el.textContent = b.note;
        } else {
          el.textContent = b;
        }
        box.appendChild(el);
      });

      var acts = document.createElement("div");
      acts.className = "dy-modal-actions";
      var focusBtn = null, settled = false;
      function finish(v) {
        if (settled) return;
        settled = true;
        resolve(v);
        dlg.close();
        dlg.remove();
      }
      (opt.actions || []).forEach(function (a) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "dy-modal-btn" + (a.kind ? " is-" + a.kind : "");
        btn.textContent = a.label;
        btn.addEventListener("click", function () { finish(a.value); });
        acts.appendChild(btn);
        if (!focusBtn || (a.kind === "primary" && !focusBtn.classList.contains("is-primary"))) focusBtn = btn;
      });
      box.appendChild(acts);
      dlg.appendChild(box);

      var cancelValue = opt.cancelValue === undefined ? null : opt.cancelValue;
      dlg.addEventListener("cancel", function (e) { e.preventDefault(); finish(cancelValue); });
      dlg.addEventListener("click", function (e) { if (e.target === dlg) finish(cancelValue); });

      document.body.appendChild(dlg);
      dlg.showModal();
      if (focusBtn) focusBtn.focus();
    });
  };
})();

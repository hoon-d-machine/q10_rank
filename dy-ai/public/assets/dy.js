/* DY-AI 공통: 테마별 SVG 스프라이트·배경 장면 주입, 포인터 3D 틸트·패럴랙스, 토스트, 확인 창(모달) */
(function () {
  "use strict";

  // ----- 테마별 그림 (같은 id 의 심볼을 테마에 맞게 바꿔 끼움) -----
  // 러그: 데이지·반짝이·무지개 / 풀잎: 녹차 잎·물방울 / 다크: 유리 구슬
  function petals() {
    return [0, 45, 90, 135, 180, 225, 270, 315].map(function (a) {
      return '<ellipse cx="50" cy="19" rx="13.5" ry="19" transform="rotate(' + a + ' 50 50)"/>';
    }).join("");
  }

  // ----- 풀잎: 녹차 잎 · 물방울 · 돌 · 잎 그림자 (실사 느낌은 SVG 그라디언트·조명 필터로) -----
  var TEA_LEAF = // 세로 잎 (끝이 위), 빛은 왼쪽 위
    '<defs><linearGradient id="nl-g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#8fdc72"/><stop offset=".45" stop-color="#22a64a"/><stop offset="1" stop-color="#0a5e2c"/></linearGradient>' +
    '<linearGradient id="nl-s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".4"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="M50 3 C70 16 86 40 82 62 C78 82 62 94 50 98 C38 94 22 82 18 62 C14 40 30 16 50 3 Z" fill="url(#nl-g)"/>' +
    '<path d="M50 3 C30 16 14 40 18 62 C22 82 38 94 50 98 Z" fill="url(#nl-s)"/>' +
    '<path d="M50 96 C49 70 49 40 50 8" fill="none" stroke="#d9f5c8" stroke-opacity=".75" stroke-width="1.6" stroke-linecap="round"/>' +
    [20, 34, 48, 62, 76].map(function (y) {
      return '<path d="M50 ' + (y + 6) + " Q40 " + (y + 2) + " 28 " + (y - 6) + " M50 " + (y + 6) + " Q60 " + (y + 2) + " 72 " + (y - 6) +
        '" fill="none" stroke="#d9f5c8" stroke-opacity=".38" stroke-width="1"/>';
    }).join("") +
    '<path d="M34 22 C40 14 46 9 50 6" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.4" stroke-linecap="round"/>';

  var DROP = // 물방울: 가장자리 굴절 + 하이라이트 + 아래 반사광
    '<defs><radialGradient id="nd-g" cx=".5" cy=".58" r=".55"><stop offset="0" stop-color="#f4fff4" stop-opacity=".25"/>' +
    '<stop offset=".7" stop-color="#9fdc9a" stop-opacity=".35"/><stop offset=".93" stop-color="#2e8c4a" stop-opacity=".7"/><stop offset="1" stop-color="#1d6b38" stop-opacity=".8"/></radialGradient></defs>' +
    '<circle cx="10" cy="10" r="9.4" fill="url(#nd-g)"/>' +
    '<ellipse cx="6.6" cy="6" rx="2.6" ry="1.7" transform="rotate(-35 6.6 6)" fill="#fff" opacity=".95"/>' +
    '<path d="M4.5 13.5 Q10 18.6 15.5 13.5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.1" stroke-linecap="round"/>';

  function frond(x, y, ang, len, n) { // 야자잎 그림자 한 줄기
    var out = '<g transform="translate(' + x + " " + y + ") rotate(" + ang + ')">' +
      '<path d="M0 0 Q' + (len * 0.5) + " 8 " + len + ' 30" stroke-width="5" stroke="currentColor" fill="none"/>';
    for (var i = 1; i <= n; i++) {
      var t = i / (n + 1), px = (len * t).toFixed(0), py = (30 * t * t + 8 * t).toFixed(0), l = 120 * (1 - t * 0.55);
      out += '<ellipse cx="' + px + '" cy="' + (py - l / 2).toFixed(0) + '" rx="9" ry="' + (l / 2).toFixed(0) +
        '" transform="rotate(' + (-28 + t * 20).toFixed(0) + " " + px + " " + py + ')"/>' +
        '<ellipse cx="' + px + '" cy="' + (+py + l / 2).toFixed(0) + '" rx="9" ry="' + (l / 2).toFixed(0) +
        '" transform="rotate(' + (28 - t * 20).toFixed(0) + " " + px + " " + py + ')"/>';
    }
    return out + "</g>";
  }

  function stone(id, seed, d, facets, tone) { // 거친 돌: 모양 → 가장자리 흔들기 → 잔돌 질감 조명
    return '<svg viewBox="0 0 300 360" aria-hidden="true"><defs>' +
      '<linearGradient id="' + id + 'g" x1="0" y1="0" x2="1" y2=".35"><stop offset="0" stop-color="' + tone[0] + '"/><stop offset=".55" stop-color="' + tone[1] + '"/><stop offset="1" stop-color="' + tone[2] + '"/></linearGradient>' +
      '<filter id="' + id + 'f" x="-8%" y="-8%" width="116%" height="116%">' +
      '<feTurbulence type="fractalNoise" baseFrequency=".022" numOctaves="2" seed="' + seed + '" result="w"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="w" scale="10" xChannelSelector="R" yChannelSelector="G" result="s"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="4" result="n"/>' +
      '<feDiffuseLighting in="n" surfaceScale="1.6" diffuseConstant="1" lighting-color="#fff" result="l"><feDistantLight azimuth="220" elevation="58"/></feDiffuseLighting>' +
      '<feComponentTransfer in="l" result="lc"><feFuncR type="linear" slope=".42" intercept=".6"/><feFuncG type="linear" slope=".42" intercept=".6"/><feFuncB type="linear" slope=".42" intercept=".6"/></feComponentTransfer>' +
      '<feComposite in="lc" in2="s" operator="in" result="li"/><feBlend in="s" in2="li" mode="multiply"/></filter>' +
      '<radialGradient id="' + id + 'r" cx=".3" cy=".25" r=".9"><stop offset="0" stop-color="#fffbe6" stop-opacity=".45"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#1f3312" stop-opacity=".35"/></radialGradient>' +
      '<filter id="' + id + 'b" x="-30%" y="-200%" width="160%" height="500%"><feGaussianBlur stdDeviation="9"/></filter></defs>' +
      '<ellipse cx="160" cy="350" rx="150" ry="12" fill="#2c4419" opacity=".55" filter="url(#' + id + 'b)"/>' +
      '<g filter="url(#' + id + 'f)"><path d="' + d + '" fill="url(#' + id + 'g)"/>' + facets + '<path d="' + d + '" fill="url(#' + id + 'r)"/></g></svg>';
  }

  function leaf(x, y, s, depth, d, r, delay, cls) {
    return '<div class="n-leaf' + (cls ? " " + cls : "") + '" style="--x:' + x + ";--y:" + y + ";--s:" + s + '" data-depth="' + depth + '">' +
      '<div class="drift" style="--d:' + d + ";--r:" + r + ";--delay:" + delay + '"><svg viewBox="0 0 100 100"><use href="#daisy"/></svg></div></div>';
  }
  function drop(x, y, s, depth, d, delay) {
    return '<div class="n-drop" style="--x:' + x + ";--y:" + y + ";--s:" + s + '" data-depth="' + depth + '">' +
      '<div class="drift" style="--d:' + d + ";--delay:" + delay + '"><svg viewBox="0 0 20 20"><use href="#spark4"/></svg></div></div>';
  }

  var NATURE_BACK =
    '<div class="n-wall"></div><div class="n-sun"></div>' +
    '<div class="n-shade" data-depth="5"><svg viewBox="0 0 1000 760" preserveAspectRatio="xMaxYMin slice" aria-hidden="true">' +
    '<defs><filter id="ns-b" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7"/></filter></defs>' +
    '<g class="n-sway" fill="currentColor" filter="url(#ns-b)">' +
    frond(1060, -40, 140, 520, 14) + frond(1040, 120, 165, 470, 12) + frond(820, -60, 112, 420, 11) + frond(1080, 330, 190, 380, 10) +
    "</g></svg></div>" +
    '<div class="n-ring" data-depth="10"><svg viewBox="0 0 200 200" aria-hidden="true"><defs><linearGradient id="nr-g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#f7e2a8"/><stop offset=".35" stop-color="#c9933d"/><stop offset=".6" stop-color="#fff2c9"/><stop offset="1" stop-color="#a87628"/></linearGradient></defs>' +
    '<circle cx="100" cy="100" r="98.6" fill="none" stroke="url(#nr-g)" stroke-width="1.1"/></svg></div>' +
    '<div class="n-floor"></div>' +
    '<div class="n-stone n-stone-a" data-depth="12">' + stone("nsa", 7,
      "M28 352 L18 250 L30 168 L58 98 L104 52 L150 30 L196 36 L232 70 L256 128 L270 196 L282 272 L290 352 Z",
      '<path d="M150 30 L196 36 L232 70 L256 128 L270 196 L282 272 L290 352 L210 352 L220 250 L200 150 Z" fill="#30451c" opacity=".16"/>' +
      '<path d="M30 168 L58 98 L104 52 L150 30 L120 110 L80 170 Z" fill="#fff" opacity=".18"/>',
      ["#eaf3cf", "#c8dc9c", "#9fb86e"]) + "</div>" +
    '<div class="n-stone n-stone-b" data-depth="18">' + stone("nsb", 11,
      "M36 352 L30 240 L56 176 L96 140 L150 128 L206 146 L246 190 L262 262 L268 352 Z",
      '<path d="M150 128 L206 146 L246 190 L262 262 L268 352 L196 352 L196 230 Z" fill="#30451c" opacity=".17"/>' +
      '<path d="M30 240 L56 176 L96 140 L150 128 L112 196 L64 250 Z" fill="#fff" opacity=".2"/>',
      ["#e6f0c8", "#c2d794", "#9ab366"]) + "</div>" +
    leaf("12%", "16%", "66px", 22, "11s", "-38deg", "0s") +
    leaf("80%", "30%", "54px", 30, "9s", "52deg", "-3s") +
    drop("24%", "64%", "18px", 26, "7s", "-1s") +
    drop("71%", "18%", "12px", 34, "6s", "-2s") +
    drop("88%", "58%", "22px", 24, "8s", "-4s");

  var NATURE_FRONT = // 앞쪽 큰 잎은 초점이 나간 것처럼 흐리게 (사진의 얕은 심도)
    leaf("84%", "70%", "190px", 60, "13s", "-58deg", "-5s", "n-blur") +
    leaf("-4%", "2%", "150px", 54, "12s", "142deg", "0s", "n-blur");

  // ----- 다크: 해 질 녘 하늘 + 흐린 능선 + 필름 입자 (사진처럼, 도형 없음) -----
  var DARK_BACK =
    '<div class="d-sky"></div><div class="d-glow"></div>' +
    '<div class="d-ridge" data-depth="6"><svg viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden="true">' +
    '<defs><filter id="dr-b" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>' +
    '<filter id="dr-b2" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="3"/></filter></defs>' +
    '<path d="M0 300 V150 C140 128 230 96 360 112 C470 126 540 84 660 92 C790 100 860 140 980 132 C1080 125 1140 108 1200 112 V300 Z" fill="#14151b" filter="url(#dr-b)"/>' +
    '<path d="M0 300 V214 C160 196 300 170 450 186 C600 202 700 176 840 184 C980 192 1090 214 1200 206 V300 Z" fill="#060608" filter="url(#dr-b2)"/>' +
    "</svg></div>" +
    '<div class="d-grain"></div><div class="d-vignette"></div>';
  var DARK_FRONT = "";

  var SCENES = {
    nature: { back: NATURE_BACK, front: NATURE_FRONT },
    dark: { back: DARK_BACK, front: DARK_FRONT }
  };

  var ART = {
    rug: {
      daisy: // 데이지 (크림 꽃잎 + 노란 웃는 얼굴, 털실 느낌이라 외곽선은 얇게)
        '<g fill="#fbfbf3" stroke="#e6e2c8" stroke-width="2" stroke-linejoin="round">' + petals() + "</g>" +
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
      daisy: TEA_LEAF,
      spark: DROP,
      rainbow: "",
      logo: ["#0e3b24", "#0e3b24", "#11af5d", "#0e3b24", "#0e3b24"],
      logoW: 13
    },
    dark: {
      daisy: // 유리 구슬 (무지갯빛 테두리)
        '<defs><linearGradient id="dg-r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9ad7ff"/><stop offset=".35" stop-color="#c9a8ff"/>' +
        '<stop offset=".65" stop-color="#ffc6a0"/><stop offset="1" stop-color="#8ff0d8"/></linearGradient>' +
        '<radialGradient id="dg-f" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".5" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#b9a6ff" stop-opacity=".25"/></radialGradient></defs>' +
        '<circle cx="50" cy="50" r="40" fill="url(#dg-f)" stroke="url(#dg-r)" stroke-width="5"/>' +
        '<ellipse cx="36" cy="32" rx="11" ry="6" transform="rotate(-35 36 32)" fill="#fff" opacity=".85"/>',
      spark: '<path d="M10 3 V17 M3 10 H17" stroke="#fff" stroke-opacity=".6" stroke-width="1.6" stroke-linecap="round"/>',
      rainbow: "",
      logo: ["#f2f2f2", "#f2f2f2", "#f2f2f2", "#f2f2f2", "#f2f2f2"],
      logoW: 9
    }
  };

  function theme() {
    var t = document.documentElement.getAttribute("data-theme");
    return ART[t] ? t : "rug";
  }

  function logoGroups(colors, inkOnly, thin) {
    // thin: 모던 테마는 외곽선 없이 얇은 선만, 통통 튀지 않게 (<use> 안쪽이라 CSS 대신 속성으로)
    var L = [
      { x: 14,  d: "M18 22 H44 C86 22 90 108 44 108 H18 Z" },                         // D
      { x: 124, d: "M14 22 L50 66 L86 22 M50 66 V108" },                              // Y
      { x: 226, d: "M20 66 H64" },                                                    // -
      { x: 292, d: "M12 108 L50 22 L88 108 M27 82 H73" },                             // A
      { x: 404, d: "M30 22 H70 M30 108 H70 M50 22 V108" }                             // I
    ];
    var out = L.map(function (l, i) {
      // 위치(transform 속성)와 애니메이션(CSS transform)을 다른 그룹으로 분리
      return '<g transform="translate(' + l.x + ' 0)"><g class="ltr" style="--i:' + i + ';--c:' + colors[i] + (thin ? ";animation:none" : "") + '">' +
        (thin ? "" : '<path class="ink" d="' + l.d + '"/>') +
        (inkOnly ? "" : '<path class="col" d="' + l.d + '"' + (thin ? ' style="stroke-width:' + thin + '"' : "") + "/>") + "</g></g>";
    }).join("");
    if (!inkOnly) {
      out += '<g class="logo-daisy"><use href="#daisy" x="456" y="-6" width="58" height="58"/></g>';
    }
    return out;
  }

  function sprite(t) {
    var a = ART[t];
    return '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">' +
      '<symbol id="daisy" viewBox="0 0 100 100">' + a.daisy + "</symbol>" +
      '<symbol id="spark4" viewBox="0 0 20 20">' + a.spark + "</symbol>" +
      '<symbol id="rainbow" viewBox="-40 -140 1080 600">' + a.rainbow + "</symbol>" +
      // 로고 글자 경로 (D Y - A I)
      '<symbol id="dy-logo" viewBox="-10 -30 540 170">' + logoGroups(a.logo, false, a.logoW) + "</symbol>" +
      '<symbol id="dy-logo-ink" viewBox="-10 -30 540 170" class="ink-only">' + logoGroups(a.logo, true, a.logoW) + "</symbol>" +
      "</svg>";
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

  // ----- 포인터 3D -----
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var tilts = Array.prototype.slice.call(document.querySelectorAll("[data-tilt]"));
  var deeps = [];
  var tx = 0, ty = 0, cx = 0, cy = 0, raf = null;

  function place(el) {
    var d = parseFloat(el.dataset.depth) || 0;
    el.style.transform = "translate3d(" + (cx * d).toFixed(1) + "px," + (cy * d).toFixed(1) + "px," + (d * 2).toFixed(1) + "px)";
  }
  function frame() {
    cx += (tx - cx) * 0.08;
    cy += (ty - cy) * 0.08;
    tilts.forEach(function (el) {
      var max = parseFloat(el.dataset.tilt) || 10;
      el.style.transform = "rotateX(" + (-cy * max).toFixed(2) + "deg) rotateY(" + (cx * max).toFixed(2) + "deg)";
    });
    deeps.forEach(place);
    raf = (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) ? requestAnimationFrame(frame) : null;
  }
  if (!reduce) {
    window.addEventListener("pointermove", function (e) {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(frame);
    }, { passive: true });
  }

  // 테마별 배경 장면: .scene 맨 앞(뒤쪽 레이어)과 맨 뒤(앞쪽 레이어)에 끼움 (러그는 없음)
  function mountScene() {
    document.querySelectorAll(".theme-scene, .theme-front").forEach(function (e) { e.remove(); });
    var sc = SCENES[theme()];
    if (sc) {
      document.querySelectorAll(".scene").forEach(function (host) {
        var b = document.createElement("div");
        b.className = "theme-scene";
        b.setAttribute("aria-hidden", "true");
        b.innerHTML = sc.back;
        host.insertBefore(b, host.firstChild);
        var f = document.createElement("div");
        f.className = "theme-front";
        f.setAttribute("aria-hidden", "true");
        f.innerHTML = sc.front;
        host.appendChild(f);
      });
    }
    deeps = Array.prototype.slice.call(document.querySelectorAll("[data-depth]"));
    if (!reduce) deeps.forEach(place);
  }

  mountSprite();
  mountScene();
  document.addEventListener("dy:theme", function () { mountSprite(); mountScene(); });

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
      // 풀잎·다크는 svg 대신 굵은 워드마크 박스(.logo-word)를 보여 줌 (themes.css)
      el.innerHTML = svg("dy-logo") + '<span class="logo-word" aria-hidden="true">dy-ai</span>';
    }
  });

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

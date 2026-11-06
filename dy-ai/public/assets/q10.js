/* DY-AI 메인: Q10 수집 확장 프로그램 연동
 * - 설치 여부/버전 확인 → 상태 표시, 최신이면 다운로드 버튼 잠금
 * - .js-collect 버튼 → 확장에 수집 요청, 진행 상황은 토스트
 * 확장(bridge.js)과는 window.postMessage 로만 대화한다.
 */
(function () {
  "use strict";

  var ZIP_URL = "/downloads/dy-ai-q10-extension.zip";
  var VERSION_URL = "/downloads/extension.json";
  var DETECT_MS = 1200; // 이 시간 안에 확장 응답이 없으면 미설치로 판단

  var latest = null;      // 사이트에 올라간 최신 버전
  var installed = null;   // 설치된 확장 버전 (구버전은 버전을 안 알려 줘서 "unknown")
  var detected = false;
  var busy = false;

  var collectBtns = [].slice.call(document.querySelectorAll(".js-collect"));
  var pills = [].slice.call(document.querySelectorAll(".js-ext-status"));
  var dlBtn = document.querySelector(".js-dl");
  var dlLabel = document.querySelector(".js-dl-label");

  // ---------- 버전 ----------
  function cmp(a, b) {
    var x = String(a).split("."), y = String(b).split(".");
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var d = (parseInt(x[i], 10) || 0) - (parseInt(y[i], 10) || 0);
      if (d) return d > 0 ? 1 : -1;
    }
    return 0;
  }

  function state() {
    if (!detected && installed === null) return "checking";
    if (installed === null) return "none";
    if (!latest) return "ok";                     // 최신 버전 정보를 못 받으면 설치만 확인
    if (installed === "unknown" || cmp(installed, latest) < 0) return "old";
    return "ok";
  }

  function render() {
    var s = state();
    var text = {
      checking: "확장 프로그램 확인 중…",
      none: "확장 프로그램이 아직 없어요",
      old: "업데이트 필요" + (installed && installed !== "unknown" ? " · v" + installed : "") + (latest ? " → v" + latest : ""),
      ok: "설치됨 · v" + installed + (latest ? " (최신)" : "")
    }[s];
    pills.forEach(function (p) {
      p.setAttribute("data-state", s);
      p.querySelector("span").textContent = text;
    });

    if (dlBtn) {
      var v = latest ? " v" + latest : "";
      if (s === "ok") {
        dlBtn.removeAttribute("href");
        dlBtn.setAttribute("aria-disabled", "true");
        dlBtn.tabIndex = -1;
        dlLabel.textContent = "최신 버전 설치됨";
      } else {
        dlBtn.setAttribute("href", ZIP_URL + (latest ? "?v=" + latest : ""));
        dlBtn.removeAttribute("aria-disabled");
        dlBtn.removeAttribute("tabindex");
        dlLabel.textContent = (s === "old" ? "새 버전 받기" : "확장 프로그램 받기") + v;
      }
    }
  }

  fetch(VERSION_URL, { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { latest = j && j.version; render(); })
    .catch(function () {});

  setTimeout(function () { detected = true; render(); }, DETECT_MS);

  // ---------- 수집 ----------
  function setBusy(on) {
    busy = on;
    collectBtns.forEach(function (b) {
      b.setAttribute("aria-busy", on ? "true" : "false");
      var l = b.querySelector(".label");
      if (l) l.textContent = on ? "수집 중…" : "Q10 수집";
    });
  }

  function goGuide() {
    var g = document.getElementById("guide");
    if (g) g.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  window.addEventListener("message", function (e) {
    if (e.source !== window || e.origin !== location.origin) return;
    var d = e.data;
    if (!d || d.source !== "dy-ext") return;
    if (installed === null || installed === "unknown") installed = d.version || "unknown";
    if (d.type === "ready") { detected = true; render(); return; }
    if (d.type !== "q10-status") return;
    // 진행/로그인 안내는 다음 소식까지 유지, 완료·오류는 길게
    var ms = d.state === "progress" || d.state === "login" ? 0 : (d.state === "busy" ? 2400 : 9000);
    window.dyToast(d.text, ms);
    if (d.state === "done" || d.state === "error") setBusy(false);
    if (d.state === "busy") setBusy(true);
  });
  window.postMessage({ source: "dy-ai", type: "ping" }, location.origin);

  collectBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (busy) { window.dyToast("이미 수집 중이에요"); return; }
      var s = state();
      if (s === "none" || s === "checking") {
        window.dyToast("먼저 'DY-AI Q10 수집' 확장 프로그램을 설치해 주세요", 4000);
        goGuide();
        return;
      }
      if (s === "old") window.dyToast("확장 프로그램 새 버전이 있어요. 수집은 그대로 진행할게요", 3000);
      setBusy(true);
      window.postMessage({ source: "dy-ai", type: "q10-collect" }, location.origin);
    });
  });

  // ---------- 주소 복사 ----------
  document.querySelectorAll(".js-copy").forEach(function (b) {
    b.addEventListener("click", function () {
      var label = b.querySelector(".js-copy-label");
      var done = function () {
        label.textContent = "복사됨!";
        window.dyToast("주소를 복사했어요. 새 탭 주소창에 붙여 넣어 주세요");
        setTimeout(function () { label.textContent = "복사"; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(b.getAttribute("data-copy")).then(done, function () {
          window.dyToast("복사하지 못했어요. 직접 입력해 주세요: " + b.getAttribute("data-copy"), 5000);
        });
      } else {
        window.dyToast("직접 입력해 주세요: " + b.getAttribute("data-copy"), 5000);
      }
    });
  });

  render();
})();

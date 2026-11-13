/* DY-AI 메인: Q10 수집 확장 프로그램 연동
 * - 설치 여부/버전 확인 → 상태 표시, 최신이면 다운로드 버튼 잠금
 * - .js-collect 버튼 → 저장 대상(원본 엑셀/새 파일) 확인 → 확장에 수집 요청, 진행 상황은 토스트
 * - 확장이 결과(data)를 넘기면 q10-save.js 가 원본 엑셀에 덮어쓴다
 * 확장(bridge.js)과는 window.postMessage 로만 대화한다.
 */
(function () {
  "use strict";

  var ZIP_URL = "/downloads/dy-ai-q10-extension.zip";
  var VERSION_URL = "/downloads/extension.json";
  var DETECT_MS = 1200; // 이 시간 안에 확장 응답이 없으면 미설치로 판단
  var PAGE_SAVE_FROM = "0.3.0"; // 이 버전부터 확장이 결과를 페이지로 넘김 (그 전엔 확장이 직접 다운로드)

  var latest = null;      // 사이트에 올라간 최신 버전
  var installed = null;   // 설치된 확장 버전 (구버전은 버전을 안 알려 줘서 "unknown")
  var detected = false;
  var busy = false;
  var choosing = false;
  var target = null;      // 이번 수집의 저장 대상 (q10-save.js chooseTarget 결과)
  var autoLogin = null;   // 확장에 Qoo10 로그인 정보가 저장돼 있는지 (0.4.0+)
  var AUTOLOGIN_FROM = "0.4.0";
  var autoEl = document.querySelector(".js-autologin");
  var optBtn = document.querySelector(".js-options");

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
    // 확장이 없거나 업데이트가 필요하면 수집 버튼을 잠근다 (누르면 안내만)
    var locked = s !== "ok" && s !== "checking";
    collectBtns.forEach(function (b) {
      b.setAttribute("aria-disabled", locked ? "true" : "false");
      b.classList.toggle("is-locked", locked);
      b.title = locked ? (s === "old" ? "확장 프로그램 업데이트가 필요해요" : "확장 프로그램을 먼저 설치해 주세요") : "";
      var l = b.querySelector(".label");
      if (l && !busy) l.textContent = s === "old" ? "업데이트 필요" : s === "none" ? "확장 설치 필요" : "Q10 수집";
    });
    pills.forEach(function (p) {
      p.setAttribute("data-state", s);
      p.querySelector("span").textContent = text;
    });

    if (autoEl) {
      var canAuto = installed && installed !== "unknown" && cmp(installed, AUTOLOGIN_FROM) >= 0;
      autoEl.setAttribute("data-state", s === "checking" ? "checking" : !installed || installed === null ? "none" : !canAuto ? "old" : autoLogin ? "ok" : "off");
      autoEl.textContent = s === "checking" ? "확인 중…"
        : installed === null ? "확장 프로그램을 먼저 설치해 주세요"
        : !canAuto ? "확장 프로그램 v" + AUTOLOGIN_FROM + "부터 쓸 수 있어요 (업데이트 필요)"
        : autoLogin ? "자동 입력 켜짐" : "아직 설정 안 됨";
    }

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
    if (!on) render();   // 끝났으면 잠금 상태(업데이트 필요 등)에 맞는 표시로 되돌림
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
    if (d.type === "ready") { detected = true; if ("autoLogin" in d) autoLogin = !!d.autoLogin; render(); return; }
    if (d.type === "pending") { offerPending(d); return; }
    if (d.type !== "q10-status") return;
    if (d.state === "data") {
      // 수집 결과 → 엑셀 저장 → DB·구글 시트 (끝나야 버튼이 풀림)
      var t = target || { mode: "download" };
      var r = run;
      target = null;
      run = null;
      window.dyToast(d.text, 0);
      afterCollect(d.payload, t, r).then(function () { setBusy(false); });
      return;
    }
    // 진행/로그인 안내는 다음 소식까지 유지, 완료·오류는 길게
    var ms = d.state === "progress" || d.state === "login" ? 0 : (d.state === "busy" ? 2400 : 9000);
    window.dyToast(d.text, ms);
    if (run) {
      var lv = { login: "warn", error: "error", done: "ok", busy: "warn" }[d.state] || "info";
      run.step(d.state === "login" ? "로그인" : "수집", lv, d.text);
      if (d.state === "done") run.end("ok", d.text);
      if (d.state === "error") run.end("error", d.text);
      if (d.state === "busy") { run.end("cancel", d.text); run = null; }
    }
    if (d.state === "done" || d.state === "error") { setBusy(false); target = null; run = null; }
    if (d.state === "busy") setBusy(true);
  });

  // ---------- 보관된 수집 결과 (수집 중에 이 페이지를 벗어나서 저장하지 못한 것) ----------
  var pendingAsked = false;
  async function offerPending(d) {
    if (pendingAsked || busy) return;
    pendingAsked = true;
    var when = new Date(d.savedAt), hm = when.getMonth() + 1 + "/" + when.getDate() + " " + String(when.getHours()).padStart(2, "0") + ":" + String(when.getMinutes()).padStart(2, "0");
    var v = await window.dyModal({
      tone: "warn",
      title: "저장하지 못한 수집 결과가 있어요",
      body: ["수집은 끝났는데 저장되기 전에 이 페이지를 벗어나서 확장 프로그램이 보관해 둔 결과예요.",
        { note: "수집 시각 " + hm + " · 기간 " + d.start + " ~ " + d.end + ". 저장하면 DB와 구글 시트가 이 결과로 교체돼요(엑셀 파일은 건드리지 않아요). 버리면 다시 수집해야 해요." }],
      actions: [{ label: "지금 저장", value: "take", kind: "primary" }, { label: "버리기", value: "drop", kind: "quiet" }, { label: "나중에", value: null, kind: "quiet" }]
    });
    if (v === "take") {
      target = { mode: "none" };
      run = null;
      setBusy(true);
      window.postMessage({ source: "dy-ai", type: "q10-pending-take" }, location.origin);
    } else if (v === "drop") {
      window.postMessage({ source: "dy-ai", type: "q10-pending-drop" }, location.origin);
      window.dyToast("보관된 수집 결과를 버렸어요", 4000);
    }
  }

  // ---------- 수집 뒤: 엑셀 → DB·시트, 단계마다 로그 ----------
  var run = null; // 이번 수집 건의 로그 (q10-log.js)

  function count(p) {
    return p.sheets.map(function (s) { return s.name + " " + s.rows.length.toLocaleString("ko-KR") + "행"; }).join(" · ");
  }

  async function afterCollect(p, t, r) {
    var L = r || (window.dyLog ? window.dyLog.start({ start: p.start, end: p.end }) : null);
    var log = L || { step: function () {}, end: function () {}, period: function () {} };
    log.period(p.start, p.end);
    log.step("수집", "ok", "수집 완료 (" + p.start + " ~ " + p.end + ") " + count(p),
      p.warnings && p.warnings.length ? { warnings: p.warnings } : null);
    if (p.warnings && p.warnings.length) log.step("수집", "warn", "경고 " + p.warnings.length + "건: " + p.warnings.join(" / "));

    // 1) 엑셀
    var saved = false;
    log.step("엑셀 저장", "info", t.mode === "file" ? "원본 파일에 덮어쓰기: " + t.handle.name : t.mode === "none" ? "건너뜀 (엑셀 없이 진행)" : "새 파일로 받기");
    try {
      saved = await window.dyQ10Save.save(p, t);
      log.step("엑셀 저장", saved ? (t.mode === "none" ? "info" : "ok") : "warn", t.mode === "none" ? "건너뜀" : saved ? "저장 완료" : "저장 안 함 (취소)");
    } catch (e) {
      console.error("[DY-AI Q10]", e);
      log.step("엑셀 저장", "error", (e && e.message) || String(e));
      window.dyToast("엑셀 저장 중 오류가 났어요: " + (e && e.message || e), 9000);
    }

    // 2) DB · 구글 시트 (실패하면 다시 시도 가능) + 추가 항목(상품별 PV·고객·광고·Beauty Brand AD 등, 확장 0.5.0~)은 한 번만 반영
    if (!window.dyQ10Sync) { log.end(saved ? "ok" : "partial", "엑셀만 저장"); return; }
    var ex = null;
    for (;;) {
      window.dyToast("DB · 구글 시트 업데이트 중…", 0);
      var res = await window.dyQ10Sync.run(p, log);
      var bad = res.parts.filter(function (x) { return !x.ok; });
      if (ex === null) {
        if (p.extra && window.dyQ10Extra) {
          window.dyToast("추가 항목(상품별 PV · 고객 · 광고 등) 반영 중…", 0);
          ex = await window.dyQ10Extra.run(p.extra, log);
        } else {
          ex = false;
          log.step("추가 수집", "info", "추가 항목(상품별 PV·고객·찜장바구니·광고·Beauty Brand AD·행사 달력)은 확장 프로그램 0.5.0 이상에서 같이 수집돼요 (지금 설치된 확장은 건너뜀)");
        }
      }
      var exBad = ex ? ex.failed.length + ex.errors.length : 0;
      var line = "엑셀 " + (t.mode === "none" ? "-" : saved ? "✓" : "✕") + " · DB " + (bad.some(function (x) { return x.target === "DB"; }) ? "✕" : "✓") +
        " · 시트 " + (bad.some(function (x) { return x.target === "시트"; }) ? "✕" : "✓") + (ex ? " · 추가 " + (exBad ? "✕ " + exBad + "건" : "✓ " + ex.done + "건") : "");
      if (!bad.length) {
        log.end(saved && !exBad ? "ok" : "partial", line + " (" + p.start + " ~ " + p.end + ")");
        window.dyToast((exBad ? "일부 추가 항목이 실패했어요 — " : "저장 완료 — ") + line + " (" + p.start + " ~ " + p.end + ")" + (exBad ? ". 자세한 내용은 로그 메뉴에서 볼 수 있어요" : ""), exBad ? 0 : 9000);
        return;
      }
      window.dyToast("일부를 업데이트하지 못했어요 — " + line, 0);
      var v = await window.dyModal({
        tone: "warn",
        title: "DB · 구글 시트 일부를 업데이트하지 못했어요",
        body: bad.map(function (x) { return x.target + " " + x.name + ": " + x.message; })
          .concat([{ note: "엑셀 저장은 따로 끝났어요. 다시 시도하면 실패한 곳까지 같은 데이터로 다시 교체해요." }]),
        actions: [{ label: "다시 시도", value: "retry", kind: "primary" }, { label: "닫기", value: null, kind: "quiet" }]
      });
      if (v !== "retry") {
        log.end("partial", line + " (" + p.start + " ~ " + p.end + ")");
        window.dyToast("일부 실패 — " + line + ". 자세한 내용은 로그 메뉴에서 볼 수 있어요", 9000);
        return;
      }
      log.step("재시도", "info", "DB · 시트 다시 시도");
    }
  }
  // 수집기 페이지가 열려 있다는 표시(확장 bridge.js 가 결과를 넘길 때 확인) + 수집·저장 중에 이동·닫기를 하면 브라우저 경고
  document.documentElement.setAttribute("data-q10-collector", "1");
  window.addEventListener("beforeunload", function (e) {
    if (!busy) return;
    e.preventDefault();
    e.returnValue = "";
  });
  window.postMessage({ source: "dy-ai", type: "ping" }, location.origin);

  collectBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (busy) { window.dyToast("이미 수집 중이에요"); return; }
      if (choosing) return;
      var s = state();
      if (s === "none" || s === "checking") {
        window.dyToast("먼저 'DY-AI Q10 수집' 확장 프로그램을 설치해 주세요", 4000);
        goGuide();
        return;
      }
      if (s === "old") {
        window.dyToast("확장 프로그램 업데이트가 필요해요. 아래 설명서에서 최신 버전을 받아 덮어쓰고, 확장을 새로고침한 뒤 이 페이지도 새로고침해 주세요", 7000);
        goGuide();
        return;
      }
      var pageSave = installed && installed !== "unknown" && cmp(installed, PAGE_SAVE_FROM) >= 0 && window.dyQ10Save;
      if (!pageSave) {
        // 구버전 확장: 확장이 새 파일로 바로 다운로드
        window.dyToast("확장 프로그램 새 버전이 있어요. 지금은 새 파일로 받고, 업데이트하면 원본 엑셀에 바로 저장돼요", 4000);
        run = window.dyLog ? window.dyLog.start({}) : null;
        if (run) run.step("시작", "warn", "구버전 확장(" + installed + "): 확장이 새 파일로 직접 다운로드 (DB·시트 업데이트 없음)");
        setBusy(true);
        window.postMessage({ source: "dy-ai", type: "q10-collect" }, location.origin);
        return;
      }
      choosing = true;
      window.dyQ10Save.chooseTarget()
        .then(function (t) {
          if (!t) return;
          target = t;
          run = window.dyLog ? window.dyLog.start({}) : null;
          if (run) run.step("시작", "info", "저장 대상: " + (t.mode === "file" ? "원본 파일 " + t.handle.name : t.mode === "none" ? "엑셀 없이 진행" : "새 파일로 받기") + " · 확장 v" + installed);
          setBusy(true);
          window.postMessage({ source: "dy-ai", type: "q10-collect", deliver: "page" }, location.origin);
        })
        .catch(function (e) { window.dyToast("저장 위치를 정하지 못했어요: " + (e && e.message || e), 5000); })
        .then(function () { choosing = false; });
    });
  });

  // ---------- Qoo10 로그인 정보 설정 (확장 설정 화면 열기) ----------
  if (optBtn) optBtn.addEventListener("click", function () {
    if (installed === null) { window.dyToast("먼저 확장 프로그램을 설치해 주세요", 3000); goGuide(); return; }
    if (installed === "unknown" || cmp(installed, AUTOLOGIN_FROM) < 0) {
      window.dyToast("확장 프로그램을 v" + AUTOLOGIN_FROM + " 이상으로 업데이트하면 설정할 수 있어요 (1번에서 새 버전 받기)", 5000);
      return;
    }
    window.postMessage({ source: "dy-ai", type: "open-options" }, location.origin);
    window.dyToast("새 탭에서 Qoo10 아이디·비밀번호를 저장해 주세요", 3000);
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

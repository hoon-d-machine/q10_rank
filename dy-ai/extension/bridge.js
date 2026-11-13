/* DY-AI 페이지 ↔ 확장 프로그램 중계 (DY-AI 사이트에서만 실행)
 * 페이지 → 확장: window.postMessage({ source: "dy-ai", type: "q10-collect", deliver: "page" })
 * 확장 → 페이지: window.postMessage({ source: "dy-ext", type: "ready" | "q10-status", ... })
 *   q10-status 의 state: progress | login | busy | done | error | data(수집 결과 payload, 페이지가 저장)
 */
(function () {
  "use strict";

  var VERSION = chrome.runtime.getManifest().version;

  function toPage(msg) {
    msg.source = "dy-ext";
    msg.version = VERSION;
    window.postMessage(msg, location.origin);
  }

  window.addEventListener("message", function (e) {
    if (e.source !== window || e.origin !== location.origin) return;
    var d = e.data;
    if (!d || d.source !== "dy-ai") return;
    if (d.type === "ping") { ready(); checkPending(); return; }
    if (d.type === "q10-pending-take") { takePending(); return; }
    if (d.type === "q10-pending-drop") { chrome.storage.local.remove("pendingResult").catch(function () {}); return; }
    if (d.type === "open-options") { chrome.runtime.sendMessage({ type: "open-options" }).catch(function () {}); return; }
    if (d.type === "q10-collect") {
      chrome.runtime.sendMessage({ type: "q10-collect", deliver: d.deliver }).catch(function () {
        toPage({ type: "q10-status", state: "error", text: "확장 프로그램과 연결하지 못했어요. 확장 프로그램을 새로고침한 뒤 이 페이지도 새로고침해 주세요." });
      });
    }
  });

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === "q10-status") {
      // 수집 결과(data)는 수집기 페이지(q10.js 가 data-q10-collector 표시를 달아 둠)가 열려 있을 때만 받았다고 답한다.
      // 다른 DY-AI 페이지로 이동한 탭이면 ok:false → 확장이 결과를 잃지 않고 xlsx 로 내려받는다.
      var collector = document.documentElement.hasAttribute("data-q10-collector");
      if (msg.state === "data" && !collector) { sendResponse({ ok: false }); return; }
      toPage(msg);
      sendResponse({ ok: true }); // 결과(data)를 받았음을 알림 → 확장은 따로 다운로드하지 않음
    }
  });

  // 저장되지 않은 수집 결과(수집기 페이지가 닫혀 있을 때 확장이 보관한 것)가 있으면 수집기 페이지에 알림
  var PENDING_MAX_MS = 48 * 3600 * 1000;
  function checkPending() {
    chrome.storage.local.get("pendingResult").then(function (o) {
      var p = o.pendingResult;
      if (!p || !p.payload) return;
      if (Date.now() - p.savedAt > PENDING_MAX_MS) { chrome.storage.local.remove("pendingResult").catch(function () {}); return; }
      toPage({ type: "pending", savedAt: p.savedAt, start: p.payload.start, end: p.payload.end });
    }, function () {});
  }
  function takePending() {
    chrome.storage.local.get("pendingResult").then(function (o) {
      var p = o.pendingResult;
      if (!p || !p.payload) { toPage({ type: "q10-status", state: "error", text: "보관된 수집 결과가 없어요. 다시 수집해 주세요." }); return; }
      chrome.storage.local.remove("pendingResult").catch(function () {});
      toPage({ type: "q10-status", state: "data", text: "보관해 둔 수집 결과를 저장하는 중…", payload: p.payload });
    }, function () {});
  }

  // 설치돼 있음 + Qoo10 자동 로그인 설정 여부를 페이지에 알림 (ping 에도 응답)
  function ready() {
    chrome.storage.local.get("qsmLogin").then(function (o) {
      var v = o.qsmLogin;
      toPage({ type: "ready", autoLogin: !!(v && v.id && v.auto !== false) });
    }, function () { toPage({ type: "ready" }); });
  }
  chrome.storage.onChanged.addListener(function (ch, area) { if (area === "local" && ch.qsmLogin) ready(); });
  ready();
})();

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
    if (d.type === "ping") { toPage({ type: "ready" }); return; }
    if (d.type === "q10-collect") {
      chrome.runtime.sendMessage({ type: "q10-collect", deliver: d.deliver }).catch(function () {
        toPage({ type: "q10-status", state: "error", text: "확장 프로그램과 연결하지 못했어요. 확장 프로그램을 새로고침한 뒤 이 페이지도 새로고침해 주세요." });
      });
    }
  });

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === "q10-status") {
      toPage(msg);
      sendResponse({ ok: true }); // 결과(data)를 받았음을 알림 → 확장은 따로 다운로드하지 않음
    }
  });

  // 설치돼 있음을 페이지에 알림 (페이지 스크립트가 먼저/나중에 로드돼도 되게 ping에도 응답)
  toPage({ type: "ready" });
})();

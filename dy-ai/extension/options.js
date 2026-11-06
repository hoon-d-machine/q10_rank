/* Qoo10 로그인 정보 저장 (chrome.storage.local, 키: qsmLogin) */
(function () {
  "use strict";
  var KEY = "qsmLogin";
  var f = document.getElementById("f");
  var msg = document.getElementById("msg");

  function say(text, cls) { msg.textContent = text; msg.className = cls || ""; }

  chrome.storage.local.get(KEY).then(function (o) {
    var v = o[KEY];
    if (!v) { say("아직 저장된 정보가 없어요."); return; }
    f.id.value = v.id || "";
    f.pw.value = v.pw || "";
    f.ep.value = v.ep || "";
    f.auto.checked = v.auto !== false;
    say("저장돼 있어요.", "ok");
  });

  f.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = f.id.value.trim();
    if (!id) { say("아이디를 입력해 주세요.", "err"); f.id.focus(); return; }
    var v = { id: id, pw: f.pw.value, ep: f.ep.value.trim(), auto: f.auto.checked, savedAt: new Date().toISOString() };
    chrome.storage.local.set({ qsmLogin: v }).then(function () {
      say("저장했어요. DY-AI 페이지를 새로고침하면 설정됨으로 보여요.", "ok");
    }, function (err) { say("저장하지 못했어요: " + (err && err.message || err), "err"); });
  });

  document.getElementById("clear").addEventListener("click", function () {
    chrome.storage.local.remove(KEY).then(function () {
      f.reset();
      say("지웠어요. 이제 로그인 창에 자동으로 넣지 않아요.");
    });
  });
})();

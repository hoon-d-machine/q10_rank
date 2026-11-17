/* QSM 로그인 자동 입력 (Qoo10_RPA.py qsm_login 과 같은 동작)
 * - 수집 중에 확장이 연 탭에서만 동작 (background 가 판단해서 아이디/비번을 줌)
 * 1) login.aspx 의 #txtLoginID / #txtLoginPwd 채우기 → reCAPTCHA·로그인 버튼은 사람이
 * 2) 로그인 후 나오는 #ep_id 칸에 아이디 넣고 확인(#subIdSection div div a) 클릭
 */
(function () {
  "use strict";

  if (!/login\.aspx/i.test(location.pathname)) return;

  function visible(el) { return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)); }

  function setValue(el, v) {
    el.focus();
    var proto = Object.getPrototypeOf(el);
    var desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, v); else el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  }

  function report(what) { chrome.runtime.sendMessage({ type: "qsm-autofill-done", what: what }).catch(function () {}); }

  // 자동 입력 상태를 로그인 화면 위쪽에 잠깐 보여 준다 (왜 안 채워지는지 바로 보이게)
  function banner(text, bad, soft) {
    try {
      var b = document.getElementById("dy-ai-autofill");
      if (!b) {
        b = document.createElement("div"); b.id = "dy-ai-autofill";
        b.style.cssText = "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:8px 14px;border-radius:8px;font:13px/1.4 sans-serif;color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.3);max-width:80vw";
        (document.body || document.documentElement).appendChild(b);
      }
      b.style.background = soft ? "#6b7280" : bad ? "#c0392b" : "#2e7d32"; b.textContent = "DY-AI 자동 입력: " + text;
      if (!bad || soft) setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 6000);
    } catch (e) {}
  }
  var SKIP = {
    nojob: "수집 중이 아니라 건너뛰었어요 (Q10 수집 버튼으로 연 창에서만 넣어요)",
    othertab: "수집용 탭이 아니라 건너뛰었어요",
    nocred: "저장된 로그인 정보가 없어요 (관리 화면의 ‘팀 공용 로그인 정보’ 또는 확장 옵션에서 저장)",
    off: "‘로그인 창에 자동으로 넣기’가 꺼져 있어요 (확장 옵션)",
    storage: "저장 정보를 읽지 못했어요",
    nosession: "DY-AI 로그인 세션이 없어요 (사이트에 로그인한 뒤 수집 버튼을 눌러 주세요)",
    session: "DY-AI 로그인 세션이 만료됐어요 (사이트를 새로고침한 뒤 다시 수집해 주세요)",
    nodb: "팀 공용 정보 기능이 서버(DB)에 아직 설치되지 않았어요",
    noperm: "팀 공용 정보를 읽을 권한(수집 권한)이 없어요",
    dberr: "팀 공용 정보를 불러오지 못했어요"
  };

  chrome.runtime.sendMessage({ type: "qsm-autofill" }).then(function (cred) {
    if (!cred) { banner("확장 백그라운드가 응답하지 않았어요 (확장을 새로고침해 보세요)", true); return; }
    if (cred.skip) { banner((SKIP[cred.skip] || cred.skip) + (cred.skip === "othertab" ? " [탭 " + cred.tab + " / 작업 " + cred.jobTab + "]" : "") + (cred.err ? " (" + String(cred.err).slice(0, 60) + ")" : ""), true, cred.skip === "nojob"); return; }
    if (!cred.id) return;
    var filledLogin = false, filledEp = false;
    var until = Date.now() + 10 * 60 * 1000;

    var timer = setInterval(function () {
      if (Date.now() > until) { clearInterval(timer); return; }
      if (!filledLogin && Date.now() > until - 10 * 60 * 1000 + 15000 && !document.getElementById("dy-ai-autofill") && !visible(document.getElementById("txtLoginID"))) banner("로그인 입력칸을 찾지 못했어요 (Qoo10 화면이 바뀌었을 수 있어요)", true);

      // 1) 아이디 · 비밀번호
      if (!filledLogin) {
        var id = document.getElementById("txtLoginID");
        var pw = document.getElementById("txtLoginPwd");
        if (visible(id) && visible(pw)) {
          filledLogin = true;
          if (!id.value) setValue(id, cred.id);
          if (!pw.value && cred.pw) setValue(pw, cred.pw);
          banner(cred.pw ? "아이디·비밀번호를 넣었어요. reCAPTCHA 후 로그인을 눌러 주세요" : "아이디를 넣었어요 (비밀번호는 저장돼 있지 않아요)");
          report(cred.pw ? "login" : "login-id");
        }
      }

      // 2) 로그인 뒤 아이디 확인 화면
      if (!filledEp) {
        var ep = document.getElementById("ep_id");
        if (visible(ep)) {
          filledEp = true;
          setValue(ep, cred.ep || cred.id);
          var btn = document.querySelector("#subIdSection div div a");
          setTimeout(function () {
            if (btn) btn.click();
            report(btn ? "ep" : "ep-nobutton");
          }, 300);
          clearInterval(timer);
        }
      }
    }, 500);
  }).catch(function () {});
})();

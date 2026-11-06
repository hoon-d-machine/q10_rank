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

  chrome.runtime.sendMessage({ type: "qsm-autofill" }).then(function (cred) {
    if (!cred || !cred.id) return;
    var filledLogin = false, filledEp = false;
    var until = Date.now() + 10 * 60 * 1000;

    var timer = setInterval(function () {
      if (Date.now() > until) { clearInterval(timer); return; }

      // 1) 아이디 · 비밀번호
      if (!filledLogin) {
        var id = document.getElementById("txtLoginID");
        var pw = document.getElementById("txtLoginPwd");
        if (visible(id) && visible(pw)) {
          filledLogin = true;
          if (!id.value) setValue(id, cred.id);
          if (!pw.value && cred.pw) setValue(pw, cred.pw);
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

/* Qoo10(QSM) 로그인 정보 팀 공용 저장 (관리 화면, 관리자만)
 *   저장·삭제: dy_qsm_cred_set / dy_qsm_cred_clear, 상태: dy_qsm_cred_status (supabase/qsm_cred.sql)
 *   값은 DB(Vault)에 암호화돼 있고 화면에는 다시 보여 주지 않는다. 확장이 로그인 창에 자동 입력할 때 DB 에서 받아 쓴다.
 */
(function () {
  "use strict";
  var A = window.dyAuth, P = window.dyPerm;
  var root = document.querySelector(".js-cred");
  if (!root || !A) return;
  var $ = function (s) { return root.querySelector(s); };
  var f = $(".js-c-form");

  function toast(m) { if (window.dyToast) window.dyToast(m, 3500); }
  function msg(t, bad) { var m = $(".js-c-msg"); m.textContent = t || ""; m.hidden = !t; }
  function rpc(name, args) { return A.client.rpc(name, args || {}).then(function (r) { if (r.error) throw new Error(r.error.message); return r.data; }); }
  function when(t) { var d = new Date(t); return isNaN(d) ? "-" : d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2) + " " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }

  function refresh() {
    msg("");
    return rpc("dy_qsm_cred_status").then(function (s) {
      var st = $(".js-c-state");
      if (s && s.set) { st.textContent = "저장됨 · 아이디 " + (s.id_hint || "") + " · " + when(s.updated_at) + (s.updated_by ? " · " + s.updated_by : ""); st.dataset.on = "1"; }
      else { st.textContent = "저장된 정보가 없어요"; st.dataset.on = "0"; }
      $(".js-c-clear").disabled = !(s && s.set);
    }).catch(function (e) { msg(/function|PGRST202/i.test(e.message) ? "팀 공용 로그인 정보 기능이 아직 서버(DB)에 설치되지 않았어요 (supabase/qsm_cred.sql 실행 필요)" : e.message); });
  }

  f.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = f.id.value.trim();
    if (!id) { msg("아이디를 입력해 주세요"); f.id.focus(); return; }
    var go = function () {
      return rpc("dy_qsm_cred_set", { p_id: id, p_pw: f.pw.value, p_ep: f.ep.value.trim() }).then(function () {
        f.pw.value = ""; f.reset(); toast("팀 공용 로그인 정보를 저장했어요"); return refresh();
      }).catch(function (err) { msg("저장하지 못했어요: " + err.message); });
    };
    if (!f.pw.value) {
      window.dyModal({ tone: "warn", title: "비밀번호 없이 저장할까요?",
        body: ["비밀번호 칸이 비어 있어요. 이대로 저장하면 아이디만 자동으로 들어가요.", { note: "비밀번호를 바꾸려면 다시 입력해서 저장하세요. 저장된 비밀번호는 화면에 다시 보여 주지 않아요." }],
        actions: [{ label: "비밀번호 없이 저장", value: "ok", kind: "primary" }, { label: "취소", value: null, kind: "quiet" }] }).then(function (v) { if (v === "ok") go(); });
    } else go();
  });

  $(".js-c-clear").addEventListener("click", function () {
    window.dyModal({ tone: "warn", title: "팀 공용 로그인 정보를 삭제할까요?",
      body: ["삭제하면 모든 사용자의 자동 입력이 멈춰요. (각자 확장 옵션에 따로 저장한 정보는 그대로예요)", { note: "삭제 기록은 변경 이력에 남아요." }],
      actions: [{ label: "삭제", value: "ok", kind: "primary" }, { label: "취소", value: null, kind: "quiet" }] }).then(function (v) {
      if (v !== "ok") return;
      rpc("dy_qsm_cred_clear").then(function () { toast("삭제했어요"); return refresh(); }).catch(function (err) { msg("삭제하지 못했어요: " + err.message); });
    });
  });

  (P ? P.ready : Promise.resolve()).then(function () { if (P && P.isAdmin()) refresh(); else root.hidden = true; });
})();

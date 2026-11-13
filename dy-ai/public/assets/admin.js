/* DY-AI 계정 관리 화면 (/admin): 관리자만. 계정 목록·만들기·권한 편집·비밀번호·사용 중지·삭제
 *   목록·권한 저장: DB 함수 dy_admin_users / dy_admin_set_perms (관리자 확인)
 *   계정 만들기·비밀번호·중지·삭제: Worker /api/admin/* (service key 는 Worker 에만 있음)
 *   권한 키 목록(메뉴·탭·기능)은 perm.js 의 CATALOG
 */
(function () {
  "use strict";
  var A = window.dyAuth, P = window.dyPerm;
  var $ = function (s) { return document.querySelector(s); };
  var rowsEl = $(".js-rows"), countEl = $(".js-count"), msgEl = $(".js-msg");
  var users = [], myId = null;

  function h(tag, c, text) { var e = document.createElement(tag); if (c) e.className = c; if (text != null) e.textContent = text; return e; }
  function toast(m, ms) { if (window.dyToast) window.dyToast(m, ms || 3500); }
  function showMsg(t) { msgEl.textContent = t || ""; msgEl.hidden = !t; }
  function friendly(e) { var m = String((e && e.message) || e || ""); return /admin only|permission|403/i.test(m) ? "관리자만 쓸 수 있어요" : m || "알 수 없는 오류"; }
  function when(t) { if (!t) return "-"; var d = new Date(t); return isNaN(d) ? "-" : d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2) + " " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }

  // ---------- Worker 호출 ----------
  function api(method, path, body) {
    return A.getSession().then(function (s) {
      if (!s) throw new Error("로그인이 필요해요");
      return fetch(path, { method: method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.access_token }, body: body ? JSON.stringify(body) : undefined });
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ("오류 " + r.status)); return j; }); });
  }
  function rpc(name, args) { return A.client.rpc(name, args || {}).then(function (r) { if (r.error) throw new Error(r.error.message); return r.data; }); }

  // ---------- 목록 ----------
  function summary(u) {
    if (u.is_admin) return "관리자 (전체)";
    var p = u.perms || [];
    if (p.indexOf("*") >= 0) return "전체 허용";
    if (!p.length) return "권한 없음";
    var c = function (pre) { return p.filter(function (k) { return k.indexOf(pre) === 0; }).length; };
    return "메뉴 " + c("menu.") + " · 탭 " + (c("dash.") + c("data.t.") + c("event.t.")) + " · 기능 " + (c("feat.") + c("edit."));
  }
  function render() {
    rowsEl.innerHTML = "";
    countEl.textContent = users.length + "개 계정";
    users.forEach(function (u) {
      var tr = h("tr", u.disabled ? "is-off" : "");
      var nameTd = h("td", "admin-name"), nm = h("span", null, u.name || "-"), nb = h("button", "logs-btn admin-rename", "이름 수정");
      nb.type = "button"; nb.title = "상단에 표시되는 이름을 바꿔요"; nb.addEventListener("click", function () { renameUser(u); });
      nameTd.appendChild(nm); nameTd.appendChild(nb); tr.appendChild(nameTd);
      var idTd = h("td", null, u.email); idTd.className = "admin-id"; tr.appendChild(idTd);
      tr.appendChild(h("td", null, u.is_admin ? "관리자" : "일반"));
      var st = h("td"); var b = h("span", "admin-badge " + (u.disabled ? "is-off" : "is-on"), u.disabled ? "사용 중지" : "사용 중"); st.appendChild(b);
      if (!u.registered) st.appendChild(h("span", "admin-badge is-warn", "권한 미설정"));
      tr.appendChild(st);
      tr.appendChild(h("td", null, summary(u)));
      tr.appendChild(h("td", null, when(u.last_sign_in_at)));
      var act = h("td", "admin-acts"), self = u.id === myId;
      [["권한 편집", function () { editUser(u); }], ["비밀번호", function () { pwUser(u); }],
        [u.disabled ? "사용 재개" : "사용 중지", function () { toggleUser(u); }, self], ["삭제", function () { deleteUser(u); }, self]].forEach(function (a) {
        var btn = h("button", "logs-btn", a[0]); btn.type = "button"; if (a[2]) { btn.disabled = true; btn.title = "자기 자신에게는 쓸 수 없어요"; } btn.addEventListener("click", a[1]); act.appendChild(btn);
      });
      tr.appendChild(act);
      rowsEl.appendChild(tr);
    });
    if (!users.length) rowsEl.innerHTML = '<tr><td colspan="7" class="admin-empty">계정이 없어요.</td></tr>';
  }
  function load() {
    showMsg("");
    return rpc("dy_admin_users").then(function (d) { users = d || []; render(); }).catch(function (e) { rowsEl.innerHTML = '<tr><td colspan="7" class="admin-empty">불러오지 못했어요</td></tr>'; showMsg(friendly(e)); });
  }

  // ---------- 모달 공통 ----------
  function modal(title, desc, build) {
    var prev = document.activeElement, ov = h("div", "inni-modal"), card = h("div", "inni-modal-card is-wide admin-modal");
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", title);
    card.appendChild(h("h3", null, title)); if (desc) card.appendChild(h("p", null, desc));
    var err = h("div", "inni-modal-err"), acts = h("div", "inni-modal-acts"), gap = h("span", "inni-gap"), cancel = h("button", "dash-btn", "취소"), save = h("button", "dash-btn is-primary", "저장");
    cancel.type = save.type = "button";
    function close() { document.removeEventListener("keydown", onKey, true); if (ov.parentNode) ov.parentNode.removeChild(ov); if (prev && prev.focus) prev.focus(); }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
    var m = { card: card, err: err, save: save, close: close };
    var first = build(m);
    card.appendChild(err); [gap, cancel, save].forEach(function (x) { acts.appendChild(x); }); card.appendChild(acts);
    ov.appendChild(card); document.body.appendChild(ov); document.addEventListener("keydown", onKey, true);
    cancel.addEventListener("click", close);
    if (first && first.focus) first.focus();
    return m;
  }
  function field(card, label, input, hint) {
    var l = h("label", "admin-field"); l.appendChild(h("span", null, label)); l.appendChild(input); if (hint) l.appendChild(h("small", null, hint)); card.appendChild(l); return input;
  }
  function textInput(type, val, ph) { var i = h("input"); i.type = type; i.value = val || ""; if (ph) i.placeholder = ph; i.autocomplete = "off"; return i; }

  // ---------- 권한 편집기 ----------
  // 반환: { el, get() → { is_admin, perms[] } }
  function permEditor(u) {
    var box = h("div", "admin-perms"), cur = (u && u.perms) || [];
    var allOn = cur.indexOf("*") >= 0, admin = !!(u && u.is_admin);
    var adminCb = h("input"); adminCb.type = "checkbox"; adminCb.checked = admin;
    var al = h("label", "admin-check admin-strong"); al.appendChild(adminCb); al.appendChild(document.createTextNode(" 관리자 (모든 권한 + 계정 관리)")); box.appendChild(al);
    var allCb = h("input"); allCb.type = "checkbox"; allCb.checked = allOn;
    var all = h("label", "admin-check admin-strong"); all.appendChild(allCb); all.appendChild(document.createTextNode(" 전체 허용 (나중에 생기는 권한도 자동 포함)")); box.appendChild(all);
    var presets = h("div", "admin-presets"); presets.appendChild(h("small", null, "빠른 선택"));
    var groupsEl = h("div", "admin-groups"), cbs = [];
    function setKeys(keys) { cbs.forEach(function (x) { x.cb.checked = keys === "all" || keys.indexOf(x.key) >= 0; }); refresh(); }
    [["메뉴만", function () { setKeys(P.allKeys().filter(function (k) { return k.indexOf("menu.") === 0; })); }],
      ["조회만 (설명·엑셀 가능, 설정·입력 불가)", function () { setKeys(P.allKeys().filter(function (k) { return ["feat.settings", "feat.input", "feat.collect", "edit.codes"].indexOf(k) < 0; })); }],
      ["모두 선택", function () { setKeys("all"); }], ["모두 해제", function () { setKeys([]); }]].forEach(function (p) {
      var b = h("button", "logs-btn", p[0]); b.type = "button"; b.addEventListener("click", p[1]); presets.appendChild(b);
    });
    box.appendChild(presets);
    P.CATALOG.forEach(function (g) {
      var gd = h("fieldset", "admin-group"), lg = h("legend"), gcb = h("input"); gcb.type = "checkbox";
      var ll = h("label", "admin-check"); ll.appendChild(gcb); ll.appendChild(document.createTextNode(" " + g.group)); lg.appendChild(ll); gd.appendChild(lg);
      var items = h("div", "admin-items"), mine = [];
      g.items.forEach(function (it) {
        var l = h("label", "admin-check"), cb = h("input"); cb.type = "checkbox"; cb.checked = allOn || cur.indexOf(it[0]) >= 0;
        l.appendChild(cb); l.appendChild(document.createTextNode(" " + it[1])); items.appendChild(l);
        var rec = { key: it[0], cb: cb }; cbs.push(rec); mine.push(rec);
        cb.addEventListener("change", function () { syncGroup(); });
      });
      function syncGroup() { var n = mine.filter(function (x) { return x.cb.checked; }).length; gcb.checked = n === mine.length; gcb.indeterminate = n > 0 && n < mine.length; }
      gcb.addEventListener("change", function () { mine.forEach(function (x) { x.cb.checked = gcb.checked; }); syncGroup(); });
      gd.appendChild(items); groupsEl.appendChild(gd); syncGroup(); mine.syncGroup = syncGroup; g._sync = syncGroup;
    });
    box.appendChild(groupsEl);
    function refresh() {
      var off = adminCb.checked || allCb.checked;
      cbs.forEach(function (x) { x.cb.disabled = off; });
      Array.prototype.forEach.call(groupsEl.querySelectorAll("legend input"), function (i) { i.disabled = off; });
      Array.prototype.forEach.call(presets.querySelectorAll("button"), function (b) { b.disabled = off; });
      groupsEl.classList.toggle("is-off", off);
      P.CATALOG.forEach(function (g) { if (g._sync) g._sync(); });
    }
    adminCb.addEventListener("change", refresh); allCb.addEventListener("change", refresh); refresh();
    return {
      el: box,
      get: function () {
        var keys = cbs.filter(function (x) { return x.cb.checked; }).map(function (x) { return x.key; });
        return { is_admin: adminCb.checked, perms: allCb.checked ? ["*"] : keys };
      }
    };
  }

  // ---------- 계정 만들기 ----------
  function newUser() {
    modal("계정 만들기", "아이디만 입력하면 로그인 때도 아이디만 써요 (예: kim). 이메일을 쓰려면 @ 까지 입력해요.", function (m) {
      var login = field(m.card, "아이디", textInput("text", "", "예: kim 또는 kim@company.com"), "영문·숫자·._- 2~40자");
      var name = field(m.card, "이름", textInput("text", "", "표시용 이름"));
      var pw = field(m.card, "비밀번호", textInput("password", "", "8자 이상"), "처음 비밀번호예요. 직접 알려 주고 로그인 뒤 바꾸게 해 주세요.");
      var note = field(m.card, "메모", textInput("text", "", "예: 영업팀"));
      var ed = permEditor(null); m.card.appendChild(ed.el);
      m.save.addEventListener("click", function () {
        var g = ed.get(); m.err.textContent = ""; m.save.disabled = true;
        api("POST", "/api/admin/users", { login: login.value, password: pw.value, name: name.value, note: note.value, is_admin: g.is_admin, perms: g.perms })
          .then(function () { toast("계정을 만들었어요"); m.close(); return load(); })
          .catch(function (e) { m.err.textContent = friendly(e); m.save.disabled = false; });
      });
      return login;
    });
  }

  // ---------- 권한 편집 ----------
  function editUser(u) {
    modal("권한 편집 · " + (u.name || u.email), u.email, function (m) {
      var name = field(m.card, "이름", textInput("text", u.name || "", "표시용 이름"));
      var note = field(m.card, "메모", textInput("text", u.note || "", "예: 영업팀"));
      var ed = permEditor(u); m.card.appendChild(ed.el);
      m.save.addEventListener("click", function () {
        var g = ed.get(); m.err.textContent = ""; m.save.disabled = true;
        rpc("dy_admin_set_perms", { p_user: u.id, p_is_admin: g.is_admin, p_perms: g.perms, p_name: name.value, p_note: note.value })
          .then(function () { toast("권한을 저장했어요"); m.close(); return load(); })
          .catch(function (e) { m.err.textContent = friendly(e); m.save.disabled = false; });
      });
      return name;
    });
  }

  // ---------- 이름만 바꾸기 (상단 계정 이름으로 보임) ----------
  function renameUser(u) {
    modal("이름 수정 · " + u.email, "화면 위쪽(테마와 로그아웃 사이)에 보이는 이름이에요. 그 계정이 다시 불러올 때 바뀌어요. 비우면 아이디가 보여요.", function (m) {
      var name = field(m.card, "이름", textInput("text", u.name || "", "표시용 이름"));
      var go = function () {
        m.err.textContent = ""; m.save.disabled = true;
        rpc("dy_admin_set_perms", { p_user: u.id, p_is_admin: u.is_admin, p_perms: u.perms || [], p_name: name.value, p_note: u.note })
          .then(function () { toast("이름을 바꿨어요"); m.close(); return load(); })
          .catch(function (e) { m.err.textContent = friendly(e); m.save.disabled = false; });
      };
      m.save.addEventListener("click", go);
      name.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); go(); } });
      return name;
    });
  }

  // ---------- 비밀번호 · 중지 · 삭제 ----------
  function pwUser(u) {
    modal("비밀번호 변경 · " + (u.name || u.email), "새 비밀번호를 정해 주세요. 그 계정은 다음 로그인부터 새 비밀번호를 써요.", function (m) {
      var pw = field(m.card, "새 비밀번호", textInput("password", "", "8자 이상")), pw2 = field(m.card, "한 번 더", textInput("password", "", ""));
      m.save.addEventListener("click", function () {
        if (pw.value !== pw2.value) { m.err.textContent = "두 비밀번호가 달라요"; return; }
        m.err.textContent = ""; m.save.disabled = true;
        api("POST", "/api/admin/users/" + u.id + "/password", { password: pw.value })
          .then(function () { toast("비밀번호를 바꿨어요"); m.close(); })
          .catch(function (e) { m.err.textContent = friendly(e); m.save.disabled = false; });
      });
      return pw;
    });
  }
  function toggleUser(u) {
    var dis = !u.disabled;
    window.dyModal({ tone: "warn", title: dis ? "이 계정을 사용 중지할까요?" : "이 계정을 다시 사용할까요?",
      body: [(u.name || u.email) + " (" + u.email + ")", { note: dis ? "사용 중지하면 로그인할 수 없고, 이미 로그인한 화면도 다시 불러올 때 로그아웃돼요. 언제든 다시 풀 수 있어요." : "다시 로그인할 수 있게 돼요." }],
      actions: [{ label: dis ? "사용 중지" : "사용 재개", value: "ok", kind: "primary" }, { label: "취소", value: null, kind: "quiet" }] }).then(function (v) {
      if (v !== "ok") return;
      api("POST", "/api/admin/users/" + u.id + "/disable", { disabled: dis }).then(function () { toast(dis ? "사용 중지했어요" : "다시 사용하도록 했어요"); return load(); }).catch(function (e) { showMsg(friendly(e)); });
    });
  }
  function deleteUser(u) {
    window.dyModal({ tone: "warn", title: "이 계정을 삭제할까요?", body: [(u.name || u.email) + " (" + u.email + ")", { note: "삭제하면 되돌릴 수 없어요. 그 계정이 남긴 코멘트·설정 기록은 그대로 남아요. 잠시 막으려면 ‘사용 중지’를 쓰세요." }],
      actions: [{ label: "삭제", value: "ok", kind: "primary" }, { label: "취소", value: null, kind: "quiet" }] }).then(function (v) {
      if (v !== "ok") return;
      api("DELETE", "/api/admin/users/" + u.id).then(function () { toast("삭제했어요"); return load(); }).catch(function (e) { showMsg(friendly(e)); });
    });
  }

  // ---------- 시작 ----------
  $(".js-new").addEventListener("click", newUser);
  $(".js-refresh").addEventListener("click", load);
  document.getElementById("logout") && null;
  (A ? A.requireLogin() : Promise.resolve(null)).then(function (s) {
    myId = s && s.user && s.user.id;
    return P ? P.ready : null;
  }).then(function () { if (P && P.isAdmin()) load(); else if (P && P.me().open) { rowsEl.innerHTML = '<tr><td colspan="7" class="admin-empty">계정 관리 기능이 아직 서버(DB)에 설치되지 않았어요 (supabase/admin.sql 실행 필요)</td></tr>'; } });
})();

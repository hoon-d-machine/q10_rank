/* 식순 수정 페이지: PIN 으로 들어와 순서·내용(한·영·일)을 고치고 저장한다.
 * 저장은 Supabase honrye_save 함수가 PIN 을 확인한 뒤에만 된다. 알림창(alert/confirm) 대신 자체 대화상자를 쓴다.
 */
(function () {
  "use strict";

  var Store = window.HonryeStore, slug = Store.slug();
  var LNAME = { ko: "한국어", ja: "日本語" };
  var S = { pin: "", rev: null, data: null, saved: "", lang: "ko", open: null, saving: false, pv: false, pvReady: false };

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function loc() { return { ko: "", en: "", ja: "" }; }
  function draftKey() { return "honrye.draft." + slug; }
  function isDirty() { return S.data && JSON.stringify(S.data) !== S.saved; }

  // ---------- 알림 / 대화상자 ----------
  function toast(msg, err) {
    var t = $("toast");
    t.textContent = msg; t.className = "on" + (err ? " err" : "");
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.className = ""; }, 3600);
  }

  // o: { title, text, inputs:[{name,label,type,inputmode}], buttons:[{label,value,primary,danger}] } → Promise<{value, values}>
  function modal(o) {
    return new Promise(function (resolve) {
      var ov = el("div", "ov"), md = el("div", "md"), ins = {};
      md.setAttribute("role", "dialog"); md.setAttribute("aria-modal", "true");
      md.appendChild(el("h3", null, o.title || ""));
      if (o.text) md.appendChild(el("p", null, o.text));
      (o.inputs || []).forEach(function (i) {
        var w = el("label", "fld"); w.appendChild(el("span", null, i.label));
        var inp = el("input"); inp.type = i.type || "text"; inp.autocomplete = "off";
        if (i.inputmode) inp.inputMode = i.inputmode;
        w.appendChild(inp); md.appendChild(w); ins[i.name] = inp;
      });
      var acts = el("div", "acts");
      (o.buttons || [{ label: "확인", value: "ok", primary: true }]).forEach(function (b) {
        var bt = el("button", "btn" + (b.primary ? " primary" : "") + (b.danger ? " danger" : ""), b.label);
        bt.type = "button"; bt.addEventListener("click", function () { close(b.value); });
        acts.appendChild(bt);
      });
      md.appendChild(acts); ov.appendChild(md); document.body.appendChild(ov);
      function vals() { var v = {}; Object.keys(ins).forEach(function (k) { v[k] = ins[k].value; }); return v; }
      function close(v) { document.removeEventListener("keydown", onKey); var out = { value: v, values: vals() }; document.body.removeChild(ov); resolve(out); }
      function onKey(e) {
        if (e.key === "Escape") close("cancel");
        if (e.key === "Enter" && e.target && e.target.tagName === "INPUT") { var p = md.querySelector(".btn.primary"); if (p) p.click(); }
      }
      document.addEventListener("keydown", onKey);
      var first = md.querySelector("input") || md.querySelector(".btn.primary") || md.querySelector(".btn");
      if (first) first.focus();
    });
  }

  function errText(e) {
    if (e && (e.status === 404 || e.code === "PGRST202")) return "저장소가 아직 준비되지 않았어요. (Supabase 에서 honrye.sql 을 실행해야 해요)";
    if (e && e.name === "AbortError") return "시간이 너무 오래 걸려요. 인터넷을 확인해 주세요.";
    return "연결하지 못했어요. 인터넷을 확인해 주세요.";
  }
  function pinErr(code) {
    return code === "locked" ? "틀린 횟수가 많아 잠시 잠겼어요. 10분 뒤에 다시 시도해 주세요." : "PIN이 맞지 않아요.";
  }

  var ICON_OPTS = [["", "없음"], ["bell", "종 (시작)"], ["lantern", "청사초롱"], ["goose", "기러기"], ["candle", "촛불"], ["people", "사람들 (인사)"], ["bow", "절"], ["scroll", "두루마리 (선언)"], ["bible", "성경책 (성혼선언)"], ["letter", "편지 (축사)"], ["flower", "꽃"], ["gate", "문 (마무리)"], ["heart", "하트"]];
  var DEF_ICON = { s1: "bell", s2: "lantern", s3: "goose", s4: "candle", s5: "people", s6: "bow", s7: "bible", s8: "letter", s9: "gate" };

  // ---------- 데이터 모양 맞추기 ----------
  function ensure(d) {
    d.intro = d.intro || loc();
    d.subtitle = d.subtitle || loc();
    d.title = d.title || loc();
    d.couple = d.couple || {};
    ["groom", "bride"].forEach(function (k) { d.couple[k] = d.couple[k] || loc(); });
    d.steps = d.steps || [];
    d.steps.forEach(function (s, i) {
      s.id = s.id || ("s" + (i + 1));
      ["title", "one", "meaning", "how"].forEach(function (f) { s[f] = s[f] || loc(); });
      if (s.note) { s.note.title = s.note.title || loc(); s.note.body = s.note.body || loc(); }
    });
    return d;
  }
  function pickKo(o) { return (o && (o[S.lang] || o.ko)) || ""; }

  // ---------- 입력칸 만들기: obj[key] 는 { ko, en, ja }, 지금 고르는 언어 칸만 고친다 ----------
  function field(label, kind, obj, key, o) {
    o = o || {};
    var wrap = el("label", "fld"), cap = el("span", null, label);
    wrap.appendChild(cap);
    var ctl = el(kind === "area" ? "textarea" : "input");
    if (kind !== "area") ctl.type = "text";
    if (o.rows) ctl.rows = o.rows;
    if (o.ph) ctl.placeholder = o.ph;
    ctl.value = obj[key][S.lang] || "";
    wrap.appendChild(ctl);
    if (o.hint) cap.appendChild(el("span", "hint2", o.hint));
    var badge = null, ref = null;
    if (S.lang !== "ko") {
      badge = el("span", "badge", "비어 있음 → 한국어로 표시"); cap.appendChild(badge);
      ref = el("div", "ref", "한국어: " + (obj[key].ko || "(비어 있음)")); wrap.appendChild(ref);
      badge.hidden = !!ctl.value.trim();
    }
    ctl.addEventListener("input", function () {
      obj[key][S.lang] = ctl.value;
      if (badge) badge.hidden = !!ctl.value.trim();
      if (o.onInput) o.onInput(ctl.value);
      changed();
    });
    return wrap;
  }

  // ---------- 그리기 ----------
  function renderBasics() {
    var b = $("basics"); b.textContent = "";
    b.appendChild(field("제목 (맨 위 큰 글씨)", "area", S.data, "title", { rows: 2, hint: "줄바꿈으로 줄 나누기 · 비우면 기본 제목(전통 혼례 / 식순)" }));
    b.appendChild(field("부제 (제목 아래 한 줄, 예: 전통 사대부가 혼인례 · 친영례)", "line", S.data, "subtitle", { hint: "비우면 기본 부제(전통 사대부가 혼인례 · 친영례)로 보여요" }));
    b.appendChild(field("소개 문구 (맨 위 설명)", "area", S.data, "intro", { rows: 3 }));
    var isKo = S.lang === "ko";
    b.appendChild(field("신랑 이름", "line", S.data.couple, "groom", { hint: isKo ? "" : "비우면 한글 이름으로 보여요" }));
    b.appendChild(field("신부 이름", "line", S.data.couple, "bride", { hint: isKo ? "" : "비우면 한글 이름으로 보여요" }));
  }

  function renderList() {
    var list = $("stepList"); list.textContent = "";
    var steps = S.data.steps;
    steps.forEach(function (s, i) {
      var li = el("li", "item" + (S.open === s.id ? " open" : ""));
      var head = el("div", "sh"); head.setAttribute("role", "button"); head.tabIndex = 0;
      head.setAttribute("aria-expanded", String(S.open === s.id));
      head.appendChild(el("span", "sn", String(i + 1)));
      var st = el("span", "st"); var tt = el("span", null, pickKo(s.title) || "(제목 없음)"); st.appendChild(tt);
      if (S.lang !== "ko" && !(s.title[S.lang] || "").trim()) st.appendChild(el("small", null, "제목이 비어 있어 한국어로 표시돼요"));
      head.appendChild(st);
      var mv = el("span", "mv");
      var up = el("button", "btn ghost", "▲"), dn = el("button", "btn ghost", "▼");
      up.type = dn.type = "button";
      up.setAttribute("aria-label", "위로"); dn.setAttribute("aria-label", "아래로");
      up.disabled = i === 0; dn.disabled = i === steps.length - 1;
      up.addEventListener("click", function (e) { e.stopPropagation(); move(i, -1); });
      dn.addEventListener("click", function (e) { e.stopPropagation(); move(i, 1); });
      mv.appendChild(up); mv.appendChild(dn); head.appendChild(mv);
      function toggle() { S.open = S.open === s.id ? null : s.id; renderList(); if (S.open) li = null; }
      head.addEventListener("click", toggle);
      head.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
      li.appendChild(head);

      if (S.open === s.id) {
        var body = el("div", "body");
        body.appendChild(field("제목", "line", s, "title", { onInput: function (v) { tt.textContent = v.trim() || pickKo(s.title) || "(제목 없음)"; } }));
        var ic = el("label", "fld"); ic.appendChild(el("span", null, "아이콘 (모든 언어 공통)"));
        var sel = el("select");
        ICON_OPTS.forEach(function (o) { var op = el("option", null, o[1]); op.value = o[0]; sel.appendChild(op); });
        sel.value = s.icon || DEF_ICON[s.id] || "";
        sel.addEventListener("change", function () { s.icon = sel.value; changed(); });
        ic.appendChild(sel); body.appendChild(ic);
        body.appendChild(field("한 줄 설명 (목록에 보이는 글)", "line", s, "one"));
        body.appendChild(field("이 의식의 뜻", "area", s, "meaning", { rows: 6, hint: "빈 줄로 문단 나누기" }));
        body.appendChild(field("이렇게 진행돼요", "area", s, "how", { rows: 5, hint: "줄마다 한 항목" }));
        var chk = el("label", "chk"), cb = el("input"); cb.type = "checkbox"; cb.checked = !!s.note;
        chk.appendChild(cb); chk.appendChild(document.createTextNode("참고 박스 쓰기 (파란 안내 상자)"));
        body.appendChild(chk);
        var noteBox = el("div");
        function drawNote() {
          noteBox.textContent = "";
          if (!s.note) return;
          noteBox.appendChild(field("참고 박스 제목", "line", s.note, "title"));
          noteBox.appendChild(field("참고 박스 내용", "area", s.note, "body", { rows: 4 }));
        }
        cb.addEventListener("change", function () {
          s.note = cb.checked ? { title: loc(), body: loc() } : null;
          drawNote(); changed();
        });
        drawNote(); body.appendChild(noteBox);
        var del = el("button", "btn ghost danger", "이 순서 삭제"); del.type = "button";
        del.disabled = steps.length <= 1;
        del.addEventListener("click", function () { removeStep(i); });
        body.appendChild(del);
        li.appendChild(body);
      }
      list.appendChild(li);
    });
  }

  function render() {
    Array.prototype.forEach.call(document.querySelectorAll(".langtabs button"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-l") === S.lang));
    });
    renderBasics(); renderList(); updateState();
  }

  // ---------- 변경 ----------
  function updateState() {
    var d = isDirty(), st = $("state");
    st.textContent = d ? "저장 안 된 변경이 있어요" : "저장됨";
    st.className = "state" + (d ? " dirty" : "");
  }
  function changed() {
    updateState();
    clearTimeout(S.dt);
    S.dt = setTimeout(function () { try { localStorage.setItem(draftKey(), JSON.stringify({ data: S.data, rev: S.rev })); } catch (e) {} }, 400);
    clearTimeout(S.pt); S.pt = setTimeout(postPreview, 250);
  }
  function move(i, dir) {
    var a = S.data.steps, j = i + dir;
    if (j < 0 || j >= a.length) return;
    var t = a[i]; a[i] = a[j]; a[j] = t;
    renderList(); changed();
  }
  function removeStep(i) {
    var s = S.data.steps[i];
    modal({ title: "순서 삭제", text: "‘" + (pickKo(s.title) || "제목 없음") + "’ 순서를 삭제할까요?\n(저장하기 전에는 하객 화면에 영향이 없어요.)",
      buttons: [{ label: "취소", value: "cancel" }, { label: "삭제", value: "ok", primary: true, danger: true }] })
      .then(function (r) {
        if (r.value !== "ok") return;
        S.data.steps.splice(i, 1); if (S.open === s.id) S.open = null;
        renderList(); changed();
      });
  }
  function addStep() {
    var id = "n" + Date.now().toString(36);
    S.data.steps.push({ id: id, title: { ko: "새 순서", en: "", ja: "" }, one: loc(), meaning: loc(), how: loc(), note: null });
    S.open = id; renderList(); changed();
    var items = document.querySelectorAll("#stepList .item");
    var last = items[items.length - 1];
    if (last) { last.scrollIntoView({ block: "center", behavior: "smooth" }); var inp = last.querySelector("input[type=text]"); if (inp) inp.focus(); }
  }

  // ---------- 미리보기 ----------
  function postPreview() {
    var f = $("pv");
    if (!S.pv || !S.pvReady || !f.contentWindow) return;
    f.contentWindow.postMessage({ type: "honrye-preview", data: S.data, lang: S.lang }, location.origin);
  }
  window.addEventListener("message", function (e) {
    if (e.origin === location.origin && e.data && e.data.type === "honrye-preview-ready") { S.pvReady = true; postPreview(); }
  });
  function togglePreview() {
    S.pv = !S.pv;
    $("pvWrap").hidden = !S.pv;
    $("pvBtn").textContent = S.pv ? "미리보기 닫기" : "미리보기";
    if (S.pv) {
      if (!$("pv").getAttribute("src")) $("pv").src = "/?c=" + slug + "&preview=1&lang=" + S.lang;
      else postPreview();
      $("pvWrap").scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

  // ---------- 저장 ----------
  function save() {
    if (S.saving) return;
    S.saving = true; $("saveBtn").disabled = true; $("state").textContent = "저장 중…";
    Store.save(S.pin, S.data, slug, S.rev).then(function (r) {
      if (r && r.ok) {
        S.rev = r.rev; S.saved = JSON.stringify(S.data);
        try { localStorage.removeItem(draftKey()); } catch (e) {}
        Store.cacheSet(slug, { rev: r.rev, data: S.data });
        toast("저장했어요. 하객 화면은 새로 열 때 바로 바뀌어요.");
        return;
      }
      var code = r && r.error;
      if (code === "stale") {
        return modal({ title: "다른 곳에서 먼저 수정됐어요", text: "지금 보는 내용보다 더 새로운 저장본이 있어요.\n어떻게 할까요?",
          buttons: [{ label: "취소", value: "cancel" }, { label: "최신 내용 불러오기 (내 변경 버림)", value: "reload" }, { label: "내 내용으로 덮어쓰기", value: "force", primary: true }] })
          .then(function (m) {
            if (m.value === "force") { S.rev = r.rev; S.saving = false; return save(); }
            if (m.value === "reload") return loadContent(true);
          });
      }
      if (code === "bad_pin" || code === "locked") { toast(pinErr(code), true); if (code === "bad_pin") lock(); return; }
      toast(code === "bad_data" ? "내용 형식이 올바르지 않아 저장하지 못했어요." : "저장하지 못했어요.", true);
    }).catch(function (e) { toast(errText(e), true); })
      .then(function () { S.saving = false; $("saveBtn").disabled = false; updateState(); });
  }

  // ---------- 불러오기 / 들어오기 ----------
  function loadContent(discardDraft) {
    return Store.load(slug, 10000).then(function (r) {
      S.rev = r ? r.rev : null;
      S.data = ensure(r ? clone(r.data) : clone(window.HONRYE_DEFAULT));
      S.saved = JSON.stringify(S.data);
      if (!r) toast("아직 저장된 내용이 없어서 기본 내용으로 시작해요.");
      var draft = null;
      if (discardDraft) { try { localStorage.removeItem(draftKey()); } catch (e) {} }
      else { try { draft = JSON.parse(localStorage.getItem(draftKey())); } catch (e) {} }
      render(); postPreview();
      if (draft && draft.data && JSON.stringify(ensure(clone(draft.data))) !== S.saved) {
        return modal({ title: "저장 안 된 임시 변경이 있어요", text: "지난번에 고치다 저장하지 못한 내용이 남아 있어요.\n이어서 편집할까요?",
          buttons: [{ label: "버리기", value: "drop" }, { label: "이어서 편집", value: "use", primary: true }] })
          .then(function (m) {
            if (m.value === "use") { S.data = ensure(clone(draft.data)); render(); postPreview(); changed(); }
            else { try { localStorage.removeItem(draftKey()); } catch (e) {} }
          });
      }
    });
  }

  function showEditor() {
    $("gate").hidden = true; $("editor").hidden = false; $("savebar").hidden = false;
    $("slugInfo").textContent = slug === "main" ? "" : "(" + slug + ")";
    $("viewLink").href = slug === "main" ? "/" : "/?c=" + slug;
  }
  function gateMsg(t) { $("gateMsg").textContent = t || ""; }
  function lock() {
    try { sessionStorage.removeItem("honrye.pin"); } catch (e) {}
    S.pin = ""; location.reload();
  }
  function enter(pin) {
    gateMsg("확인 중…");
    return Store.checkPin(pin).then(function (r) {
      if (!(r && r.ok)) { gateMsg(pinErr(r && r.error)); try { sessionStorage.removeItem("honrye.pin"); } catch (e) {} return; }
      S.pin = pin;
      try { sessionStorage.setItem("honrye.pin", pin); } catch (e) {}
      return loadContent(false).then(function () { showEditor(); gateMsg(""); });
    }).catch(function (e) { gateMsg(errText(e)); });
  }

  // ---------- 이벤트 ----------
  $("gateForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = $("pin").value.trim();
    if (v) enter(v);
  });
  Array.prototype.forEach.call(document.querySelectorAll(".langtabs button"), function (b) {
    b.addEventListener("click", function () { S.lang = b.getAttribute("data-l"); render(); postPreview(); });
  });
  $("addBtn").addEventListener("click", addStep);
  $("resetBtn").addEventListener("click", function () {
    modal({ title: "기본 내용으로 되돌릴까요?", text: "지금 고친 내용이 모두 기본 식순으로 바뀌어요.\n(저장 버튼을 누르기 전에는 하객 화면에 영향이 없어요.)",
      buttons: [{ label: "취소", value: "cancel" }, { label: "되돌리기", value: "ok", primary: true, danger: true }] })
      .then(function (r) { if (r.value === "ok") { S.data = ensure(clone(window.HONRYE_DEFAULT)); S.open = null; render(); changed(); postPreview(); } });
  });
  $("pvBtn").addEventListener("click", togglePreview);
  $("saveBtn").addEventListener("click", save);
  $("lockBtn").addEventListener("click", lock);
  $("pinBtn").addEventListener("click", function () {
    modal({ title: "PIN 변경", text: "새 PIN 은 4자 이상으로 정해 주세요.",
      inputs: [{ name: "o", label: "지금 PIN", type: "password", inputmode: "numeric" }, { name: "n", label: "새 PIN", type: "password", inputmode: "numeric" }, { name: "n2", label: "새 PIN 한 번 더", type: "password", inputmode: "numeric" }],
      buttons: [{ label: "취소", value: "cancel" }, { label: "변경", value: "ok", primary: true }] })
      .then(function (m) {
        if (m.value !== "ok") return;
        var v = m.values;
        if (v.n !== v.n2) return toast("새 PIN 두 칸이 서로 달라요.", true);
        if (v.n.length < 4 || v.n.length > 32) return toast("새 PIN 은 4자 이상 32자 이하여야 해요.", true);
        Store.setPin(v.o, v.n).then(function (r) {
          if (r && r.ok) { S.pin = v.n; try { sessionStorage.setItem("honrye.pin", v.n); } catch (e) {} toast("PIN을 바꿨어요."); }
          else toast(r && r.error === "bad_new_pin" ? "새 PIN 형식이 올바르지 않아요." : pinErr(r && r.error), true);
        }).catch(function (e) { toast(errText(e), true); });
      });
  });
  window.addEventListener("beforeunload", function (e) { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } });

  // 같은 브라우저에서 방금 들어왔다면 PIN 을 다시 묻지 않음
  var remembered = ""; try { remembered = sessionStorage.getItem("honrye.pin") || ""; } catch (e) {}
  if (remembered) enter(remembered); else $("pin").focus();
})();

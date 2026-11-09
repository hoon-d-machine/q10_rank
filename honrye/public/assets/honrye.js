/* 전통 혼례 식순 화면: 데이터(한·영·일)를 그려 주고, 언어 선택·족자 펼침·한 번에 하나씩 펼치기를 처리한다.
 * 내용 출처: 저장소(Supabase, 수정 페이지에서 고친 것) → 브라우저에 남겨 둔 마지막 내용 → 페이지에 내장된 기본 내용 (window.HONRYE_DEFAULT)
 * 저장소를 못 읽어도(예식장 전파가 약해도) 기본/마지막 내용으로 바로 보인다.
 */
(function () {
  "use strict";

  var LANGS = ["ko", "en", "ja"];
  var UI = {
    docTitle: { ko: "전통 혼례 식순", en: "Traditional Wedding Order", ja: "伝統婚礼 式次第" },
    title: { ko: ["전통 혼례", "식순"], en: ["Traditional", "Wedding Order"], ja: ["伝統婚礼", "式次第"] },
    sub: { ko: "전통 사대부가 혼인례 · 친영례", en: "Joseon Scholar-Family Wedding · Chinyeong", ja: "朝鮮の士大夫家の婚礼 · 親迎礼" },
    names: { ko: "신랑 {g} · 신부 {b}", en: "Groom {g} · Bride {b}", ja: "新郎 {g} · 新婦 {b}" },
    groomOnly: { ko: "신랑 {g}", en: "Groom {g}", ja: "新郎 {g}" },
    brideOnly: { ko: "신부 {b}", en: "Bride {b}", ja: "新婦 {b}" },
    count: { ko: "모두 {n}가지 의식으로 이어져요.", en: "The ceremony unfolds in {n} rites.", ja: "全{n}の儀式で進みます。" },
    hint: { ko: "의식 이름을 눌러 뜻을 확인해 보세요", en: "Tap a rite to see its meaning", ja: "儀式の名前をタップして意味をご覧ください" },
    expand: { ko: "모두 펼치기", en: "Expand all", ja: "すべて開く" },
    collapse: { ko: "모두 접기", en: "Collapse all", ja: "すべて閉じる" },
    meaning: { ko: "이 의식의 뜻", en: "What it means", ja: "この儀式の意味" },
    how: { ko: "이렇게 진행돼요", en: "How it goes", ja: "進め方" },
    thanks: { ko: "함께해 주셔서 감사합니다", en: "Thank you for being with us", ja: "ご列席いただき、ありがとうございます" }
  };

  // 순서별 아이콘 (선으로 그린 작은 그림). 수정 페이지에서 고른 이름(step.icon) 또는 기본 배정(id)을 쓴다
  var petals = [0, 72, 144, 216, 288].map(function (a) { return '<ellipse cx="12" cy="6.6" rx="2.3" ry="3.4" transform="rotate(' + a + ' 12 12)"/>'; }).join("");
  var ICONS = {
    bell: '<path d="M6 17h12l-1.5-2.2V10a4.5 4.5 0 0 0-9 0v4.8z"/><path d="M10 20a2 2 0 0 0 4 0M12 5.5V3.5"/>',
    lantern: '<path d="M9.5 3h5M10 3v2.2M14 3v2.2"/><rect x="6.5" y="5.2" width="11" height="12" rx="4.5"/><path d="M6.8 11.2h10.4M12 17.2V20M10 21h4"/>',
    goose: '<path d="M4 15.5c0-2.6 2.8-4 5.8-4 1.6 0 2.7-.5 3.4-1.7l.9-3.2a2 2 0 1 1 3.6 1.4l-.9 2.5c0 4-3 6.8-7.4 6.8H4"/><path d="M18.5 5.5 21 6M9 19v2M13 19v2"/>',
    candle: '<path d="M12 2.5c2.2 2.4 2.2 4.2 0 5.5-2.2-1.3-2.2-3.1 0-5.5z"/><rect x="9" y="9" width="6" height="11" rx="1"/><path d="M6.5 20.5h11"/>',
    people: '<circle cx="8" cy="8" r="2.6"/><circle cx="16" cy="8" r="2.6"/><path d="M3.5 19c0-3 2-5 4.5-5s4.5 2 4.5 5M11.5 19c0-3 2-5 4.5-5s4.5 2 4.5 5"/>',
    bow: '<circle cx="6.5" cy="6" r="2"/><circle cx="17.5" cy="6" r="2"/><path d="M3 20.5l1.6-6.5 4.2 1.6M21 20.5l-1.6-6.5-4.2 1.6M8.8 15.6 7.5 11h-2M15.2 15.6 16.5 11h2"/>',
    scroll: '<path d="M8 4h10a2 2 0 0 1 2 2v11.5a2.5 2.5 0 0 1-2.5 2.5H7"/><path d="M8 4a2.5 2.5 0 0 0-2.5 2.5V18a2 2 0 0 0 2 2 2 2 0 0 0 2-2V6.5M11.5 9H17M11.5 12.5H17"/>',
    flower: petals + '<circle cx="12" cy="12" r="1.8"/>',
    gate: '<path d="M2.5 6 12 3l9.5 3M4.5 8.5h15M6.5 8.5V21M17.5 8.5V21M10 8.5V21M14 8.5V21"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>'
  };
  var DEFAULT_ICON = { s1: "bell", s2: "lantern", s3: "goose", s4: "candle", s5: "people", s6: "bow", s7: "scroll", s8: "flower", s9: "gate" };
  function iconEl(name) {
    if (!name || !ICONS[name]) return null;
    var w = document.createElement("span"); w.className = "ico"; w.setAttribute("aria-hidden", "true");
    w.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + "</svg>";
    return w;
  }

  var $ = function (id) { return document.getElementById(id); };
  var sheet = $("sheet"), paper = $("paper"), list = $("steps"), allBtn = $("toggleAll");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DUR = 2.8; // 족자가 펼쳐지는 시간(초)

  function param(name) {
    var m = new RegExp("[?&]" + name + "=([^&]*)").exec(location.search);
    return m ? decodeURIComponent(m[1]) : "";
  }
  var slug = window.HonryeStore.slug();
  var preview = param("preview") === "1";   // 수정 페이지의 미리보기(iframe)

  function initialLang() {
    var q = param("lang");
    if (LANGS.indexOf(q) >= 0) return q;
    try { var s = localStorage.getItem("honrye.lang"); if (LANGS.indexOf(s) >= 0) return s; } catch (e) {}
    var n = (navigator.language || "").slice(0, 2).toLowerCase();
    return n === "ja" ? "ja" : n === "en" ? "en" : "ko";
  }
  var lang = initialLang();
  var cached = preview ? null : window.HonryeStore.cacheGet(slug);
  var data = (cached && cached.data) || window.HONRYE_DEFAULT;
  var all = false;

  // ---------- 작은 도구들 ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function t(key) { return UI[key][lang]; }
  // 선택한 언어의 내용. 비어 있으면 한국어로 대신 보여 줌
  function pick(o) {
    if (!o) return "";
    var v = o[lang];
    return v && String(v).trim() ? String(v) : String(o.ko || "");
  }
  // **굵게** 만 지원 (HTML 은 쓰지 않으므로 입력에 태그가 들어 있어도 글자 그대로 보임)
  function rich(parent, text) {
    String(text || "").split("**").forEach(function (s, i) {
      if (!s) return;
      if (i % 2) parent.appendChild(el("b", null, s));
      else parent.appendChild(document.createTextNode(s));
    });
  }
  function paras(s) { return String(s || "").split(/\n\s*\n/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function lines(s) { return String(s || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean); }

  // ---------- 그리기 ----------
  function renderChrome() {
    document.documentElement.lang = lang;
    var custom = pick(data.title).split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    document.title = custom.length ? custom.join(" ") : t("docTitle");
    var h1 = $("title"); h1.textContent = "";
    (custom.length ? custom : t("title")).forEach(function (s, i) { if (i) h1.appendChild(document.createElement("br")); h1.appendChild(document.createTextNode(s)); });
    $("sub").textContent = pick(data.subtitle) || t("sub");

    var g = pick(data.couple && data.couple.groom), b = pick(data.couple && data.couple.bride);
    var names = g && b ? t("names").replace("{g}", g).replace("{b}", b) : g ? t("groomOnly").replace("{g}", g) : b ? t("brideOnly").replace("{b}", b) : "";
    $("couple").textContent = names; $("couple").hidden = !names;

    $("intro").textContent = pick(data.intro);
    $("count").textContent = t("count").replace("{n}", (data.steps || []).length);
    $("hint").textContent = t("hint");
    allBtn.textContent = all ? t("collapse") : t("expand");
    $("thanks").textContent = t("thanks");
    Array.prototype.forEach.call(document.querySelectorAll(".lang button"), function (b2) {
      b2.setAttribute("aria-pressed", String(b2.getAttribute("data-lang") === lang));
    });
  }

  function openIds() {
    var o = {};
    Array.prototype.forEach.call(list.querySelectorAll("details[open]"), function (d) { o[d.getAttribute("data-id")] = true; });
    return o;
  }

  function bind(d) {   // 한 번에 하나씩 펼치기 (모두 펼치기 중에는 제외)
    d.addEventListener("toggle", function () {
      if (!d.open || all) return;
      Array.prototype.forEach.call(list.querySelectorAll("details"), function (o) { if (o !== d) o.open = false; });
      var sum = d.querySelector("summary");
      setTimeout(function () {
        var r = sum.getBoundingClientRect();
        if (r.top < 8 || r.bottom > window.innerHeight) sum.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
      }, 60);
    });
  }

  function renderSteps() {
    var was = openIds();
    list.textContent = "";
    (data.steps || []).forEach(function (s, i) {
      var li = el("li"), d = el("details");
      d.setAttribute("data-id", s.id || ("i" + i));
      var sum = el("summary");
      sum.appendChild(el("span", "no", String(i + 1)));
      var ttl = el("span", "ttl"); var ic = iconEl(s.icon || DEFAULT_ICON[s.id]); if (ic) ttl.appendChild(ic); ttl.appendChild(el("b", null, pick(s.title))); sum.appendChild(ttl);
      sum.appendChild(el("span", "one", pick(s.one)));
      var chev = el("span", "chev"); chev.setAttribute("aria-hidden", "true"); sum.appendChild(chev);
      d.appendChild(sum);

      var det = el("div", "detail");
      var meaning = paras(pick(s.meaning));
      if (meaning.length) {
        det.appendChild(el("h3", null, t("meaning")));
        meaning.forEach(function (p) { var pe = el("p"); rich(pe, p); det.appendChild(pe); });
      }
      if (s.note && (pick(s.note.title) || pick(s.note.body))) {
        var note = el("div", "note");
        if (pick(s.note.title)) note.appendChild(el("b", null, pick(s.note.title)));
        var np = el("p"); rich(np, pick(s.note.body)); note.appendChild(np);
        det.appendChild(note);
      }
      var how = lines(pick(s.how));
      if (how.length) {
        det.appendChild(el("h3", null, t("how")));
        var ul = el("ul");
        how.forEach(function (x) { var item = el("li"); rich(item, x); ul.appendChild(item); });
        det.appendChild(ul);
      }
      d.appendChild(det);
      if (all || was[d.getAttribute("data-id")]) d.open = true;
      bind(d);
      li.appendChild(d); list.appendChild(li);
    });
  }

  function renderAll() { renderChrome(); renderSteps(); }

  // ---------- 언어 선택 ----------
  Array.prototype.forEach.call(document.querySelectorAll(".lang button"), function (b) {
    b.addEventListener("click", function () {
      lang = b.getAttribute("data-lang");
      try { localStorage.setItem("honrye.lang", lang); } catch (e) {}
      renderAll();
    });
  });

  allBtn.addEventListener("click", function () {
    all = !all;
    Array.prototype.forEach.call(list.querySelectorAll("details"), function (d) { d.open = all; });
    allBtn.setAttribute("aria-pressed", String(all));
    allBtn.textContent = all ? t("collapse") : t("expand");
  });

  // ---------- 족자 펼침 ----------
  function unroll() {
    document.documentElement.classList.remove("js");
    if (reduce || preview) { sheet.style.height = "auto"; return; }
    var h = paper.offsetHeight;
    sheet.style.height = "0px";
    void sheet.offsetHeight;
    sheet.style.transition = "height " + DUR + "s cubic-bezier(.45, .05, .2, 1)";
    sheet.style.height = h + "px";
    var done = false;
    function finish() { if (done) return; done = true; sheet.style.transition = "none"; sheet.style.height = "auto"; }
    sheet.addEventListener("transitionend", function (e) { if (e.target === sheet && e.propertyName === "height") finish(); });
    setTimeout(finish, DUR * 1000 + 400);
  }

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  renderAll();

  if (preview) {   // 수정 페이지 미리보기: 부모가 보내 주는 내용을 그대로 그림
    window.addEventListener("message", function (e) {
      if (e.origin !== location.origin || !e.data || e.data.type !== "honrye-preview") return;
      if (e.data.data) data = e.data.data;
      if (LANGS.indexOf(e.data.lang) >= 0) lang = e.data.lang;
      renderAll();
    });
    unroll();
    if (window.parent !== window) window.parent.postMessage({ type: "honrye-preview-ready" }, location.origin);
    return;
  }

  // 저장소에서 최신 내용을 받아 오되, 족자가 펼쳐지기 전(최대 1.3초)에 오면 그 내용으로 시작
  var remote = window.HonryeStore.load(slug, 4000).then(function (r) {
    if (!r) return;
    var changed = !cached || cached.rev !== r.rev;
    window.HonryeStore.cacheSet(slug, r);
    if (changed) { data = r.data; renderAll(); }
  }).catch(function () { /* 못 받아도 기본/마지막 내용으로 보여 줌 */ });

  var fonts = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, delay(1200)]) : delay(300);
  Promise.all([Promise.race([remote, delay(1300)]), fonts]).then(unroll);
})();

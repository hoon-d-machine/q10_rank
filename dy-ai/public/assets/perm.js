/* DY-AI 계정 권한 (window.dyPerm): 로그인한 계정의 권한(dy_me)을 읽어 메뉴·탭·화면 기능을 보이거나 숨긴다
 * auth.js 다음에 로드. 화면마다 <body data-page="main|dashboard|event|data|logs|admin"> 가 있으면 그 화면 접근도 막는다
 *
 * 권한 키 (DB 에는 허용된 키 문자열 목록만 저장, '*' 는 전부):
 *   menu.*        상단 메뉴(화면 전체)         dash.board.* 대시보드 보드 탭     dash.inni.* inni 리포트 탭    dash.codes 상품코드관리 탭
 *   data.t.* 데이터 표 탭    event.t.* 행사 랭킹 탭    feat.* 화면 기능 버튼(설명·설정·코멘트·입력·엑셀·수집)    edit.codes 상품코드 등록·수정
 * 숨김은 화면에서 하고, 관리(계정)·상품코드 수정은 DB 함수도 같은 권한을 확인한다
 * 안전장치: DB 에 권한 함수(dy_me)가 아직 없으면 전부 허용(옛 동작), 있는데 읽지 못하면 아무것도 보이지 않음
 */
(function () {
  "use strict";

  var CATALOG = [
    { group: "메뉴 (화면 전체)", items: [["menu.main", "수집기"], ["menu.dashboard", "대시보드"], ["menu.event", "행사 랭킹"], ["menu.data", "데이터"], ["menu.logs", "로그"]] },
    { group: "대시보드 · 보드 탭", items: [["dash.board.custom", "커스텀"], ["dash.board.ad", "광고 효율"], ["dash.board.rank", "랭킹·판매"], ["dash.board.channel", "유입 경로"],
      ["dash.board.customer", "고객 구조"], ["dash.board.events", "행사 비교"], ["dash.board.wish", "찜·장바구니"], ["dash.board.exec", "경영 요약"]] },
    { group: "대시보드 · inni 리포트 탭", items: [["dash.inni.sales", "SALES"], ["dash.inni.product", "PRODUCT"], ["dash.inni.onsite", "ONSITE AD"], ["dash.inni.megapo", "MEGAPO"]] },
    { group: "대시보드 · 상품코드", items: [["dash.codes", "상품코드관리 탭 보기"], ["edit.codes", "상품코드 등록·수정·삭제"]] },
    { group: "데이터 표 탭", items: [["data.t.goods", "일자·품목별 거래"], ["data.t.pvgoods", "일자·상품별 PV"], ["data.t.sales", "일자별 거래"], ["data.t.pageview", "일자별 페이지뷰"],
      ["data.t.customer", "고객(일자별)"], ["data.t.custgoods", "찜·장바구니"], ["data.t.ad_daily", "광고비·광고 매출"], ["data.t.ad_goods", "상품별 광고"], ["data.t.ad_keyword", "광고 키워드"],
      ["data.t.mega_event", "행사 달력"], ["data.t.cpm_daily", "Beauty Brand AD 일자별"], ["data.t.cpm_keyword", "Beauty Brand AD 키워드"], ["data.t.cpm_campaign", "Beauty Brand AD 캠페인"],
      ["data.t.rank", "랭킹(일·주·월)"], ["data.t.products", "상품코드"]] },
    { group: "행사 랭킹 탭", items: [["event.t.trend", "순위 트렌드"], ["event.t.price", "가격·리뷰 분석"], ["event.t.share", "카테고리 점유율"]] },
    { group: "화면 기능 버튼", items: [["feat.help", "설명(정보) 버튼"], ["feat.settings", "설정 버튼 (코멘트·강조·그래프·색상)"],
      ["feat.input", "입력 버튼 (월별 목표·월별 광고비)"], ["feat.xlsx", "엑셀 다운로드 버튼"], ["feat.collect", "Q10 수집 버튼"]] }
  ];
  var PAGES = { main: "menu.main", dashboard: "menu.dashboard", event: "menu.event", data: "menu.data", logs: "menu.logs", admin: "admin" };
  var PAGE_URL = { main: "/main", dashboard: "/dashboard", event: "/event", data: "/data", logs: "/logs" };
  var PAGE_ORDER = ["main", "dashboard", "event", "data", "logs"];
  // 화면 기능 버튼: 권한 키 → 선택자
  var FEATURES = {
    "feat.help": ".js-help, .js-b-help",
    "feat.settings": ".js-s-set, .js-p-set, .js-o-set, .js-m-set, .js-b-set",
    "feat.input": ".js-s-tgt-btn, .js-s-notice-btn, .js-o-manual",
    "feat.xlsx": ".js-s-xlsx, .js-p-xlsx, .js-o-xlsx, .js-m-xlsx, .js-b-xlsx, .js-dl-one, .js-dl-all",
    "feat.collect": ".js-collect"
  };

  var me = { is_admin: false, perms: [], name: null, loaded: false, open: false };
  var readyP = null, observer = null, queued = false;

  function all(key) { return me.open || me.is_admin || me.perms.indexOf("*") >= 0; }
  function can(key) {
    if (key === "admin") return !!me.is_admin;
    return all() || me.perms.indexOf(key) >= 0;
  }
  function canAny(prefix) { return all() || me.perms.some(function (k) { return k.indexOf(prefix) === 0; }); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function hide(el, on) {
    if (on) { el.hidden = true; el.style.display = "none"; el.dataset.permHidden = "1"; }
    else if (el.dataset.permHidden) { el.hidden = false; el.style.display = ""; delete el.dataset.permHidden; }
  }

  function tabKey(el) {
    var d = el.dataset;
    if (el.closest(".js-views")) return d.view === "dash" ? "?dash.board." : d.view === "inni" ? "?dash.inni." : d.view === "codes" ? "dash.codes" : null;
    if (el.closest(".js-bsubs")) return d.board ? "dash.board." + d.board : null;
    if (el.closest(".js-subs")) return d.sub ? "dash.inni." + d.sub : null;
    if (el.closest(".data-tabs") && d.src) return "data.t." + d.src;
    if (el.closest(".ev-tabs") && d.tab) return "event.t." + d.tab;
    return null;
  }

  // 테마 선택과 로그아웃 사이에 로그인한 계정 이름 (이름은 계정 관리에서 고침, 없으면 아이디)
  function showName() {
    var out = document.getElementById("logout");
    if (!out || !me.email) return;
    var el = document.getElementById("user-name");
    if (!el) { el = document.createElement("span"); el.id = "user-name"; el.className = "user-name"; out.parentNode.insertBefore(el, out); }
    var label = me.name || String(me.email).split("@")[0];
    el.textContent = label; el.title = me.email + (me.is_admin ? " · 관리자" : "");
  }

  function apply() {
    queued = false;
    if (!me.loaded) return;
    showName();
    // 상단 메뉴
    $$(".top-nav a").forEach(function (a) {
      var p = (a.getAttribute("href") || "").replace(/^\//, "").replace(/\.html$/, "");
      if (a.hasAttribute("data-perm-admin")) { a.hidden = !me.is_admin; a.style.display = me.is_admin ? "" : "none"; }
      else if (PAGES[p]) hide(a, !can(PAGES[p]));
    });
    // 탭
    $$(".inni-tab, .data-tab").forEach(function (b) {
      var k = tabKey(b); if (!k) return;
      hide(b, k.charAt(0) === "?" ? !canAny(k.slice(1)) : !can(k));
    });
    // 화면 기능 버튼
    Object.keys(FEATURES).forEach(function (k) { var off = !can(k); $$(FEATURES[k]).forEach(function (b) { hide(b, off); }); });
    // 상품코드 편집 권한이 없으면 편집 화면이 읽기 전용이 되도록 알림
    document.documentElement.classList.toggle("dy-no-edit-codes", !can("edit.codes"));
    // 고른 탭이 숨겨졌으면 보이는 첫 탭으로
    $$(".inni-tabs, .data-tabs").forEach(function (list) {
      var tabs = $$(".inni-tab, .data-tab", list).filter(function (t) { return list.contains(t); });
      var sel = tabs.filter(function (t) { return t.getAttribute("aria-selected") === "true"; })[0];
      if (sel && sel.dataset.permHidden) { var first = tabs.filter(function (t) { return !t.dataset.permHidden; })[0]; if (first) first.click(); }
    });
  }
  function schedule() { if (queued) return; queued = true; (window.requestAnimationFrame || setTimeout)(apply); }

  // ---------- 화면 접근 ----------
  function firstAllowedPage() { return PAGE_ORDER.filter(function (p) { return can(PAGES[p]); })[0] || null; }
  function blocker(msg, withLogout) {
    var d = document.createElement("div");
    d.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(20,24,22,.72);padding:24px";
    var c = document.createElement("div");
    c.style.cssText = "max-width:420px;background:#fff;color:#222;border-radius:14px;padding:26px 28px;box-shadow:0 12px 40px rgba(0,0,0,.35);font:15px/1.6 Pretendard Variable,Pretendard,sans-serif";
    var p = document.createElement("p"); p.style.margin = "0 0 16px"; p.textContent = msg; c.appendChild(p);
    if (withLogout) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = "로그아웃"; b.className = "dash-btn is-primary";
      b.addEventListener("click", function () { window.dyAuth.signOut().then(function () { location.replace("/"); }); }); c.appendChild(b);
    }
    d.appendChild(c); document.body.appendChild(d);
  }
  function guard() {
    var page = document.body && document.body.getAttribute("data-page");
    if (!page || !PAGES[page]) return;
    if (can(PAGES[page])) return;
    var go = firstAllowedPage();
    if (go) { location.replace(PAGE_URL[go]); return; }
    blocker(page === "admin" ? "관리자만 쓸 수 있는 화면이에요." : "이 계정에는 볼 수 있는 메뉴가 없어요. 관리자에게 권한을 요청해 주세요.", true);
  }

  function load() {
    var A = window.dyAuth;
    if (!A || !A.client) { me.loaded = true; me.open = true; return Promise.resolve(); }
    return A.getSession().then(function (s) {
      if (!s) { me.loaded = true; me.open = true; return; }
      me.email = s.user && s.user.email || "";   // 로그인 안 한 화면(로그인 창)은 각 화면이 알아서 처리
      return A.client.rpc("dy_me").then(function (r) {
        if (r.error) {
          var msg = String(r.error.message || ""), code = String(r.error.code || "");
          if (code === "PGRST202" || /Could not find the function|schema cache/i.test(msg)) { me.open = true; me.loaded = true; return; }   // 아직 권한 기능이 DB 에 없음
          me.loaded = true; me.perms = []; return;                                                                                         // 읽지 못함 → 닫아 둠
        }
        var d = r.data || {};
        me = { email: me.email, is_admin: !!d.is_admin, perms: Array.isArray(d.perms) ? d.perms : [], name: d.name || null, loaded: true, open: false, disabled: !!d.disabled, registered: d.registered !== false };
        if (me.disabled) { A.signOut().then(function () { location.replace("/"); }); }
      });
    }).catch(function () { me.loaded = true; me.open = true; });
  }

  document.documentElement.classList.add("dy-perm-wait");
  var tmo = setTimeout(function () { document.documentElement.classList.remove("dy-perm-wait"); }, 6000);
  readyP = new Promise(function (resolve) {
    function start() {
      load().then(function () {
        clearTimeout(tmo);
        apply(); guard();
        document.documentElement.classList.remove("dy-perm-wait");
        observer = new MutationObserver(schedule); observer.observe(document.body, { childList: true, subtree: true });
        document.dispatchEvent(new CustomEvent("dyperm:ready"));
        resolve(me);
      });
    }
    if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
  });

  window.dyPerm = { ready: readyP, can: can, canAny: canAny, isAdmin: function () { return !!me.is_admin; }, me: function () { return me; }, CATALOG: CATALOG, apply: apply,
    allKeys: function () { var o = []; CATALOG.forEach(function (g) { g.items.forEach(function (i) { o.push(i[0]); }); }); return o; } };
})();

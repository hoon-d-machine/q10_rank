/* 대시보드·Sell Thru 리포트 HTML 다운로드: 지금 화면의 리포트(설정·코멘트까지 반영된 모습)를 한 파일로 내려받는다.
 *   탑바·메뉴·탭·설정 줄(버튼·선택칸)은 빼고 리포트 카드만 담는다. CSS 는 파일 안에 넣어 혼자서도 열린다.
 *   그래프는 Chart.js 와 설정을 같이 넣어서 파일에서도 마우스를 올리면 값이 보이고 범례를 누르면 켜고 꺼진다(인터넷 연결 필요).
 *   Chart.js 를 못 불러오거나 그리다 실패하면 받는 시점의 그림으로 대신 보인다.
 *   가로 스크롤이 생기지 않게 화면 폭보다 넓으면 비율을 줄여서 맞춘다.
 *   통합 HTML: SALES · PRODUCT · ONSITE AD 를 고른 기준 월로 맞춰서(강조·코멘트도 그 월 것) 한 파일로 만들고, 화면은 원래대로 돌려놓는다.
 */
(function () {
  "use strict";
  var CHARTJS = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
  var FN = "@@fn@@";
  function toast(m) { if (window.dyToast) window.dyToast(m, 3500); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function h(tag, c, text) { var e = document.createElement(tag); if (c) e.className = c; if (text != null) e.textContent = text; return e; }

  function css() { // 화면에 적용된 스타일시트 전부(같은 출처). 막힌 건 <link> 로 대신한다
    var out = "", links = "";
    Array.prototype.forEach.call(document.styleSheets, function (ss) {
      try { out += Array.prototype.map.call(ss.cssRules, function (r) { return r.cssText; }).join("\n") + "\n"; }
      catch (e) { if (ss.href) links += '<link rel="stylesheet" href="' + esc(ss.href) + '">\n'; }
    });
    return { text: out, links: links };
  }

  // ---------- 그래프: 설정을 글로 저장(함수는 소스로) ----------
  var chartSeq = 0;
  function chartJson(inst) {
    var c = inst.config, cfg = { type: c.type || (c._config && c._config.type), data: c.data, options: c.options, plugins: c.plugins };
    return JSON.stringify(cfg, function (k, v) { return typeof v === "function" ? FN + v.toString() : v; });
  }

  // 한 리포트를 조각으로: { html, title, wide, charts }. wide=true 면 화면처럼 폭 제한 없이(PRODUCT 화면과 같게)
  function part(card, head, wide) {
    if (!card || !card.querySelector("table, canvas")) return null;
    var clone = card.cloneNode(true), charts = [];
    var src = card.querySelectorAll("canvas"), dst = clone.querySelectorAll("canvas");
    Array.prototype.forEach.call(dst, function (c, i) {
      var inst = window.Chart && window.Chart.getChart ? window.Chart.getChart(src[i]) : null, img = null;
      try { img = document.createElement("img"); img.src = src[i].toDataURL("image/png"); } catch (e) { img = null; }
      if (inst) { c.id = "dyc" + (++chartSeq); try { charts.push({ id: c.id, cfg: chartJson(inst) }); } catch (e) { c.removeAttribute("id"); } }
      if (img) { // 그래프를 못 그릴 때 대신 보이는 그림
        img.className = "dy-fb"; img.alt = "그래프";
        img.style.cssText = "width:100%;height:100%;object-fit:contain;display:" + (c.id ? "none" : "block");
        if (c.id) c.after(img); else { img.className += " " + c.className; c.replaceWith(img); }
      } else if (!c.id) c.remove();
    });
    Array.prototype.forEach.call(clone.querySelectorAll("[hidden], button, select, input, textarea, .inni-actions, .inni-link"), function (e) { e.remove(); });
    var title = (head && head.title) || (clone.querySelector("h2") || {}).textContent || "report";
    return { html: '<div class="dash-inner' + (wide ? " is-wide" : "") + '"%%TAB%%><section class="inni-pane">\n' + (head ? head.html : "") + clone.outerHTML + '\n</section></div>', title: title, wide: !!wide, charts: charts };
  }

  // 받은 파일 안에서 도는 코드 (이 함수의 소스가 그대로 들어간다 — 바깥 변수를 쓰지 말 것)
  function boot() {
    var FNM = "@@fn@@";
    function fit() { // 가로 스크롤 방지: 화면 폭보다 넓으면 비율을 줄인다
      var b = document.body, d = document.documentElement; b.style.zoom = "";
      var w = d.clientWidth, sw = Math.max(d.scrollWidth, b.scrollWidth);
      if (sw > w + 1) b.style.zoom = String(Math.max(0.3, w / sw));
    }
    fit(); window.addEventListener("resize", fit); window.addEventListener("load", fit);
    function mk(src) {
      var f; try { f = (0, eval)("(" + src + ")"); } catch (e) { try { var o = (0, eval)("({" + src + "})"); f = o[Object.keys(o)[0]]; } catch (e2) { return undefined; } }
      return typeof f === "function" ? function () { try { return f.apply(this, arguments); } catch (e) { return undefined; } } : undefined;
    }
    function rev(v) {
      if (typeof v === "string") return v.indexOf(FNM) === 0 ? mk(v.slice(FNM.length)) : v;
      if (Array.isArray(v)) return v.map(rev);
      if (v && typeof v === "object") { var o = {}; Object.keys(v).forEach(function (k) { o[k] = rev(v[k]); }); return o; }
      return v;
    }
    function fallback(c) { c.style.display = "none"; var n = c.nextElementSibling; if (n && n.className.indexOf("dy-fb") >= 0) n.style.display = "block"; }
    var el = document.getElementById("dy-charts"), list = [];
    try { list = JSON.parse(el.textContent); } catch (e) { list = []; }
    function make(tab) { // 보이는 탭의 그래프만 그린다 (숨은 탭은 크기를 못 재서 처음 열 때 그린다)
      list.forEach(function (it) {
        if (it.done || (it.tab || "") !== tab) return;
        var c = document.getElementById(it.id); if (!c) return; it.done = true;
        if (!window.Chart) { fallback(c); return; }
        try {
          var cfg = rev(JSON.parse(it.cfg)); cfg.options = cfg.options || {};
          cfg.options.responsive = true; cfg.options.maintainAspectRatio = false;
          new window.Chart(c, cfg);
        } catch (e) { fallback(c); }
      });
    }
    var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-dytab-btn]")), panes = Array.prototype.slice.call(document.querySelectorAll("[data-dytab]"));
    function show(k) {
      panes.forEach(function (p) { p.hidden = p.getAttribute("data-dytab") !== k; });
      tabs.forEach(function (t) { t.setAttribute("aria-selected", String(t.getAttribute("data-dytab-btn") === k)); });
      make(k); fit(); setTimeout(fit, 400);
    }
    tabs.forEach(function (t) { t.addEventListener("click", function () { show(t.getAttribute("data-dytab-btn")); }); });
    show(tabs.length ? tabs[0].getAttribute("data-dytab-btn") : "");
  }

  function build(parts, title) {
    var sheet = css(), html = document.documentElement;
    var attrs = ' lang="ko" data-theme="' + esc(html.getAttribute("data-theme") || "rug") + '"';
    var NL = String.fromCharCode(10), charts = [];
    var multi = parts.length > 1;
    parts.forEach(function (p, i) { // 여러 개면 탭으로: 첫 탭만 보이고 나머지는 눌러서 연다
      (p.charts || []).forEach(function (c) { c.tab = multi ? p.key : ""; charts.push(c); });
      p.out = p.html.replace("%%TAB%%", multi ? ' data-dytab="' + p.key + '"' + (i ? " hidden" : "") : "");
    });
    var tabBar = multi ? '<div class="dash-inner"><div class="inni-tabs inni-sub" role="tablist">' + parts.map(function (p, i) {
      return '<button class="inni-tab" type="button" role="tab" data-dytab-btn="' + p.key + '" aria-selected="' + (i ? "false" : "true") + '">' + esc(p.label) + "</button>";
    }).join("") + "</div></div>" : "";
    var json = JSON.stringify(charts).replace(/</g, "\\u003c");
    var doc = ["<!doctype html>", "<html" + attrs + ">", "<head>", '<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">', "<title>" + esc(title) + "</title>", sheet.links + "<style>", sheet.text,
      "html,body{overflow-x:hidden}body{background:var(--lg-bg)!important;background-image:none!important;margin:0}[hidden]{display:none!important}.inni-tabs{margin-bottom:16px}.inni-scroll{overflow-x:visible!important}", "</style>", "</head>",
      '<body class="' + esc(document.body.className) + '">', '<main class="dash-page">' + tabBar + parts.map(function (x) { return x.out; }).join(NL) + "</main>",
      '<script type="application/json" id="dy-charts">' + json + "</scr" + "ipt>",
      '<script src="' + CHARTJS + '"></scr' + "ipt>",
      "<script>(" + boot.toString() + ")();</scr" + "ipt>", "</body>", "</html>", ""].join(NL);
    return { doc: doc, title: title };
  }

  function download(r, prefix) {
    var d = new Date(), stamp = d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2);
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([r.doc], { type: "text/html;charset=utf-8" }));
    a.download = (prefix || "Sell_Thru") + "_" + r.title.replace(/[^\w가-힣-]+/g, "_") + "_" + stamp + ".html";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    toast("HTML을 내려받았어요");
  }

  function save(card, head, prefix, wide) {
    var p = part(card, head, wide);
    if (!p) { toast("내려받을 리포트가 아직 없어요 (불러온 뒤 다시 시도)"); return; }
    download(build([p], p.title), prefix);
  }

  // ---------- 통합 HTML ----------
  var ALL = ["sales", "product", "onsite"], PFX = { sales: "s", product: "p", onsite: "o" }, busy = false, pending = 0;
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function ready(pane, tries) { return pane.querySelector(".inni-report table") ? Promise.resolve(true) : tries <= 0 ? Promise.resolve(false) : wait(200).then(function () { return ready(pane, tries - 1); }); }

  // 서버 요청이 모두 끝나고 잠깐 조용해질 때까지 기다린다 (요청 수를 세려고 rpc 를 잠깐 감싼다)
  function track() {
    var c = window.dyAuth && window.dyAuth.client; if (!c || c.__dyTrack) return function () {};
    var orig = c.rpc; c.__dyTrack = true;
    c.rpc = function () {
      var b = orig.apply(c, arguments), t = b.then.bind(b);
      b.then = function (a, r) { pending++; return t(function (v) { pending--; return a ? a(v) : v; }, function (e) { pending--; if (r) return r(e); throw e; }); };
      return b;
    };
    return function () { c.rpc = orig; delete c.__dyTrack; };
  }
  function settle() {
    return new Promise(function (res) {
      var calm = 0, t0 = Date.now();
      setTimeout(function tick() { if (pending > 0) calm = 0; else calm += 100; if (calm >= 500 || Date.now() - t0 > 25000) return res(); setTimeout(tick, 100); }, 200);
    });
  }
  function setSel(s, v) {
    if (!s || !Array.prototype.some.call(s.options, function (o) { return o.value === v; })) return false;
    if (s.value !== v) { s.value = v; s.dispatchEvent(new Event("change", { bubbles: true })); }
    return true;
  }
  function fyOf(ym) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7); return m >= 7 ? y + 1 : y; }

  // 화면의 기준 월을 ym("YYYY-MM-01")로 맞춘다. 되돌릴 때 쓸 이전 상태를 돌려준다
  function aim(pane, sub, ym, range) {
    var p = PFX[sub], q = function (n) { return pane.querySelector(".js-" + p + "-" + n); };
    var fy = q("fy"), mo = q("month"), mode = q("mode"), from = q("from"), to = q("to");
    var prev = { fy: fy && fy.value, mo: mo && mo.value, mode: mode && mode.value, from: from && from.value, to: to && to.value };
    var done = function (ok) { return { ok: ok, prev: prev, undo: function () { return restore(q, prev); } }; };
    if (sub === "onsite" && range) { // ONSITE AD 기간 보기: 끝 연월 → 시작 연월 순으로 맞춘다
      return Promise.resolve().then(function () { if (mode.value !== "range") { setSel(mode, "range"); return settle(); } })
        .then(function () { var ch = to.value !== range.to; var ok = setSel(to, range.to); return ch ? settle().then(function () { return ok; }) : ok; })
        .then(function (ok1) { var ch = from.value !== range.from; var ok = setSel(from, range.from); return (ch ? settle() : Promise.resolve()).then(function () { return ok1 && ok; }); })
        .then(function (ok) { return done(ok && to.value === range.to && from.value === range.from); });
    }
    var step = Promise.resolve();
    if (mode && mode.value === "range") {
      var other = Array.prototype.map.call(mode.options, function (o) { return o.value; }).filter(function (v) { return v !== "range"; })[0];
      step = step.then(function () { setSel(mode, other); return settle(); });
    }
    return step.then(function () { var ch = fy && fy.value !== String(fyOf(ym)); setSel(fy, String(fyOf(ym))); return ch ? settle() : null; })
      .then(function () { var ch = mo && mo.value !== ym; var ok = setSel(mo, ym); return (ch ? settle() : Promise.resolve()).then(function () { return ok; }); })
      .then(done);
  }
  function restore(q, prev) {
    var fy = q("fy"), mo = q("month"), mode = q("mode"), from = q("from"), to = q("to");
    return Promise.resolve().then(function () { if (mode && prev.mode && mode.value !== prev.mode) { setSel(mode, prev.mode); return settle(); } })
      .then(function () {
        if (prev.mode === "range") { if (from && prev.from && from.value !== prev.from) setSel(from, prev.from); if (to && prev.to && to.value !== prev.to) setSel(to, prev.to); return settle(); }
        if (fy && prev.fy && fy.value !== prev.fy) { setSel(fy, prev.fy); return settle(); }
      })
      .then(function () { if (prev.mode !== "range" && mo && prev.mo && mo.value !== prev.mo) { setSel(mo, prev.mo); return settle(); } });
  }

  var LABEL = { sales: "SALES", product: "PRODUCT", onsite: "ONSITE AD" };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function ymStr(y, m) { return y + "-" + ("0" + m).slice(-2) + "-01"; }
  function addMonths(ym, n) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return ymStr(y, m + 1); }
  function monthsBetween(a, b) { var out = [], k = a; while (k <= b && out.length < 400) { out.push(k); k = addMonths(k, 1); } return out; }
  function field(text, control) { var l = h("label", "dash-field"); l.appendChild(h("span", null, text)); l.appendChild(control); return l; } // 사이트 선택칸과 같은 모양(.dash-field)
  function opt(sel, value, text) { var o = h("option", null, text); o.value = value; sel.appendChild(o); return o; }

  // 선택할 수 있는 월 범위: 대시보드 데이터의 처음~마지막 (ONSITE AD 는 그 화면이 이미 불러왔으면 그 화면 범위)
  function bounds() {
    var D = window.dyDash, lo = null, hi = null;
    try { lo = D.minDate(); hi = D.anchor(); } catch (e) { }
    var now = new Date(), cur = ymStr(now.getFullYear(), now.getMonth() + 1);
    lo = lo ? lo.slice(0, 8) + "01" : addMonths(cur, -23); hi = hi ? hi.slice(0, 8) + "01" : cur;
    var of = document.querySelector(".js-o-from"), onsite = null;
    if (of && of.options.length) onsite = [of.options[0].value, of.options[of.options.length - 1].value];
    return { lo: lo, hi: hi, onsite: onsite };
  }

  // 통합 HTML 옵션 창 (알림창 대신 화면 안 모달): 담을 화면 체크 · 기준 월(회계연도+월) · ONSITE AD 기간 설정(회계연도/기간)
  function askOptions(def) {
    return new Promise(function (res) {
      var B = bounds(), prev = document.activeElement, ov = h("div", "inni-modal"), card = h("div", "inni-modal-card");
      ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "통합 HTML");
      card.appendChild(h("h3", null, "통합 HTML 다운로드"));
      card.appendChild(h("p", null, "고른 화면을 한 파일에 탭으로 담아요. SALES · PRODUCT는 고른 회계연도·기준 월로 맞춰지고, 강조와 코멘트도 그 월에 저장된 것이 들어가요. 받은 뒤 화면은 원래대로 돌아와요."));
      var checks = {}, row = h("div", "inni-checks"); row.style.margin = "8px 0";
      ALL.forEach(function (sub) {
        var lab = h("label"), cb = h("input"); cb.type = "checkbox"; cb.checked = true; checks[sub] = cb;
        lab.appendChild(cb); lab.appendChild(document.createTextNode(LABEL[sub])); row.appendChild(lab);
      });
      card.appendChild(h("h5", null, "담을 화면")); card.appendChild(row);

      // 기준 월: 회계연도 → 월 (사이트 대시보드 위쪽 선택칸과 같은 구성)
      var base = B.hi, d0 = def ? def + "-01" : B.hi; if (d0 >= B.lo && d0 <= B.hi) base = d0;
      var fyOf2 = function (ym) { return +ym.slice(0, 4) + (+ym.slice(5, 7) >= 7 ? 1 : 0); };
      var fySel = h("select"), moSel = h("select");
      fySel.setAttribute("aria-label", "회계연도"); moSel.setAttribute("aria-label", "기준 월");
      for (var f = fyOf2(B.hi); f >= fyOf2(B.lo); f--) opt(fySel, String(f), "BY" + String(f).slice(2) + " (" + (f - 1) + "-07 ~ " + f + "-06)");
      function fillMo(keep) {
        var f2 = +fySel.value; moSel.innerHTML = "";
        monthsBetween(ymStr(f2 - 1, 7), ymStr(f2, 6)).filter(function (k) { return k >= B.lo && k <= B.hi; })
          .forEach(function (k) { opt(moSel, k, k.slice(0, 4) + " " + MON[+k.slice(5, 7) - 1]); });
        if (keep && Array.prototype.some.call(moSel.options, function (o) { return o.value === keep; })) moSel.value = keep;
        else moSel.value = moSel.options.length ? moSel.options[moSel.options.length - 1].value : "";
      }
      fySel.value = String(fyOf2(base)); fillMo(base); fySel.addEventListener("change", function () { fillMo(null); });
      var baseTitle = h("h5", null, "SALES · PRODUCT 기준"), baseRow = h("div"); baseRow.style.cssText = "display:flex;gap:12px;flex-wrap:wrap";
      baseRow.appendChild(field("회계연도", fySel)); baseRow.appendChild(field("기준 월", moSel));
      card.appendChild(baseTitle); card.appendChild(baseRow);

      // ONSITE AD 기간 설정
      var osTitle = h("h5", null, "ONSITE AD 기간 설정"), osBox = h("div");
      var rd = h("div", "inni-radios"), modes = {};
      [["fy", "기준 월과 같은 회계연도"], ["range", "기간 지정"]].forEach(function (o) {
        var lab = h("label"), r = h("input"); r.type = "radio"; r.name = "dy-html-onsite"; r.value = o[0]; r.checked = o[0] === "fy"; modes[o[0]] = r;
        lab.appendChild(r); lab.appendChild(document.createTextNode(o[1])); rd.appendChild(lab);
      });
      osBox.appendChild(rd);
      var ms = monthsBetween(B.onsite ? B.onsite[0] : B.lo, B.onsite ? B.onsite[1] : B.hi);
      var fi = h("select"), ti = h("select"); fi.setAttribute("aria-label", "시작 연월"); ti.setAttribute("aria-label", "끝 연월");
      [fi, ti].forEach(function (s) { ms.forEach(function (k) { opt(s, k, k.slice(0, 4) + "-" + k.slice(5, 7)); }); });
      var tdef = ms.indexOf(base) >= 0 ? base : ms[ms.length - 1], fdef = addMonths(tdef, -5);
      ti.value = tdef; fi.value = ms.indexOf(fdef) >= 0 ? fdef : ms[0];
      var rg = h("div"); rg.style.cssText = "display:flex;gap:12px;flex-wrap:wrap;margin-top:8px";
      rg.appendChild(field("시작 연월", fi)); rg.appendChild(field("끝 연월 (최대 36개월)", ti));
      osBox.appendChild(rg);
      card.appendChild(osTitle); card.appendChild(osBox);

      function sync() { // 체크를 풀면 그 화면 설정은 잠근다
        var osOn = checks.onsite.checked, baseOn = checks.sales.checked || checks.product.checked || (osOn && modes.fy.checked);
        modes.fy.disabled = modes.range.disabled = !osOn;
        fi.disabled = ti.disabled = !osOn || !modes.range.checked;
        fySel.disabled = moSel.disabled = !baseOn;
        osBox.style.opacity = osOn ? "1" : ".45"; rg.style.opacity = fi.disabled ? ".45" : "1"; baseRow.style.opacity = baseOn ? "1" : ".45";
      }
      ALL.forEach(function (s) { checks[s].addEventListener("change", sync); });
      modes.fy.addEventListener("change", sync); modes.range.addEventListener("change", sync); sync();

      var err = h("div", "inni-modal-err"); card.appendChild(err);
      var acts = h("div", "inni-modal-acts"), gap = h("span", "inni-gap"), cancel = h("button", "dash-btn", "취소"), ok = h("button", "dash-btn is-primary", "받기");
      cancel.type = ok.type = "button"; [gap, cancel, ok].forEach(function (x) { acts.appendChild(x); });
      card.appendChild(acts); ov.appendChild(card); document.body.appendChild(ov); fySel.focus();
      function close(v) { document.removeEventListener("keydown", onKey, true); ov.remove(); if (prev && prev.focus) prev.focus(); res(v); }
      function go() {
        var subs = ALL.filter(function (s) { return checks[s].checked; });
        if (!subs.length) { err.textContent = "담을 화면을 하나 이상 골라 주세요"; return; }
        var out = { subs: subs, ym: moSel.value || null, range: null };
        if (subs.indexOf("onsite") >= 0 && modes.range.checked) {
          if (fi.value > ti.value) { err.textContent = "시작 연월이 끝 연월보다 늦어요"; return; }
          if ((+ti.value.slice(0, 4) - +fi.value.slice(0, 4)) * 12 + (+ti.value.slice(5, 7) - +fi.value.slice(5, 7)) + 1 > 36) { err.textContent = "기간은 최대 36개월이에요"; return; }
          out.range = { from: fi.value, to: ti.value };
        }
        if (!out.ym && !out.range) { err.textContent = "기준 월을 골라 주세요"; return; }
        if (!out.ym) out.ym = out.range.to;
        close(out);
      }
      function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(null); } else if (e.key === "Enter" && e.target.tagName !== "BUTTON" && e.target.tagName !== "SELECT") { e.preventDefault(); go(); } }
      document.addEventListener("keydown", onKey, true);
      ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(null); });
      cancel.addEventListener("click", function () { close(null); }); ok.addEventListener("click", go);
    });
  }

  function saveAll(btn) {
    if (busy) return;
    var cur = document.querySelector(".js-s-month"), def = cur && cur.value ? cur.value.slice(0, 7) : "";
    askOptions(def).then(function (opt) {
      if (!opt || busy) return;
      busy = true;
      var old = btn.textContent; btn.disabled = true; btn.textContent = "만드는 중…";
      var untrack = track(), parts = [], missing = [], misses = [];
      var tag = opt.range ? opt.range.from.slice(0, 7) + "_" + opt.range.to.slice(0, 7) : opt.ym.slice(0, 7);
      return opt.subs.reduce(function (chain, sub) {
        return chain.then(function () {
          var pane = document.querySelector('#view-inni .inni-pane[data-pane="' + sub + '"]'), was = pane.hidden, state = null;
          pane.hidden = false;
          document.dispatchEvent(new CustomEvent("inni:show", { detail: { view: "inni", sub: sub } }));
          return settle().then(function () { return ready(pane, 75); }).then(function (ok) {
            if (!ok) { missing.push(LABEL[sub]); return; }
            return aim(pane, sub, opt.ym, sub === "onsite" ? opt.range : null).then(function (st) {
              state = st; if (!st.ok) misses.push(LABEL[sub]);
              window.dispatchEvent(new Event("resize"));
              return wait(900);
            }).then(function () {
              var p = part(pane.querySelector(".inni-report"), null, sub === "product");
              if (p) { p.key = sub; p.label = LABEL[sub]; parts.push(p); } else missing.push(LABEL[sub]);
            });
          }).then(function () { return state ? state.undo() : null; }).then(function () { pane.hidden = was; });
        });
      }, Promise.resolve()).then(function () {
        if (missing.length) toast(missing.join(", ") + " 화면은 불러오지 못해 제외했어요");
        if (misses.length) toast(misses.join(", ") + " 화면은 고른 기간 데이터가 없어 다른 기간으로 담겼어요");
        if (parts.length) download(build(parts, parts.map(function (p) { return p.label.replace(" ", "_"); }).join("_") + "_" + tag), "Sell_Thru");
      }).catch(function (e) { toast("만들지 못했어요: " + ((e && e.message) || e)); })
        .then(function () { untrack(); busy = false; btn.disabled = false; btn.textContent = old; });
    });
  }

  function pick(sel, q) { var e = sel.querySelector(q); return e ? e.textContent.trim() : ""; }

  // Sell Thru 네 화면: 엑셀 버튼 옆에 버튼을 붙인다
  Array.prototype.forEach.call(document.querySelectorAll("#view-inni .inni-pane"), function (pane) {
    var x = pane.querySelector('.inni-bar [class*="-xlsx"]');
    if (!x) return;
    var b = document.createElement("button");
    b.type = "button"; b.className = "dash-btn js-html"; b.textContent = "HTML 다운로드";
    b.title = "지금 화면의 리포트(코멘트·설정 반영)를 HTML 파일로 내려받기";
    b.addEventListener("click", function () { save(pane.querySelector(".inni-report"), null, null, pane.dataset.pane === "product"); });
    x.after(b);
    if (ALL.indexOf(pane.dataset.pane) < 0) return;
    var c = document.createElement("button");
    c.type = "button"; c.className = "dash-btn js-html"; c.textContent = "통합 HTML";
    c.title = "SALES · PRODUCT · ONSITE AD 를 기준 월을 골라 한 파일로 내려받기 (그 월의 강조·코멘트 반영)";
    c.addEventListener("click", function () { saveAll(c); });
    b.after(c);
  });

  // 대시보드 보드 7종(버튼은 inni-board.js 가 만든다)과 커스텀 대시보드는 클릭을 위임으로 받는다
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest(".js-b-html, .js-dash-html");
    if (!t) return;
    if (t.classList.contains("js-b-html")) { save(t.closest(".board-pane").querySelector(".inni-report"), null, "Dashboard", false); return; }
    var pane = t.closest(".board-pane"), sel = pane.querySelector(".js-pick");
    var name = sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.trim() : "대시보드", per = pick(pane, ".js-dates-text");
    var head = { title: name, html: '<header class="inni-rhead"><p class="logs-eyebrow">Dashboard</p><h2>' + esc(name) + '</h2><p class="inni-unit">' + esc(per) + '</p></header>' };
    save(pane.querySelector(".js-grid"), head, "Dashboard");
  });
})();

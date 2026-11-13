/* 그래프 색상 지정 + 막대·꺾은선 혼합 그래프 보정 (window.dyColors)
 *
 * 색은 그래프마다·계열마다 설정 모달의 '그래프' 탭 '색상'에서 고른다. 고르면 바로 저장돼 모두가 같은 색으로 본다
 *   저장 위치: inni_settings report='board_colors' fy=2001 (기존 설정 함수 그대로 사용) → { <그래프 id>: { <계열 키>: '#rrggbb' } }
 * 기본 색: 기간 비교는 현재=풀잎 초록(#11af5d) · 전=진회색 · 전전=연회색, 나머지는 초록과 어울리면서 서로 대비되는 계열
 *
 * 쓰는 쪽
 *   dyColors.get(chartId, key, 기본색) → 지정한 색 또는 기본색
 *   dyColors.cmp(chartId, role)       → 기간 비교 역할('cur'|'prev'|'prev2') 색 (지정값 > 기본)
 *   dyColors.decorate(chartId, cfg)   → 보드 그래프처럼 계열 순서로 색을 입힘(숫자 키 0,1,2…). 단색 계열만. 혼합 보정도 같이 함
 *   dyColors.mixed(cfg)               → 막대+꺾은선 혼합이면 꺾은선을 맨 앞에 그리고 잘리지 않게 함
 *   dyColors.section(charts)          → 설정 모달에 넣는 색상 DOM. charts=[{id,title,series:[{key,label,def}]}]
 *   색이 바뀌면 document 에 'dycolors:change' 이벤트 → 각 화면이 그래프를 다시 그림
 */
(function () {
  "use strict";
  var REPORT = "board_colors", FY = 2001;
  var GREEN = "#11af5d", DARK = "#6b7075", LIGHT = "#c9ccd0";
  // 초록과 어울리면서 서로 대비되는 순서 (초록 · 청록 · 호박 · 청회색 · 산호 · 진초록 · 연두 · 보라)
  var PAL = ["#11af5d", "#2a8c9a", "#e5a63a", "#5b6c8f", "#e06c5a", "#0b7a40", "#9bc53d", "#8a6fb0"];
  var CMP = { cur: GREEN, prev: DARK, prev2: LIGHT, old: "#e1e3e6" };
  var over = {}, loaded = false, timer = null, dirty = false;

  function h(tag, c, text) { var e = document.createElement(tag); if (c) e.className = c; if (text != null) e.textContent = text; return e; }
  function okHex(v) { return /^#[0-9a-f]{6}$/i.test(v || ""); }

  function get(chartId, key, def) { var c = over[chartId]; return c && okHex(c[String(key)]) ? c[String(key)] : def; }
  function cmp(chartId, role) { return get(chartId, role, CMP[role] || CMP.old); }

  // 막대+꺾은선 혼합: 꺾은선을 맨 앞에 그리고(order 가 작을수록 위), 축 끝에서 잘리지 않게 여유를 둔다
  function mixed(cfg) {
    var ds = (cfg.data && cfg.data.datasets) || [], kinds = {};
    ds.forEach(function (d) { kinds[d.type || cfg.type || "bar"] = true; });
    if (!(kinds.bar && kinds.line)) return cfg;
    ds.forEach(function (d) {
      if ((d.type || cfg.type) === "line") { d.order = -1; d.clip = false; d.pointRadius = Math.max(d.pointRadius || 0, 3); d.pointHoverRadius = Math.max(d.pointHoverRadius || 0, 5); }
      else d.order = 5;
    });
    var o = cfg.options = cfg.options || {}, sc = o.scales = o.scales || {};
    Object.keys(sc).forEach(function (k) { if (sc[k] && sc[k].beginAtZero !== undefined && !sc[k].grace) sc[k].grace = "10%"; });
    var lp = (o.layout = o.layout || {}).padding;
    o.layout.padding = typeof lp === "object" && lp ? Object.assign({ top: 10, right: 12 }, lp) : { top: 10, right: 12 };
    return cfg;
  }

  function paint(d, c) {
    var line = (d.type || "") === "line";
    d.borderColor = c; d.backgroundColor = c;
    if (line) { d.pointBackgroundColor = c; d.pointBorderColor = c; }
  }
  // 계열 순서대로 색을 입힌다. 단색 계열은 계열마다 한 색, 막대마다 색이 다른 계열(선택한 달만 다른 색 등)은
  // 가장 많은 색 = '기본', 나머지 = '강조'로 보고 기본만 새 색으로 바꾼다(강조 색은 원래 색 유지, 둘 다 지정 가능)
  var reg = {};   // chartId → [{key,label,def}] 마지막으로 그린 그래프의 계열 목록 (설정 모달용)
  function decorate(chartId, cfg) {
    var ds = (cfg.data && cfg.data.datasets) || [], list = [];
    ds.forEach(function (d, i) {
      var label = d.label || "계열 " + (i + 1), bg = d.backgroundColor;
      if (Array.isArray(bg)) {
        var cnt = {}, order = [];
        bg.forEach(function (x) { if (typeof x !== "string") return; if (!(x in cnt)) { cnt[x] = 0; order.push(x); } cnt[x]++; });
        if (!order.length) return;
        order.sort(function (x, y) { return cnt[y] - cnt[x]; });
        var map = {};
        order.forEach(function (x, n) {
          var key = i + (n ? ":hl" + n : ":base"), def = n ? x : PAL[i % PAL.length];
          list.push({ key: key, label: label + (n ? " · 강조" + (order.length > 2 ? " " + n : "") : (order.length > 1 ? " · 기본" : "")), def: def });
          map[x] = get(chartId, key, def);
        });
        d.backgroundColor = bg.map(function (x) { return map[x] || x; });
        if (typeof d.borderColor === "string" || Array.isArray(d.borderColor)) d.borderColor = d.backgroundColor;
        return;
      }
      if (bg != null && typeof bg !== "string") return;
      var key = String(i), c = get(chartId, key, PAL[i % PAL.length]);
      list.push({ key: key, label: label, def: PAL[i % PAL.length] });
      paint(d, c);
    });
    reg[chartId] = list;
    return mixed(cfg);
  }
  // 보드의 그래프 목록(설정 모달용): 마지막으로 그린 그래프의 계열
  function boardCharts(boardId, charts, sections) {
    var out = [];
    (sections || []).forEach(function (s) {
      var id = "b." + boardId + "." + s.id;
      if (s.type === "chart" && reg[id] && reg[id].length) out.push({ id: id, title: s.title, series: reg[id] });
    });
    return out;
  }

  // 그래프 글자·눈금·격자 색: 테마로 정한다 (엑셀 그림 light=true 는 어두운 글자). 테마가 바뀌면 각 화면이 그래프를 다시 그린다
  function themeName() { return document.documentElement.getAttribute("data-theme") || "rug"; }
  function tick(light) { if (light) return "#333333"; var t = themeName(); return t === "dark" ? "#e6e8ec" : t === "nature" ? "#2d4a38" : "#4a2f12"; }
  function grid(light) { if (light) return "rgba(0,0,0,.1)"; var t = themeName(); return t === "dark" ? "rgba(255,255,255,.14)" : t === "nature" ? "rgba(14,59,36,.1)" : "rgba(59,34,0,.1)"; }

  // ---------- 저장 ----------
  function client() { return window.dyAuth && window.dyAuth.client; }
  function load() {
    var c = client();
    if (!c) return Promise.resolve();
    return c.rpc("dy_inni_settings_get", { p_report: REPORT, p_fy: FY }).then(function (r) {
      loaded = true;
      var d = r && r.data;
      if (d && typeof d === "object") { over = d; document.dispatchEvent(new CustomEvent("dycolors:change")); }
    }, function () {});
  }
  function flush() {
    timer = null; if (!dirty) return; dirty = false;
    var c = client(); if (!c) return;
    c.rpc("dy_inni_settings_set", { p_report: REPORT, p_fy: FY, p_config: over }).then(function (r) {
      if (r && r.error && window.dyToast) window.dyToast("색상을 저장하지 못했어요: " + (r.error.message || ""), 5000);
    });
  }
  function change() {
    dirty = true; if (timer) clearTimeout(timer); timer = setTimeout(flush, 500);
    document.dispatchEvent(new CustomEvent("dycolors:change"));
  }

  // ---------- 설정 모달에 넣는 색상 DOM ----------
  function section(charts) {
    var box = h("div", "inni-colorset");
    box.appendChild(h("h4", null, "그래프 색상"));
    box.appendChild(h("p", null, "그래프마다 계열(범례) 색을 골라요. 고르면 바로 저장되고 모두가 같은 색으로 봐요. 기간 비교는 현재=초록 · 전=진회색 · 전전=연회색이 기본이에요."));
    charts.forEach(function (ch) {
      var g = h("div", "inni-colorgrp"), head = h("div", "inni-colorhead");
      head.appendChild(h("h5", null, ch.title));
      var reset = h("button", "dash-btn", "기본 색으로"); reset.type = "button"; head.appendChild(reset); g.appendChild(head);
      var rows = [];
      ch.series.forEach(function (s) {
        var row = h("label", "inni-colorrow"), inp = h("input");
        inp.type = "color"; inp.value = get(ch.id, s.key, s.def); inp.setAttribute("aria-label", ch.title + " · " + s.label + " 색");
        var chip = h("span", "inni-colorname", s.label);
        inp.addEventListener("input", function () { (over[ch.id] = over[ch.id] || {})[s.key] = inp.value; change(); });
        row.appendChild(inp); row.appendChild(chip); g.appendChild(row); rows.push([inp, s]);
      });
      reset.addEventListener("click", function () {
        if (over[ch.id]) { delete over[ch.id]; change(); }
        rows.forEach(function (x) { x[0].value = x[1].def; });
      });
      box.appendChild(g);
    });
    return box;
  }

  window.dyColors = { tick: tick, grid: grid, get: get, cmp: cmp, decorate: decorate, mixed: mixed, section: section, boardCharts: boardCharts, load: load, PAL: PAL, GREEN: GREEN, DARK: DARK, LIGHT: LIGHT,
    _set: function (o) { over = o || {}; }, _flush: flush };
  // 로그인 클라이언트가 준비되면 한 번 불러온다
  var tries = 0;
  (function boot() { if (client()) { load(); return; } if (++tries < 40) setTimeout(boot, 250); })();
})();

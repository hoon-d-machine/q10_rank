/* 행사 랭킹 · 순위 추이 보드 (Chart.js) — window.dyEvTrend.mount(box, state, spec)
 * 수십 개 선을 한 그래프에 겹쳐 그리면 읽을 수 없어서: 왼쪽 순위표(현재 순위·전일 대비·추이선) + 오른쪽 그래프로 나눈다.
 *   그래프: 강조한 항목만 색을 입혀 굵게, 나머지는 옅은 회색 배경선. 범례 없이 선 끝에 이름을 붙임. 말풍선은 사이트 카드 모양.
 *   강조: 표 행이나 선을 클릭하면 켜고 끔 · 표 행에 마우스를 올리면 그 선이 잠깐 도드라짐.
 * spec = { xs:[yy-mm-dd…], series:[{key,label,sub,color,vals:[xs 와 같은 길이, 없으면 null]}], defaults:[기본 강조 key…] }
 * state = { focus:null|{key:1}, rowHover:null, lineHover:null }  (focus 가 null 이면 defaults 가 강조)
 */
(function () {
  "use strict";
  var charts = new WeakMap();
  var FONT = "Pretendard Variable, Pretendard, sans-serif";

  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function css(n, d) { var v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || d; }
  function isDark() { return document.documentElement.getAttribute("data-theme") === "dark"; }
  function pal() {
    var d = isDark();
    return { ghost: d ? "rgba(255,255,255,.11)" : "rgba(70,60,40,.13)", text: window.dyColors ? window.dyColors.tick(false) : "#222", grid: window.dyColors ? window.dyColors.grid(false) : "rgba(128,128,128,.2)", muted: css("--lg-muted", "#666") };
  }
  function nn(v) { return v != null; }
  function clip(ctx, s, w) { if (ctx.measureText(s).width <= w) return s; while (s.length > 1 && ctx.measureText(s + "…").width > w) s = s.slice(0, -1); return s + "…"; }

  function mount(box, state, spec) {
    var old = charts.get(box); if (old) { old.destroy(); charts.delete(box); }
    box.innerHTML = ""; box.classList.add("ev-board");
    var xs = spec.xs, S = spec.series.slice();
    if (!S.length || !xs.length) { box.appendChild(h("p", "ev-empty", "보여 줄 데이터가 없어요. 필터를 바꿔 보세요.")); return; }
    var last = xs.length - 1;
    var pos = [], pp = 0;   // x 위치: 날짜 사이는 1칸, 기간 공백('~')은 앞뒤로 0.25칸씩(전체 0.5칸 + 간격)
    xs.forEach(function (x, i) { if (i) pp += (x === "~" || xs[i - 1] === "~") ? 0.25 : 1; pos.push(pp); });
    var tickAt = {}, real = xs.map(function (x, i) { return x === "~" ? -1 : i; }).filter(function (i) { return i >= 0; }), skip = Math.max(1, Math.ceil(real.length / 9));
    real.forEach(function (i, n) { if (n % skip === 0 || n === real.length - 1) tickAt[pos[i]] = xs[i].slice(3); });

    // ---- 계산: 현재 순위 · 전일 대비 · 신규 진입 ----
    S.forEach(function (s) {
      s.cur = s.vals[last] != null ? s.vals[last] : null;
      var pi = -1; for (var i = last - 1; i >= 0; i--) if (s.vals[i] != null) { pi = i; break; }
      s.prev = s.cur != null && pi >= 0 ? s.vals[pi] : null;
      var vv = s.vals.filter(nn); s.best = vv.length ? Math.min.apply(null, vv) : 999;
      var fi = -1; for (var j = 0; j < s.vals.length; j++) if (s.vals[j] != null) { fi = j; break; }
      s.isNew = xs.length > 1 && fi > 0 && s.cur != null;
    });
    S.sort(function (a, b) { return (a.cur == null ? 1e9 : a.cur) - (b.cur == null ? 1e9 : b.cur) || a.best - b.best; });
    var byKey = {}; S.forEach(function (s) { byKey[s.key] = s; });
    var allVals = []; S.forEach(function (s) { s.vals.forEach(function (v) { if (v != null) allVals.push(v); }); });
    var minR = Math.max(1, Math.min.apply(null, allVals) - 1), maxR = Math.max.apply(null, allVals) + 1;

    function isOn(k) { return state.focus ? !!state.focus[k] : spec.defaults.indexOf(k) >= 0; }
    function hoverKey() { return state.rowHover || state.lineHover || null; }
    function toggle(k) {
      if (!state.focus) { state.focus = {}; spec.defaults.forEach(function (d) { state.focus[d] = 1; }); }
      if (state.focus[k]) delete state.focus[k]; else state.focus[k] = 1;
      refresh(); if (spec.onChange) spec.onChange();
    }
    var newKeys = S.filter(function (s) { return s.isNew; }).map(function (s) { return s.key; });

    // ---- 위쪽 도구 ----
    var tools = h("div", "ev-btools"), cnt = h("span", "ev-note");
    var bNew = h("button", "ev-mini", "신규 진입 " + newKeys.length + "개 보기"); bNew.type = "button"; bNew.hidden = !newKeys.length;
    bNew.title = "조회 기간 첫날에는 없다가 이후에 새로 들어온 항목만 강조해요";
    bNew.addEventListener("click", function () { state.focus = {}; newKeys.forEach(function (k) { state.focus[k] = 1; }); refresh(); if (spec.onChange) spec.onChange(); });
    var bDef = h("button", "ev-mini", "기본 강조로"); bDef.type = "button";
    bDef.addEventListener("click", function () { state.focus = null; refresh(); if (spec.onChange) spec.onChange(); });
    var bNone = h("button", "ev-mini", "강조 모두 끄기"); bNone.type = "button";
    bNone.addEventListener("click", function () { state.focus = {}; refresh(); if (spec.onChange) spec.onChange(); });
    tools.appendChild(cnt); tools.appendChild(bNew); tools.appendChild(bDef); tools.appendChild(bNone);
    box.appendChild(tools);

    var main = h("div", "ev-bmain"), tbl = h("div", "ev-rtable"), cw = h("div", "ev-bchart"), cv = h("canvas"), tip = h("div", "ev-tip");
    tip.hidden = true; cw.appendChild(cv); cw.appendChild(tip); main.appendChild(tbl); main.appendChild(cw); box.appendChild(main);

    // ---- 순위표 ----
    var head = h("div", "ev-rrow ev-rhead");
    ["순위", "이름", "변동", "추이"].forEach(function (t) { head.appendChild(h("span", null, t)); });
    tbl.appendChild(head);
    var rowEls = {};
    function spark(s, color) {
      var W = 56, Hh = 18, pts = [], d = "";
      s.vals.forEach(function (v, i) {
        if (v == null) { pts.push(null); return; }
        pts.push([xs.length > 1 ? i / (xs.length - 1) * (W - 4) + 2 : W / 2, 2 + (v - minR) / ((maxR - minR) || 1) * (Hh - 4)]);
      });
      var pen = false;
      pts.forEach(function (p) { if (!p) { pen = false; return; } d += (pen ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); pen = true; });
      return '<svg viewBox="0 0 ' + W + " " + Hh + '" width="' + W + '" height="' + Hh + '" aria-hidden="true"><path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    S.forEach(function (s) {
      var r = h("div", "ev-rrow"); r.tabIndex = 0; r.setAttribute("role", "button");
      var rk = h("span", "ev-rk-n", s.cur != null ? String(s.cur) : "–");
      var nm = h("span", "ev-rname"), dot = h("i", "ev-dot"), tx = h("span", "ev-rtext"), t1 = h("b", null, s.label);
      tx.appendChild(t1); if (s.sub) tx.appendChild(h("small", null, s.sub));
      nm.appendChild(dot); nm.appendChild(tx); if (s.isNew) nm.appendChild(h("em", "ev-new", "NEW"));
      var ch = h("span", "ev-chg");
      if (s.cur == null) { ch.textContent = "이탈"; ch.className = "ev-chg is-out"; }
      else if (s.prev == null) { ch.textContent = s.isNew ? "신규" : "–"; }
      else if (s.prev > s.cur) { ch.textContent = "▲" + (s.prev - s.cur); ch.className = "ev-chg is-up"; }
      else if (s.prev < s.cur) { ch.textContent = "▼" + (s.cur - s.prev); ch.className = "ev-chg is-down"; }
      else ch.textContent = "–";
      var sp = h("span", "ev-spark");
      r.appendChild(rk); r.appendChild(nm); r.appendChild(ch); r.appendChild(sp);
      r.addEventListener("click", function () { toggle(s.key); });
      r.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(s.key); } });
      r.addEventListener("mouseenter", function () { state.rowHover = s.key; restyle(); });
      r.addEventListener("mouseleave", function () { state.rowHover = null; restyle(); });
      r.title = s.label + (s.sub ? " · " + s.sub : "") + " — 클릭하면 그래프에서 강조/해제";
      tbl.appendChild(r); rowEls[s.key] = { row: r, dot: dot, spark: sp };
    });

    // ---- 그래프 ----
    function style(s) {
      var P = pal(), on = isOn(s.key), hv = hoverKey() === s.key;
      return { color: on || hv ? s.color : P.ghost, width: on ? 2.6 : hv ? 2.6 : 1, pr: 0, order: on ? 0 : hv ? 1 : 5 };
    }
    var datasets = S.map(function (s) {
      return { key: s.key, label: s.label, data: s.vals.map(function (v, i) { return { x: pos[i], y: v }; }), spanGaps: false, pointHitRadius: 9, pointHoverRadius: function () { return isOn(s.key) || hoverKey() === s.key ? 5 : 0; }, tension: 0.18, borderCapStyle: "round", borderJoinStyle: "round",
        borderColor: function () { return style(s).color; }, backgroundColor: function () { return style(s).color; },
        borderWidth: function () { return style(s).width; }, pointRadius: function () { return style(s).pr; }, order: 5 };
    });
    var endLabels = { id: "evEnd", afterDatasetsDraw: function (c) {
      var ctx = c.ctx, A = c.chartArea, items = [], hk = hoverKey();
      c.data.datasets.forEach(function (d, i) {
        var s = byKey[d.key]; if (!(isOn(s.key) || hk === s.key)) return;
        var idx = -1; for (var k = s.vals.length - 1; k >= 0; k--) if (s.vals[k] != null) { idx = k; break; }
        if (idx < 0) return; var el = c.getDatasetMeta(i).data[idx]; if (!el) return;
        items.push({ x: el.x, y: el.y, y0: el.y, s: s });
      });
      items.sort(function (a, b) { return a.y - b.y; });
      for (var q = 1; q < items.length; q++) if (items[q].y < items[q - 1].y + 16) items[q].y = items[q - 1].y + 16;
      ctx.save(); ctx.font = "600 12px " + FONT; ctx.textBaseline = "middle";
      items.forEach(function (it) {
        ctx.fillStyle = it.s.color; ctx.beginPath(); ctx.arc(it.x, it.y0, 4, 0, 6.283); ctx.fill();
        if (Math.abs(it.y - it.y0) > 2) { ctx.strokeStyle = it.s.color; ctx.globalAlpha = .5; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(it.x + 4, it.y0); ctx.lineTo(it.x + 8, it.y); ctx.stroke(); ctx.globalAlpha = 1; }
        ctx.fillStyle = it.s.color; ctx.fillText(clip(ctx, (it.s.sub ? it.s.sub + " · " : "") + it.s.label, c.width - it.x - 14), it.x + 9, it.y); });
      ctx.restore();
    }, afterDraw: function (c) {
      var a = c.getActiveElements(); if (!a.length) return;
      var ctx = c.ctx, A = c.chartArea; ctx.save(); ctx.strokeStyle = pal().grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a[0].element.x, A.top); ctx.lineTo(a[0].element.x, A.bottom); ctx.stroke(); ctx.restore();
    } };
    var P0 = pal();
    var chart = new Chart(cv, { type: "line", data: { datasets: datasets }, plugins: [endLabels],
      options: { responsive: true, maintainAspectRatio: false, animation: false, layout: { padding: { right: 150, top: 8 } },
        interaction: { mode: "index", intersect: false },
        scales: { x: { type: "linear", min: -0.3, max: pos[pos.length - 1] + 0.3, grid: { color: P0.grid }, afterBuildTicks: function (ax) { ax.ticks = Object.keys(tickAt).map(function (k) { return { value: +k }; }); }, ticks: { color: P0.text, font: { family: FONT, size: 11.5 }, maxRotation: 0, callback: function (v) { return tickAt[v] || ""; } }, border: { display: false } },
          y: { reverse: true, min: minR, max: maxR, grid: { color: P0.grid }, border: { display: false }, ticks: { color: P0.text, font: { family: FONT, size: 11.5 }, precision: 0, callback: function (v) { return v === 1 || (v % 5 === 0 && v > 0) ? v + "위" : ""; } } } },
        plugins: { legend: { display: false }, tooltip: { enabled: false, external: function (ctx) {
          var tt = ctx.tooltip; if (!tt || tt.opacity === 0 || !tt.dataPoints || !tt.dataPoints.length) { tip.hidden = true; return; }
          var hk = hoverKey(), idx = tt.dataPoints[0].dataIndex, list = [];
          if (xs[idx] === "~") { tip.hidden = true; return; }
          tt.dataPoints.forEach(function (p) { var s = byKey[p.dataset.key]; if (s.vals[idx] != null && (isOn(s.key) || hk === s.key)) list.push(s); });
          list.sort(function (a, b) { return a.vals[idx] - b.vals[idx]; });
          tip.innerHTML = "";
          tip.appendChild(h("div", "ev-tip-h", "20" + xs[idx]));
          if (!list.length) tip.appendChild(h("div", "ev-tip-e", "강조한 항목이 이 날에는 없어요"));
          list.slice(0, 10).forEach(function (s) {
            var row = h("div", "ev-tip-r" + (s.key === hk ? " is-hot" : "")), d = h("i", "ev-dot"); d.style.background = s.color;
            row.appendChild(d); row.appendChild(h("span", "ev-tip-n", s.label)); row.appendChild(h("b", null, s.vals[idx] + "위")); tip.appendChild(row);
          });
          if (list.length > 10) tip.appendChild(h("div", "ev-tip-e", "외 " + (list.length - 10) + "개"));
          tip.hidden = false;
          var W = cw.clientWidth, tw = tip.offsetWidth, x = tt.caretX + 16;
          if (x + tw > W) x = tt.caretX - tw - 16;
          tip.style.left = Math.max(4, x) + "px"; tip.style.top = Math.max(4, Math.min(tt.caretY - 10, cw.clientHeight - tip.offsetHeight - 4)) + "px";
        } } },
        onHover: function (e, els, c) {
          var near = c.getElementsAtEventForMode(e, "nearest", { intersect: true }, false), k = near.length ? c.data.datasets[near[0].datasetIndex].key : null;
          cv.style.cursor = k ? "pointer" : "default";
          if (k !== state.lineHover) { state.lineHover = k; restyle(); }
        },
        onClick: function (e, els, c) { var near = c.getElementsAtEventForMode(e, "nearest", { intersect: true }, false); if (near.length) toggle(c.data.datasets[near[0].datasetIndex].key); } } });
    cv.addEventListener("mouseleave", function () { if (state.lineHover) { state.lineHover = null; restyle(); } });
    charts.set(box, chart);

    function restyle() {
      chart.data.datasets.forEach(function (d) { d.order = style(byKey[d.key]).order; });
      chart.update("none");
      S.forEach(function (s) { var o = rowEls[s.key]; o.row.classList.toggle("is-hot", hoverKey() === s.key); });
    }
    function refresh() {
      var n = 0;
      S.forEach(function (s) {
        var on = isOn(s.key), o = rowEls[s.key]; if (on) n++;
        o.row.classList.toggle("is-on", on); o.row.setAttribute("aria-pressed", on ? "true" : "false");
        o.dot.style.background = on ? s.color : "transparent"; o.dot.style.boxShadow = on ? "none" : "inset 0 0 0 1.5px " + pal().ghost;
        o.spark.innerHTML = spark(s, on ? s.color : pal().muted);
      });
      cnt.textContent = "강조 " + n + "개 / 전체 " + S.length + "개 · 행을 눌러 강조하거나 해제";
      bDef.disabled = !state.focus;
      restyle();
    }
    refresh();
  }

  window.dyEvTrend = { mount: mount };
})();

/* DY-AI 대시보드 화면: 대시보드 고르기·저장(dy_dashboards) · 위젯 그리기(Chart.js) · 편집
 * 필요: auth.js(dyAuth), dash-core.js(dyDash), Chart.js
 * 위젯 설정 { id, type, title, w(6칸 중 2|3|4|6), metric, metric2, metrics[], range('dash'|{preset,from,to}),
 *            grain('auto'|day|week|month|quarter|year), compare(none|prev|yoy), chart(line|bar|area), dim, top }
 */
(function () {
  "use strict";

  var D = window.dyDash;
  var M = D.METRICS;
  var LS_KEY = "dy.dash.last";

  // ============================================================
  // 위젯 종류
  // ============================================================
  var TYPES = {
    kpi: { label: "KPI 카드", desc: "한 지표의 합계와 비교 기간 대비 증감", w: 2 },
    trend: { label: "추이 그래프", desc: "기간별 흐름 (선·막대·영역), 비교 기간 겹쳐 보기, 브랜드별 선", w: 6 },
    compare: { label: "기간 비교", desc: "전년 동기·직전 기간을 묶음별로 나란히 (월별 전년비, 분기 비교 등)", w: 6 },
    change: { label: "변화율", desc: "주간·월간 값과 직전 대비 증감률", w: 6 },
    rank: { label: "순위표", desc: "브랜드·상품 상위 N, 비중과 비교 기간 증감", w: 3 },
    mix: { label: "구성 비교", desc: "여러 지표를 나란히 (유입 경로별 PV 등), 비중과 증감", w: 3 },
    weekday: { label: "요일 패턴", desc: "요일별 하루 평균", w: 3 },
    table: { label: "기간별 표", desc: "기간별 여러 지표 표, CSV 내려받기", w: 6 }
  };
  var WIDTHS = [[2, "1/3"], [3, "1/2"], [4, "2/3"], [6, "전체"]];
  var CAL_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 8.5h14M7 2.8v3.4M13 2.8v3.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  var INVERSE = { cancel_amt: 1, cancels: 1, cancel_qty: 1, cancel_rate: 1, g_cancel_amt: 1, g_cancel_qty: 1, r_d_avg: 1, r_w_avg: 1, r_m_avg: 1 };

  // ============================================================
  // 템플릿
  // ============================================================
  var seq = 0;
  function W(type, o) { o.type = type; o.id = "w" + (++seq) + Math.random().toString(36).slice(2, 6); if (!o.w) o.w = TYPES[type].w; return o; }
  function TEMPLATES() {
    return [
      { key: "t-basic", name: "기본 현황", config: { range: { preset: "last30" }, widgets: [
        W("kpi", { metric: "net_sales", compare: "prev" }), W("kpi", { metric: "orders", compare: "prev" }), W("kpi", { metric: "aov", compare: "prev" }),
        W("kpi", { metric: "visitors", compare: "prev" }), W("kpi", { metric: "cvr", compare: "prev" }), W("kpi", { metric: "cancel_rate", compare: "prev" }),
        W("trend", { metric: "net_sales", metric2: "orders", grain: "auto", compare: "none", chart: "bar" }),
        W("rank", { metric: "g_net_amt", dim: "brand_nm", top: 10, compare: "prev", w: 4 }),
        W("weekday", { metric: "net_sales", w: 2 })
      ] } },
      { key: "t-yoy", name: "전년 비교", config: { range: { preset: "ytd" }, widgets: [
        W("kpi", { metric: "net_sales", compare: "yoy" }), W("kpi", { metric: "orders", compare: "yoy" }), W("kpi", { metric: "visitors", compare: "yoy" }),
        W("compare", { metric: "net_sales", grain: "month", compare: "yoy", title: "월별 매출 전년비" }),
        W("compare", { metric: "orders", grain: "month", compare: "yoy", w: 3, title: "월별 주문건수 전년비" }),
        W("compare", { metric: "cvr", grain: "month", compare: "yoy", w: 3, title: "월별 구매전환율 전년비" }),
        W("rank", { metric: "g_net_amt", dim: "brand_nm", top: 15, compare: "yoy", w: 6, title: "브랜드 매출 전년비" })
      ] } },
      { key: "t-quarter", name: "분기 비교", config: { range: { preset: "qtd" }, widgets: [
        W("kpi", { metric: "net_sales", compare: "prev", title: "매출 · 직전 분기 같은 날수 대비" }),
        W("kpi", { metric: "net_sales", compare: "yoy", title: "매출 · 전년 같은 분기 대비" }),
        W("kpi", { metric: "cvr", compare: "prev", title: "구매전환율 · 직전 분기 대비" }),
        W("compare", { metric: "net_sales", grain: "quarter", compare: "yoy", range: { preset: "last24m" }, w: 3, title: "분기별 매출 전년비 (최근 24개월)" }),
        W("compare", { metric: "net_sales", grain: "quarter", compare: "prev", range: { preset: "last24m" }, w: 3, title: "분기별 매출 직전 분기 대비" }),
        W("trend", { metric: "net_sales", grain: "week", compare: "prev", chart: "line", title: "이번 분기 주별 매출 vs 직전 분기" }),
        W("mix", { metrics: ["net_sales", "orders", "aov", "visitors", "cvr", "cancel_rate"], compare: "prev", w: 6, title: "분기 핵심 지표 비교" })
      ] } },
      { key: "t-week", name: "주간 변화", config: { range: { preset: "last90" }, widgets: [
        W("kpi", { metric: "net_sales", compare: "prev", range: { preset: "last7" }, title: "최근 7일 매출" }),
        W("kpi", { metric: "visitors", compare: "prev", range: { preset: "last7" }, title: "최근 7일 방문자" }),
        W("kpi", { metric: "cvr", compare: "prev", range: { preset: "last7" }, title: "최근 7일 구매전환율" }),
        W("change", { metric: "net_sales", grain: "week" }), W("change", { metric: "visitors", grain: "week", w: 3 }),
        W("change", { metric: "cvr", grain: "week", w: 3 }),
        W("table", { metrics: ["net_sales", "orders", "aov", "visitors", "cvr", "cancel_rate"], grain: "week" })
      ] } },
      { key: "t-month", name: "월간 변화", config: { range: { preset: "last12m" }, widgets: [
        W("change", { metric: "net_sales", grain: "month" }), W("change", { metric: "orders", grain: "month", w: 3 }),
        W("change", { metric: "aov", grain: "month", w: 3 }), W("change", { metric: "visitors", grain: "month", w: 3 }),
        W("change", { metric: "cvr", grain: "month", w: 3 }),
        W("table", { metrics: ["net_sales", "gmv", "cancel_amt", "orders", "aov", "visitors", "cvr"], grain: "month" })
      ] } },
      { key: "t-traffic", name: "유입 분석", config: { range: { preset: "last30" }, widgets: [
        W("kpi", { metric: "visitors", compare: "prev" }), W("kpi", { metric: "total_pv", compare: "prev" }), W("kpi", { metric: "cvr", compare: "prev" }),
        W("trend", { metric: "visitors", metric2: "cvr", grain: "auto", compare: "none", chart: "line" }),
        W("mix", { metrics: ["pv_main", "pv_search", "pv_bestseller", "pv_mn_megawari", "pv_deal", "pv_category", "pv_sellershop", "pv_external", "pv_directurl"], compare: "prev", title: "유입 경로별 PV" }),
        W("mix", { metrics: ["pv_ext_google", "pv_ext_yahoo", "pv_ext_instagram", "pv_ext_twitter", "pv_ext_line", "pv_ext_facebook", "pv_ext_kakaku"], compare: "prev", title: "외부 유입 PV" }),
        W("weekday", { metric: "cvr", w: 6, title: "요일별 구매전환율" })
      ] } },
      { key: "t-rank", name: "랭킹·판매 대조", config: { range: { preset: "last90" }, widgets: [
        W("kpi", { metric: "r_d_cnt", compare: "prev", title: "일간 베스트셀러 진입 상품수(합계)" }), W("kpi", { metric: "r_d_avg", compare: "prev" }), W("kpi", { metric: "net_sales", compare: "prev" }),
        W("trend", { metric: "net_sales", metric2: "r_d_cnt", grain: "week", compare: "none", chart: "line", title: "매출 vs 일간 랭킹 진입 상품수 (주별)" }),
        W("trend", { metric: "net_sales", metric2: "r_w_top50", grain: "week", compare: "none", chart: "line", title: "매출 vs 주간 랭킹 50위 안 상품수" }),
        W("table", { metrics: ["net_sales", "orders", "r_d_cnt", "r_d_top50", "r_d_avg", "r_w_cnt", "r_w_avg", "r_m_cnt"], grain: "month", title: "월별 매출과 랭킹" })
      ] } },
      { key: "t-goods", name: "상품 분석", config: { range: { preset: "last30" }, widgets: [
        W("kpi", { metric: "g_net_amt", compare: "prev" }), W("kpi", { metric: "g_net_qty", compare: "prev" }), W("kpi", { metric: "g_unit_price", compare: "prev" }),
        W("trend", { metric: "g_net_amt", dim: "brand_nm", top: 5, grain: "auto", chart: "line", title: "상위 5개 브랜드 매출 추이" }),
        W("rank", { metric: "g_net_amt", dim: "gd_no", top: 20, compare: "prev", w: 4, title: "상품 매출 상위 20" }),
        W("rank", { metric: "g_net_amt", dim: "brand_nm", top: 10, compare: "prev", w: 2, title: "브랜드 상위 10" })
      ] } }
    ];
  }

  // ============================================================
  // 상태
  // ============================================================
  var me = null;            // 로그인 사용자 id
  var saved = [];           // 저장된 대시보드
  var cur = null;           // { id?, key?, name, owner?, config }
  var editing = false, dirty = false;
  var charts = {};

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var grid = $(".js-grid"), msgEl = $(".js-msg");

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var page = document.querySelector(".dash-page") || document.body;
  function css(name) { return getComputedStyle(page).getPropertyValue(name).trim(); }
  function label(k) { return M[k] ? M[k].label : k; }
  function f(k, v, compact) { return D.fmt(v, M[k] ? M[k].fmt : "int", compact); }

  function rangeOf(w) {
    var r = w.range && w.range !== "dash" ? w.range : cur.config.range;
    return D.resolve(r, D.anchor(), D.minDate());
  }
  function autoGrain(rg) { var n = D.days(rg.from, rg.to); return n <= 45 ? "day" : n <= 200 ? "week" : "month"; }
  function grainOf(w, rg) { return !w.grain || w.grain === "auto" ? autoGrain(rg) : w.grain; }

  function setMsg(text, err) {
    msgEl.textContent = text || "";
    msgEl.hidden = !text;
    msgEl.classList.toggle("is-err", !!err);
  }
  function markDirty() { dirty = true; renderBar(); }

  // ============================================================
  // 상단 막대 (대시보드 선택 · 기간 · 편집 · 저장)
  // ============================================================
  var pick = $(".js-pick"), rangeSel = $(".js-range"), datesBtn = $(".js-dates"), datesText = $(".js-dates-text");
  var btnEdit = $(".js-edit"), btnSave = $(".js-save"), btnSaveAs = $(".js-saveas"), btnDel = $(".js-del"), btnAdd = $(".js-add"), btnReload = $(".js-reload");

  function fillPick() {
    pick.innerHTML = "";
    var g1 = el("optgroup"); g1.label = "저장된 대시보드";
    if (!saved.length) { var o0 = el("option", null, "(아직 없음)"); o0.disabled = true; g1.appendChild(o0); }
    saved.forEach(function (d) {
      var o = el("option", null, d.name + (d.owner !== me ? " · " + String(d.owner_email || "").replace(/@dy-ai\.local$/, "") : ""));
      o.value = "id:" + d.id; g1.appendChild(o);
    });
    var g2 = el("optgroup"); g2.label = "템플릿";
    TEMPLATES().forEach(function (t) { var o = el("option", null, t.name); o.value = "tpl:" + t.key; g2.appendChild(o); });
    pick.appendChild(g1); pick.appendChild(g2);
    if (cur) pick.value = cur.id ? "id:" + cur.id : "tpl:" + cur.key;
  }

  function fillRange() {
    rangeSel.innerHTML = "";
    D.PRESETS.forEach(function (p) { var o = el("option", null, p[1]); o.value = p[0]; rangeSel.appendChild(o); });
  }

  function renderBar() {
    var r = cur.config.range || { preset: "last30" };
    rangeSel.value = r.preset;
    var custom = r.preset === "custom";
    var rg = D.resolve(r, D.anchor(), D.minDate());
    datesText.textContent = rg.from + " ~ " + rg.to;
    datesBtn.classList.toggle("is-custom", custom);
    var mine = cur.id && cur.owner === me;
    document.body.classList.toggle("is-editing", editing);
    btnEdit.textContent = editing ? "편집 끝내기" : "편집";
    btnEdit.setAttribute("aria-pressed", editing ? "true" : "false");
    btnAdd.hidden = !editing;
    btnSave.hidden = !(mine && dirty);
    btnSaveAs.textContent = cur.id ? "다른 이름으로 저장" : "내 대시보드로 저장";
    btnSaveAs.hidden = !(editing || dirty || !cur.id);
    btnDel.hidden = !(mine && editing);
    $(".js-dirty").hidden = !dirty;
    $(".js-owner").textContent = cur.id
      ? (mine ? "내 대시보드" : "만든 사람: " + String(cur.owner_email || "").replace(/@dy-ai\.local$/, "") + " (수정하려면 내 대시보드로 저장)")
      : "템플릿 — 바꾼 내용은 '내 대시보드로 저장'해야 남아요";
  }

  pick.addEventListener("change", function () {
    if (dirty && !confirm("저장하지 않은 변경이 있어요. 다른 대시보드로 바꿀까요?")) { fillPick(); return; }
    openByValue(pick.value);
  });
  // 기간 달력 (dy-cal.js): 날짜 버튼을 누르거나 '직접 지정'을 고르면 열림
  function pickDates() {
    var rg = D.resolve(cur.config.range, D.anchor(), D.minDate());
    return window.dyCal.range({ anchor: datesBtn, from: rg.from, to: rg.to, min: D.minDate(), max: D.anchor() }).then(function (v) {
      if (v) { cur.config.range = { preset: "custom", from: v.from, to: v.to }; markDirty(); renderAll(); }
      else renderBar();
    });
  }
  rangeSel.addEventListener("change", function () {
    if (rangeSel.value === "custom") { pickDates(); return; }
    cur.config.range = { preset: rangeSel.value }; markDirty(); renderAll();
  });
  datesBtn.addEventListener("click", pickDates);
  btnEdit.addEventListener("click", function () { editing = !editing; renderBar(); renderAll(true); });
  btnAdd.addEventListener("click", function () { editWidget(null); });
  btnReload.addEventListener("click", function () { D.clearCache(); D.loadBounds().then(function () { renderBounds(); renderBar(); renderAll(); }, showErr); });
  btnSave.addEventListener("click", function () { save(false); });
  btnSaveAs.addEventListener("click", function () { save(true); });
  btnDel.addEventListener("click", function () {
    if (!cur.id || !confirm("'" + cur.name + "' 대시보드를 지울까요?")) return;
    window.dyAuth.client.from("dy_dashboards").delete().eq("id", cur.id).then(function (res) {
      if (res.error) return window.dyToast("지우지 못했어요: " + res.error.message, 5000);
      saved = saved.filter(function (d) { return d.id !== cur.id; });
      dirty = false; editing = false;
      openByValue("tpl:t-basic");
      window.dyToast("지웠어요");
    });
  });
  window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  function openByValue(v) {
    var d;
    if (v.indexOf("id:") === 0) {
      d = saved.filter(function (x) { return "id:" + x.id === v; })[0];
      if (d) cur = { id: d.id, name: d.name, owner: d.owner, owner_email: d.owner_email, config: clone(d.config) };
    }
    if (!d) {
      var t = TEMPLATES().filter(function (x) { return "tpl:" + x.key === v; })[0] || TEMPLATES()[0];
      cur = { key: t.key, name: t.name, config: clone(t.config) };
    }
    if (!cur.config.widgets) cur.config.widgets = [];
    if (!cur.config.range) cur.config.range = { preset: "last30" };
    dirty = false;
    try { localStorage.setItem(LS_KEY, cur.id ? "id:" + cur.id : "tpl:" + cur.key); } catch (e) {}
    fillPick(); renderBar(); renderAll();
  }

  function save(asNew) {
    var c = window.dyAuth.client;
    var go = function (name) {
      var body = { name: name, config: cur.config, updated_at: new Date().toISOString() };
      var q = asNew || !cur.id ? c.from("dy_dashboards").insert(body).select().single()
        : c.from("dy_dashboards").update(body).eq("id", cur.id).select().single();
      q.then(function (res) {
        if (res.error) return window.dyToast("저장하지 못했어요: " + D.friendly(res.error), 6000);
        var d = res.data;
        saved = saved.filter(function (x) { return x.id !== d.id; }).concat([d]).sort(function (a, b) { return a.name.localeCompare(b.name, "ko"); });
        cur = { id: d.id, name: d.name, owner: d.owner, owner_email: d.owner_email, config: clone(d.config) };
        dirty = false;
        try { localStorage.setItem(LS_KEY, "id:" + d.id); } catch (e) {}
        fillPick(); renderBar();
        window.dyToast("'" + d.name + "' 저장했어요");
      });
    };
    if (!asNew && cur.id) return go(cur.name);
    ask("대시보드 이름", cur.id ? cur.name + " 복사본" : cur.name).then(function (name) { if (name) go(name); });
  }

  // ============================================================
  // 위젯 그리기
  // ============================================================
  function destroyCharts() { Object.keys(charts).forEach(function (k) { try { charts[k].destroy(); } catch (e) {} delete charts[k]; }); }

  function renderAll() {
    destroyCharts();
    grid.innerHTML = "";
    var ws = cur.config.widgets;
    if (!ws.length) {
      var empty = el("div", "dash-empty");
      empty.appendChild(el("p", null, "위젯이 없어요."));
      var b = el("button", "dash-btn is-primary", "위젯 추가");
      b.type = "button";
      b.addEventListener("click", function () { if (!editing) { editing = true; renderBar(); } editWidget(null); });
      empty.appendChild(b);
      grid.appendChild(empty);
      return;
    }
    ws.forEach(function (w, i) { grid.appendChild(card(w, i)); });
  }

  function card(w, i) {
    var c = el("section", "dash-card t-" + w.type);
    c.style.setProperty("--w", w.w || TYPES[w.type].w);
    var head = el("header", "dash-card-head");
    var h = el("h3", null, w.title || autoTitle(w));
    head.appendChild(h);
    var sub = el("p", "dash-card-sub", "");
    head.appendChild(sub);
    if (editing) {
      var tools = el("div", "dash-tools");
      [["←", "앞으로", function () { move(i, -1); }], ["→", "뒤로", function () { move(i, 1); }],
       ["↔", "너비 바꾸기", function () { cycleW(i); }], ["설정", "위젯 설정", function () { editWidget(i); }],
       ["복제", "위젯 복제", function () { dup(i); }], ["삭제", "위젯 삭제", function () { del(i); }]].forEach(function (t) {
        var b = el("button", "dash-tool", t[0]); b.type = "button"; b.title = t[1]; b.setAttribute("aria-label", t[1]);
        b.addEventListener("click", t[2]); tools.appendChild(b);
      });
      head.appendChild(tools);
    }
    c.appendChild(head);
    var body = el("div", "dash-card-body");
    body.appendChild(el("p", "dash-loading", "불러오는 중…"));
    c.appendChild(body);
    var rg = rangeOf(w);
    sub.textContent = short(rg.from, rg.to) + (w.range && w.range !== "dash" ? " · 위젯 기간" : "");
    var R = RENDER[w.type];
    Promise.resolve().then(function () { return R(w, rg, body, sub); }).then(function () { sub.title = sub.textContent; }).catch(function (e) {
      body.innerHTML = "";
      body.appendChild(el("p", "dash-error", D.friendly(e)));
    });
    return c;
  }

  function autoTitle(w) {
    var m = label(w.metric);
    switch (w.type) {
      case "kpi": return m;
      case "trend": return w.dim ? m + " · " + (w.dim === "brand_nm" ? "브랜드" : "상품") + "별 추이" : m + (w.metric2 ? " · " + label(w.metric2) : "") + " 추이";
      case "compare": return m + " · " + (w.compare === "yoy" ? "전년 동기" : "직전 기간") + " 비교";
      case "change": return m + " · " + (w.grain === "month" ? "월간" : w.grain === "day" ? "일간" : "주간") + " 변화";
      case "rank": return m + " · " + (w.dim === "gd_no" ? "상품" : "브랜드") + " 상위 " + (w.top || 10);
      case "mix": return "지표 구성 비교";
      case "weekday": return m + " · 요일 패턴";
      case "table": return "기간별 표";
    }
    return TYPES[w.type].label;
  }

  function short(a, b) { return a.slice(0, 4) === b.slice(0, 4) ? a + " ~ " + b.slice(5) : a + " ~ " + b; }
  function cmpNote(mode, rg) {
    if (mode !== "yoy" && mode !== "prev") return "";
    var c = D.shift(rg, mode);
    return " · " + (mode === "yoy" ? "전년" : "직전") + " " + short(c.from, c.to) + gap(c.from);
  }
  // 비교 기간이 데이터 시작일보다 앞이면 알림 (증감이 부풀려 보일 수 있음)
  function gap(from) { var m = D.minDate(); return m && from < m ? " · ⚠ 비교 기간 일부는 데이터 없음 (" + m + "부터)" : ""; }

  function deltaEl(k, cur0, prev) {
    var d = D.delta(cur0, prev);
    var s = el("span", "dash-delta");
    if (d === null || !isFinite(d)) { s.textContent = "–"; s.classList.add("is-flat"); return s; }
    var good = INVERSE[k] ? d < 0 : d > 0;
    s.classList.add(Math.abs(d) < 0.05 ? "is-flat" : good ? "is-up" : "is-down");
    s.textContent = (d > 0 ? "▲ " : d < 0 ? "▼ " : "") + Math.abs(d).toFixed(1) + "%";
    return s;
  }

  function total(k, rg) { return D.query({ metrics: [k], grain: "all", range: rg }).then(function (r) { var key = r.keys[0]; return key ? r.rows[key][k] : 0; }); }
  // 주·월·분기·연 단위면 첫 묶음이 잘리지 않게 그 묶음 시작일부터 (예: 8/9 시작 → 그 주 월요일 8/3부터)
  function full(rg, grain) {
    if (grain === "day" || grain === "all") return rg;
    var o = {}; for (var k in rg) o[k] = rg[k];
    o.from = D.buckets(rg, grain)[0];
    return o;
  }
  function series(keys, rg, grain) {
    rg = full(rg, grain);
    return D.query({ metrics: keys, grain: grain, range: rg }).then(function (r) {
      var bs = D.buckets(rg, grain);
      return { buckets: bs, get: function (k) { return bs.map(function (b) { return r.rows[b] ? r.rows[b][k] : (M[k].src ? 0 : null); }); } };
    });
  }

  function palette() { return [1, 2, 3, 4, 5, 6].map(function (i) { return css("--dash-c" + i) || "#4c8dff"; }); }
  function chartBase(yFmtKey, y2FmtKey) {
    var tick = css("--dash-tick"), gridC = css("--dash-grid");
    var o = {
      responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: tick, boxWidth: 10, boxHeight: 10, font: { size: 11 } } },
        tooltip: { callbacks: { label: function (ctx) {
          var k = ctx.dataset._k;
          return " " + ctx.dataset.label + ": " + f(k, ctx.parsed.y) + (ctx.dataset._dates ? "  (" + ctx.dataset._dates[ctx.dataIndex] + ")" : "");
        } } }
      },
      scales: {
        x: { ticks: { color: tick, maxRotation: 0, autoSkipPadding: 10, font: { size: 11 } }, grid: { display: false }, border: { color: gridC } },
        y: { ticks: { color: tick, font: { size: 11 }, callback: function (v) { return f(yFmtKey, v, true); } }, grid: { color: gridC }, border: { display: false }, beginAtZero: true }
      }
    };
    if (y2FmtKey) o.scales.y1 = { position: "right", ticks: { color: tick, font: { size: 11 }, callback: function (v) { return f(y2FmtKey, v, true); } }, grid: { display: false }, border: { display: false }, beginAtZero: true };
    return o;
  }
  function mountChart(w, body, cfg, h) {
    body.innerHTML = "";
    var box = el("div", "dash-chart"); box.style.height = (h || 260) + "px";
    var cv = document.createElement("canvas"); box.appendChild(cv); body.appendChild(box);
    charts[w.id] = new window.Chart(cv, cfg);
    return box;
  }

  var RENDER = {
    kpi: function (w, rg, body, sub) {
      var k = w.metric, mode = w.compare || "prev";
      sub.textContent += cmpNote(mode, rg);
      var jobs = [total(k, rg)];
      if (mode !== "none") jobs.push(total(k, D.shift(rg, mode)));
      var g = D.days(rg.from, rg.to) <= 120 ? "day" : "week";
      jobs.push(series([k], rg, g));
      return Promise.all(jobs).then(function (r) {
        body.innerHTML = "";
        body.appendChild(el("p", "dash-kpi", f(k, r[0])));
        var row = el("p", "dash-kpi-row");
        if (mode !== "none") {
          row.appendChild(deltaEl(k, r[0], r[1]));
          row.appendChild(el("span", "dash-kpi-prev", (mode === "yoy" ? "전년 " : "직전 ") + f(k, r[1], true)));
        }
        body.appendChild(row);
        body.appendChild(spark(r[r.length - 1].get(k)));
      });
    },

    trend: function (w, rg, body, sub) {
      var grain = grainOf(w, rg), pal = palette(), type = w.chart === "bar" ? "bar" : "line";
      if (w.dim) {
        var frg = full(rg, grain);
        return D.query({ metrics: [w.metric], grain: grain, range: frg, dim: w.dim, top: w.top || 5, topMetric: w.metric }).then(function (r) {
          var bs = D.buckets(frg, grain), dims = {};
          r.keys.forEach(function (key) { var d = key.split("|")[1]; dims[d] = r.labels[key] || d; });
          var tot = {};
          r.keys.forEach(function (key) { var d = key.split("|")[1]; tot[d] = (tot[d] || 0) + (r.rows[key][w.metric] || 0); });
          var ds = Object.keys(dims).sort(function (a, b) { return tot[b] - tot[a]; }).map(function (d, i) {
            var c = pal[i % pal.length];
            return { label: trim(dims[d], 18), _k: w.metric, data: bs.map(function (b) { var v = r.rows[b + "|" + d]; return v ? v[w.metric] : 0; }),
              borderColor: c, backgroundColor: type === "bar" ? c : c + "22", fill: w.chart === "area", tension: .1, pointRadius: 0, borderWidth: 1.8 };
          });
          sub.textContent += " · " + D.GRAINS.filter(function (g) { return g[0] === grain; })[0][1] + "별";
          mountChart(w, body, { type: type, data: { labels: bs.map(function (b) { return D.bucketLabel(b, grain, true); }), datasets: ds }, options: chartBase(w.metric) });
        });
      }
      var keys = [w.metric].concat(w.metric2 ? [w.metric2] : []);
      var mode = w.compare || "none";
      var jobs = [series(keys, rg, grain)];
      if (mode !== "none") jobs.push(series([w.metric], D.shift(rg, mode), grain));
      sub.textContent += " · " + D.GRAINS.filter(function (g) { return g[0] === grain; })[0][1] + "별" + cmpNote(mode, rg);
      return Promise.all(jobs).then(function (r) {
        var s = r[0], ds = [];
        ds.push({ label: label(w.metric), _k: w.metric, _dates: s.buckets, data: s.get(w.metric), yAxisID: "y", type: type,
          borderColor: pal[0], backgroundColor: type === "bar" ? pal[0] : pal[0] + "26", fill: w.chart === "area", tension: .25, pointRadius: 0, borderWidth: 2, order: 2 });
        if (r[1]) {
          var cs = r[1];
          ds.push({ label: label(w.metric) + " (" + (mode === "yoy" ? "전년" : "직전") + ")", _k: w.metric, _dates: cs.buckets, data: cs.get(w.metric).slice(0, s.buckets.length), yAxisID: "y", type: "line",
            borderColor: css("--dash-cmp"), backgroundColor: "transparent", borderDash: [5, 4], tension: .25, pointRadius: 0, borderWidth: 1.6, order: 1 });
        }
        if (w.metric2) {
          ds.push({ label: label(w.metric2), _k: w.metric2, _dates: s.buckets, data: s.get(w.metric2), yAxisID: "y1", type: "line",
            borderColor: pal[1], backgroundColor: "transparent", tension: .25, pointRadius: 0, borderWidth: 2, order: 0 });
        }
        mountChart(w, body, { type: type, data: { labels: s.buckets.map(function (b) { return D.bucketLabel(b, grain, true); }), datasets: ds }, options: chartBase(w.metric, w.metric2) });
      });
    },

    compare: function (w, rg, body, sub) {
      var grain = w.grain && w.grain !== "auto" ? w.grain : "month", mode = w.compare === "prev" ? "prev" : "yoy", k = w.metric, pal = palette();
      var gname = D.GRAINS.filter(function (g) { return g[0] === grain; })[0][1];
      // 전년 동기: 기간 전체를 1년 앞으로 / 직전: 묶음마다 바로 앞 묶음 (전 분기·전월·전주·전날)
      var crg = mode === "yoy" ? D.shift(rg, "yoy") : null;
      var frg = full(rg, grain), prevStart = mode === "prev" ? D.shift({ from: frg.from, to: frg.from, unit: null }, "prev") : null;
      var ext = mode === "prev" ? { from: D.buckets({ from: prevStart.from, to: prevStart.from }, grain)[0], to: rg.to } : null;
      sub.textContent += " · " + gname + "별" + (mode === "yoy" ? cmpNote("yoy", rg) : " · 직전 " + gname + " 대비" + gap(frg.from));
      var jobs = mode === "yoy" ? [series([k], rg, grain), series([k], crg, grain), total(k, rg), total(k, crg)]
        : [series([k], ext, grain), total(k, rg)];
      return Promise.all(jobs).then(function (r) {
        var a, av, bv, n;
        if (mode === "yoy") { a = r[0]; n = a.buckets.length; av = a.get(k); bv = r[1].get(k).slice(0, n); }
        else {
          var all = r[0].get(k), bs = r[0].buckets, cut = bs.indexOf(frg.from);
          if (cut < 1) cut = 1;
          a = { buckets: bs.slice(cut) }; av = all.slice(cut); bv = all.slice(cut - 1, all.length - 1);
          r = [r[0], null, r[1], null];
        }
        body.innerHTML = "";
        var sum = el("p", "dash-compare-sum");
        sum.appendChild(el("b", null, f(k, r[2])));
        if (mode === "yoy") { sum.appendChild(el("span", null, " vs 전년 " + f(k, r[3]))); sum.appendChild(deltaEl(k, r[2], r[3])); }
        else { sum.appendChild(el("span", null, " 기간 합계 · 최근 " + gname + " 직전 대비")); sum.appendChild(deltaEl(k, av[av.length - 1], bv[bv.length - 1])); }
        body.appendChild(sum);
        var holder = el("div"); body.appendChild(holder);
        mountChart(w, holder, { type: "bar", data: {
          labels: a.buckets.map(function (x) { return D.bucketLabel(x, grain, grain !== "quarter"); }),
          datasets: [
            { label: mode === "yoy" ? "이번 기간" : "해당 " + gname, _k: k, _dates: a.buckets, data: av, backgroundColor: pal[0], borderRadius: 3 },
            { label: mode === "yoy" ? "전년 동기" : "직전 " + gname, _k: k, data: bv, backgroundColor: css("--dash-cmp-bar"), borderRadius: 3 }
          ] }, options: chartBase(k) }, 240);
        var tb = el("table", "dash-table is-compact");
        var tr0 = el("tr"); ["", "이번", "비교", "증감"].forEach(function (t) { tr0.appendChild(el("th", null, t)); });
        var thead = el("thead"); thead.appendChild(tr0); tb.appendChild(thead);
        var tbody = el("tbody");
        a.buckets.forEach(function (x, i) {
          var tr = el("tr");
          tr.appendChild(el("th", null, D.bucketLabel(x, grain)));
          tr.appendChild(el("td", null, f(k, av[i])));
          tr.appendChild(el("td", null, f(k, bv[i])));
          var td = el("td"); td.appendChild(deltaEl(k, av[i], bv[i])); tr.appendChild(td);
          tbody.appendChild(tr);
        });
        tb.appendChild(tbody);
        var wrap = el("div", "dash-table-wrap"); wrap.appendChild(tb); body.appendChild(wrap);
      });
    },

    change: function (w, rg, body, sub) {
      var grain = w.grain && w.grain !== "auto" ? w.grain : "week", k = w.metric, pal = palette();
      sub.textContent += " · " + D.GRAINS.filter(function (g) { return g[0] === grain; })[0][1] + "별, 직전 대비";
      return series([k], rg, grain).then(function (s) {
        var v = s.get(k), ch = v.map(function (x, i) { return i ? D.delta(x, v[i - 1]) : null; });
        body.innerHTML = "";
        var head = el("p", "dash-compare-sum");
        head.appendChild(el("b", null, f(k, v[v.length - 1])));
        head.appendChild(el("span", null, " 최근 " + D.bucketLabel(s.buckets[s.buckets.length - 1], grain) + " (진행 중이면 일부 기간)"));
        head.appendChild(deltaEl(k, v[v.length - 1], v[v.length - 2]));
        body.appendChild(head);
        var holder = el("div"); body.appendChild(holder);
        var o = chartBase(k);
        o.scales.y1 = { position: "right", grid: { display: false }, border: { display: false }, ticks: { color: css("--dash-tick"), font: { size: 11 }, callback: function (x) { return x + "%"; } } };
        o.plugins.tooltip.callbacks.label = function (ctx) {
          return ctx.dataset.yAxisID === "y1" ? " 직전 대비: " + (ctx.parsed.y == null ? "–" : ctx.parsed.y.toFixed(1) + "%") : " " + label(k) + ": " + f(k, ctx.parsed.y);
        };
        mountChart(w, holder, { type: "bar", data: {
          labels: s.buckets.map(function (x) { return D.bucketLabel(x, grain, true); }),
          datasets: [
            { label: label(k), data: v, backgroundColor: pal[0] + "cc", borderRadius: 3, yAxisID: "y", order: 2 },
            { label: "직전 대비 %", type: "line", data: ch, yAxisID: "y1", borderColor: pal[2], backgroundColor: pal[2], pointRadius: 2.5, tension: .2, borderWidth: 1.8, order: 1,
              segment: { borderColor: function (c) { return c.p1.parsed.y < 0 ? css("--dash-down") : pal[2]; } } }
          ] }, options: o }, 240);
      });
    },

    rank: function (w, rg, body, sub) {
      var k = w.metric, dim = w.dim || "brand_nm", top = w.top || 10, mode = w.compare || "none";
      if (M[k].src !== "goods" && !(M[k].num && D.srcOf(k).every(function (s) { return s === "goods"; }))) {
        body.innerHTML = ""; body.appendChild(el("p", "dash-error", "순위표는 '상품별' 지표만 쓸 수 있어요 (브랜드·상품 정보가 그 표에만 있어요)")); return;
      }
      sub.textContent += cmpNote(mode, rg);
      var jobs = [D.query({ metrics: [k], grain: "all", range: rg, dim: dim, top: top, topMetric: k }), total(k, rg)];
      if (mode !== "none") jobs.push(D.query({ metrics: [k], grain: "all", range: D.shift(rg, mode), dim: dim, top: 200, topMetric: k }));
      return Promise.all(jobs).then(function (r) {
        var rows = r[0].keys.map(function (d) { return { d: d, name: r[0].labels[d] || d, v: r[0].rows[d][k] }; })
          .sort(function (a, b) { return (b.v || 0) - (a.v || 0); }).slice(0, top);
        var max = rows.length ? Math.max.apply(null, rows.map(function (x) { return x.v || 0; })) : 0;
        var share = M[k].fmt === "money" || M[k].fmt === "int";
        body.innerHTML = "";
        if (!rows.length) { body.appendChild(el("p", "dash-loading", "이 기간에 데이터가 없어요")); return; }
        var tb = el("table", "dash-table dash-rank");
        var tr0 = el("tr");
        ["#", dim === "gd_no" ? "상품" : "브랜드", label(k)].concat(share ? ["비중"] : []).concat(mode !== "none" ? [mode === "yoy" ? "전년비" : "직전비"] : [])
          .forEach(function (t) { tr0.appendChild(el("th", null, t)); });
        var thead = el("thead"); thead.appendChild(tr0); tb.appendChild(thead);
        var tbody = el("tbody");
        rows.forEach(function (x, i) {
          var tr = el("tr");
          tr.appendChild(el("td", "dash-rank-no", String(i + 1)));
          var name = el("td", "dash-rank-name");
          name.appendChild(el("span", null, x.name));
          if (dim === "gd_no") name.appendChild(el("small", null, x.d));
          var bar = el("i", "dash-rank-bar"); bar.style.width = (max ? (x.v / max * 100) : 0) + "%"; name.appendChild(bar);
          tr.appendChild(name);
          tr.appendChild(el("td", "dash-num", f(k, x.v)));
          if (share) tr.appendChild(el("td", "dash-num", r[1] ? (x.v / r[1] * 100).toFixed(1) + "%" : "–"));
          if (mode !== "none") {
            var p = r[2].rows[x.d] ? r[2].rows[x.d][k] : null;
            var td = el("td", "dash-num"); td.appendChild(p == null ? el("span", "dash-delta is-new", "신규") : deltaEl(k, x.v, p)); tr.appendChild(td);
          }
          tbody.appendChild(tr);
        });
        tb.appendChild(tbody);
        var wrap = el("div", "dash-table-wrap"); wrap.appendChild(tb); body.appendChild(wrap);
      });
    },

    mix: function (w, rg, body, sub) {
      var ks = (w.metrics || []).filter(function (k) { return M[k]; });
      if (!ks.length) { body.innerHTML = ""; body.appendChild(el("p", "dash-error", "지표를 골라 주세요")); return; }
      var mode = w.compare || "none";
      sub.textContent += cmpNote(mode, rg);
      var jobs = [D.query({ metrics: ks, grain: "all", range: rg })];
      if (mode !== "none") jobs.push(D.query({ metrics: ks, grain: "all", range: D.shift(rg, mode) }));
      return Promise.all(jobs).then(function (r) {
        var row = r[0].keys.length ? r[0].rows[r[0].keys[0]] : {};
        var prow = r[1] && r[1].keys.length ? r[1].rows[r[1].keys[0]] : {};
        var sameFmt = ks.every(function (k) { return M[k].fmt === M[ks[0]].fmt && (M[k].fmt === "int" || M[k].fmt === "money"); });
        var sum = sameFmt ? ks.reduce(function (a, k) { return a + (row[k] || 0); }, 0) : 0;
        var max = Math.max.apply(null, ks.map(function (k) { return Math.abs(row[k] || 0); }).concat([0]));
        var list = ks.slice();
        if (sameFmt) list.sort(function (a, b) { return (row[b] || 0) - (row[a] || 0); });
        body.innerHTML = "";
        var tb = el("table", "dash-table dash-rank");
        var tr0 = el("tr");
        ["지표", "값"].concat(sameFmt ? ["비중"] : []).concat(mode !== "none" ? [mode === "yoy" ? "전년비" : "직전비"] : []).forEach(function (t) { tr0.appendChild(el("th", null, t)); });
        var thead = el("thead"); thead.appendChild(tr0); tb.appendChild(thead);
        var tbody = el("tbody");
        list.forEach(function (k) {
          var tr = el("tr");
          var name = el("td", "dash-rank-name"); name.appendChild(el("span", null, label(k).replace(/ PV$/, "")));
          if (sameFmt) { var bar = el("i", "dash-rank-bar"); bar.style.width = (max ? Math.abs(row[k] || 0) / max * 100 : 0) + "%"; name.appendChild(bar); }
          tr.appendChild(name);
          tr.appendChild(el("td", "dash-num", f(k, row[k])));
          if (sameFmt) tr.appendChild(el("td", "dash-num", sum ? ((row[k] || 0) / sum * 100).toFixed(1) + "%" : "–"));
          if (mode !== "none") { var td = el("td", "dash-num"); td.appendChild(deltaEl(k, row[k], prow[k])); tr.appendChild(td); }
          tbody.appendChild(tr);
        });
        tb.appendChild(tbody);
        var wrap = el("div", "dash-table-wrap"); wrap.appendChild(tb); body.appendChild(wrap);
      });
    },

    weekday: function (w, rg, body, sub) {
      var k = w.metric, pal = palette();
      sub.textContent += " · 하루 평균";
      return D.query({ metrics: [k], grain: "all", range: rg, dim: "weekday" }).then(function (r) {
        var isBase = !!M[k].src;
        var vals = [1, 2, 3, 4, 5, 6, 7].map(function (d) {
          var row = r.rows[String(d)];
          if (!row) return null;
          return isBase ? row[k] / Math.max(1, r.days[String(d)] || 1) : row[k];
        });
        var max = Math.max.apply(null, vals.map(function (v) { return v || 0; }));
        mountChart(w, body, { type: "bar", data: { labels: D.WEEKDAYS.slice(1), datasets: [{
          label: label(k) + (isBase ? " (하루 평균)" : ""), _k: k, data: vals, borderRadius: 4,
          backgroundColor: vals.map(function (v) { return v === max ? pal[0] : pal[0] + "66"; }) }] },
          options: (function () { var o = chartBase(k); o.plugins.legend.display = false; return o; })() }, 220);
      });
    },

    table: function (w, rg, body, sub) {
      var ks = (w.metrics || []).filter(function (k) { return M[k]; });
      var grain = grainOf(w, rg);
      sub.textContent += " · " + D.GRAINS.filter(function (g) { return g[0] === grain; })[0][1] + "별";
      if (!ks.length) { body.innerHTML = ""; body.appendChild(el("p", "dash-error", "지표를 골라 주세요")); return; }
      return series(ks, rg, grain).then(function (s) {
        body.innerHTML = "";
        var tb = el("table", "dash-table");
        var tr0 = el("tr"); tr0.appendChild(el("th", null, "기간"));
        ks.forEach(function (k) { tr0.appendChild(el("th", "dash-num", label(k))); });
        var thead = el("thead"); thead.appendChild(tr0); tb.appendChild(thead);
        var tbody = el("tbody"), cols = ks.map(function (k) { return s.get(k); });
        var csv = [["기간"].concat(ks.map(label))];
        for (var i = s.buckets.length - 1; i >= 0; i--) {
          var tr = el("tr");
          tr.appendChild(el("th", null, D.bucketLabel(s.buckets[i], grain)));
          var line = [s.buckets[i]];
          ks.forEach(function (k, j) {
            var td = el("td", "dash-num", f(k, cols[j][i]));
            if (i > 0) { var dd = deltaEl(k, cols[j][i], cols[j][i - 1]); dd.classList.add("is-mini"); td.appendChild(dd); }
            tr.appendChild(td);
            line.push(cols[j][i] == null ? "" : +(+cols[j][i]).toFixed(4));
          });
          csv.push(line);
          tbody.appendChild(tr);
        }
        tb.appendChild(tbody);
        var wrap = el("div", "dash-table-wrap is-tall"); wrap.appendChild(tb); body.appendChild(wrap);
        var dl = el("button", "dash-btn is-small", "CSV 내려받기"); dl.type = "button";
        dl.addEventListener("click", function () {
          var text = "﻿" + csv.map(function (r) { return r.map(function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\n");
          var a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
          a.download = "dy-ai_" + (w.title || "기간별표") + "_" + rg.from + "_" + rg.to + ".csv";
          a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
        });
        body.appendChild(dl);
      });
    }
  };

  function trim(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  function spark(vals) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "dash-spark"); svg.setAttribute("viewBox", "0 0 100 28"); svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    var v = vals.map(function (x) { return x == null ? 0 : x; });
    if (v.length < 2) return svg;
    var mx = Math.max.apply(null, v), mn = Math.min.apply(null, v), span = mx - mn || 1;
    var pts = v.map(function (x, i) { return (i / (v.length - 1) * 100).toFixed(2) + "," + (26 - (x - mn) / span * 24).toFixed(2); });
    var area = document.createElementNS(ns, "path");
    area.setAttribute("d", "M0,28 L" + pts.join(" L") + " L100,28 Z"); area.setAttribute("class", "dash-spark-area");
    var line = document.createElementNS(ns, "polyline");
    line.setAttribute("points", pts.join(" ")); line.setAttribute("class", "dash-spark-line");
    svg.appendChild(area); svg.appendChild(line);
    return svg;
  }

  // ============================================================
  // 편집: 이동 · 너비 · 복제 · 삭제
  // ============================================================
  function move(i, d) {
    var ws = cur.config.widgets, j = i + d;
    if (j < 0 || j >= ws.length) return;
    var t = ws[i]; ws[i] = ws[j]; ws[j] = t; markDirty(); renderAll();
  }
  function cycleW(i) {
    var ws = cur.config.widgets, order = WIDTHS.map(function (x) { return x[0]; });
    var n = order.indexOf(ws[i].w || TYPES[ws[i].type].w);
    ws[i].w = order[(n + 1) % order.length]; markDirty(); renderAll();
  }
  function dup(i) {
    var c = clone(cur.config.widgets[i]); c.id = "w" + Date.now().toString(36);
    cur.config.widgets.splice(i + 1, 0, c); markDirty(); renderAll();
  }
  function del(i) { cur.config.widgets.splice(i, 1); markDirty(); renderAll(); }

  // ============================================================
  // 위젯 설정 창
  // ============================================================
  function metricOptions(sel, filter, allowNone) {
    sel.innerHTML = "";
    if (allowNone) { var o0 = el("option", null, "없음"); o0.value = ""; sel.appendChild(o0); }
    var groups = {};
    Object.keys(M).forEach(function (k) {
      if (M[k].hidden || (filter && !filter(M[k]))) return;
      var g = M[k].group;
      if (!groups[g]) { groups[g] = el("optgroup"); groups[g].label = g; sel.appendChild(groups[g]); }
      var o = el("option", null, M[k].label); o.value = k; groups[g].appendChild(o);
    });
  }

  function field(lbl, input, hint) {
    var l = el("label", "dash-field");
    l.appendChild(el("span", null, lbl));
    l.appendChild(input);
    if (hint) l.appendChild(el("small", null, hint));
    return l;
  }
  function select(opts, val) {
    var s = el("select");
    opts.forEach(function (o) { var x = el("option", null, o[1]); x.value = o[0]; s.appendChild(x); });
    if (val != null) s.value = val;
    return s;
  }

  function editWidget(i) {
    var isNew = i == null;
    var w = isNew ? { type: "trend", metric: "net_sales", compare: "none", grain: "auto", chart: "line", w: 6, range: "dash" } : clone(cur.config.widgets[i]);
    var dlg = el("dialog", "dash-dialog");
    var form = el("form"); form.method = "dialog";
    var hd = el("div", "dash-dialog-head");
    hd.appendChild(el("h2", null, isNew ? "위젯 추가" : "위젯 설정"));
    if (window.dyHelp) {
      var hb = el("button", "dash-help-link", "설정 도움말"); hb.type = "button";
      hb.addEventListener("click", function () { window.dyHelp.open("widget"); });
      hd.appendChild(hb);
    }
    form.appendChild(hd);
    var fields = el("div", "dash-fields");
    form.appendChild(fields);

    var typeSel = select(Object.keys(TYPES).map(function (t) { return [t, TYPES[t].label]; }), w.type);
    var typeDesc = el("small");
    var title = el("input"); title.type = "text"; title.placeholder = "비우면 자동"; title.value = w.title || "";
    var metric = el("select"), metric2 = el("select");
    var multi = el("div", "dash-multi");
    var rangeS = select([["dash", "대시보드 기간 따르기"]].concat(D.PRESETS), w.range && w.range !== "dash" ? w.range.preset : "dash");
    // 직접 지정 기간: 달력 버튼 (값은 cr 에 보관)
    var cr = w.range && w.range.preset === "custom" ? { from: w.range.from, to: w.range.to } : (function () { var x = D.resolve(cur.config.range, D.anchor(), D.minDate()); return { from: x.from, to: x.to }; })();
    var crBtn = el("button", "dash-datebtn"); crBtn.type = "button"; crBtn.setAttribute("aria-haspopup", "dialog");
    function crText() { crBtn.innerHTML = CAL_ICON; crBtn.appendChild(el("span", null, cr.from + " ~ " + cr.to)); }
    crText();
    crBtn.addEventListener("click", function () {
      window.dyCal.range({ anchor: crBtn, from: cr.from, to: cr.to, min: D.minDate(), max: D.anchor() }).then(function (v) { if (v) { cr = v; crText(); } });
    });
    var grainS = select([["auto", "자동 (기간 길이에 맞춰)"]].concat(D.GRAINS), w.grain || "auto");
    var cmpS = select([["none", "비교 안 함"], ["prev", "직전 기간"], ["yoy", "전년 동기"]], w.compare || "none");
    var chartS = select([["line", "선"], ["bar", "막대"], ["area", "영역"]], w.chart || "line");
    var dimS = select([["", "없음"], ["brand_nm", "브랜드"], ["gd_no", "상품"]], w.dim || "");
    var topIn = el("input"); topIn.type = "number"; topIn.min = 3; topIn.max = 50; topIn.value = w.top || 10;
    var widthS = select(WIDTHS.map(function (x) { return [String(x[0]), x[1]]; }), String(w.w || TYPES[w.type].w));

    var F = {
      type: field("종류", typeSel), title: field("제목", title),
      metric: field("지표", metric), metric2: field("두 번째 지표 (오른쪽 축)", metric2),
      multi: field("지표 (여러 개)", multi),
      range: field("기간", rangeS), custom: field("직접 지정한 기간", crBtn),
      grain: field("단위", grainS), compare: field("비교", cmpS), chart: field("그래프", chartS),
      dim: field("묶음", dimS, "브랜드·상품 묶음은 '상품별' 지표만"), top: field("상위 몇 개", topIn), width: field("너비", widthS)
    };
    F.type.appendChild(typeDesc);
    Object.keys(F).forEach(function (k) { fields.appendChild(F[k]); });

    function fillMulti(selected) {
      multi.innerHTML = "";
      var groups = {};
      Object.keys(M).forEach(function (k) {
        if (M[k].hidden) return;
        var g = M[k].group;
        if (!groups[g]) { var d = el("details"); d.appendChild(el("summary", null, g)); groups[g] = el("div", "dash-checks"); d.appendChild(groups[g]); multi.appendChild(d); if (selected.some(function (s) { return M[s] && M[s].group === g; })) d.open = true; }
        var l = el("label"); var cb = el("input"); cb.type = "checkbox"; cb.value = k; cb.checked = selected.indexOf(k) >= 0;
        l.appendChild(cb); l.appendChild(document.createTextNode(" " + M[k].label)); groups[g].appendChild(l);
      });
    }
    function sync() {
      var t = typeSel.value;
      typeDesc.textContent = TYPES[t].desc;
      var show = {
        kpi: ["metric", "compare"], trend: ["metric", "metric2", "grain", "compare", "chart", "dim", "top"],
        compare: ["metric", "grain", "compare"], change: ["metric", "grain"], rank: ["metric", "dim", "top", "compare"],
        mix: ["multi", "compare"], weekday: ["metric"], table: ["multi", "grain"]
      }[t];
      ["metric", "metric2", "multi", "grain", "compare", "chart", "dim", "top"].forEach(function (k) { F[k].hidden = show.indexOf(k) < 0; });
      F.custom.hidden = rangeS.value !== "custom";
      if (t === "trend") { var hasDim = !!dimS.value; F.metric2.hidden = hasDim; F.compare.hidden = hasDim; F.top.hidden = !hasDim; }
      if (t === "rank") { if (!dimS.value) dimS.value = "brand_nm"; }
      if (t === "compare") { cmpS.querySelector("option[value=none]").disabled = true; if (cmpS.value === "none") cmpS.value = "yoy"; }
      else cmpS.querySelector("option[value=none]").disabled = false;
      cmpS.querySelector("option[value=prev]").textContent = t === "compare" ? "직전 묶음 (전 분기·전월·전주 대비)" : "직전 기간";
      if (t === "change") { grainS.querySelector("option[value=auto]").disabled = true; if (grainS.value === "auto") grainS.value = "week"; }
      else grainS.querySelector("option[value=auto]").disabled = false;
      var goodsOnly = t === "rank" || (t === "trend" && dimS.value);
      var keep = metric.value || w.metric;
      metricOptions(metric, goodsOnly ? function (m) { return (m.src || "") === "goods" || (m.num && D.srcOf(m.key).join() === "goods"); } : null);
      metric.value = keep; if (!metric.value) metric.selectedIndex = 0;
      F.dim.querySelector("small").hidden = t !== "trend" && t !== "rank";
      dimS.querySelector("option[value='']").disabled = t === "rank";
    }
    metricOptions(metric2, null, true); metric2.value = w.metric2 || "";
    fillMulti(w.metrics || []);
    typeSel.addEventListener("change", function () { widthS.value = String(TYPES[typeSel.value].w); sync(); });
    dimS.addEventListener("change", sync); rangeS.addEventListener("change", sync);
    metric.value = w.metric || "net_sales";
    sync();

    var acts = el("div", "dash-dialog-acts");
    var ok = el("button", "dash-btn is-primary", isNew ? "추가" : "적용"); ok.type = "submit"; ok.value = "ok";
    var cancel = el("button", "dash-btn", "취소"); cancel.type = "submit"; cancel.value = "cancel";
    acts.appendChild(cancel); acts.appendChild(ok); form.appendChild(acts);
    dlg.appendChild(form); document.body.appendChild(dlg);
    dlg.addEventListener("close", function () {
      if (dlg.returnValue === "ok") {
        var t = typeSel.value;
        var n = { id: w.id || "w" + Date.now().toString(36), type: t, w: +widthS.value };
        if (title.value.trim()) n.title = title.value.trim();
        if (!F.metric.hidden) n.metric = metric.value;
        if (!F.metric2.hidden && metric2.value) n.metric2 = metric2.value;
        if (!F.multi.hidden) n.metrics = [].slice.call(multi.querySelectorAll("input:checked")).map(function (c) { return c.value; });
        if (!F.grain.hidden) n.grain = grainS.value;
        if (!F.compare.hidden) n.compare = cmpS.value;
        if (!F.chart.hidden) n.chart = chartS.value;
        if (!F.dim.hidden && dimS.value) n.dim = dimS.value;
        if (!F.top.hidden) n.top = Math.max(3, Math.min(50, +topIn.value || 10));
        n.range = rangeS.value === "dash" ? "dash" : rangeS.value === "custom" ? { preset: "custom", from: cr.from, to: cr.to } : { preset: rangeS.value };
        if ((t === "mix" || t === "table") && (!n.metrics || !n.metrics.length)) n.metrics = ["net_sales"];
        if (isNew) cur.config.widgets.push(n); else cur.config.widgets[i] = n;
        markDirty(); renderAll();
      }
      dlg.remove();
    });
    dlg.showModal();
  }

  function ask(titleText, value) {
    return new Promise(function (resolve) {
      var dlg = el("dialog", "dash-dialog is-small");
      var form = el("form"); form.method = "dialog";
      form.appendChild(el("h2", null, titleText));
      var inp = el("input"); inp.type = "text"; inp.value = value || ""; inp.required = true; inp.maxLength = 60;
      form.appendChild(field("이름", inp));
      var acts = el("div", "dash-dialog-acts");
      var c = el("button", "dash-btn", "취소"); c.type = "submit"; c.value = "cancel"; c.formNoValidate = true;
      var ok = el("button", "dash-btn is-primary", "저장"); ok.type = "submit"; ok.value = "ok";
      acts.appendChild(c); acts.appendChild(ok); form.appendChild(acts);
      dlg.appendChild(form); document.body.appendChild(dlg);
      dlg.addEventListener("close", function () { resolve(dlg.returnValue === "ok" ? inp.value.trim() : null); dlg.remove(); });
      dlg.showModal(); inp.select();
    });
  }

  // ============================================================
  // 시작
  // ============================================================
  function renderBounds() {
    var parts = [];
    D.loadBounds().then(function (bd) {
      ["sales", "pageview", "goods", "rank"].forEach(function (k) {
        if (bd[k] && bd[k].min) parts.push(D.SRC_LABEL[k] + " " + bd[k].min + " ~ " + bd[k].max);
      });
      $(".js-bounds").textContent = parts.length ? "데이터: " + parts.join(" · ") : "DB 에 아직 데이터가 없어요. 수집기에서 Q10 수집을 한 번 하면 채워져요.";
    });
  }
  function showErr(e) { setMsg(D.friendly(e), true); }

  document.addEventListener("dy:theme", function () { if (cur) renderAll(); });

  window.dyAuth.requireLogin().then(function (s) {
    if (!s) return;
    me = s.user && s.user.id;
    fillRange();
    var c = window.dyAuth.client;
    return Promise.all([
      D.loadBounds().catch(function (e) { showErr(e); return null; }),
      c.from("dy_dashboards").select("id, name, owner, owner_email, config, updated_at").order("name").then(function (res) {
        if (res.error) { if (!/dy_dashboards/.test(res.error.message || "")) showErr(res.error); else setMsg(D.friendly({ message: "dy_dash_agg" }), true); return []; }
        return res.data || [];
      })
    ]).then(function (r) {
      saved = r[1];
      if (r[0]) renderBounds();
      var last = null;
      try { last = localStorage.getItem(LS_KEY); } catch (e) {}
      openByValue(last || "tpl:t-basic");
    });
  });
})();

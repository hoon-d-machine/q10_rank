/* DY-AI 행사 랭킹 화면: 예전 Streamlit 대시보드(dashboard.py)를 사이트로 옮긴 것
 * 읽기는 Supabase RPC dy_event_meta / dy_event_rows, 즐겨찾기는 brand_favorites, 수집 설정은 dy_event_config_set (supabase/event_rank.sql)
 * 필요: auth.js(dyAuth), dy-cal.js(dyCal), Plotly
 */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  var client = null, meta = null, rows = [], fav = {}, selected = [];
  var TOPN = ["전체", 5, 10, 15, 20, 30, 50];
  var reqSeq = 0;
  var rangeState = { from: null, to: null };

  var el = {
    sid: $(".js-sid"), enabled: $(".js-enabled"), saveCfg: $(".js-save-cfg"), runNow: $(".js-run-now"), cfgNote: $(".js-cfg-note"),
    event: $(".js-event"), rtype: $(".js-rtype"), cat: $(".js-cat"), range: $(".js-range"), topn: $(".js-topn"),
    brandSum: $(".js-brand-sum"), brandQ: $(".js-brand-q"), brandList: $(".js-brand-list"),
    favSelect: $(".js-fav-select"), brandClear: $(".js-brand-clear"), favBrand: $(".js-fav-brand"), favColor: $(".js-fav-color"),
    favSave: $(".js-fav-save"), favList: $(".js-fav-list"), reload: $(".js-reload"), dlView: $(".js-dl-view"), dlAll: $(".js-dl-all"),
    goodsQ: $(".js-goods-q"), tr: $(".js-tr"), hlClear: $(".js-hl-clear"), chips: $(".js-chips"),
    status: $(".js-status"), raw: $(".js-raw"), rawCount: $(".js-raw-count")
  };

  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmt(n) { return Number(n).toLocaleString("ko-KR"); }
  function setStatus(msg, kind) { el.status.textContent = msg || ""; el.status.className = "data-status js-status" + (kind ? " is-" + kind : ""); }
  function errText(e) {
    var m = (e && e.message) || String(e);
    if (/dy_event_|Could not find the function|schema cache/i.test(m)) return "행사 랭킹 함수가 아직 없어요. Supabase SQL Editor 에서 dy-ai/supabase/event_rank.sql 을 실행해 주세요.";
    if (/login required|JWT|expired/i.test(m)) return "로그인이 만료됐어요. 다시 로그인해 주세요.";
    return "불러오지 못했어요: " + m;
  }
  function day(t) { return String(t).slice(0, 10); }
  function dlabel(t) { return String(t).slice(2, 10); }  // yy-mm-dd

  // ---- 색 ----
  var SITE = ["#11af5d", "#2a8c9a", "#e5a63a", "#5b6c8f", "#e06c5a", "#0b7a40", "#9bc53d", "#8a6fb0"];
  var PALETTE = SITE.concat(["#6fcf97", "#68b6c2", "#f0c46d", "#8f9cb8", "#ec9a8d", "#4a9f72", "#c3dd7f", "#b5a1d0"], ["#0a5c32", "#1e6b76", "#b57d1c", "#3f4d6c", "#b04a3a", "#07502a", "#6f9423", "#65508a"]);
    function colorMap(names) {
    var m = {}, i = 0;
    names.forEach(function (n) { m[n] = fav[n] || PALETTE[i++ % PALETTE.length]; });
    return m;
  }
  function cssVar(n, d) { var v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || d; }
  function theme() {
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    return { font: window.dyColors ? window.dyColors.tick(false) : "#222", grid: window.dyColors ? window.dyColors.grid(false) : "rgba(128,128,128,.25)",
      tipBg: dark ? "#17191f" : cssVar("--lg-card", "#fff"), tipLine: cssVar("--lg-line", "rgba(0,0,0,.2)"), tipText: dark ? "#f1f1f1" : cssVar("--lg-text", "#222") };
  }
  function baseLayout(extra) {
    var t = theme();
    var l = { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { color: t.font, family: "Pretendard Variable, Pretendard, sans-serif", size: 12 },
      margin: { t: 16, l: 48, r: 12, b: 48 }, hovermode: "closest", hoverdistance: 24,
      hoverlabel: { namelength: -1, align: "left", bgcolor: t.tipBg, bordercolor: t.tipLine, font: { color: t.tipText, family: "Pretendard Variable, Pretendard, sans-serif", size: 13 } } };
    Object.keys(extra || {}).forEach(function (k) { l[k] = extra[k]; });
    return l;
  }
  // 호버 말풍선용: 긴 상품명을 줄바꿈(Plotly 는 자동으로 안 꺾음)
  function wrap(s, n) { s = String(s == null ? "" : s); var o = []; for (var i = 0; i < s.length; i += n) o.push(s.slice(i, i + n)); return o.join("<br>"); }

  // ---- 번역(브라우저 내장 Translator, 일본어→한국어) ----
  var trOn = false, trCache = {}, trObj = null;
  function tn(s) { s = s || ""; return trOn && trCache[s] ? trCache[s] : s; }
  function trSupported() { return typeof window.Translator !== "undefined" && typeof window.Translator.create === "function"; }
  function translateNames(names) {
    var todo = names.filter(function (n) { return n && trCache[n] == null && /[\u3040-\u30ff\u3400-\u9fff]/.test(n); });   // 일본어(가나·한자)가 든 이름만
    if (!todo.length) return Promise.resolve();
    var done = 0;
    var getT = trObj ? Promise.resolve(trObj) : window.Translator.create({ sourceLanguage: "ja", targetLanguage: "ko", monitor: function (m) {
      m.addEventListener("downloadprogress", function (e) { setStatus("번역 모델 내려받는 중… " + Math.round((e.loaded || 0) * 100) + "%", "load"); });
    } }).then(function (t) { trObj = t; return t; });
    return getT.then(function (t) {
      var chain = Promise.resolve();
      todo.forEach(function (n) {
        chain = chain.then(function () { return t.translate(n).then(function (k) { trCache[n] = k; }, function () { trCache[n] = n; }).then(function () { done++; if (done % 10 === 0) setStatus("상품명 번역 중… " + done + "/" + todo.length, "load"); }); });
      });
      return chain;
    });
  }
  function goodsNames(list) { var s = {}; list.forEach(function (r) { ["goods_name", "brand", "large", "medium", "small"].forEach(function (k) { if (r[k]) s[r[k]] = 1; }); }); return Object.keys(s); }

  // ---- 범례/선 클릭 강조 ----
  var hl = {};   // 그래프 선택자 → { 이름: true }
  function applyHL(node, sel) {
    if (!node.data) return;
    var set = hl[sel] || {}, any = Object.keys(set).length > 0, op = [], w = [], idx = [], lidx = [];
    node.data.forEach(function (d, i) {
      if (d.type !== "scatter") return;
      var on = !any || set[d.name];
      idx.push(i); op.push(on ? 1 : .12);
      if (d.mode !== "markers") { lidx.push(i); w.push(on && any ? 4 : 2); }
    });
    if (idx.length) Plotly.restyle(node, { opacity: op }, idx);
    if (lidx.length) Plotly.restyle(node, { "line.width": w }, lidx);
    refreshHlBtn();
  }
  function refreshHlBtn() { el.hlClear.hidden = !(tstate.brand.focus || tstate.goods.focus || Object.keys(hl).some(function (k) { return Object.keys(hl[k]).length; })); }
  function bindHL(node, sel) {
    if (node._evBound) return; node._evBound = true;
    function toggle(name) { var s = hl[sel] = hl[sel] || {}; if (s[name]) delete s[name]; else s[name] = true; applyHL(node, sel); }
    node.on("plotly_legendclick", function (e) {
      var name = e.data[e.curveNumber].name;
      if (e.event && e.event.shiftKey) { var d = e.data[e.curveNumber]; Plotly.restyle(node, { visible: d.visible === "legendonly" ? true : "legendonly" }, [e.curveNumber]); }
      else toggle(name);
      return false;
    });
    node.on("plotly_legenddoubleclick", function () { hl[sel] = {}; Plotly.restyle(node, { visible: true }); applyHL(node, sel); return false; });
    node.on("plotly_click", function (e) { var p = e.points && e.points[0]; if (p && p.data.type === "scatter") toggle(p.data.name); });
  }
  function draw(sel, data, layout) {
    var node = $(sel);
    if (!data.length) { Plotly.purge(node); node._evBound = false; node.innerHTML = '<p class="ev-empty">보여 줄 데이터가 없어요. 필터를 바꿔 보세요.</p>'; return; }
    if (node.querySelector(".ev-empty")) { Plotly.purge(node); node._evBound = false; node.innerHTML = ""; }   // 안내 문구만 있던 칸이면 비우고 새로 그림 (그려진 그래프의 DOM 은 건드리지 않음)
    var names = {}; data.forEach(function (d) { names[d.name] = 1; });
    if (hl[sel]) Object.keys(hl[sel]).forEach(function (k) { if (!names[k]) delete hl[sel][k]; });   // 사라진 항목의 강조는 버림
    try {
      var pr = Plotly.react(node, data, layout, { responsive: true, displaylogo: false });
      if (pr && pr.then) pr.then(function () { bindHL(node, sel); applyHL(node, sel); });
      if (pr && pr.catch) pr.catch(function (e) { console.error("Plotly 오류", e); node.innerHTML = '<p class="ev-empty">그래프를 그리지 못했어요: ' + String((e && e.message) || e) + "</p>"; });
    } catch (e) { console.error("Plotly 오류", e); node.innerHTML = '<p class="ev-empty">그래프를 그리지 못했어요: ' + String((e && e.message) || e) + "</p>"; }
  }

  // ---- 필터 적용 ----
  function topFilter(list, key, n) {
    if (n === "전체") return list;
    var best = {};
    list.forEach(function (r) { best[r[key]] = Math.min(best[r[key]] == null ? 1e9 : best[r[key]], r.rank); });
    var keep = Object.keys(best).sort(function (a, b) { return best[a] - best[b]; }).slice(0, +n);
    var set = {}; keep.forEach(function (k) { set[k] = 1; });
    return list.filter(function (r) { return set[r[key]]; });
  }
  function current() {
    var list = rows;
    if (selected.length) { var s = {}; selected.forEach(function (b) { s[b] = 1; }); list = list.filter(function (r) { return s[r.brand]; }); }
    var q = el.goodsQ.value.trim().toLowerCase();
    if (q) list = list.filter(function (r) { return String(r.goods_no).indexOf(q) >= 0 || (r.goods_name || "").toLowerCase().indexOf(q) >= 0 || (trOn && (tn(r.goods_name) || "").toLowerCase().indexOf(q) >= 0); });
    return list;
  }
  function topN() { return el.topn.value === "전체" ? "전체" : +el.topn.value; }

  // 브랜드 목록: 마지막 수집 시점의 최고 순위순, 그 시점에 없으면 가나다순으로 뒤에
  function brandOrder() {
    if (!rows.length) return [];
    var last = rows[rows.length - 1].t, best = {}, all = {};
    rows.forEach(function (r) { if (r.brand) all[r.brand] = 1; if (r.t === last && r.brand) best[r.brand] = Math.min(best[r.brand] == null ? 1e9 : best[r.brand], r.rank); });
    var ranked = Object.keys(best).sort(function (a, b) { return best[a] - best[b]; });
    var rest = Object.keys(all).filter(function (b) { return best[b] == null; }).sort();
    return ranked.concat(rest);
  }

  function setSel(b, on) { var i = selected.indexOf(b); if (on && i < 0) selected.push(b); else if (!on && i >= 0) selected.splice(i, 1); }
  function renderBrandList() {
    var q = el.brandQ.value.trim().toLowerCase(), order = brandOrder(), rk = {};
    var last = rows.length ? rows[rows.length - 1].t : null;
    rows.forEach(function (r) { if (r.t === last && r.brand) rk[r.brand] = Math.min(rk[r.brand] == null ? 1e9 : rk[r.brand], r.rank); });
    var shown = order.filter(function (b) { return !q || b.toLowerCase().indexOf(q) >= 0 || tn(b).toLowerCase().indexOf(q) >= 0; });
    shown = shown.filter(function (b) { return selected.indexOf(b) >= 0; }).concat(shown.filter(function (b) { return selected.indexOf(b) < 0; }));   // 선택한 브랜드를 위로
    el.brandList.innerHTML = "";
    if (shown.length) {
      var bar = h("div", "ev-brandtools");
      var all = h("button", "ev-mini", "검색 결과 " + shown.length + "개 모두 선택"); all.type = "button";
      all.addEventListener("click", function () { shown.forEach(function (b) { setSel(b, true); }); renderBrandList(); renderAll(); });
      var none = h("button", "ev-mini", "모두 해제"); none.type = "button";
      none.addEventListener("click", function () { shown.forEach(function (b) { setSel(b, false); }); renderBrandList(); renderAll(); });
      bar.appendChild(all); bar.appendChild(none); el.brandList.appendChild(bar);
    }
    shown.forEach(function (b) {
      var lab = h("label", "ev-brandrow");
      var cb = h("input"); cb.type = "checkbox"; cb.checked = selected.indexOf(b) >= 0;
      cb.addEventListener("change", function () { setSel(b, cb.checked); renderBrandList(); renderAll(); });
      lab.appendChild(cb);
      var dot = h("i", "ev-dot"); if (fav[b]) dot.style.background = fav[b]; lab.appendChild(dot);
      lab.appendChild(h("span", null, tn(b)));
      if (rk[b] != null) lab.appendChild(h("em", "ev-rk", rk[b] + "위"));
      el.brandList.appendChild(lab);
    });
    if (!order.length) el.brandList.appendChild(h("p", "ev-empty", "브랜드가 없어요"));
    else if (!shown.length) el.brandList.appendChild(h("p", "ev-empty", "검색 결과가 없어요"));
    renderBrandSum();
  }
  function renderBrandSum() {
    el.brandSum.textContent = selected.length ? "브랜드: " + selected.length + "개 선택" : "브랜드: 전체";
    el.chips.innerHTML = ""; el.chips.hidden = !selected.length;
    selected.forEach(function (b) {
      var c = h("button", "ev-chip"); c.type = "button"; c.title = "선택 해제";
      if (fav[b]) { var d = h("i", "ev-dot"); d.style.background = fav[b]; c.appendChild(d); }
      c.appendChild(h("span", null, tn(b))); c.appendChild(h("b", null, "×"));
      c.addEventListener("click", function () { setSel(b, false); renderBrandList(); renderAll(); });
      el.chips.appendChild(c);
    });
  }

  function renderFavs() {
    var brands = brandOrder();
    el.favBrand.innerHTML = "";
    brands.forEach(function (b) { var o = h("option", null, tn(b)); o.value = b; el.favBrand.appendChild(o); });
    el.favList.innerHTML = "";
    var names = Object.keys(fav);
    if (!names.length) el.favList.appendChild(h("li", "ev-note", "저장된 즐겨찾기가 없어요"));
    names.forEach(function (b) {
      var li = h("li"), dot = h("i", "ev-dot"); dot.style.background = fav[b];
      var del = h("button", "logs-btn", "삭제"); del.type = "button";
      del.addEventListener("click", function () {
        client.from("brand_favorites").delete().eq("brand_name", b).then(function (res) {
          if (res.error) { setStatus(errText(res.error), "err"); return; }
          delete fav[b]; renderFavs(); renderBrandList(); renderAll();
        });
      });
      li.appendChild(dot); li.appendChild(h("span", null, tn(b))); li.appendChild(del); el.favList.appendChild(li);
    });
  }

  // ---- 그래프 ----
  function renderAll() {
    var list = current();
    var n = topN(), tn = n === "전체" ? "" : " Top " + n;
    $(".js-t-brand").textContent = "🏢 브랜드" + tn + " 순위";
    $(".js-t-goods").textContent = "📦 상품" + tn + " 순위";
    renderPane(list, n); renderRaw(list);
  }
  document.addEventListener("dy:theme", function () { try { renderAll(); } catch (e) {} });   // 테마가 바뀌면 글자색을 다시 입힘
  // 숨겨진 탭에서는 Plotly 가 크기를 못 재서 그래프가 안 그려진다 → 보이는 탭만 그리고, 탭을 열 때 그린다
  var activeTab = "trend";
  function renderPane(list, n) {
    list = list || current(); n = n == null ? topN() : n;
    if (activeTab === "trend") renderTrend(list, n);
    else if (activeTab === "price") renderPrice(list, n);
    else renderShare(list);
  }

  // 날짜가 10일 넘게 끊기면(예: 3월 행사와 11월 행사) 사이에 빈 칸 하나를 넣어 선이 이어지지 않게 함
  function withGaps(xs) {
    var out = [];
    xs.forEach(function (d, i) {
      if (i) { var a = new Date("20" + xs[i - 1]), b = new Date("20" + d); if ((b - a) / 864e5 > 10) out.push("~"); }
      out.push(d);
    });
    return out;
  }
  var tstate = { brand: { focus: null, rowHover: null, lineHover: null }, goods: { focus: null, rowHover: null, lineHover: null } };
  function renderTrend(list, n) {
    // 브랜드: 날짜별 최고 순위
    var bl = topFilter(list.filter(function (r) { return r.brand; }), "brand", n);
    var by = {}, dates = {};
    bl.forEach(function (r) { var d = dlabel(r.t); dates[d] = 1; var o = by[r.brand] = by[r.brand] || {}; o[d] = Math.min(o[d] == null ? 1e9 : o[d], r.rank); });
    var order = brandOrderIn(bl).filter(function (b) { return by[b]; }), cm = colorMap(order);
    var xs = withGaps(Object.keys(dates).sort());
    var bser = order.map(function (b) { return { key: b, label: tn(b), color: cm[b], vals: xs.map(function (d) { return by[b][d] != null ? by[b][d] : null; }) }; });
    var favB = order.filter(function (b) { return fav[b]; });
    window.dyEvTrend.mount($(".js-b-brand"), tstate.brand, { xs: xs, series: bser, defaults: favB.length ? favB : order.slice(0, 5), onChange: refreshHlBtn });

    // 상품: 날짜별 최고 순위 (같은 상품 이름은 마지막 이름으로)
    var gl = topFilter(list.filter(function (r) { return r.brand; }), "goods_no", n);
    var lastName = {}, gb = {}, gbrand = {}, gd = {};
    gl.forEach(function (r) { lastName[r.goods_no] = r.goods_name; gbrand[r.goods_no] = r.brand; var d = dlabel(r.t); gd[d] = 1; var o = gb[r.goods_no] = gb[r.goods_no] || {}; o[d] = Math.min(o[d] == null ? 1e9 : o[d], r.rank); });
    var gx = withGaps(Object.keys(gd).sort()), gkeys = Object.keys(gb);
    var gser = gkeys.map(function (g, i) {
      return { key: g, label: tn(lastName[g] || ""), sub: tn(gbrand[g] || ""), color: PALETTE[i % PALETTE.length], vals: gx.map(function (d) { return gb[g][d] != null ? gb[g][d] : null; }) };
    });
    // 기본 강조: 즐겨찾기 브랜드의 상품(현재 순위 상위 10개), 없으면 상위 5개
    var lastX = gx.length - 1, cur = function (s) { return s.vals[lastX] == null ? 1e9 : s.vals[lastX]; };
    var gsorted = gser.slice().sort(function (a, b) { return cur(a) - cur(b); });
    var gfav = gsorted.filter(function (s) { return fav[gbrand[s.key]]; }).slice(0, 10).map(function (s) { return s.key; });
    window.dyEvTrend.mount($(".js-b-goods"), tstate.goods, { xs: gx, series: gser, defaults: gfav.length ? gfav : gsorted.slice(0, 5).map(function (s) { return s.key; }), onChange: refreshHlBtn });
    refreshHlBtn();
  }
  function brandOrderIn(list) { // 마지막 시점 순위순
    if (!list.length) return [];
    var last = list[list.length - 1].t, best = {}, all = {};
    list.forEach(function (r) { all[r.brand] = 1; if (r.t === last) best[r.brand] = Math.min(best[r.brand] == null ? 1e9 : best[r.brand], r.rank); });
    return Object.keys(best).sort(function (a, b) { return best[a] - best[b]; }).concat(Object.keys(all).filter(function (b) { return best[b] == null; }));
  }

  function renderPrice(list, n) {
    var gl = topFilter(list, "goods_no", n), last = {};
    gl.forEach(function (r) { last[r.goods_no] = r; });
    var items = Object.keys(last).map(function (k) { return last[k]; }), byBrand = {};
    items.forEach(function (r) { (byBrand[r.brand || "(없음)"] = byBrand[r.brand || "(없음)"] || []).push(r); });
    var cm = colorMap(Object.keys(byBrand));
    var maxRev = Math.max.apply(null, items.map(function (r) { return r.review_count || 0; }).concat([1]));
    draw(".js-c-scatter", Object.keys(byBrand).map(function (b) {
      var a = byBrand[b];
      return { type: "scatter", mode: "markers", name: tn(b), x: a.map(function (r) { return r.sale_price; }), y: a.map(function (r) { return r.rank; }),
        text: a.map(function (r) { return wrap(tn(r.goods_name), 26) + "<br>리뷰 " + fmt(r.review_count || 0); }), hovertemplate: "<b>%{text}</b><br>가격 %{x:,}엔 · <b>%{y}위</b><extra>" + tn(b) + "</extra>",
        marker: { color: cm[b], size: a.map(function (r) { return 6 + 30 * Math.sqrt((r.review_count || 0) / maxRev); }), line: { width: 1, color: "rgba(255,255,255,.7)" }, opacity: .85 } };
    }), baseLayout({ xaxis: { title: "판매가(엔)", gridcolor: theme().grid }, yaxis: { autorange: "reversed", title: "순위", gridcolor: theme().grid } }));
    var byMed = {};
    list.forEach(function (r) { var m = r.medium || "(없음)"; (byMed[m] = byMed[m] || []).push(r.sale_price); });
    var meds = Object.keys(byMed).sort();
    draw(".js-c-box", meds.map(function (m, i) {
      return { type: "box", name: tn(m), y: byMed[m], boxpoints: "all", jitter: .4, pointpos: 0, marker: { color: PALETTE[i % PALETTE.length], size: 4 }, line: { width: 1.5 } };
    }), baseLayout({ yaxis: { title: "판매가(엔)", gridcolor: theme().grid }, showlegend: false, margin: { t: 16, l: 56, r: 12, b: 96 } }));
  }

  // 계층 합계(부모 = 자식 합) → Plotly treemap/sunburst 노드
  function hierarchy(list, levels, root) {
    var sums = {}, parent = {}, label = {};
    list.forEach(function (r) {
      var v = Math.max(101 - r.rank, 0), path = [];
      levels.forEach(function (lv) { var name = lv === "brand" ? r.brand : (lv === "large" ? r.large : lv === "medium" ? r.medium : r.small); path.push(name || "(없음)"); });
      var id = root || "", par = root ? "" : null;
      if (root) { sums[root] = (sums[root] || 0) + v; label[root] = root; parent[root] = ""; }
      path.forEach(function (nm, i) {
        var cid = (id ? id + "/" : "") + nm;
        sums[cid] = (sums[cid] || 0) + v; label[cid] = nm; parent[cid] = id; id = cid;
      });
    });
    var ids = Object.keys(sums);
    return { ids: ids, labels: ids.map(function (i) { return label[i]; }), parents: ids.map(function (i) { return parent[i]; }), values: ids.map(function (i) { return sums[i]; }) };
  }
  // 점유율 색: 중분류마다 사이트 팔레트 색 하나, 그 아래(브랜드·소분류)는 같은 색의 농도로 점유율 크기를 표현 (진할수록 점유율 큼)
  function hexRgb(x) { var n = parseInt(x.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function mixHex(a, b, t) { var A = hexRgb(a), B = hexRgb(b); return "#" + [0, 1, 2].map(function (i) { return ("0" + Math.round(A[i] * t + B[i] * (1 - t)).toString(16)).slice(-2); }).join(""); }
  function lumOf(x) { var c = hexRgb(x); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
  function shareColors(ids, parents, values, depthMed, mcolOf, neutral, bg, favOf) {
    // depthMed: id → 중분류 이름(없으면 null=중립), 같은 중분류 안의 최대 값으로 농도 정규화
    var maxIn = {};
    ids.forEach(function (id, i) { var m = depthMed(id); if (m && id.split("/").length - 1 > depthMed.level) maxIn[m] = Math.max(maxIn[m] || 0, values[i]); });
    return ids.map(function (id, i) {
      var m = depthMed(id), lvl = id.split("/").length - 1;
      if (!m) return neutral[Math.min(lvl, neutral.length - 1)];
      var base = mcolOf(m);
      if (lvl === depthMed.level) return base;
      var f = favOf(id); if (f) return f;
      return mixHex(base, bg, 0.32 + 0.6 * Math.sqrt(values[i] / (maxIn[m] || 1)));
    });
  }
  function renderShare(list) {
    var dark = document.documentElement.getAttribute("data-theme") === "dark", T = theme();
    var bg = dark ? "#17191f" : "#fffef7", neutral = dark ? ["#262a33", "#2f343e"] : ["#ece6d6", "#e2dbc8"], ink = dark ? "#f1f1f1" : "#2b2b2b";
    var tot = {}; list.forEach(function (r) { var m = r.medium || "(없음)"; tot[m] = (tot[m] || 0) + Math.max(101 - r.rank, 0); });
    var medNames = Object.keys(tot).sort(function (a, b) { return tot[b] - tot[a]; }), mcol = {};
    medNames.forEach(function (m, i) { mcol[m] = SITE[i % SITE.length]; });
    var mcolOf = function (m) { return mcol[m] || "#9a9fa5"; };
    var common = { branchvalues: "total", marker: null };
    // 트리맵: 전체 > 대분류 > 중분류 > 브랜드
    var t = hierarchy(list, ["large", "medium", "brand"], "전체");
    var medT = function (id) { var seg = id.split("/"); return seg.length >= 3 ? seg[2] : null; }; medT.level = 2;
    var tcol = shareColors(t.ids, t.parents, t.values, medT, mcolOf, neutral, bg, function (id) { var b = id.split("/").pop(); return fav[b] || null; });
    var total = t.values[t.ids.indexOf("전체")] || 1;
    var tline = t.ids.map(function (id) { var b = id.split("/"); return b.length === 4 && fav[b[3]] ? 3 : 1.5; });
    var tfont = tcol.map(function (c) { return lumOf(c) > 0.62 ? "#222" : "#fff"; });
    tfont = tfont.map(function (c, i) { var lvl = t.ids[i].split("/").length - 1; return lvl < 2 ? ink : c; });
    draw(".js-c-tree", list.length ? [{ type: "treemap", ids: t.ids, labels: t.labels.map(tn), parents: t.parents, values: t.values, branchvalues: "total",
      customdata: t.values.map(function (v) { return (v / total * 100).toFixed(1); }), texttemplate: "<b>%{label}</b><br>%{customdata}%", hovertemplate: "<b>%{label}</b><br>점유율 %{customdata}%<extra></extra>",
      textfont: { color: tfont, family: "Pretendard Variable, Pretendard, sans-serif", size: 13 }, hoverlabel: { bgcolor: T.tipBg, bordercolor: T.tipLine, font: { color: T.tipText, size: 13 }, align: "left" }, pathbar: { visible: false }, tiling: { pad: 3 },
      marker: { colors: tcol, cornerradius: 6, line: { width: tline, color: bg } } }] : [],
      baseLayout({ margin: { t: 4, l: 0, r: 0, b: 0 } }));
    // 선버스트: 대분류 > 중분류 > 소분류
    var s = hierarchy(list, ["large", "medium", "small"], null);
    var medS = function (id) { var seg = id.split("/"); return seg.length >= 2 ? seg[1] : null; }; medS.level = 1;
    var scol = shareColors(s.ids, s.parents, s.values, medS, mcolOf, neutral, bg, function () { return null; });
    var stot = 0; s.ids.forEach(function (id, i) { if (id.indexOf("/") < 0) stot += s.values[i]; }); stot = stot || 1;
    draw(".js-c-sun", list.length ? [{ type: "sunburst", ids: s.ids, labels: s.labels.map(tn), parents: s.parents, values: s.values, branchvalues: "total",
      customdata: s.values.map(function (v) { return (v / stot * 100).toFixed(1); }), hovertemplate: "<b>%{label}</b><br>점유율 %{customdata}%<extra></extra>",
      hoverlabel: { bgcolor: T.tipBg, bordercolor: T.tipLine, font: { color: T.tipText, size: 13 }, align: "left" }, insidetextorientation: "radial", textfont: { color: ink, family: "Pretendard Variable, Pretendard, sans-serif", size: 12 },
      marker: { colors: scol, line: { width: 1.5, color: bg } } }] : [],
      baseLayout({ margin: { t: 4, l: 4, r: 4, b: 4 } }));
  }

  function renderRaw(list) {
    el.raw.innerHTML = "";
    el.rawCount.textContent = fmt(list.length) + "행" + (list.length > 500 ? " (500행만 표시, 전체는 CSV)" : "");
    list.slice(0, 500).forEach(function (r) {
      var tr = h("tr");
      [dlabel(r.t), r.rank, tn(r.brand || ""), tn(r.goods_name || ""), fmt(r.sale_price || 0), fmt(r.review_count || 0)].forEach(function (v, i) {
        var td = h("td", i === 1 || i >= 4 ? "is-num" : null, String(v)); tr.appendChild(td);
      });
      el.raw.appendChild(tr);
    });
  }

  // ---- 데이터 불러오기 ----
  function rpc(name, args) { return client.rpc(name, args).then(function (res) { if (res.error) throw res.error; return res.data; }); }
  function sidValue() { return el.event.value === "__all" ? null : el.event.value; }

  function load() {
    var my = ++reqSeq;
    setStatus("불러오는 중…", "load");
    return rpc("dy_event_rows", { p_sid: sidValue(), p_rank_type: el.rtype.value, p_category: el.cat.value, p_from: rangeState.from, p_to: rangeState.to }).then(function (data) {
      if (my !== reqSeq) return;
      rows = data || [];
      selected = selected.filter(function (b) { return rows.some(function (r) { return r.brand === b; }); });
      setStatus(rows.length ? "" : "선택한 조건에 데이터가 없어요.", rows.length ? "" : "info");
      renderBrandList(); renderFavs();
      if (trOn) return translateNames(goodsNames(rows)).then(function () { setStatus("", ""); if (my === reqSeq) { renderBrandList(); renderFavs(); renderAll(); } });
      renderAll();
    }).catch(function (e) { if (my === reqSeq) setStatus(errText(e), "err"); });
  }

  function rangeLabel() { return rangeState.from && rangeState.to ? rangeState.from + " ~ " + rangeState.to : "전체 기간"; }
  function resetRangeFromEvent() {
    var sid = el.event.value, evs = meta.events.filter(function (e) { return sid === "__all" || e.sid === sid; });
    var from = evs.map(function (e) { return e.from; }).sort()[0] || null, to = evs.map(function (e) { return e.to; }).sort().slice(-1)[0] || null;
    rangeState = { from: from, to: to };
    el.range.querySelector("span").textContent = rangeLabel();
  }

  // ---- CSV ----
  function csv(list) {
    var head = ["일자", "행사", "순위", "브랜드", "상품번호", "상품명", "판매가", "리뷰수", "대분류", "중분류", "소분류"];
    var q = function (v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return "﻿" + [head.join(",")].concat(list.map(function (r) { return [r.t.replace("T", " "), r.sid, r.rank, r.brand, r.goods_no, r.goods_name, r.sale_price, r.review_count, r.large, r.medium, r.small].map(q).join(","); })).join("\r\n");
  }
  function save(name, text) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  // ---- 수집 설정 ----
  function showConfig(c) {
    c = c || {};
    el.sid.value = c.event_sid || ""; el.enabled.checked = !!c.enabled;
    el.cfgNote.textContent = c.updated_at ? "마지막 변경 " + c.updated_at.slice(0, 16).replace("T", " ") + " (UTC)" + (c.updated_by ? " · " + c.updated_by : "") : "";
  }
  el.saveCfg.addEventListener("click", function () {
    rpc("dy_event_config_set", { p_sid: el.sid.value, p_enabled: el.enabled.checked }).then(function (c) { showConfig(c); window.dyToast && window.dyToast("수집 설정을 저장했어요"); })
      .catch(function (e) { setStatus(errText(e), "err"); });
  });
  el.runNow.addEventListener("click", function () {
    if (!el.sid.value.trim()) { setStatus("행사 번호(SID)를 먼저 넣어 주세요.", "err"); return; }
    el.runNow.disabled = true; setStatus("수집하는 중… (1~2분 걸려요)", "load");
    window.dyAuth.getSession().then(function (s) {
      return fetch("/api/event/collect?sid=" + encodeURIComponent(el.sid.value.trim()), { method: "POST", headers: { authorization: "Bearer " + s.access_token } });
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); })
      .then(function (j) {
        var msg = j.skipped ? "건너뜀: " + j.skipped : "수집 완료: " + fmt(j.rows || 0) + "행" + (j.failures && j.failures.length ? " (실패 " + j.failures.length + "건: " + j.failures[0].error + ")" : "");
        setStatus(msg, j.failures && j.failures.length ? "err" : "info"); if (!j.skipped) return init(true);
      }).catch(function (e) { setStatus("수집 실패: " + ((e && e.message) || e), "err"); })
      .then(function () { el.runNow.disabled = false; });
  });

  // ---- 이벤트 ----
  el.event.addEventListener("change", function () { resetRangeFromEvent(); load(); });
  el.rtype.addEventListener("change", load);
  el.cat.addEventListener("change", load);
  el.topn.addEventListener("change", renderAll);
  el.reload.addEventListener("click", function () { init(true); });
  el.brandQ.addEventListener("input", renderBrandList);
  var gqT = null;
  el.goodsQ.addEventListener("input", function () { clearTimeout(gqT); gqT = setTimeout(function () { renderAll(); }, 200); });
  el.hlClear.addEventListener("click", function () { hl = {}; tstate.brand.focus = null; tstate.goods.focus = null; renderAll(); refreshHlBtn(); });
  document.addEventListener("click", function (e) { var d = $(".js-brands"); if (d && d.open && !d.contains(e.target)) d.open = false; });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { var d = $(".js-brands"); if (d && d.open) d.open = false; } });
  if (!trSupported()) { el.tr.disabled = true; el.tr.title = "이 브라우저는 내장 번역을 지원하지 않아요 (Chrome 138 이상 필요)"; }
  el.tr.addEventListener("click", function () {
    if (trOn) { trOn = false; el.tr.setAttribute("aria-pressed", "false"); el.tr.textContent = "🌐 한국어로 보기"; hl = {}; renderBrandList(); renderFavs(); renderAll(); return; }
    el.tr.disabled = true; setStatus("상품명 번역 준비 중…", "load");
    translateNames(goodsNames(rows)).then(function () {
      trOn = true; el.tr.setAttribute("aria-pressed", "true"); el.tr.textContent = "🌐 원문으로 보기"; setStatus("", ""); hl = {}; renderBrandList(); renderFavs(); renderAll();
    }).catch(function (e) { setStatus("번역하지 못했어요: " + ((e && e.message) || e), "err"); })
      .then(function () { el.tr.disabled = false; });
  });
  el.brandClear.addEventListener("click", function () { selected = []; renderBrandList(); renderAll(); });
  el.favSelect.addEventListener("click", function () {
    var have = {}; rows.forEach(function (r) { have[r.brand] = 1; });
    selected = Object.keys(fav).filter(function (b) { return have[b]; }); renderBrandList(); renderAll();
  });
  el.favSave.addEventListener("click", function () {
    var b = el.favBrand.value; if (!b) return;
    client.from("brand_favorites").upsert({ brand_name: b, color_code: el.favColor.value, is_favorite: true, updated_at: new Date().toISOString() }).then(function (res) {
      if (res.error) { setStatus(errText(res.error), "err"); return; }
      fav[b] = el.favColor.value; renderFavs(); renderBrandList(); renderAll();
    });
  });
  el.range.addEventListener("click", function () {
    var evs = meta.events, min = evs.map(function (e) { return e.from; }).sort()[0], max = evs.map(function (e) { return e.to; }).sort().slice(-1)[0];
    window.dyCal.range({ anchor: el.range, from: rangeState.from, to: rangeState.to, min: min, max: max }).then(function (v) {
      if (v) { rangeState = { from: v.from, to: v.to }; el.range.querySelector("span").textContent = rangeLabel(); load(); }
    });
  });
  el.dlView.addEventListener("click", function () { save("행사랭킹_현재데이터.csv", csv(current())); });
  el.dlAll.addEventListener("click", function () {
    el.dlAll.disabled = true; setStatus("전체 원본 만드는 중…", "load");
    var all = [], jobs = [];
    meta.rank_types.forEach(function (t) { meta.categories.forEach(function (c) { jobs.push([t, c]); }); });
    var chain = Promise.resolve();
    jobs.forEach(function (j) { chain = chain.then(function () { return rpc("dy_event_rows", { p_sid: sidValue(), p_rank_type: j[0], p_category: j[1], p_from: null, p_to: null }).then(function (d) { d.forEach(function (r) { r.rt = j[0]; r.cat = j[1]; }); all = all.concat(d); }); }); });
    chain.then(function () { save("행사랭킹_전체원본.csv", csv(all)); setStatus(fmt(all.length) + "행을 내려받았어요.", "info"); })
      .catch(function (e) { setStatus(errText(e), "err"); }).then(function () { el.dlAll.disabled = false; });
  });
  Array.prototype.forEach.call(document.querySelectorAll(".js-tabs .data-tab"), function (b) {
    b.addEventListener("click", function () {
      activeTab = b.dataset.tab;
      Array.prototype.forEach.call(document.querySelectorAll(".js-tabs .data-tab"), function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
      Array.prototype.forEach.call(document.querySelectorAll(".ev-pane"), function (p) { p.hidden = p.dataset.pane !== b.dataset.tab; });
      renderPane();
    });
  });

  // ---- 시작 ----
  function fillSelect(sel, list, def) {
    var keep = sel.value;
    sel.innerHTML = "";
    list.forEach(function (x) { var o = h("option", null, x[1]); o.value = x[0]; sel.appendChild(o); });
    sel.value = keep && list.some(function (x) { return x[0] === keep; }) ? keep : def;
  }
  function init(refresh) {
    return Promise.all([
      rpc("dy_event_meta"),
      client.from("brand_favorites").select("brand_name, color_code").then(function (res) { return res.error ? [] : res.data; })
    ]).then(function (r) {
      meta = r[0]; fav = {};
      (r[1] || []).forEach(function (f) { fav[f.brand_name] = f.color_code; });
      showConfig(meta.config);
      fillSelect(el.event, [["__all", "전체 (All Events)"]].concat(meta.events.map(function (e) { return [e.sid, e.sid + " (" + e.from + " ~ " + e.to + ")"]; })), meta.events.length ? meta.events[0].sid : "__all");
      fillSelect(el.rtype, meta.rank_types.map(function (t) { return [t, t]; }), meta.rank_types.indexOf("누적건수") >= 0 ? "누적건수" : meta.rank_types[0]);
      var cats = meta.categories.slice().sort();
      fillSelect(el.cat, cats.map(function (c) { return [c, c]; }), cats.indexOf("뷰티전체") >= 0 ? "뷰티전체" : cats[0]);
      if (!el.topn.options.length) TOPN.forEach(function (n) { var o = h("option", null, n === "전체" ? "전체" : "Top " + n); o.value = String(n); el.topn.appendChild(o); });
      if (!refresh || !rangeState.from) resetRangeFromEvent();
      if (!meta.events.length) { setStatus("아직 수집된 행사 데이터가 없어요. 위에서 행사 번호(SID)를 켜면 매일 밤 수집돼요.", "info"); return; }
      return load();
    }).catch(function (e) { setStatus(errText(e), "err"); });
  }

  window.dyAuth.requireLogin().then(function (sess) {
    if (!sess) return;
    client = window.dyAuth.client;
    return init(false);
  });
})();

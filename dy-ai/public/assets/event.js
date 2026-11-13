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
  var PALETTE = ["#FD3216", "#00FE35", "#6A76FC", "#FED4C4", "#FE00CE", "#0DF9FF", "#F6F926", "#FF9616", "#479B55", "#EEA6FB", "#DC587D", "#D626FF", "#6E899C", "#00B5F7", "#B68E00", "#C9FBE5", "#FF0092", "#22FFA7", "#E3EE9E", "#86CE00", "#BC7196", "#7E7DCD", "#FC6955", "#E48F72"];
  function pastel(hex) { var n = parseInt(hex.slice(1), 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + ",.5)"; }
  function colorMap(names) {
    var m = {}, i = 0;
    names.forEach(function (n) { m[n] = fav[n] || pastel(PALETTE[i++ % PALETTE.length]); });
    return m;
  }
  function theme() {
    return { font: window.dyColors ? window.dyColors.tick(false) : "#222", grid: "rgba(128,128,128,.25)" };
  }
  function baseLayout(extra) {
    var t = theme();
    var l = { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { color: t.font, family: "Pretendard Variable, Pretendard, sans-serif", size: 12 },
      margin: { t: 16, l: 48, r: 12, b: 48 }, legend: { itemclick: "toggleothers", itemdoubleclick: "toggle" }, hoverlabel: { namelength: -1 } };
    Object.keys(extra || {}).forEach(function (k) { l[k] = extra[k]; });
    return l;
  }
  function draw(sel, data, layout) {
    var node = $(sel);
    if (!data.length) { Plotly.purge(node); node.innerHTML = '<p class="ev-empty">보여 줄 데이터가 없어요. 필터를 바꿔 보세요.</p>'; return; }
    if (node.querySelector(".ev-empty")) { Plotly.purge(node); node.innerHTML = ""; }   // 안내 문구만 있던 칸이면 비우고 새로 그림 (그려진 그래프의 DOM 은 건드리지 않음)
    try {
      var pr = Plotly.react(node, data, layout, { responsive: true, displaylogo: false });
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

  function renderBrandList() {
    var q = el.brandQ.value.trim().toLowerCase(), order = brandOrder();
    el.brandList.innerHTML = "";
    order.filter(function (b) { return !q || b.toLowerCase().indexOf(q) >= 0; }).forEach(function (b) {
      var lab = h("label", "ev-brandrow");
      var cb = h("input"); cb.type = "checkbox"; cb.checked = selected.indexOf(b) >= 0;
      cb.addEventListener("change", function () {
        if (cb.checked) { if (selected.indexOf(b) < 0) selected.push(b); } else selected = selected.filter(function (x) { return x !== b; });
        renderBrandSum(); renderAll();
      });
      lab.appendChild(cb);
      var dot = h("i", "ev-dot"); if (fav[b]) dot.style.background = fav[b]; lab.appendChild(dot);
      lab.appendChild(h("span", null, b));
      el.brandList.appendChild(lab);
    });
    if (!order.length) el.brandList.appendChild(h("p", "ev-empty", "브랜드가 없어요"));
    renderBrandSum();
  }
  function renderBrandSum() { el.brandSum.textContent = selected.length ? "브랜드: " + selected.length + "개 선택" : "브랜드: 전체"; }

  function renderFavs() {
    var brands = brandOrder();
    el.favBrand.innerHTML = "";
    brands.forEach(function (b) { var o = h("option", null, b); o.value = b; el.favBrand.appendChild(o); });
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
      li.appendChild(dot); li.appendChild(h("span", null, b)); li.appendChild(del); el.favList.appendChild(li);
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

  function renderTrend(list, n) {
    var lay = function (title) { return baseLayout({ yaxis: { autorange: "reversed", title: "순위", tickformat: "d", gridcolor: theme().grid }, xaxis: { type: "category", categoryorder: "category ascending", gridcolor: theme().grid } }); };
    // 브랜드: 날짜별 최고 순위
    var bl = topFilter(list.filter(function (r) { return r.brand; }), "brand", n);
    var by = {}, dates = {};
    bl.forEach(function (r) { var d = dlabel(r.t); dates[d] = 1; var o = by[r.brand] = by[r.brand] || {}; o[d] = Math.min(o[d] == null ? 1e9 : o[d], r.rank); });
    var order = brandOrderIn(bl), cm = colorMap(Object.keys(by));
    var xs = Object.keys(dates).sort();
    draw(".js-c-brand", order.filter(function (b) { return by[b]; }).map(function (b) {
      return { type: "scatter", mode: "lines+markers", name: b, x: xs.filter(function (d) { return by[b][d] != null; }), y: xs.filter(function (d) { return by[b][d] != null; }).map(function (d) { return by[b][d]; }), line: { color: cm[b], width: 2 }, marker: { color: cm[b] } };
    }), lay());
    // 상품: 날짜별 최고 순위 (같은 상품 이름은 마지막 이름으로)
    var gl = topFilter(list.filter(function (r) { return r.brand; }), "goods_no", n);
    var lastName = {}, gb = {}, gbrand = {}, gd = {};
    gl.forEach(function (r) { lastName[r.goods_no] = r.goods_name; gbrand[r.goods_no] = r.brand; var d = dlabel(r.t); gd[d] = 1; var o = gb[r.goods_no] = gb[r.goods_no] || {}; o[d] = Math.min(o[d] == null ? 1e9 : o[d], r.rank); });
    var gx = Object.keys(gd).sort();
    var lastT = gl.length ? gl[gl.length - 1].t : null, lastBest = {};
    gl.forEach(function (r) { if (r.t === lastT) lastBest[r.goods_no] = Math.min(lastBest[r.goods_no] == null ? 1e9 : lastBest[r.goods_no], r.rank); });
    var gorder = Object.keys(gb).sort(function (a, b) { return (lastBest[a] == null ? 1e9 : lastBest[a]) - (lastBest[b] == null ? 1e9 : lastBest[b]); });
    var bcm = colorMap(Object.keys(by).concat(Object.keys(gbrand).map(function (k) { return gbrand[k]; })));
    draw(".js-c-goods", gorder.map(function (g) {
      var name = (lastName[g] || "").slice(0, 10) + ".. (#" + String(g).slice(-4) + ")";
      var xx = gx.filter(function (d) { return gb[g][d] != null; });
      return { type: "scatter", mode: "lines+markers", name: name, text: xx.map(function () { return lastName[g]; }), hovertemplate: "%{text}<br>%{x} · %{y}위<extra></extra>", x: xx, y: xx.map(function (d) { return gb[g][d]; }), line: { color: bcm[gbrand[g]] || "#D3D3D3", width: 2 }, marker: { color: bcm[gbrand[g]] || "#D3D3D3" } };
    }), lay());
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
      return { type: "scatter", mode: "markers", name: b, x: a.map(function (r) { return r.sale_price; }), y: a.map(function (r) { return r.rank; }),
        text: a.map(function (r) { return r.goods_name + "<br>리뷰 " + fmt(r.review_count || 0); }), hovertemplate: "%{text}<br>가격 %{x:,}엔 · %{y}위<extra>" + b + "</extra>",
        marker: { color: cm[b], size: a.map(function (r) { return 6 + 30 * Math.sqrt((r.review_count || 0) / maxRev); }), line: { width: 1, color: "rgba(0,0,0,.25)" } } };
    }), baseLayout({ xaxis: { title: "판매가(엔)", gridcolor: theme().grid }, yaxis: { autorange: "reversed", title: "순위", gridcolor: theme().grid } }));
    var byMed = {};
    list.forEach(function (r) { var m = r.medium || "(없음)"; (byMed[m] = byMed[m] || []).push(r.sale_price); });
    var meds = Object.keys(byMed).sort();
    draw(".js-c-box", meds.map(function (m, i) {
      return { type: "box", name: m, y: byMed[m], boxpoints: "all", jitter: .4, pointpos: 0, marker: { color: PALETTE[i % PALETTE.length], size: 4 }, line: { width: 1.5 } };
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
  function renderShare(list) {
    var meds = {}; list.forEach(function (r) { meds[r.medium || "(없음)"] = 1; });
    var medNames = Object.keys(meds).sort(), pastels = ["#66C5CC", "#F6CF71", "#F89C74", "#DCB0F2", "#87C55F", "#9EB9F3", "#FE88B1", "#C9DB74", "#8BE0A4", "#B497E7", "#D3B484", "#B3B3B3"];
    var mcol = {}; medNames.forEach(function (m, i) { mcol[m] = pastels[i % pastels.length]; });
    var t = hierarchy(list, ["large", "medium", "brand"], "전체");
    var tcol = t.ids.map(function (id, i) {
      var lab = t.labels[i];
      if (fav[lab]) return fav[lab];
      if (mcol[lab]) return mcol[lab];
      var par = (t.parents[i] || "").split("/").pop();
      return mcol[par] || "#E5ECF6";
    });
    draw(".js-c-tree", list.length ? [{ type: "treemap", ids: t.ids, labels: t.labels, parents: t.parents, values: t.values, branchvalues: "total", textinfo: "label+value", marker: { colors: tcol, line: { width: 1 } } }] : [],
      baseLayout({ margin: { t: 8, l: 4, r: 4, b: 4 } }));
    var s = hierarchy(list, ["large", "medium", "small"], null);
    var scol = s.ids.map(function (id) { var seg = id.split("/"); return mcol[seg[1] || seg[0]] || "#B3B3B3"; });
    draw(".js-c-sun", list.length ? [{ type: "sunburst", ids: s.ids, labels: s.labels, parents: s.parents, values: s.values, branchvalues: "total", marker: { colors: scol, line: { width: 1 } } }] : [],
      baseLayout({ margin: { t: 8, l: 4, r: 4, b: 4 } }));
  }

  function renderRaw(list) {
    el.raw.innerHTML = "";
    el.rawCount.textContent = fmt(list.length) + "행" + (list.length > 500 ? " (500행만 표시, 전체는 CSV)" : "");
    list.slice(0, 500).forEach(function (r) {
      var tr = h("tr");
      [dlabel(r.t), r.rank, r.brand || "", r.goods_name || "", fmt(r.sale_price || 0), fmt(r.review_count || 0)].forEach(function (v, i) {
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
      renderBrandList(); renderFavs(); renderAll();
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

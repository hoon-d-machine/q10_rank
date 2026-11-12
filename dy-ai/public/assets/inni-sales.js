/* inni 탭 · SALES 월간 리포트 (AP Talk 시트의 SALES 탭을 DB 로 대체)
 *   - 회계연도(BY, 7월~6월) 단위로 월별 SALES · YoY · 목표 · 달성률 · PV · ORDERS · CVR · AOV
 *   - BY 별 월 매출 추이(그래프+표), 코멘트(자동 생성 + 직접 입력)
 *   - 집계는 dash-core.js(window.dyDash.query) 의 월 단위 집계를 그대로 씀. 목표·코멘트는 supabase/inni.sql 의 함수.
 * 정의: SALES = 순매출(final_buy_bpv), PV = 총 PV, ORDERS = 구매수(purchase_cnt), CVR = ORDERS ÷ PV, AOV = SALES ÷ ORDERS
 * 진행 중인 달은 같은 일수끼리 비교(작년 같은 날수, 전월 같은 날수)하고 헤더에 * 를 붙인다.
 */
(function () {
  "use strict";
  var D = window.dyDash;
  var pane = document.querySelector('.inni-pane[data-pane="sales"]');
  if (!D || !pane) return;

  var $ = function (s) { return pane.querySelector(s); };
  var el = {
    fy: $(".js-s-fy"), month: $(".js-s-month"), reload: $(".js-s-reload"), tgtBtn: $(".js-s-tgt-btn"), msg: $(".js-s-msg"),
    tgt: $(".js-s-tgt"), tgtTable: $(".js-s-tgt-table"), tgtSave: $(".js-s-tgt-save"), tgtCancel: $(".js-s-tgt-cancel"), tgtNote: $(".js-s-tgt-note"),
    title: $(".js-s-title"), unit: $(".js-s-unit"), auto: $(".js-s-auto"), noteBtn: $(".js-s-note-btn"), manual: $(".js-s-manual"), manualBody: $(".js-s-manual-body"), manualMeta: $(".js-s-manual-meta"),
    kpiTitle: $(".js-s-kpi-title"), kpi: $(".js-s-kpi"), chart: $(".js-s-chart"), trend: $(".js-s-trend")
  };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var S = { note: null, ready: false, loading: false, rows: {}, targets: {}, anchor: null, minYm: null, endYm: null, partialYm: null, lyPart: null, pmPart: null, fy: null, ym: null };
  var chart = null;

  // ---------- 날짜 ----------
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ym(y, m) { return y + "-" + pad(m) + "-01"; }
  function yOf(k) { return +k.slice(0, 4); }
  function mOf(k) { return +k.slice(5, 7); }
  function addM(k, n) { var t = yOf(k) * 12 + (mOf(k) - 1) + n; return ym(Math.floor(t / 12), (t % 12) + 1); }
  function lastDay(k) { return new Date(yOf(k), mOf(k), 0).getDate(); }
  function fyOf(k) { return mOf(k) >= 7 ? yOf(k) + 1 : yOf(k); }              // BY27 = 2026-07 ~ 2027-06
  function fyLabel(fy) { return "BY" + String(fy).slice(2); }
  function fyMonths(fy) { var a = []; for (var i = 0; i < 12; i++) a.push(addM(ym(fy - 1, 7), i)); return a; }
  function ymd(k, d) { return k.slice(0, 8) + pad(d); }

  // ---------- 서식 ----------
  function num(v) { return v == null ? "-" : Math.round(v).toLocaleString("ko-KR"); }
  function kj(v) { return v == null ? "-" : Math.round(v / 1000).toLocaleString("ko-KR"); }
  function pctv(v, d) { return v == null || !isFinite(v) ? "-" : (d == null ? v.toFixed(0) : v.toFixed(d)) + "%"; }
  function gv(v) { return v == null || !isFinite(v) ? null : v; }
  function gstr(v) { return v == null ? "-" : (v >= 0 ? "+" : "") + v.toFixed(0) + "%"; }
  function growth(a, b) { return b ? (a / b - 1) * 100 : null; }
  function krw(yen) { // 엔 → 한국식 '약 …' 금액 (4천8백만, 1억2천만, 939만)
    var n = Math.round(yen);
    if (n >= 99500000) { var u = Math.round(n / 1e7) * 1e7, eok = Math.floor(u / 1e8), rest = Math.round((u - eok * 1e8) / 1e7); return eok + "억" + (rest ? rest + "천만" : ""); }
    if (n >= 1e7) { var m = Math.round(n / 1e6), c = Math.floor(m / 10), b = m % 10; return (c ? c + "천" : "") + (b ? b + "백" : "") + "만"; }
    return Math.round(n / 1e4).toLocaleString("ko-KR") + "만";
  }
  function cls(v) { return v == null ? "" : v >= 0 ? "is-up" : "is-down"; }
  function h(tag, c, text) { var e = document.createElement(tag); if (c) e.className = c; if (text != null) e.textContent = text; return e; }
  function toast(m) { if (window.dyToast) window.dyToast(m); }
  function showMsg(m) { el.msg.textContent = m || ""; el.msg.hidden = !m; }
  function rpc(name, args) { return window.dyAuth.client.rpc(name, args).then(function (res) { if (res.error) throw res.error; return res.data; }); }
  function friendly(e) {
    var m = (e && e.message) || String(e);
    if (/dy_inni_|Could not find the function|schema cache/i.test(m)) return "목표·코멘트 함수가 아직 없어요. Supabase SQL Editor 에서 dy-ai/supabase/inni.sql 을 실행해 주세요.";
    return D.friendly ? D.friendly(e) : "불러오지 못했어요: " + m;
  }

  // ---------- 데이터 ----------
  var MET = ["net_sales", "total_pv", "purchases"];
  function q(from, to) { return D.query({ metrics: MET, grain: "month", range: { from: from, to: to } }); }

  function load() {
    if (S.loading) return Promise.resolve();
    S.loading = true; showMsg("");
    return window.dyAuth.requireLogin().then(function (sess) {
      if (!sess) return;
      return D.loadBounds().then(function () {
        var anchor = D.anchor(), minD = D.minDate() || "2024-01-01";
        S.anchor = anchor; S.minYm = minD.slice(0, 8) + "01";
        var aym = anchor.slice(0, 8) + "01", ad = +anchor.slice(8, 10);
        S.endYm = ym(fyOf(aym), 6);                                  // 목표는 이 회계연도 말(다음 6월)까지 입력
        S.partialYm = ad < lastDay(aym) ? aym : null;
        var jobs = [q(S.minYm, anchor), rpc("dy_inni_targets_get", { p_from: S.minYm, p_to: S.endYm })];
        if (S.partialYm) {                                            // 진행 중인 달: 같은 일수끼리 비교 기준
          var ly = addM(aym, -12), pm = addM(aym, -1);
          jobs.push(q(ly, ymd(ly, Math.min(ad, lastDay(ly)))), q(pm, ymd(pm, Math.min(ad, lastDay(pm)))));
        }
        return Promise.all(jobs).then(function (r) {
          S.rows = r[0].rows || {};
          S.targets = {}; (r[1] || []).forEach(function (t) { S.targets[String(t.ym).slice(0, 10)] = +t.v; });
          if (S.partialYm) { S.lyPart = (r[2].rows || {})[addM(aym, -12)] || null; S.pmPart = (r[3].rows || {})[addM(aym, -1)] || null; }
          S.ready = true;
        });
      });
    }).catch(function (e) { showMsg(friendly(e)); }).then(function () { S.loading = false; });
  }

  // 한 달 지표
  function month(k) {
    var r = S.rows[k];
    if (!r || (!r.net_sales && !r.total_pv)) return null;
    var part = k === S.partialYm;
    var ly = part ? S.lyPart : S.rows[addM(k, -12)], pm = part ? S.pmPart : S.rows[addM(k, -1)];
    var m = { ym: k, partial: part, sales: r.net_sales, pv: r.total_pv, orders: r.purchases };
    m.cvr = m.pv ? m.orders / m.pv * 100 : null; m.aov = m.orders ? m.sales / m.orders : null;
    m.ly = ly || null; m.pm = pm || null;
    m.lyAov = ly && ly.purchases ? ly.net_sales / ly.purchases : null;
    m.yoy = ly ? gv(growth(m.sales, ly.net_sales)) : null;
    m.pvYoy = ly ? gv(growth(m.pv, ly.total_pv)) : null;
    m.aovYoy = m.lyAov && m.aov ? gv(growth(m.aov, m.lyAov)) : null;
    m.mom = pm ? gv(growth(m.sales, pm.net_sales)) : null;
    m.tgt = S.targets[k] != null ? S.targets[k] : null;
    m.tgtPct = m.tgt ? m.sales / m.tgt * 100 : null;
    return m;
  }

  // ---------- 코멘트 ----------
  function streak(k) { // 같은 방향 YoY 가 몇 달 이어졌는지
    var cur = month(k); if (!cur || cur.yoy == null) return 0;
    var sign = cur.yoy >= 0, n = 0, t = k;
    while (true) { var m = month(t); if (!m || m.yoy == null || (m.yoy >= 0) !== sign) break; n++; t = addM(t, -1); }
    return n;
  }
  function autoLines(k) {
    var m = month(k), L = [];
    if (!m) return [{ t: "이 달은 아직 데이터가 없어요." }];
    var head = "Sales 약 " + krw(m.sales) + "엔 (" + [m.mom != null ? "MoM " + gstr(m.mom) : null, m.yoy != null ? "YoY " + gstr(m.yoy) : null].filter(Boolean).join(" ") + ")";
    L.push({ t: head + (m.partial ? " · " + S.anchor.slice(5).replace("-", "/") + "까지 (같은 일수 비교)" : "") });
    if (m.yoy != null) {
      var n = streak(k), neg = m.yoy < 0;
      L.push({ t: n >= 3 ? "YoY " + gstr(m.yoy) + ", " + n + "개월 연속 " + (neg ? "마이너스 — 마이너스 트렌드 지속중" : "플러스 — 성장 트렌드 지속중") : "YoY " + gstr(m.yoy) + (neg ? " 감소" : " 성장"), c: neg ? "is-neg" : "is-pos" });
    }
    L.push({ t: m.tgt ? "목표 " + kj(m.tgt) + "K 대비 " + pctv(m.tgtPct) + " 달성" + (m.partial ? " (진행 중)" : "") : "목표가 입력되지 않았어요 (월별 목표 입력)" });
    L.push({ t: "PV " + num(m.pv) + (m.pvYoy != null ? " (YoY " + gstr(m.pvYoy) + ")" : "") + " · ORDERS " + num(m.orders) + " · CVR " + pctv(m.cvr, 1) + " · AOV ¥" + num(m.aov) + (m.aovYoy != null ? " (YoY " + gstr(m.aovYoy) + ")" : "") });
    return L;
  }
  function showManual(c) {
    S.note = c && c.body ? c : null;
    el.manual.hidden = !S.note;
    el.manualBody.textContent = S.note ? S.note.body : "";
    el.manualMeta.textContent = S.note ? "직접 입력 · " + (S.note.by || "") + (S.note.at ? " · " + String(S.note.at).slice(0, 16).replace("T", " ") : "") : "";
    el.noteBtn.textContent = S.note ? "코멘트 수정" : "코멘트 입력";
  }
  function renderComment(k) {
    el.auto.innerHTML = "";
    autoLines(k).forEach(function (l) { var p = h("p"); var sp = h("span", l.c || "", l.t); p.appendChild(sp); el.auto.appendChild(p); });
    showManual(null);
    rpc("dy_inni_comment_get", { p_report: "sales", p_ym: k }).then(function (c) {
      if (k === S.ym) showManual(c);
    }).catch(function (e) { el.manualMeta.textContent = friendly(e); el.manual.hidden = false; });
  }

  // 코멘트 입력 모달 (브라우저 기본 창 대신)
  function openNoteModal() {
    var k = S.ym, prev = document.activeElement;
    var ov = h("div", "inni-modal"), card = h("div", "inni-modal-card");
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "코멘트 입력");
    card.appendChild(h("h3", null, "코멘트 입력 · " + k.slice(0, 4) + " " + MON[mOf(k) - 1]));
    card.appendChild(h("p", null, "자동 코멘트 아래에 같이 보여요. 줄바꿈은 그대로 보여요."));
    var ta = h("textarea"); ta.maxLength = 4000; ta.value = S.note ? S.note.body : ""; ta.placeholder = "예: 메가와리 기간 차이로 YoY -17%...";
    card.appendChild(ta);
    var err = h("div", "inni-modal-err"); card.appendChild(err);
    var acts = h("div", "inni-modal-acts");
    var del = h("button", "dash-btn", "지우기"); del.type = "button"; del.hidden = !S.note;
    var gap = h("span", "inni-gap");
    var cancel = h("button", "dash-btn", "취소"); cancel.type = "button";
    var save = h("button", "dash-btn is-primary", "저장"); save.type = "button";
    [del, gap, cancel, save].forEach(function (x) { acts.appendChild(x); });
    card.appendChild(acts); ov.appendChild(card); document.body.appendChild(ov);
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    function close() { document.removeEventListener("keydown", onKey, true); if (ov.parentNode) ov.parentNode.removeChild(ov); if (prev && prev.focus) prev.focus(); }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(ta.value); }
    }
    function commit(body) {
      save.disabled = del.disabled = true; err.textContent = "";
      rpc("dy_inni_comment_set", { p_report: "sales", p_ym: k, p_body: body }).then(function (c) {
        if (k === S.ym) showManual(c);
        toast(c ? "코멘트를 저장했어요" : "코멘트를 지웠어요"); close();
      }).catch(function (e) { err.textContent = friendly(e); save.disabled = del.disabled = false; });
    }
    document.addEventListener("keydown", onKey, true);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    cancel.addEventListener("click", close);
    save.addEventListener("click", function () { commit(ta.value); });
    del.addEventListener("click", function () { commit(""); });
  }

  // ---------- 표·그래프 ----------
  function kpiRow(label, cells, opt) {
    var tr = h("tr", opt && opt.sub ? "is-sub" : ""); tr.appendChild(h("td", null, label));
    cells.forEach(function (c) {
      var td = h("td", [c.cls || "", c.sel ? "is-sel" : "", c.sum ? "is-sum" : "", c.v === "" ? "is-empty" : ""].join(" ").trim(), c.v === "" ? "·" : c.v);
      tr.appendChild(td);
    });
    return tr;
  }
  function renderKpi() {
    var fy = S.fy, months = fyMonths(fy), ms = months.map(function (k) { return k <= S.ym ? month(k) : null; });   // 기준 월 이후는 보이지 않게
    el.kpiTitle.textContent = "월별 요약 · " + fyLabel(fy) + " (" + months[0].slice(0, 7) + " ~ " + S.ym.slice(0, 7) + " 기준)";
    el.kpi.innerHTML = "";
    var thead = h("thead"), hr = h("tr"); hr.appendChild(h("th", null, fyLabel(fy)));
    months.forEach(function (k, i) { var th = h("th", [ms[i] && ms[i].partial ? "is-part" : "", k === S.ym ? "is-sel" : ""].join(" ").trim(), MON[mOf(k) - 1]); if (ms[i] && ms[i].partial) th.title = S.anchor.slice(5) + "까지 · 같은 일수끼리 비교"; hr.appendChild(th); });
    hr.appendChild(h("th", "is-sum", "누계")); thead.appendChild(hr); el.kpi.appendChild(thead);

    var have = ms.filter(Boolean);
    var sum = function (f) { return have.reduce(function (a, m) { return a + (f(m) || 0); }, 0); };
    var lyAll = have.length && have.every(function (m) { return m.ly; });
    var sSales = sum(function (m) { return m.sales; }), sPv = sum(function (m) { return m.pv; }), sOrd = sum(function (m) { return m.orders; });
    var lySales = lyAll ? sum(function (m) { return m.ly.net_sales; }) : null, lyPv = lyAll ? sum(function (m) { return m.ly.total_pv; }) : null;
    var tgtMonths = months.filter(function (k) { return k <= S.ym && S.targets[k] != null; });
    var sTgt = tgtMonths.reduce(function (a, k) { return a + S.targets[k]; }, 0);
    var tgtBase = tgtMonths.filter(function (k) { return month(k); });
    var sTgtDone = tgtBase.reduce(function (a, k) { return a + S.targets[k]; }, 0), sSalesDone = tgtBase.reduce(function (a, k) { return a + month(k).sales; }, 0);
    var yS = lyAll ? gv(growth(sSales, lySales)) : null, yP = lyAll ? gv(growth(sPv, lyPv)) : null;
    var col = function (fn, sumCell) {
      var out = months.map(function (k, i) { var c = fn(ms[i], k) || { v: "" }; c.sel = k === S.ym; return c; });
      out.push(sumCell || { v: "", sum: true }); return out;
    };
    var tb = h("tbody");
    tb.appendChild(kpiRow("SALES", col(function (m) { return m ? { v: kj(m.sales) } : null; }, { v: have.length ? kj(sSales) : "", sum: true })));
    tb.appendChild(kpiRow("YoY", col(function (m) { return m && m.yoy != null ? { v: gstr(m.yoy), cls: cls(m.yoy) } : null; }, { v: yS != null ? gstr(yS) : "", cls: cls(yS), sum: true }), { sub: true }));
    tb.appendChild(kpiRow("TGT", col(function (m, k) { return k <= S.ym && S.targets[k] != null ? { v: kj(S.targets[k]) } : null; }, { v: tgtMonths.length ? kj(sTgt) : "", sum: true })));
    tb.appendChild(kpiRow("TGT %", col(function (m) { return m && m.tgtPct != null ? { v: pctv(m.tgtPct) } : null; }, { v: sTgtDone ? pctv(sSalesDone / sTgtDone * 100) : "", sum: true }), { sub: true }));
    tb.appendChild(kpiRow("PV", col(function (m) { return m ? { v: num(m.pv) } : null; }, { v: have.length ? num(sPv) : "", sum: true })));
    tb.appendChild(kpiRow("YoY", col(function (m) { return m && m.pvYoy != null ? { v: gstr(m.pvYoy), cls: cls(m.pvYoy) } : null; }, { v: yP != null ? gstr(yP) : "", cls: cls(yP), sum: true }), { sub: true }));
    tb.appendChild(kpiRow("ORDERS", col(function (m) { return m ? { v: num(m.orders) } : null; }, { v: have.length ? num(sOrd) : "", sum: true })));
    tb.appendChild(kpiRow("CVR", col(function (m) { return m && m.cvr != null ? { v: pctv(m.cvr, 2) } : null; }, { v: sPv ? pctv(sOrd / sPv * 100, 2) : "", sum: true })));
    tb.appendChild(kpiRow("AOV", col(function (m) { return m && m.aov != null ? { v: "¥ " + num(m.aov) } : null; }, { v: sOrd ? "¥ " + num(sSales / sOrd) : "", sum: true })));
    el.kpi.appendChild(tb);
  }

  function renderTrend() {
    var fy = S.fy, minFy = fyOf(S.minYm), fys = [fy - 2, fy - 1, fy].filter(function (f) { return f >= minFy; });
    var palette = [1, 2, 3, 4].map(function (i) { return getComputedStyle(document.documentElement).getPropertyValue("--dash-c" + i).trim() || ["#0072e4", "#eb0104", "#06ac78", "#e0a800"][i - 1]; });
    var pageStyle = getComputedStyle(pane); var cs = function (n, d) { return pageStyle.getPropertyValue(n).trim() || d; };
    var tick = cs("--dash-tick", "#7a4a1c"), grid = cs("--dash-grid", "rgba(0,0,0,.08)");
    var order = fyMonths(fy).map(function (k) { return mOf(k); });          // 7,8,…,6
    var datasets = [];
    el.trend.innerHTML = "";
    var thead = h("thead"), hr = h("tr"); hr.appendChild(h("th", null, ""));
    order.forEach(function (mm) { hr.appendChild(h("th", null, MON[mm - 1])); }); hr.appendChild(h("th", "is-sum", "합계")); thead.appendChild(hr); el.trend.appendChild(thead);
    var tb = h("tbody");
    fys.forEach(function (f, i) {
      var vals = fyMonths(f).map(function (k) { if (f === fy && k > S.ym) return null; var m = month(k); return m ? m.sales / 1000 : null; });
      var tr = h("tr"); tr.appendChild(h("td", null, fyLabel(f)));
      vals.forEach(function (v) { tr.appendChild(h("td", v == null ? "is-empty" : "", v == null ? "·" : Math.round(v).toLocaleString("ko-KR"))); });
      var total = vals.reduce(function (a, v) { return a + (v || 0); }, 0);
      tr.appendChild(h("td", "is-sum", vals.some(function (v) { return v != null; }) ? Math.round(total).toLocaleString("ko-KR") : "·")); tb.appendChild(tr);
      datasets.push({ label: fyLabel(f), data: vals.map(function (v) { return v == null ? null : Math.round(v); }), borderColor: palette[(fys.length - 1 - i) % 4], backgroundColor: palette[(fys.length - 1 - i) % 4], tension: .25, pointRadius: 3, borderWidth: f === fy ? 2.6 : 1.6, spanGaps: false });
    });
    var tg = fyMonths(fy).map(function (k) { return k <= S.ym && S.targets[k] != null ? Math.round(S.targets[k] / 1000) : null; });
    if (tg.some(function (v) { return v != null; })) {
      var tr2 = h("tr", "is-sub"); tr2.appendChild(h("td", null, "TGT " + fyLabel(fy)));
      tg.forEach(function (v) { tr2.appendChild(h("td", v == null ? "is-empty" : "", v == null ? "·" : v.toLocaleString("ko-KR"))); });
      tr2.appendChild(h("td", "is-sum", tg.reduce(function (a, v) { return a + (v || 0); }, 0).toLocaleString("ko-KR"))); tb.appendChild(tr2);
      datasets.push({ label: "TGT " + fyLabel(fy), data: tg, borderColor: cs("--dash-cmp", "#a19a82"), backgroundColor: cs("--dash-cmp", "#a19a82"), borderDash: [6, 4], tension: 0, pointRadius: 3, borderWidth: 1.6, spanGaps: false });
    }
    el.trend.appendChild(tb);
    if (chart) { chart.destroy(); chart = null; }
    if (!window.Chart) return;
    chart = new window.Chart(el.chart, {
      type: "line", data: { labels: order.map(function (mm) { return MON[mm - 1]; }), datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, interaction: { mode: "index", intersect: false },
        plugins: { legend: { labels: { color: tick, boxWidth: 10, boxHeight: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: function (c) { return " " + c.dataset.label + ": " + (c.parsed.y == null ? "-" : Math.round(c.parsed.y).toLocaleString("ko-KR")); } } } },
        scales: { x: { ticks: { color: tick }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: tick, callback: function (v) { return v.toLocaleString("ko-KR"); } }, grid: { color: grid } } }
      }
    });
  }

  function render() {
    var k = S.ym, parts = k.slice(0, 4) + " " + MON[mOf(k) - 1];
    el.title.textContent = "Qoo10 Monthly Report · " + parts + (k === S.partialYm ? " (" + S.anchor.slice(5).replace("-", "/") + "까지)" : "");
    el.unit.textContent = "(K JPY / Unit) · 순매출(GMV) 기준 · 회계연도 " + fyLabel(S.fy) + " (7월~6월) · 데이터 " + S.minYm.slice(0, 7) + " ~ " + S.anchor;
    renderComment(k); renderKpi(); renderTrend();
  }

  // ---------- 선택 상자 ----------
  function fillMonths() {
    var months = fyMonths(S.fy).filter(function (k) { return month(k); });
    el.month.innerHTML = "";
    months.forEach(function (k) { var o = h("option", null, k.slice(0, 4) + " " + MON[mOf(k) - 1] + (k === S.partialYm ? " (진행 중)" : "")); o.value = k; el.month.appendChild(o); });
    var done = months.filter(function (k) { return k !== S.partialYm; });
    var pick = S.ym && months.indexOf(S.ym) >= 0 ? S.ym : (done.length ? done[done.length - 1] : months[months.length - 1]);
    S.ym = pick || fyMonths(S.fy)[0]; el.month.value = S.ym;
  }
  function fillFy() {
    var minFy = fyOf(S.minYm), maxFy = fyOf(S.anchor.slice(0, 8) + "01");
    el.fy.innerHTML = "";
    for (var f = maxFy; f >= minFy; f--) { var o = h("option", null, fyLabel(f) + " (" + (f - 1) + "-07 ~ " + f + "-06)"); o.value = String(f); el.fy.appendChild(o); }
    if (S.fy == null) S.fy = maxFy;
    el.fy.value = String(S.fy);
  }

  // ---------- 월별 목표 입력 ----------
  var tgtLoaded = {};
  function buildTargets() {
    var minFy = fyOf(S.minYm), maxFy = fyOf(S.endYm);
    el.tgtTable.innerHTML = ""; tgtLoaded = {};
    var thead = h("thead"), hr = h("tr"); hr.appendChild(h("th", null, ""));
    [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6].forEach(function (mm) { hr.appendChild(h("th", null, MON[mm - 1])); });
    hr.appendChild(h("th", "is-sum", "합계")); thead.appendChild(hr); el.tgtTable.appendChild(thead);
    var tb = h("tbody");
    for (var f = minFy; f <= maxFy; f++) {
      var tr = h("tr"); tr.appendChild(h("td", null, fyLabel(f)));
      fyMonths(f).forEach(function (k) {
        var td = h("td"), inp = h("input"); inp.type = "number"; inp.min = "0"; inp.step = "100"; inp.inputMode = "numeric"; inp.dataset.ym = k;
        inp.setAttribute("aria-label", k.slice(0, 7) + " 목표(천 엔)");
        var inRange = k >= S.minYm && k <= S.endYm;
        if (!inRange) inp.disabled = true;
        var v = S.targets[k] != null ? Math.round(S.targets[k] / 1000) : "";
        inp.value = v; tgtLoaded[k] = v;
        inp.addEventListener("input", function () { inp.classList.toggle("is-changed", String(inp.value) !== String(tgtLoaded[k])); sumRow(tr); });
        td.appendChild(inp); tr.appendChild(td);
      });
      var st = h("td", "is-sum"); st.dataset.sum = "1"; tr.appendChild(st); sumRow(tr); tb.appendChild(tr);
    }
    el.tgtTable.appendChild(tb); el.tgtNote.textContent = "";
  }
  function sumRow(tr) {
    var t = 0, any = false;
    Array.prototype.forEach.call(tr.querySelectorAll("input"), function (i) { if (i.value !== "") { t += +i.value; any = true; } });
    tr.querySelector("td[data-sum]").textContent = any ? t.toLocaleString("ko-KR") : "·";
  }
  function saveTargets() {
    var rows = [];
    Array.prototype.forEach.call(el.tgtTable.querySelectorAll("input"), function (i) {
      if (i.disabled || String(i.value) === String(tgtLoaded[i.dataset.ym])) return;
      if (i.value !== "" && !(+i.value >= 0)) return;
      rows.push({ ym: i.dataset.ym, v: i.value === "" ? null : Math.round(+i.value * 1000) });
    });
    if (!rows.length) { el.tgtNote.textContent = "바뀐 칸이 없어요."; return; }
    el.tgtSave.disabled = true; el.tgtNote.textContent = "저장하는 중…";
    rpc("dy_inni_targets_set", { p_rows: rows }).then(function () {
      rows.forEach(function (r) { if (r.v == null) delete S.targets[r.ym]; else S.targets[r.ym] = r.v; });
      toast("목표 " + rows.length + "개월을 저장했어요"); buildTargets(); render();
    }).catch(function (e) { el.tgtNote.textContent = friendly(e); }).then(function () { el.tgtSave.disabled = false; });
  }

  // ---------- 이벤트 ----------
  el.fy.addEventListener("change", function () { S.fy = +el.fy.value; S.ym = null; fillMonths(); render(); });
  el.month.addEventListener("change", function () { S.ym = el.month.value; render(); });
  el.reload.addEventListener("click", function () { D.clearCache(); S.ready = false; start(true); });
  el.tgtBtn.addEventListener("click", function () {
    var open = el.tgt.hidden; el.tgt.hidden = !open; el.tgtBtn.setAttribute("aria-expanded", String(open));
    el.tgtBtn.textContent = open ? "월별 목표 닫기" : "월별 목표 입력"; if (open) buildTargets();
  });
  el.tgtCancel.addEventListener("click", function () { el.tgt.hidden = true; el.tgtBtn.setAttribute("aria-expanded", "false"); el.tgtBtn.textContent = "월별 목표 입력"; });
  el.tgtSave.addEventListener("click", saveTargets);
  el.noteBtn.addEventListener("click", openNoteModal);

  // ---------- 시작 ----------
  var started = false;
  function start(force) {
    if (started && !force) { if (chart) chart.resize(); return Promise.resolve(); }
    started = true;
    return load().then(function () {
      if (!S.ready) { started = false; return; }
      fillFy(); fillMonths(); render();
    });
  }
  document.addEventListener("inni:show", function (e) { if (e.detail.view === "inni" && e.detail.sub === "sales") start(); });
  var h0 = location.hash || "";
  if (h0 === "#inni" || /^#inni\/sales/.test(h0)) start();
})();

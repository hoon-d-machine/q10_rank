/* inni 탭 · MEGAPO 행사 리포트 (AP Talk 시트의 MEGAPO 탭을 DB 로 대체) — 메가포(SUPERPOINT) · 메가와리(MEGAWARI) 행사 둘 다
 *   - 행사 달력(inni_mega_event, 광고센터 /api/calendar/mega)에서 종류와 행사를 고르면 그 행사 기간(시작일~종료일)의 매출로 리포트를 만든다
 *   - 일별(Day 1~N): SALES · PV · ORDERS · CVR · AOV 를 직전 행사(QoQ)·작년 같은 행사(YoY)와 같은 Day 끼리 비교, 합계(SUM)는 같은 일수끼리
 *   - 유입 경로별 PV(스토어 전체) · 상품별 실적(상위 20개)
 *   - 코멘트: 자동 생성 + 직접 입력, 강조·그래프는 '설정', 엑셀 다운로드. 저장 단위: 코멘트는 행사 시작 월(리포트 megapo / megawari), 설정은 행사가 속한 회계연도
 * 정의: SALES = 순매출(final_buy_bpv, 취소 제외), PV = 스토어 총 PV, ORDERS = 총상품수량(순)(final_total_buy_cnt), CVR = ORDERS ÷ PV, AOV = SALES ÷ ORDERS
 * 진행 중인 행사는 데이터가 있는 마지막 날까지만 보여 주고 비교도 같은 일수로 한다. 메가와리는 행사 첫날이 오후 5시 시작이라 첫날은 일부 시간만 행사다.
 */
(function () {
  "use strict";
  var D = window.dyDash, K = window.dyInniKit;
  var pane = document.querySelector('.inni-pane[data-pane="megapo"]');
  if (!D || !K || !pane) return;

  var $ = function (s) { return pane.querySelector(s); };
  var el = {
    type: $(".js-m-type"), ev: $(".js-m-event"), reload: $(".js-m-reload"), setBtn: $(".js-m-set"), xlsxBtn: $(".js-m-xlsx"),
    msg: $(".js-m-msg"), notice: $(".js-m-notice"), eyebrow: $(".js-m-eyebrow"), title: $(".js-m-title"), auto: $(".js-m-auto"),
    chart: $(".js-m-chart"), pvchart: $(".js-m-pvchart"), daily: $(".js-m-daily"), chan: $(".js-m-chan"), chanTitle: $(".js-m-chan-title"), items: $(".js-m-items"), itemsTitle: $(".js-m-items-title"), note: $(".js-m-note")
  };
  var TOP_N = 15, FLAG_RATE = 0.5;
  var TYPES = [["SUPERPOINT", "메가포"], ["MEGAWARI", "메가와리"]];
  var CH_SPEC = [["큐텐 구좌", "홈(메인페이지)_메가할인", "mn_megawari_pv"], ["큐텐 구좌", "홈(메인페이지)_메가포", "mn_megapo_pv"], ["오가닉", "홈(메인페이지)_나의관심상품", "mn_myinterest_pv"], ["큐텐 구좌", "홈(메인페이지)_주목 브랜드", "mn_spotlight_brand_pv"], ["오가닉", "홈(메인페이지)_랭킹", "mn_bestseller_pv"], ["오가닉", "홈(메인페이지)_공식 코스메 랭킹", "mn_beauty_ranking_pv"], ["큐텐 구좌", "홈(메인페이지)_코스메셀렉트", "mn_beauty_pv"], ["내부 광고", "홈(메인페이지)_타임세일", "mn_timesale_pv"], ["내부 광고", "홈(메인페이지)_데일리딜", "mn_dailydeal_pv"], ["구분 불가", "홈(메인페이지)_공동구매", "mn_groupbuy_pv"], ["내부 광고", "홈(메인페이지)_호리다시모노", "mn_chancedeal_pv"], ["구분 불가", "홈(메인페이지)_기타", "mn_etc_pv"], ["내부 광고", "검색결과_키워드플러스", "sch_keywordplus_pv"], ["내부 광고", "검색결과_파워랭크업", "sch_powerrank_pv"], ["내부 광고", "검색결과_스마트세일즈", "sch_cps_pv"], ["내부 광고", "검색결과_타임세일", "sch_timesale_pv"], ["오가닉", "검색결과_일반", "sch_etc_pv"], ["오가닉", "베스트셀러", "bestseller_pv"], ["큐텐 구좌", "뷰티", "beautyhub_pv"], ["큐텐 구좌", "이너뷰티", "supplementhub_pv"], ["내부 광고", "프로모션페이지_오늘의메가할인", "dl_todaysmega_pv"], ["내부 광고", "프로모션페이지_오늘의메가포", "dl_todaysmega_po_pv"], ["큐텐 구좌", "프로모션페이지_타임세일", "dl_timesale_pv"], ["큐텐 구좌", "프로모션페이지_데일리딜", "dl_dailydeal_pv"], ["큐텐 구좌", "프로모션페이지_공동구매", "dl_groupbuy_pv"], ["내부 광고", "프로모션페이지_호리다시모노", "dl_onedaychance_pv"], ["오가닉", "위시리스트", "wish_pv"], ["오가닉", "최근본상품", "todaysview_pv"], ["오가닉", "장바구니", "cart_pv"], ["외부 광고", "셀러샵", "sellershop_pv"], ["큐텐 구좌", "기획전", "special_pv"], ["내부 광고", "카테고리페이지", "category_pv"], ["구분 불가", "상품상세페이지", "vip_pv"], ["오가닉", "상품카탈로그", "catalog_pv"], ["오가닉", "마이페이지", "my_pv"], ["큐텐 구좌", "Live Shopping", "live_pv"], ["외부 광고", "외부유입_구글", "ext_google_pv"], ["외부 광고", "외부유입_페이스북", "ext_facebook_pv"], ["외부 광고", "외부유입_X(트위터)", "ext_twitter_pv"], ["외부 광고", "외부유입_Instagram", "ext_instagram_pv"], ["외부 광고", "외부유입_Tiktok", "ext_tiktok_pv"], ["외부 광고", "외부유입_야후", "ext_yahoo_pv"], ["외부 광고", "외부유입_카카쿠", "ext_kakaku_pv"], ["외부 광고", "외부유입_라인", "ext_line_pv"], ["외부 광고", "외부유입_이메일", "ext_email_pv"], ["외부 광고", "외부유입_기타", "ext_others_pv"], ["외부 광고", "URL직접입력", "directurl_pv"], ["구분 불가", "기타", "etc_pv"]];   // [구분, 경로, 열] — 시트 MEGAPO 의 유입 경로 표와 같은 순서·이름 (틱톡은 스토어 전체 표에 열이 없어 항상 ‘-’)
  var CHKEYS = CH_SPEC.map(function (x) { return "pv_" + x[2].replace(/_pv$/, ""); }).filter(function (k) { return D.METRICS[k]; });
  var S = { ready: false, loading: false, all: [], events: [], type: "SUPERPOINT", ev: null, master: null, anchor: null, data: null, notes: {}, cfg: null, busy: false };
  var chart = null, pvChart = null;

  // ---------- 날짜·서식 ----------
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function parse(s) { var a = s.split("-"); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function addD(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
  function diffD(a, b) { return Math.round((parse(a) - parse(b)) / 86400000); }
  function md(s) { return +s.slice(5, 7) + "/" + +s.slice(8, 10); }
  function fyOf(s) { return +s.slice(5, 7) >= 7 ? +s.slice(0, 4) + 1 : +s.slice(0, 4); }
  function fyLabel(fy) { return "BY" + String(fy).slice(2); }
  function kv(yen) { return yen == null ? "-" : Math.round(yen / 1000).toLocaleString("ko-KR"); }
  function num(v) { return v == null ? "-" : Math.round(v).toLocaleString("ko-KR"); }
  function growth(a, b) { return b ? (a / b - 1) * 100 : null; }
  function gs(v) { return v == null ? "-" : v >= 9999.5 ? ">+9,999%" : (v >= 0 ? "+" : "") + v.toFixed(0) + "%"; }
  function cls(v) { return v == null ? "" : v >= 0 ? "is-up" : "is-down"; }
  function pv1(v) { return v == null || !isFinite(v) ? "-" : v.toFixed(1) + "%"; }
  function mil(yen) { return (yen / 1e6).toFixed(1) + "백만엔"; }
  function man(v) { return v >= 1e4 ? (v / 1e4).toFixed(1) + "만" : Math.round(v).toLocaleString("ko-KR"); }
  function h(tag, c, text) { var e = document.createElement(tag); if (c) e.className = c; if (text != null) e.textContent = text; return e; }
  function toast(m) { if (window.dyToast) window.dyToast(m); }
  function showMsg(m) { el.msg.textContent = m || ""; el.msg.hidden = !m; }
  function rpc(name, args) { return window.dyAuth.client.rpc(name, args).then(function (res) { if (res.error) throw res.error; return res.data; }); }
  function friendly(e) {
    var m = (e && e.message) || String(e);
    if (/dy_inni_|dy_data_page|inni_mega|Could not find the function|schema cache/i.test(m)) return "필요한 DB 함수·표가 아직 없어요. Supabase SQL Editor 에서 dy-ai/supabase/inni.sql · data_view.sql 과 inni_RPA/supabase_schema_ads.sql 을 실행해 주세요.";
    return D.friendly ? D.friendly(e) : "불러오지 못했어요: " + m;
  }

  // ---------- 행사 목록 ----------
  function isWari() { return S.type === "MEGAWARI"; }
  function report() { return isWari() ? "megawari" : "megapo"; }
  function evLabel(e) {
    if (e.type === "MEGAWARI") { var mid = addD(e.start_dt, Math.floor(diffD(e.end_dt, e.start_dt) / 2)); return mid.slice(0, 4) + " " + mid.slice(5, 7) + " MEGAWARI"; }   // 8/28~9/9 → 9월 메가와리
    return e.start_dt.slice(0, 4) + " " + e.start_dt.slice(5, 7) + " MEGAPO";
  }
  function evRange(e) { return md(e.start_dt) + "~" + md(e.end_dt); }
  function typeName() { return isWari() ? "MEGAWARI" : "MEGAPO"; }

  function load() {
    if (S.loading) return Promise.resolve();
    S.loading = true; showMsg("");
    return window.dyAuth.requireLogin().then(function (sess) {
      if (!sess) return;
      return Promise.all([D.loadBounds(), rpc("dy_data_page", { p_source: "mega_event", p_from: null, p_to: null, p_q: null, p_limit: 1000, p_offset: 0 }),
        rpc("dy_data_page", { p_source: "products", p_from: null, p_to: null, p_q: null, p_limit: 1000, p_offset: 0 })]).then(function (r) {
        S.anchor = D.anchor(); var minD = D.minDate() || "2024-01-01";
        S.all = (r[1].rows || []).map(function (x) { return { no: x.promotion_no, nm: x.promotion_nm, type: x.promotion_type, start_dt: String(x.start_dt).slice(0, 10), end_dt: String(x.end_dt).slice(0, 10) }; })
          .filter(function (e) { return e.start_dt <= S.anchor && e.end_dt >= minD; })
          .sort(function (a, b) { return a.start_dt < b.start_dt ? 1 : -1; });   // 최신 행사가 먼저
        S.master = {}; (r[2].rows || []).forEach(function (x) { S.master[String(x.gd_no)] = x; });
        if (!S.all.length) throw new Error("행사 달력이 아직 없어요. 수집기에서 Q10 수집을 한 번 하면 채워져요.");
        S.ready = true;
      });
    }).catch(function (e) { showMsg(friendly(e)); }).then(function () { S.loading = false; });
  }
  function pickType() { S.events = S.all.filter(function (e) { return e.type === S.type; }); S.ev = null; }

  // 직전 행사(같은 종류에서 바로 다음), 작년 같은 행사(시작일이 1년 전과 가장 가까운 같은 종류 행사, 40일 이내)
  function prevOf(e) { var i = S.events.indexOf(e); return i >= 0 && i + 1 < S.events.length ? S.events[i + 1] : null; }
  function lyOf(e) {
    var tgt = addD(e.start_dt, -365), best = null, bd = 41;
    S.events.forEach(function (x) { if (x === e) return; var d = Math.abs(diffD(x.start_dt, tgt)); if (d < bd) { bd = d; best = x; } });
    return best;
  }

  // ---------- 설정 ----------
  function normCfg(c) {
    c = c || {};
    return { daily: K.normSpec(c.daily), chan: K.normSpec(c.chan), items: K.normSpec(c.items), type: c.type === "bar" ? "bar" : "line", compare: ["both", "prev", "ly", "none"].indexOf(c.compare) >= 0 ? c.compare : "both" };
  }
  function cfgFy() { return fyOf(S.ev.start_dt); }
  function loadCfg() {
    var rp = report(), fy = cfgFy();
    return rpc("dy_inni_settings_get", { p_report: rp, p_fy: fy }).then(function (c) { S.cfg = normCfg(c); }).catch(function (e) { S.cfg = normCfg(null); showMsg(friendly(e)); });
  }

  // ---------- 집계 ----------
  var DM = ["net_sales", "total_pv", "net_qty", "gmv", "cancel_amt"];
  function eventDays(e, limit) { var out = [], d = e.start_dt; while (d <= e.end_dt && (limit == null || out.length < limit)) { out.push(d); d = addD(d, 1); } return out; }
  function seriesOf(e, n) { // e 의 앞 n 일(데이터 있는 날까지)의 일별 값 [{date, sales, pv, orders, gmv, cancel}|null]
    if (!e) return Promise.resolve(null);
    var days = eventDays(e, n).filter(function (d) { return d <= S.anchor; });
    if (!days.length) return Promise.resolve([]);
    return D.query({ metrics: DM, grain: "day", range: { from: days[0], to: days[days.length - 1] } }).then(function (r) {
      return days.map(function (d) { var x = r.rows[d]; return x ? { date: d, sales: x.net_sales || 0, pv: x.total_pv || 0, orders: x.net_qty || 0, gmv: x.gmv || 0, cancel: x.cancel_amt || 0 } : null; });
    });
  }
  function itemsOf(from, to) { return D.query({ metrics: ["g_net_amt", "g_pv", "g_net_qty"], grain: "all", range: { from: from, to: to }, dim: "gd_no", top: 200, topMetric: "g_net_amt" }); }
  function chansOf(from, to) { return D.query({ metrics: CHKEYS, grain: "all", range: { from: from, to: to } }).then(function (r) { return r.rows[Object.keys(r.rows)[0]] || {}; }); }
  function sum(ser, f) { var t = 0; (ser || []).forEach(function (x) { if (x) t += x[f]; }); return t; }
  function cnt(ser) { return (ser || []).filter(Boolean).length; }

  function build() {
    var e = S.ev, p = prevOf(e), l = lyOf(e);
    var days = eventDays(e).filter(function (d) { return d <= S.anchor; }), n = days.length, part = e.end_dt > S.anchor;
    S.busy = true;
    var pn = p ? Math.min(n, diffD(p.end_dt, p.start_dt) + 1) : 0, pRange = p ? [p.start_dt, addD(p.start_dt, pn - 1)] : null;
    return Promise.all([seriesOf(e), seriesOf(p, n), seriesOf(l, n), itemsOf(days[0], days[n - 1]), pRange ? itemsOf(pRange[0], pRange[1]) : Promise.resolve(null),
      chansOf(days[0], days[n - 1]), pRange ? chansOf(pRange[0], pRange[1]) : Promise.resolve(null),
      l ? chansOf(l.start_dt, addD(l.start_dt, Math.min(n, diffD(l.end_dt, l.start_dt) + 1) - 1)) : Promise.resolve(null)]).then(function (r) {
      var cur = r[0], prev = r[1], ly = r[2], it = r[3], itp = r[4], ch = r[5], chp = r[6], chl = r[7];
      var gm = function (x, id, k) { var v = x && x.rows[id]; return v && v[k] ? v[k] : 0; };
      var total = 0; Object.keys(it.rows).forEach(function (id) { total += gm(it, id, "g_net_amt"); });
      var items = Object.keys(it.rows).map(function (id) {
        var m = S.master[id] || {};
        var o = { gd: id, name: m.product_name || it.labels[id] || id, sales: gm(it, id, "g_net_amt"), pv: gm(it, id, "g_pv"), qty: gm(it, id, "g_net_qty") };
        if (itp) { o.pSales = gm(itp, id, "g_net_amt"); o.pPv = gm(itp, id, "g_pv"); }
        return o;
      }).filter(function (o) { return o.sales > 0; }).sort(function (a, b) { return b.sales - a.sales; });
      items.forEach(function (o, i) {
        o.no = i + 1; o.share = total ? o.sales / total * 100 : null;
        o.qoq = itp ? (o.pSales ? growth(o.sales, o.pSales) : "NEW") : null; o.pvQoq = itp ? (o.pPv ? growth(o.pv, o.pPv) : "NEW") : null;
        o.cvr = o.pv ? o.qty / o.pv * 100 : null;
      });
      var storePv = sum(cur, "pv");
      // 시트와 같은 순서·구분·경로. QoQ·YoY 는 %가 아니라 PV 증감 수(이번 − 직전/작년)
      var chans = CH_SPEC.map(function (x) {
        var k = "pv_" + x[2].replace(/_pv$/, ""), has = !!D.METRICS[k], v = has ? ch[k] || 0 : 0;
        return { key: x[2], group: x[0], label: x[1], pv: v, has: has, share: storePv ? v / storePv * 100 : null,
          pPv: chp && has ? chp[k] || 0 : null, lPv: chl && has ? chl[k] || 0 : null,
          qoq: chp && has ? v - (chp[k] || 0) : null, yoy: chl && has ? v - (chl[k] || 0) : null };
      });
      var chTot = { pv: storePv, qoq: p ? storePv - sum(prev, "pv") : null, yoy: l ? storePv - sum(ly, "pv") : null };
      S.data = { e: e, p: p, l: l, days: days, n: n, part: part, cur: cur, prev: prev, ly: ly, items: items, itemsTotal: total, chans: chans, chTot: chTot, storePv: storePv };
    }).then(function () { S.busy = false; }, function (err) { S.busy = false; throw err; });
  }

  // ---------- 코멘트 ----------
  function dayStat(x) { return x ? { sales: x.sales, pv: x.pv, orders: x.orders, cvr: x.pv ? x.orders / x.pv * 100 : null, aov: x.orders ? x.sales / x.orders : null } : null; }
  function sumStat(ser) { var s = { sales: sum(ser, "sales"), pv: sum(ser, "pv"), orders: sum(ser, "orders") }; s.cvr = s.pv ? s.orders / s.pv * 100 : null; s.aov = s.orders ? s.sales / s.orders : null; s.n = cnt(ser); return s; }

  // 시트의 코멘트 입력란과 같은 네 칸: 요약 · 일별 · 제품별 실적 · PV (칸마다 자동 코멘트 + 직접 입력)
  var SECS = [["sum", "요약", ""], ["daily", "일별", "_daily"], ["items", "제품별 실적", "_items"], ["pv", "PV", "_pv"]];
  var CM = {};   // 칸 이름 → { auto, box, body, meta, btn }
  function secReport(key) { return report() + SECS.filter(function (x) { return x[0] === key; })[0][2]; }
  function secLabel(key) { return SECS.filter(function (x) { return x[0] === key; })[0][1]; }

  function pvGroups() { // 구분별 PV: [{ g, cur, prev, ly }] (유입 경로 표와 같은 구분 이름·순서)
    var order = [], map = {};
    S.data.chans.forEach(function (c) {
      if (!map[c.group]) { map[c.group] = { g: c.group, cur: 0, prev: S.data.p ? 0 : null, ly: S.data.l ? 0 : null }; order.push(c.group); }
      if (!c.has) return;
      var m = map[c.group]; m.cur += c.pv; if (m.prev != null) m.prev += c.pPv || 0; if (m.ly != null) m.ly += c.lPv || 0;
    });
    return order.map(function (g) { return map[g]; });
  }

  function linesSum() {
    var d = S.data, L = [], c = sumStat(d.cur), p = d.prev ? sumStat(d.prev) : null, y = d.ly ? sumStat(d.ly) : null;
    var qoq = function (a, b) { return p && b ? gs(growth(a, b)) : null; }, yoy = function (a, b) { return y && b ? gs(growth(a, b)) : null; };
    var pair = function (a, pb, yb) { var t = []; if (qoq(a, pb)) t.push("QoQ " + qoq(a, pb)); if (yoy(a, yb)) t.push("YoY " + yoy(a, yb)); return t.length ? " (" + t.join(" · ") + ")" : ""; };
    L.push({ t: "행사기간: " + evRange(d.e) + " (" + d.n + "일간 " + (d.part ? "진행 중 · " + md(d.days[d.n - 1]) + "까지" : "진행") + ")" + (d.p ? " · 직전 행사 " + evLabel(d.p) + (d.l ? " · 작년 " + evLabel(d.l) : "") : "") });
    L.push({ t: "매출액: " + mil(c.sales) + pair(c.sales, p && p.sales, y && y.sales), c: p && p.sales ? (c.sales >= p.sales ? "" : "is-neg") : "" });
    L.push({ t: "PV: " + man(c.pv) + pair(c.pv, p && p.pv, y && y.pv) });
    return L;
  }
  function linesDaily() {
    var d = S.data, L = [], c = sumStat(d.cur), p = d.prev ? sumStat(d.prev) : null, y = d.ly ? sumStat(d.ly) : null;
    var dayList = function (ser) { var neg = [], pos = 0; d.cur.forEach(function (x, i) { var q = ser && ser[i]; if (!x || !q || !q.sales) return; if (x.sales < q.sales) neg.push(i + 1); else pos++; }); return { neg: neg, pos: pos }; };
    var q = d.prev ? dayList(d.prev) : null, yy = d.ly ? dayList(d.ly) : null, parts = [];
    if (q) parts.push(q.neg.length ? "DAY " + q.neg.join(",") + "일차 QoQ 마이너스" : q.pos ? "모든 날 QoQ 플러스" : "");
    if (yy) parts.push(yy.neg.length ? (yy.neg.length === d.n ? "모든 날 YoY 마이너스" : "DAY " + yy.neg.join(",") + "일차 YoY 마이너스") : yy.pos ? "모든 날 YoY 플러스" : "");
    parts = parts.filter(Boolean);
    if (parts.length) L.push({ t: parts.join(", "), c: (q && q.neg.length) || (yy && yy.neg.length) ? "is-neg" : "" });
    var bits = ["ORDERS " + num(c.orders) + "건" + (p && p.orders ? " (QoQ " + gs(growth(c.orders, p.orders)) + (y && y.orders ? " · YoY " + gs(growth(c.orders, y.orders)) : "") + ")" : ""),
      "CVR " + pv1(c.cvr) + (p && p.cvr != null ? " (QoQ " + (c.cvr - p.cvr >= 0 ? "+" : "") + (c.cvr - p.cvr).toFixed(1) + "%p)" : "")];
    L.push({ t: bits.join(" · ") });
    var dv = function (a, b) { return b ? (a - b >= 0 ? "+" : "") + Math.round(a - b) + "엔" : null; }, ab = [];
    if (p && p.aov && dv(c.aov, p.aov)) ab.push("QoQ " + dv(c.aov, p.aov));
    if (y && y.aov && dv(c.aov, y.aov)) ab.push("YoY " + dv(c.aov, y.aov));
    L.push({ t: "AOV " + num(c.aov) + "엔" + (ab.length ? " (" + ab.join(", ") + ")" : "") });
    flagged().forEach(function (f) { L.push({ t: "※ " + f, c: "is-neg" }); });
    return L;
  }
  function linesItems() {
    var d = S.data, L = [], top = d.items.slice(0, TOP_N);
    if (top.length >= 3) {
      var t3 = top.slice(0, 3), sh = t3.reduce(function (t, o) { return t + o.sales; }, 0) / d.itemsTotal * 100;
      L.push({ t: "상위 3개 상품이 " + sh.toFixed(0) + "%: " + t3.map(function (o) { return o.name + " " + mil(o.sales); }).join(" · ") });
    }
    var withQ = top.filter(function (o) { return typeof o.qoq === "number"; }).sort(function (a, b) { return b.qoq - a.qoq; });
    if (withQ.length >= 2) {
      var up = withQ[0], dn = withQ[withQ.length - 1];
      L.push({ t: "QoQ 가장 크게 성장 " + up.name + " " + gs(up.qoq) + " · 가장 크게 하락 " + dn.name + " " + gs(dn.qoq), c: dn.qoq < 0 ? "is-neg" : "" });
    }
    var nw = top.filter(function (o) { return o.qoq === "NEW"; });
    if (nw.length) L.push({ t: "직전 행사에 없던 신규 상품 " + nw.length + "개: " + nw.map(function (o) { return o.no + "위 " + o.name; }).join(", ") });
    return L;
  }
  function linesPv() {
    var d = S.data, L = [], c = sumStat(d.cur), p = d.prev ? sumStat(d.prev) : null, y = d.ly ? sumStat(d.ly) : null, t = [];
    if (p && p.pv) t.push("QoQ " + gs(growth(c.pv, p.pv)));
    if (y && y.pv) t.push("YoY " + gs(growth(c.pv, y.pv)));
    L.push({ t: "전체 PV " + man(c.pv) + (t.length ? ", " + t.join(" ") : "") });
    if (d.prev) {
      var gr = pvGroups().filter(function (x) { return x.g !== "구분 불가" && x.prev; }).map(function (x) { x.q = growth(x.cur, x.prev); return x; });
      var up = gr.filter(function (x) { return x.q >= 0; }).sort(function (a, b) { return b.q - a.q; }), dn = gr.filter(function (x) { return x.q < 0; }).sort(function (a, b) { return a.q - b.q; });
      if (up.length) L.push({ t: up.map(function (x) { return x.g; }).join(", ") + (up.length > 1 ? " 각" : "") + " QoQ " + up.map(function (x) { return gs(x.q); }).join(", ") + " 상승" });
      if (dn.length) L.push({ t: dn.map(function (x) { return x.g; }).join(", ") + (dn.length > 1 ? " 각" : "") + " QoQ " + dn.map(function (x) { return gs(x.q); }).join(", ") + " 하락", c: "is-neg" });
    }
    var topc = d.chans.filter(function (x) { return x.group !== "구분 불가"; }).sort(function (a, b) { return b.pv - a.pv; }).slice(0, 3);   // 상품상세페이지·기타(구분 불가)는 빼고 상위 경로를 말한다
    if (topc.length && topc[0].pv > 0) L.push({ t: "유입 경로 상위: " + topc.map(function (x) { return x.label + " " + man(x.pv) + (x.qoq != null ? " (QoQ " + (x.qoq >= 0 ? "+" : "") + num(x.qoq) + ")" : ""); }).join(" · ") });
    return L;
  }
  function autoLines(key) { return { sum: linesSum, daily: linesDaily, items: linesItems, pv: linesPv }[key](); }
  // 취소금액이 주문금액의 50% 이상인 날(집계 이상 가능성) — 비교값이 크게 흔들린다
  function flagged() {
    var d = S.data, out = [];
    [["이번 행사", d.cur], ["직전 행사", d.prev], ["작년 행사", d.ly]].forEach(function (pr) {
      (pr[1] || []).forEach(function (x, i) {
        if (x && x.gmv > 0 && x.cancel / x.gmv >= FLAG_RATE) out.push(x.date + " (" + pr[0] + " Day " + (i + 1) + ")은 취소금액이 주문금액의 " + (x.cancel / x.gmv * 100).toFixed(0) + "%라 그 날의 매출·비교값이 크게 흔들려요");
      });
    });
    return out;
  }

  // 칸마다 코멘트 상자(제목줄 + 입력 버튼 / 자동 / 직접 입력)를 만든다
  function mkComments() {
    SECS.forEach(function (sc) {
      var host = $(".js-m-c-" + sc[0]); if (!host || CM[sc[0]]) return;
      var box = h("div", "inni-comment"), head = h("div", "inni-comment-head"), btn = h("button", "dash-btn", "코멘트 입력");
      btn.type = "button"; btn.setAttribute("aria-haspopup", "dialog"); head.appendChild(h("h3", null, "코멘트 · " + sc[1])); head.appendChild(btn); box.appendChild(head);
      var auto = h("div", "inni-auto"), man_ = h("div", "inni-manual"), body = h("p", "inni-manual-body"), meta = h("small", "inni-note");
      man_.hidden = true; man_.appendChild(body); man_.appendChild(meta); box.appendChild(auto); box.appendChild(man_); host.appendChild(box);
      CM[sc[0]] = { auto: auto, box: man_, body: body, meta: meta, btn: btn };
      btn.addEventListener("click", function () { if (S.ready && S.ev) openNoteModal(sc[0]); });
    });
  }
  function showManual(key, c) {
    var m = CM[key]; S.notes[key] = c && c.body ? c : null; var n = S.notes[key];
    m.box.hidden = !n; m.body.textContent = n ? n.body : "";
    m.meta.textContent = n ? "직접 입력 · " + (n.by || "") + (n.at ? " · " + String(n.at).slice(0, 16).replace("T", " ") : "") : "";
    m.btn.textContent = n ? "코멘트 수정" : "코멘트 입력";
  }
  function noteKey() { return S.ev.start_dt.slice(0, 8) + "01"; }   // 같은 종류의 행사는 한 달에 한 번이라 시작 월로 구분한다
  function renderComment() {
    mkComments();
    var k = noteKey(), ev = S.ev;
    SECS.forEach(function (sc) {
      var m = CM[sc[0]]; m.auto.innerHTML = "";
      autoLines(sc[0]).forEach(function (l) { var q = h("p"); q.appendChild(h("span", l.c || "", l.t)); m.auto.appendChild(q); });
      showManual(sc[0], null);
      rpc("dy_inni_comment_get", { p_report: secReport(sc[0]), p_ym: k }).then(function (c) { if (ev === S.ev) showManual(sc[0], c); })
        .catch(function (e) { m.meta.textContent = friendly(e); m.box.hidden = false; });
    });
  }

  // ---------- 표 ----------
  // 일별 표의 열 정의 [id, 머리글, 엑셀 종류]
  var DCOLS = [["day", "DAY", "text"], ["date", "날짜", "text"], ["sales", "SALES", "int"], ["sq", "QoQ", "gr"], ["sy", "YoY", "gr"], ["pv", "PV", "int"], ["pq", "QoQ", "gr"], ["py", "YoY", "gr"], ["orders", "ORDERS", "int"], ["cvr", "CVR", "pct1"], ["aov", "AOV", "int"]];
  function dailyRows() { // [{ id, vals:{열id: 값}, sum, flag }]
    var d = S.data, out = [], flagDates = {}; flagged().forEach(function (f) { flagDates[f.slice(0, 10)] = 1; });
    var g = function (a, b) { return b ? growth(a, b) : null; };
    function vals(label, date, c, p, y) {
      return { day: label, date: date, sales: c.sales / 1000, sq: p ? g(c.sales, p.sales) : null, sy: y ? g(c.sales, y.sales) : null, pv: c.pv, pq: p ? g(c.pv, p.pv) : null, py: y ? g(c.pv, y.pv) : null, orders: c.orders, cvr: c.cvr, aov: c.aov };
    }
    d.cur.forEach(function (x, i) {
      if (!x) return;
      var flag = flagDates[x.date] || (d.prev && d.prev[i] && flagDates[d.prev[i].date]) || (d.ly && d.ly[i] && flagDates[d.ly[i].date]);
      out.push({ id: "d" + (i + 1), vals: vals("Day " + (i + 1), md(x.date), dayStat(x), dayStat(d.prev && d.prev[i]), dayStat(d.ly && d.ly[i])), flag: !!flag });
    });
    out.push({ id: "sum", vals: vals("SUM", d.n + "일", sumStat(d.cur), d.prev ? sumStat(d.prev) : null, d.ly ? sumStat(d.ly) : null), strong: true });
    return out;
  }
  function fmtCell(id, v) {
    if (v == null) return "-";
    switch (id) { case "sales": return Math.round(v).toLocaleString("ko-KR"); case "sq": case "sy": case "pq": case "py": return gs(v); case "cvr": return pv1(v); case "pv": case "orders": case "aov": return num(v); }
    return String(v);
  }
  function renderDaily() {
    var t = el.daily; t.innerHTML = "";
    var thead = h("thead"), tr = h("tr"); DCOLS.forEach(function (c) { var th = h("th", null, c[1]); th.dataset.col = c[0]; tr.appendChild(th); }); thead.appendChild(tr); t.appendChild(thead);
    var tb = h("tbody");
    dailyRows().forEach(function (r) {
      var row = h("tr", (r.strong ? "is-total " : "") + (r.flag ? "is-flag" : "")); row.dataset.id = r.id;
      DCOLS.forEach(function (c) {
        var v = r.vals[c[0]], td = h("td", c[2] === "text" ? "t" : (c[2] === "gr" ? (v == null ? "is-empty" : cls(v)) : ""), c[2] === "text" ? v : fmtCell(c[0], v)); td.dataset.col = c[0]; row.appendChild(td);
      });
      tb.appendChild(row);
    });
    t.appendChild(tb); K.applyHl(t, S.cfg.daily);
  }

  var CCOLS = [["group", "구분", "text"], ["name", "경로", "text"], ["pv", "PV", "int"], ["share", "%", "pct"], ["qoq", "QoQ", "int"], ["yoy", "YoY", "int"]];
  function chanVals(c) { return c.has ? { group: c.group, name: c.label, pv: c.pv, share: c.share, qoq: c.qoq, yoy: c.yoy } : { group: c.group, name: c.label, pv: null }; }   // 열이 없는 경로(틱톡)는 시트처럼 PV 만 ‘-’ 이고 나머지는 빈칸
  function chanTotal() { var t = S.data.chTot; return { group: "전체", name: "합계(총페이지뷰)", pv: t.pv, share: 100, qoq: t.qoq, yoy: t.yoy }; }
  // 시트와 같은 표시: PV 가 0 이면 ‘-’, 비중은 정수 %, QoQ·YoY 는 PV 증감 수(부호 포함)
  function chanCell(id, v, c) {
    if (id === "group" || id === "name") return String(v);
    if (id === "pv") return v == null || v === 0 ? "-" : num(v);
    if (v === undefined) return "";
    if (id === "share") return v == null ? "-" : v.toFixed(0) + "%";
    return v == null ? "-" : (v === 0 ? "0" : (v > 0 ? "+" : "") + num(v));
  }
  function renderChans() {
    var d = S.data, t = el.chan; t.innerHTML = "";
    el.chanTitle.textContent = "유입 경로별 PV · 스토어 전체 " + num(d.storePv) + " · QoQ·YoY 는 PV 증감 수";
    var thead = h("thead"), tr = h("tr"); CCOLS.forEach(function (c) { var th = h("th", null, c[1]); th.dataset.col = c[0]; tr.appendChild(th); }); thead.appendChild(tr); t.appendChild(thead);
    var tb = h("tbody");
    function line(id, vals, strong) {
      var row = h("tr", strong ? "is-total" : ""); row.dataset.id = id;
      CCOLS.forEach(function (c) {
        var v = vals[c[0]], td = h("td", c[2] === "text" ? "t" : (c[0] === "qoq" || c[0] === "yoy") && typeof v === "number" && v !== 0 ? cls(v) : "", chanCell(c[0], v)); td.dataset.col = c[0]; row.appendChild(td);
      });
      tb.appendChild(row);
    }
    d.chans.forEach(function (c) { line(c.key, chanVals(c)); });
    line("total", chanTotal(), true);
    t.appendChild(tb); K.applyHl(t, S.cfg.chan);
  }

  var ICOLS = [["no", "No.", "text"], ["name", "상품", "text"], ["sales", "Sales(엔)", "int"], ["share", "%", "pct"], ["qoq", "QoQ", "gr"], ["pv", "PV", "int"], ["pvqoq", "QoQ", "gr"], ["cvr", "CVR", "pct1"]];
  function itemVals(o) { return { no: o.no, name: o.name, sales: o.sales, share: o.share, qoq: o.qoq, pv: o.pv, pvqoq: o.pvQoq, cvr: o.cvr }; }
  function renderItems() {
    var d = S.data, t = el.items; t.innerHTML = "";
    el.itemsTitle.textContent = "상품별 실적 · 상위 " + Math.min(TOP_N, d.items.length) + "개 · 행사 기간 합계 " + kv(d.itemsTotal) + "K";
    var thead = h("thead"), tr = h("tr"); ICOLS.forEach(function (c) { var th = h("th", null, c[1]); th.dataset.col = c[0]; tr.appendChild(th); }); thead.appendChild(tr); t.appendChild(thead);
    var tb = h("tbody");
    d.items.slice(0, TOP_N).forEach(function (o) {
      var row = h("tr"), v = itemVals(o); row.dataset.id = o.gd;
      var q = typeof v.qoq === "string" ? v.qoq : v.qoq == null ? "-" : gs(v.qoq), pq = typeof v.pvqoq === "string" ? v.pvqoq : v.pvqoq == null ? "-" : gs(v.pvqoq);
      [["no", String(v.no), "t"], ["name", v.name, "name"], ["sales", num(v.sales), ""], ["share", v.share == null ? "-" : v.share.toFixed(0) + "%", ""], ["qoq", q, typeof v.qoq === "number" ? cls(v.qoq) : ""],
        ["pv", num(v.pv), ""], ["pvqoq", pq, typeof v.pvqoq === "number" ? cls(v.pvqoq) : ""], ["cvr", pv1(v.cvr), ""]].forEach(function (x) {
        var td = h("td", x[2], x[1]); td.dataset.col = x[0]; if (x[0] === "name") td.title = v.name; row.appendChild(td);
      });
      tb.appendChild(row);
    });
    t.appendChild(tb); K.applyHl(t, S.cfg.items);
  }

  // 그래프: 일별 매출 (이번·직전·작년). light=true 는 엑셀 그림용
  function chartConfig(light) {
    var d = S.data, tick = light ? "#333333" : (getComputedStyle(document.body).color || "#444"), bar = S.cfg.type === "bar", labels = [];
    for (var i = 0; i < d.n; i++) labels.push("Day " + (i + 1));
    var ser = function (s) { return labels.map(function (_, i) { var x = s && s[i]; return x ? Math.round(x.sales / 1000) : null; }); };
    var sets = [{ label: evLabel(d.e) + " (" + evRange(d.e) + ")", data: ser(d.cur), borderColor: "#2b6fd6", backgroundColor: "#2b6fd6", borderWidth: bar ? 1 : 3 }];
    if (d.prev && (S.cfg.compare === "both" || S.cfg.compare === "prev")) sets.push({ label: "직전 " + evLabel(d.p), data: ser(d.prev), borderColor: "#f2a33a", backgroundColor: "#f2a33a", borderDash: bar ? [] : [6, 4] });
    if (d.ly && (S.cfg.compare === "both" || S.cfg.compare === "ly")) sets.push({ label: "작년 " + evLabel(d.l), data: ser(d.ly), borderColor: "#8c8c8c", backgroundColor: "#8c8c8c", borderDash: bar ? [] : [2, 3] });
    sets.forEach(function (s) { s.tension = .25; s.pointRadius = 3; s.spanGaps = false; });
    return { type: bar ? "bar" : "line", data: { labels: labels, datasets: sets }, options: { responsive: !light, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { color: tick } } },
      scales: { x: { ticks: { color: tick }, grid: { display: false } }, y: { beginAtZero: true, min: 0, ticks: { color: tick }, title: { display: true, text: "SALES (K JPY)", color: tick } } } } };
  }
  function drawChart() {
    if (!window.Chart) return;
    if (chart) { chart.destroy(); chart = null; }
    chart = new window.Chart(el.chart, chartConfig(false));
  }

  // PV 막대 그래프: 구분(큐텐 구좌·오가닉·내부 광고·외부 광고·구분 불가)별 이번 행사 · 직전 행사 · 작년 행사
  function pvChartConfig(light) {
    var d = S.data, tick = light ? "#333333" : (getComputedStyle(document.body).color || "#444"), gr = pvGroups(), labels = gr.map(function (x) { return x.g; });
    var sets = [{ label: evLabel(d.e), data: gr.map(function (x) { return x.cur; }), backgroundColor: "#2b6fd6" }];
    if (d.prev && (S.cfg.compare === "both" || S.cfg.compare === "prev")) sets.push({ label: "직전 " + evLabel(d.p), data: gr.map(function (x) { return x.prev; }), backgroundColor: "#f2a33a" });
    if (d.ly && (S.cfg.compare === "both" || S.cfg.compare === "ly")) sets.push({ label: "작년 " + evLabel(d.l), data: gr.map(function (x) { return x.ly; }), backgroundColor: "#a8a8a8" });
    var vlabels = { id: "valueLabels", afterDatasetsDraw: function (ch) {   // 막대 위에 PV 값
      var x = ch.ctx; x.save(); x.font = "11px sans-serif"; x.fillStyle = tick; x.textAlign = "center"; x.textBaseline = "bottom";
      ch.data.datasets.forEach(function (ds, i) { ch.getDatasetMeta(i).data.forEach(function (bar, j) { var v = ds.data[j]; if (v) x.fillText(v >= 1e4 ? (v / 1e4).toFixed(1) + "만" : Math.round(v).toLocaleString("ko-KR"), bar.x, bar.y - 3); }); });
      x.restore();
    } };
    return { type: "bar", plugins: [vlabels], data: { labels: labels, datasets: sets }, options: { responsive: !light, maintainAspectRatio: false, animation: false, layout: { padding: { top: 18 } },
      plugins: { legend: { labels: { color: tick } } },
      scales: { x: { ticks: { color: tick }, grid: { display: false } }, y: { beginAtZero: true, min: 0, ticks: { color: tick }, title: { display: true, text: "PV", color: tick } } } } };
  }
  function drawPvChart() {
    if (!window.Chart) return;
    if (pvChart) { pvChart.destroy(); pvChart = null; }
    pvChart = new window.Chart(el.pvchart, pvChartConfig(false));
  }

  function renderNotice() {
    var d = S.data, msgs = [];
    if (d.part) msgs.push("진행 중인 행사예요. 데이터가 있는 " + md(d.days[d.n - 1]) + "까지만 보이고 비교도 같은 일수로 해요.");
    if (!d.p) msgs.push("비교할 직전 행사가 없어요.");
    if (isWari()) msgs.push("메가와리는 첫날(" + md(d.e.start_dt) + ")이 오후 5시 시작이라 첫날 값에는 행사 전 시간대도 섞여 있어요.");
    el.notice.hidden = !msgs.length; el.notice.textContent = msgs.join(" ");
  }

  function renderAll() {
    var d = S.data;
    el.eyebrow.textContent = "Qoo10 " + typeName();
    el.title.textContent = evLabel(d.e) + " · " + evRange(d.e) + (d.part ? " (진행 중)" : "");
    renderNotice(); renderComment(); renderDaily(); drawChart(); renderItems(); drawPvChart(); renderChans();
    el.note.textContent = "단위: SALES 천 엔(상품 표는 엔). SALES = 순매출(취소 제외), ORDERS = 총상품수량(순), CVR = ORDERS ÷ PV, AOV = SALES ÷ ORDERS. QoQ = 직전 " + (isWari() ? "메가와리" : "메가포") + " 행사의 같은 일차 대비, YoY = 작년 같은 행사 대비. 노란 줄은 취소금액이 주문금액의 50% 이상인 날(집계 이상 가능성)이 포함된 줄이에요. 유입 경로는 서로 겹치는 항목이 있어요(검색 ⊃ 키워드플러스 등).";
  }
  function recompute() { showMsg(""); return loadCfg().then(build).then(renderAll).catch(function (e) { showMsg(friendly(e)); }); }

  // ---------- 선택 상자 ----------
  function fillTypes() {
    el.type.innerHTML = "";
    TYPES.forEach(function (t) { var o = h("option", null, t[1]); o.value = t[0]; el.type.appendChild(o); });
    el.type.value = S.type;
  }
  function fillEvents() {
    el.ev.innerHTML = "";
    S.events.forEach(function (e) { var o = h("option", null, evLabel(e) + " (" + evRange(e) + ")" + (e.end_dt > S.anchor ? " · 진행 중" : "")); o.value = String(e.no); el.ev.appendChild(o); });
    if (!S.ev) S.ev = S.events.filter(function (e) { return e.end_dt <= S.anchor; })[0] || S.events[0];   // 기본은 가장 최근에 끝난 행사
    if (S.ev) el.ev.value = String(S.ev.no);
  }

  // ---------- 코멘트 입력 모달 (칸별) ----------
  function openNoteModal(key) {
    var ev = S.ev, k = noteKey(), n = S.notes[key], prev = document.activeElement, ov = h("div", "inni-modal"), card = h("div", "inni-modal-card");
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "코멘트 입력");
    card.appendChild(h("h3", null, "코멘트 입력 · " + secLabel(key) + " · " + evLabel(ev))); card.appendChild(h("p", null, "‘" + secLabel(key) + "’ 칸의 자동 코멘트 아래에 같이 보여요. 줄바꿈은 그대로 보여요."));
    var ta = h("textarea"); ta.maxLength = 4000; ta.value = n ? n.body : ""; card.appendChild(ta);
    var err = h("div", "inni-modal-err"); card.appendChild(err);
    var acts = h("div", "inni-modal-acts"), del = h("button", "dash-btn", "지우기"), gap = h("span", "inni-gap"), cancel = h("button", "dash-btn", "취소"), save = h("button", "dash-btn is-primary", "저장");
    del.type = cancel.type = save.type = "button"; del.hidden = !n;
    [del, gap, cancel, save].forEach(function (x) { acts.appendChild(x); }); card.appendChild(acts); ov.appendChild(card); document.body.appendChild(ov);
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    function close() { document.removeEventListener("keydown", onKey, true); if (ov.parentNode) ov.parentNode.removeChild(ov); if (prev && prev.focus) prev.focus(); }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(ta.value); } }
    function commit(body) {
      save.disabled = del.disabled = true; err.textContent = "";
      rpc("dy_inni_comment_set", { p_report: secReport(key), p_ym: k, p_body: body }).then(function (c) {
        if (ev === S.ev) showManual(key, c); toast(c ? "코멘트를 저장했어요" : "코멘트를 지웠어요"); close();
      }).catch(function (e) { err.textContent = friendly(e); save.disabled = del.disabled = false; });
    }
    document.addEventListener("keydown", onKey, true);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    cancel.addEventListener("click", close); save.addEventListener("click", function () { commit(ta.value); }); del.addEventListener("click", function () { commit(""); });
  }

  // ---------- 설정 · 엑셀 ----------
  function openSettingsDlg() {
    var d = S.data, ev = S.ev, k = noteKey(), fy = cfgFy();
    var dRows = dailyRows().map(function (r) { return [r.id, r.vals.day]; });
    K.openSettings({
      title: "설정 · " + evLabel(ev), desc: "코멘트는 행사마다, 강조와 그래프는 같은 종류 행사의 회계연도(" + fyLabel(fy) + ")마다 저장돼요. 모두가 같이 봐요.",
      report: report(), fy: fy, notes: SECS.map(function (sc) { return { key: sc[0], label: sc[1], ym: k, report: secReport(sc[0]), body: S.notes[sc[0]] ? S.notes[sc[0]].body : "" }; }), cfg: S.cfg,
      tables: [
        { key: "daily", title: "일별 표", rows: dRows, cols: DCOLS.filter(function (c) { return c[2] !== "text"; }).map(function (c) { return [c[0], c[1] + (c[0] === "sq" || c[0] === "pq" ? " (SALES/PV QoQ)" : c[0] === "sy" || c[0] === "py" ? " (SALES/PV YoY)" : c[0] === "sales" ? "" : "")]; }) },
        { key: "chan", title: "유입 경로 표", rows: d.chans.map(function (c) { return [c.key, c.group + " · " + c.label]; }).concat([["total", "합계(총페이지뷰)"]]), cols: CCOLS.filter(function (c) { return c[2] !== "text"; }).map(function (c) { return [c[0], c[1]]; }), scroll: true },
        { key: "items", title: "상품별 실적 표", rows: d.items.slice(0, TOP_N).map(function (o) { return [o.gd, o.no + ". " + o.name.slice(0, 28)]; }), cols: ICOLS.filter(function (c) { return c[2] !== "text"; }).map(function (c) { return [c[0], c[1]]; }), scroll: true }
      ],
      selects: [{ key: "type", label: "그래프 종류", options: [["line", "꺾은선"], ["bar", "막대"]] }, { key: "compare", label: "비교 행사 표시", options: [["both", "직전 + 작년"], ["prev", "직전만"], ["ly", "작년만"], ["none", "이번 행사만"]] }],
      chartNote: "일별 매출 그래프예요.", rpc: rpc, toast: toast, friendly: friendly,
      onNote: function (c, key) { if (ev === S.ev) showManual(key, c); },
      onCfg: function (draft) { S.cfg = normCfg(draft); renderDaily(); renderChans(); renderItems(); drawChart(); drawPvChart(); }
    });
  }

  function exportXlsx() {
    if (!S.ready || !S.data || S.busy) return;
    el.xlsxBtn.disabled = true; var old = el.xlsxBtn.textContent; el.xlsxBtn.textContent = "만드는 중…";
    K.loadExcelJs().then(function () {
      var d = S.data, wb = new window.ExcelJS.Workbook(); wb.creator = "DY-AI"; wb.created = new Date();
      var ws = wb.addWorksheet(typeName(), { views: [{ showGridLines: false }] });
      ws.columns = [{ width: 10 }, { width: 30 }].concat([1, 2, 3, 4, 5, 6, 7, 8, 9].map(function () { return { width: 12.5 }; }));
      var r = K.writeHead(ws, 2, { eyebrow: "QOO10 " + typeName(), title: el.title.textContent, unit: "(K JPY) · 순매출 기준 · 행사 기간(시작일~종료일) 합계", width: 11, noComment: true });
      var cm = function (key) { r = K.writeComment(ws, r, { title: "코멘트 · " + secLabel(key), lines: autoLines(key), note: S.notes[key], width: 11 }) + 1; };
      var sec = function (title) { ws.getCell(r, 1).value = title; ws.getCell(r, 1).font = { size: 14, bold: true, color: { argb: "FF1F3A5F" } }; ws.getRow(r).height = 22; r++; };
      sec("요약"); cm("sum");
      sec("일별"); cm("daily");
      ws.getCell(r, 1).value = "일별 매출 (직전 행사 · 작년 행사와 같은 Day 비교)"; ws.getCell(r, 1).font = { size: 11, bold: true }; r++;
      ws.addImage(K.imageOf(wb, chartConfig(true), 900, 330), { tl: { col: 0, row: r - 1 }, ext: { width: 900, height: 330 } }); r += 18;
      r = K.writeTable(ws, r, { cols: DCOLS.map(function (c) { return { id: c[0], label: c[1], type: c[2], text: c[2] === "text" }; }),
        rows: dailyRows().map(function (x) { return { id: x.id, vals: x.vals, strong: x.strong }; }), hl: S.cfg.daily });
      sec("제품별 실적"); cm("items");
      r = K.writeTable(ws, r, { title: el.itemsTitle.textContent, cols: ICOLS.map(function (c) { return { id: c[0], label: c[1], type: c[2], text: c[2] === "text" }; }),
        rows: d.items.slice(0, TOP_N).map(function (o) { return { id: o.gd, vals: itemVals(o) }; }), hl: S.cfg.items });
      sec("PV");
      ws.getCell(r, 1).value = "구분별 PV (이번 행사 · 직전 행사 · 작년 행사)"; ws.getCell(r, 1).font = { size: 11, bold: true }; r++;
      ws.addImage(K.imageOf(wb, pvChartConfig(true), 760, 300), { tl: { col: 0, row: r - 1 }, ext: { width: 760, height: 300 } }); r += 16;
      cm("pv");
      r = K.writeTable(ws, r, { title: el.chanTitle.textContent, cols: CCOLS.map(function (c) { return { id: c[0], label: c[1], type: c[2], text: c[2] === "text" }; }),
        rows: d.chans.map(function (c) { return { id: c.key, vals: chanVals(c) }; }).concat([{ id: "total", vals: chanTotal(), strong: true }]), hl: S.cfg.chan });
      ws.mergeCells(r, 1, r, 11); ws.getCell(r, 1).value = el.note.textContent; ws.getCell(r, 1).font = { size: 9, color: { argb: K.XL.sub } }; ws.getCell(r, 1).alignment = { wrapText: true, vertical: "top" }; ws.getRow(r).height = 44;
      ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
      return K.download(wb, "Qoo10_" + typeName() + "_" + d.e.start_dt.slice(0, 7) + ".xlsx", toast);
    }).catch(function (e) { showMsg("엑셀을 만들지 못했어요: " + ((e && e.message) || e)); })
      .then(function () { el.xlsxBtn.disabled = false; el.xlsxBtn.textContent = old; });
  }

  // ---------- 이벤트 ----------
  el.type.addEventListener("change", function () { S.type = el.type.value; pickType(); fillEvents(); recompute(); });
  el.ev.addEventListener("change", function () { S.ev = S.events.filter(function (e) { return String(e.no) === el.ev.value; })[0]; recompute(); });
  el.reload.addEventListener("click", function () { D.clearCache(); S.ready = false; S.ev = null; start(true); });
  el.setBtn.addEventListener("click", function () { if (S.ready && S.data && S.cfg) openSettingsDlg(); });
  el.xlsxBtn.addEventListener("click", exportXlsx);
  document.addEventListener("dy:theme", function () { if (S.data && started) { drawChart(); drawPvChart(); } });

  // ---------- 시작 ----------
  var started = false;
  function start(force) {
    if (started && !force) { if (chart) chart.resize(); if (pvChart) pvChart.resize(); return Promise.resolve(); }
    started = true;
    return load().then(function () {
      if (!S.ready) { started = false; return; }
      fillTypes(); pickType(); fillEvents(); return recompute();
    }).catch(function (e) { showMsg(friendly(e)); });
  }
  document.addEventListener("inni:show", function (e) { if (e.detail.view === "inni" && e.detail.sub === "megapo") start(); });
  if (/^#inni\/megapo/.test(location.hash || "")) start();
})();

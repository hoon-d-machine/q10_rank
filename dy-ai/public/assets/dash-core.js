/* DY-AI 대시보드 코어: 지표 목록 · 기간 계산 · 집계 호출(dy_dash_agg) · 계산 지표
 * 화면과 무관한 부분만 (dash.js 가 사용). window.dyDash 로 내보냄.
 */
(function () {
  "use strict";

  // ============================================================
  // 지표 (src: sales=inni_sales_daily, pageview=inni_pageview_daily, goods=inni_sales_goods)
  // 계산 지표는 num/den(다른 지표 키)의 "합계끼리 나눈 값"
  // fmt: int | money | pct | dec
  // ============================================================
  var METRICS = {};
  function base(key, label, src, col, fmt, group, hidden) { METRICS[key] = { key: key, label: label, src: src, col: col, fmt: fmt || "int", group: group, hidden: !!hidden }; }
  function ratio(key, label, num, den, fmt, group, scale) { METRICS[key] = { key: key, label: label, num: num, den: den, fmt: fmt, group: group, scale: scale || 1 }; }

  // 판매 (일자별 거래)
  base("net_sales", "매출(순)", "sales", "final_buy_bpv", "money", "판매");
  base("gmv", "주문금액", "sales", "buy_bpv", "money", "판매");
  base("cancel_amt", "취소금액", "sales", "cancel_bpv", "money", "판매");
  base("orders", "주문건수", "sales", "buy_cnt", "int", "판매");
  base("cancels", "취소건수", "sales", "cancel_cnt", "int", "판매");
  base("qty", "주문상품수량", "sales", "total_buy_cnt", "int", "판매");
  base("cancel_qty", "취소상품수량", "sales", "total_cancel_cnt", "int", "판매");
  base("net_qty", "총상품수량(순)", "sales", "final_total_buy_cnt", "int", "판매");
  ratio("aov", "주문당 금액", "gmv", "orders", "money", "판매");
  ratio("cancel_rate", "취소율(금액)", "cancel_amt", "gmv", "pct", "판매", 100);
  ratio("qty_per_order", "주문당 수량", "qty", "orders", "dec", "판매");

  // 방문·전환 (일자별 페이지뷰)
  base("visitors", "방문자수", "pageview", "user_cnt", "int", "방문·전환");
  base("total_pv", "총 PV", "pageview", "total_pv", "int", "방문·전환");
  base("carts", "장바구니 담기", "pageview", "add_cnt", "int", "방문·전환");
  base("purchases", "구매수", "pageview", "purchase_cnt", "int", "방문·전환");
  ratio("cvr", "구매전환율", "purchases", "visitors", "pct", "방문·전환", 100);
  ratio("cart_rate", "장바구니율", "carts", "visitors", "pct", "방문·전환", 100);
  ratio("cart_to_buy", "장바구니→구매", "purchases", "carts", "pct", "방문·전환", 100);
  ratio("pv_per_visitor", "방문자당 PV", "total_pv", "visitors", "dec", "방문·전환");
  ratio("sales_per_visitor", "방문자당 매출", "net_sales", "visitors", "money", "방문·전환");

  // 유입 경로별 PV
  [["main_pv", "홈"], ["search_pv", "검색"], ["sch_keywordplus_pv", "검색·키워드플러스"], ["sch_powerrank_pv", "검색·파워랭크"],
   ["mn_megawari_pv", "메가와리"], ["mn_megapo_pv", "메가포"], ["mn_timesale_pv", "타임세일(메인)"], ["mn_dailydeal_pv", "데일리딜(메인)"],
   ["bestseller_pv", "베스트셀러"], ["mn_beauty_ranking_pv", "뷰티 랭킹"], ["beautyhub_pv", "뷰티허브"], ["deal_pv", "딜"],
   ["category_pv", "카테고리"], ["sellershop_pv", "셀러샵"], ["special_pv", "기획전"], ["live_pv", "라이브"],
   ["cart_pv", "장바구니 페이지"], ["wish_pv", "찜"], ["todaysview_pv", "오늘 본 상품"], ["my_pv", "마이페이지"],
   ["external_pv", "외부 유입 합계"], ["ext_google_pv", "외부·구글"], ["ext_yahoo_pv", "외부·야후"], ["ext_instagram_pv", "외부·인스타그램"],
   ["ext_twitter_pv", "외부·X"], ["ext_facebook_pv", "외부·페이스북"], ["ext_line_pv", "외부·라인"], ["ext_kakaku_pv", "외부·가카쿠"],
   ["directurl_pv", "직접 URL"], ["etc_pv", "기타"]
  ].forEach(function (x) { base("pv_" + x[0].replace(/_pv$/, ""), x[1] + " PV", "pageview", x[0], "int", "유입 경로(PV)"); });

  // 상품별 (일자·품목별 거래) — 순위·브랜드 분석용
  base("g_net_amt", "상품 순수금액", "goods", "net_bpv", "money", "상품별");
  base("g_buy_amt", "상품 수주금액", "goods", "buy_bpv", "money", "상품별");
  base("g_cancel_amt", "상품 취소금액", "goods", "cancel_bpv", "money", "상품별");
  base("g_net_qty", "상품 순수량", "goods", "net_cnt", "int", "상품별");
  base("g_buy_qty", "상품 수주수량", "goods", "buy_cnt", "int", "상품별");
  base("g_cancel_qty", "상품 취소수량", "goods", "cancel_cnt", "int", "상품별");
  ratio("g_unit_price", "상품 평균 단가", "g_net_amt", "g_net_qty", "money", "상품별");

  // 랭킹 (data/*.csv → q10_rank_log → inni_rank_cat 뷰): 이니스프리(イニスフリー) 상품의 랭킹 진입 수량·평균 순위
  // 묶음(dim) '랭킹 카테고리'를 고르면 전체·스킨케어·베이스… 카테고리마다 선이 따로 나온다. 묶음 없이 쓰면 카테고리 합계.
  // 주간·월간은 수집한 날에만 값이 있다. 평균 순위는 낮을수록 좋음.
  [["d", "일간 베스트셀러"], ["w", "주간 랭킹"], ["m", "월간 랭킹"]].forEach(function (x) {
    var p = x[0], g = "랭킹(이니스프리)", src = "rank_" + p;
    base("r_" + p + "_cnt", x[1] + " 진입 수량", src, "cnt", "int", g);
    base("r_" + p + "_ranksum", x[1] + " 순위 합계", src, "rank_sum", "int", g, true);
    ratio("r_" + p + "_avg", x[1] + " 평균 순위", "r_" + p + "_ranksum", "r_" + p + "_cnt", "dec", g);
  });

  var SRC_LABEL = { sales: "일자별 거래", pageview: "일자별 페이지뷰", goods: "일자·상품별 거래", rank: "랭킹 기록", rank_d: "일간 랭킹", rank_w: "주간 랭킹", rank_m: "월간 랭킹" };

  function srcOf(key) { // 지표가 쓰는 원본 표들
    var m = METRICS[key];
    if (!m) return [];
    if (m.src) return [m.src];
    return srcOf(m.num).concat(srcOf(m.den)).filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  // ============================================================
  // 날짜
  // ============================================================
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parse(s) { var a = String(s).slice(0, 10).split("-"); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
  function addMonths(d, n) { // 말일 넘침 방지 (3/31 - 1개월 = 2/28)
    var x = new Date(d.getFullYear(), d.getMonth() + n, 1);
    var last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
    x.setDate(Math.min(d.getDate(), last));
    return x;
  }
  function days(a, b) { return Math.round((parse(b) - parse(a)) / 86400000) + 1; }
  function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function quarterStart(d) { return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1); }
  function yearStart(d) { return new Date(d.getFullYear(), 0, 1); }
  function weekStart(d) { var x = addDays(d, 0); var w = (x.getDay() + 6) % 7; return addDays(x, -w); } // 월요일

  // 기간 프리셋 (기준일 = 데이터 마지막 날)
  var PRESETS = [
    ["last7", "최근 7일"], ["last30", "최근 30일"], ["last90", "최근 90일"], ["last180", "최근 180일"],
    ["mtd", "이번 달"], ["prev_month", "지난 달"], ["qtd", "이번 분기"], ["prev_quarter", "지난 분기"],
    ["ytd", "올해"], ["prev_year", "작년"], ["last12m", "최근 12개월"], ["last24m", "최근 24개월"], ["all", "전체 기간"], ["custom", "직접 지정"]
  ];
  var PRESET_LABEL = {};
  PRESETS.forEach(function (p) { PRESET_LABEL[p[0]] = p[1]; });

  // r: { preset, from?, to? } → { from, to, unit, label }
  function resolve(r, anchor, minDate) {
    var a = parse(anchor), lo = minDate ? parse(minDate) : null;
    var p = (r && r.preset) || "last30", from, to = a, unit = null;
    switch (p) {
      case "last7": from = addDays(a, -6); break;
      case "last30": from = addDays(a, -29); break;
      case "last90": from = addDays(a, -89); break;
      case "last180": from = addDays(a, -179); break;
      case "mtd": from = monthStart(a); unit = "month"; break;
      case "prev_month": from = monthStart(addMonths(monthStart(a), -1)); to = addDays(monthStart(a), -1); unit = "month"; break;
      case "qtd": from = quarterStart(a); unit = "quarter"; break;
      case "prev_quarter": from = addMonths(quarterStart(a), -3); to = addDays(quarterStart(a), -1); unit = "quarter"; break;
      case "ytd": from = yearStart(a); unit = "year"; break;
      case "prev_year": from = new Date(a.getFullYear() - 1, 0, 1); to = new Date(a.getFullYear() - 1, 11, 31); unit = "year"; break;
      case "last12m": from = monthStart(addMonths(a, -11)); break;
      case "last24m": from = monthStart(addMonths(a, -23)); break;
      case "all": from = lo || addMonths(a, -24); break;
      case "custom":
        from = r.from ? parse(r.from) : addDays(a, -29);
        to = r.to ? parse(r.to) : a;
        if (to < from) { var t = from; from = to; to = t; }
        break;
      default: from = addDays(a, -29);
    }
    var out = { preset: p, from: ymd(from), to: ymd(to), unit: unit };
    out.label = p === "custom" ? out.from + " ~ " + out.to : PRESET_LABEL[p];
    return out;
  }

  // 비교 기간: mode = "prev"(직전 기간) | "yoy"(전년 동기)
  // 진행 중인 달·분기·해는 같은 날수끼리 (예: 이번 달 1~6일 ↔ 지난달 1~6일)
  function shift(rg, mode) {
    var f = parse(rg.from), t = parse(rg.to), n = days(rg.from, rg.to);
    var nf, nt;
    if (mode === "yoy") { nf = addMonths(f, -12); nt = addMonths(t, -12); }
    else if (rg.unit) {
      var step = rg.unit === "month" ? 1 : rg.unit === "quarter" ? 3 : 12;
      nf = addMonths(f, -step);
      var unitEnd = addDays(addMonths(nf, step), -1);
      nt = addDays(nf, n - 1);
      if (nt > unitEnd) nt = unitEnd;
    } else { nt = addDays(f, -1); nf = addDays(nt, -(n - 1)); }
    return { from: ymd(nf), to: ymd(nt), unit: rg.unit, label: (mode === "yoy" ? "전년 동기" : "직전 기간") + " (" + ymd(nf) + " ~ " + ymd(nt) + ")" };
  }

  // 기간 안의 묶음(일/주/월/분기/연) 시작일 목록
  function buckets(rg, grain) {
    var f = parse(rg.from), t = parse(rg.to), out = [], cur;
    if (grain === "all") return [rg.from];
    cur = grain === "day" ? f : grain === "week" ? weekStart(f) : grain === "month" ? monthStart(f) : grain === "quarter" ? quarterStart(f) : yearStart(f);
    while (cur <= t && out.length < 4000) {
      out.push(ymd(cur));
      cur = grain === "day" ? addDays(cur, 1) : grain === "week" ? addDays(cur, 7) : addMonths(cur, grain === "month" ? 1 : grain === "quarter" ? 3 : 12);
    }
    return out;
  }

  var WEEKDAYS = ["", "월", "화", "수", "목", "금", "토", "일"];
  function bucketLabel(k, grain, short) {
    var d = parse(k), yy = String(d.getFullYear()).slice(2);
    switch (grain) {
      case "day": return short ? (d.getMonth() + 1) + "/" + d.getDate() : k;
      case "week": return (short ? "" : yy + ".") + (d.getMonth() + 1) + "/" + d.getDate() + "주";
      case "month": return short ? (d.getMonth() + 1) + "월" : yy + "." + pad(d.getMonth() + 1);
      case "quarter": return (short ? "" : yy + " ") + "Q" + (Math.floor(d.getMonth() / 3) + 1);
      case "year": return String(d.getFullYear());
      default: return "전체";
    }
  }
  var GRAINS = [["day", "일"], ["week", "주"], ["month", "월"], ["quarter", "분기"], ["year", "연"]];

  // ============================================================
  // 숫자 표시
  // ============================================================
  function fmt(v, f, compact) {
    if (v === null || v === undefined || isNaN(v)) return "–";
    if (f === "pct") return v.toFixed(Math.abs(v) < 10 ? 2 : 1) + "%";
    if (f === "dec") return v.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
    if (compact) {
      var a = Math.abs(v);
      if (a >= 1e8) return (v / 1e8).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, "") + "억";
      if (a >= 1e4) return (v / 1e4).toFixed(a >= 1e6 ? 0 : 1).replace(/\.0$/, "") + "만";
    }
    return Math.round(v).toLocaleString("ko-KR");
  }
  function delta(cur, prev) { return prev ? (cur - prev) / Math.abs(prev) * 100 : null; }

  // ============================================================
  // 데이터
  // ============================================================
  var cache = new Map();
  var bounds = null;

  function client() {
    var c = window.dyAuth && window.dyAuth.client;
    if (!c) throw new Error("Supabase 설정이 없어요");
    return c;
  }

  function friendly(e) {
    var m = (e && (e.message || e.msg)) || String(e);
    if (/dy_dash_agg|dy_dash_bounds|function .* does not exist|Could not find the function|schema cache/i.test(m))
      return "대시보드 집계 함수가 아직 없어요. Supabase SQL Editor 에서 dy-ai/supabase/dashboard.sql 을 실행해 주세요.";
    if (/permission denied/i.test(m)) return "권한이 없어요 (" + m + "). dashboard.sql 을 실행했는지 확인해 주세요.";
    return m;
  }

  function loadBounds() {
    if (bounds) return Promise.resolve(bounds);
    return client().rpc("dy_dash_bounds").then(function (res) {
      if (res.error) throw new Error(friendly(res.error));
      bounds = res.data || {};
      return bounds;
    });
  }

  // 기준일: 매출 데이터 마지막 날 (없으면 어제)
  function anchor() {
    var b = bounds || {};
    var max = (b.sales && b.sales.max) || (b.pageview && b.pageview.max) || (b.goods && b.goods.max) || (b.rank && b.rank.max);
    return max || ymd(addDays(new Date(), -1));
  }
  function minDate() {
    var b = bounds || {};
    var mins = ["sales", "pageview", "goods", "rank"].map(function (k) { return b[k] && b[k].min; }).filter(Boolean).sort();
    return mins[0] || null;
  }

  function agg(src, grain, rg, cols, dim, top, topCol) {
    var args = { p_source: src, p_grain: grain, p_from: rg.from, p_to: rg.to, p_cols: cols.slice().sort() };
    if (dim) args.p_dim = dim;
    if (top) { args.p_top = top; args.p_top_col = topCol || cols[0]; }
    var key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    var pr = client().rpc("dy_dash_agg", args).then(function (res) {
      if (res.error) throw new Error(friendly(res.error));
      return res.data || [];
    });
    pr.catch(function () { cache.delete(key); });
    cache.set(key, pr);
    return pr;
  }

  function baseKeys(keys) { // 계산 지표를 원본 지표로 풀기
    var out = [];
    (function walk(list) {
      list.forEach(function (k) {
        var m = METRICS[k];
        if (!m) return;
        if (m.src) { if (out.indexOf(k) < 0) out.push(k); }
        else walk([m.num, m.den]);
      });
    })(keys);
    return out;
  }

  function valueOf(k, row) { // row: {원본지표키: 합계}
    var m = METRICS[k];
    if (!m) return null;
    if (m.src) return row[k] == null ? 0 : row[k];
    var n = valueOf(m.num, row), d = valueOf(m.den, row);
    return d ? n / d * (m.scale || 1) : null;
  }

  // 지표들을 기간·단위(·묶음)로 집계
  // opt: { metrics, grain, range{from,to}, dim?, top?, topMetric? }
  // → { keys: [묶음 키], rows: { 키: { 지표: 값 } }, labels: { 키: 이름 }, days: { 키: 날짜 수 } }
  function query(opt) {
    var bk = baseKeys(opt.metrics);
    var bySrc = {};
    bk.forEach(function (k) { var m = METRICS[k]; (bySrc[m.src] = bySrc[m.src] || []).push(k); });
    var topBase = opt.topMetric ? baseKeys([opt.topMetric]).filter(function (k) { return METRICS[k].src === "goods" || /^rank_/.test(METRICS[k].src) || !opt.dim || opt.dim === "weekday"; })[0] : null;
    var srcs = Object.keys(bySrc);
    return loadBounds().then(function () {
      return Promise.all(srcs.map(function (s) {
        var cols = bySrc[s].map(function (k) { return METRICS[k].col; });
        var useDim = opt.dim && (opt.dim === "weekday" || (s === "goods" && opt.dim !== "category") || (opt.dim === "category" && /^rank_/.test(s))) ? opt.dim : null;
        var topCol = opt.top && useDim && useDim !== "weekday" ? (topBase && METRICS[topBase].src === s ? METRICS[topBase].col : cols[0]) : null;
        if (topCol && cols.indexOf(topCol) < 0) cols.push(topCol);
        return agg(s, opt.grain, opt.range, cols, useDim, topCol ? opt.top : null, topCol).then(function (data) { return { src: s, dim: useDim, data: data }; });
      }));
    }).then(function (parts) {
      var rows = {}, labels = {}, dayCount = {};
      parts.forEach(function (part) {
        part.data.forEach(function (r) {
          var key = opt.dim ? String(r.d) : String(r.p).slice(0, 10);
          if (opt.dim && opt.grain !== "all") key = String(r.p).slice(0, 10) + "|" + r.d;
          var row = rows[key] = rows[key] || {};
          bySrc[part.src].forEach(function (k) { row[k] = (row[k] || 0) + (r[METRICS[k].col] || 0); });
          if (r.l) labels[key] = r.l;
          dayCount[key] = Math.max(dayCount[key] || 0, r.n || 0);
        });
      });
      var out = {};
      Object.keys(rows).forEach(function (key) {
        out[key] = {};
        opt.metrics.forEach(function (k) { out[key][k] = valueOf(k, rows[key]); });
      });
      return { keys: Object.keys(rows), rows: out, labels: labels, days: dayCount };
    });
  }

  window.dyDash = {
    METRICS: METRICS, SRC_LABEL: SRC_LABEL, PRESETS: PRESETS, GRAINS: GRAINS, WEEKDAYS: WEEKDAYS,
    srcOf: srcOf, resolve: resolve, shift: shift, buckets: buckets, bucketLabel: bucketLabel,
    fmt: fmt, delta: delta, days: days, parse: parse, ymd: ymd,
    loadBounds: loadBounds, anchor: anchor, minDate: minDate, query: query, friendly: friendly,
    clearCache: function () { cache.clear(); bounds = null; },
    _setClientForTest: null
  };
})();

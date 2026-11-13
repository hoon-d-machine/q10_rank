/* DY-AI Q10 수집 확장 — 추가 수집 (inni_RPA 의 qsm_extra.py · ads_extra.py · qsm_cpm.py 와 같은 API·검증·열)
 *   판매자센터: 상품별 일자 PV · 고객(일자) · 찜/장바구니 스냅샷
 *   광고센터(ads.qoo10.jp): 행사 달력 · 일별 광고비·광고 매출(유형별) · 상품별 광고(최근 14일) · 키워드 노출·클릭·구매(최근 28일)
 *   QSM Beauty Brand AD(CPM): 캠페인 · 일자별 성과 · 키워드 노출 (최근 35일과 겹치는 캠페인)
 * 결과는 'DB 에 호출할 작업 목록'으로 돌려준다: [{ name, fn, args, expect }] — 저장하는 쪽(페이지 q10-extra.js 또는 확장 save.js)이 순서대로 호출하고 반영 행수를 expect 와 비교한다.
 * 한 묶음이 실패해도 나머지는 계속한다(errors 에 모아서 돌려줌).
 *
 * 속도: 서로 다른 사이트(판매자센터 · 광고센터 · QSM)의 묶음은 동시에 진행하고, 같은 사이트 안에서도 독립된 호출(기간 묶음 · 광고 유형 · 일자 · 키워드 · 캠페인×일자)은
 *       사이트별 동시 호출 수 상한(판매자센터 3 · 광고센터 3 · QSM 2)과 호출 뒤 짧은 간격을 지키며 병렬로 보낸다. 작업 목록의 순서는 항상 같다(병렬이라도 결과를 정해진 순서로 모음).
 *
 * ctx (background.js 가 채워 줌, 시험은 Node 에서 같은 모양으로):
 *   seller(url, payload) → body      판매자센터 API (재시도·인증 처리 포함, 실패하면 throw)
 *   ads(path, payload|null) → body   광고센터 API (path 는 'sales/chart' 처럼 /api/ 뒤)   — 없으면 광고 묶음을 건너뜀
 *   qsm(method, path, form|null, referer) → { status, url, text }   QSM 화면 호출 (path 는 Promotion/ 뒤)   — 없으면 CPM 을 건너뜀
 *   progress(text), sleep(ms), warnings[] , today() → 'YYYY-MM-DD', cancelled() → bool (선택)
 */
(function (root) {
  "use strict";

  var SELLER = "https://seller.qoo10.jp/api/";
  var AD_FROM = "2026-02-01";                 // 광고센터 데이터가 있는 첫 날
  // 사이트별 [동시 호출 수, 호출 뒤 간격(ms)] — 서버에 몰리지 않게 (예전 직렬 수집은 호출 사이 0.8~3초였음)
  var LIMITS = { seller: [3, 600], ads: [3, 1500], qsm: [2, 900] };
  var AD_GOODS_DAYS = 14, AD_KW_DAYS = 28, CPM_DAYS = 35, KW_WINDOW = 7;
  var AD_TYPES = ["keywordplus", "cps", "power_rankup", "timesale", "horidashimono", "mega", "dailydeal", "dealplus", "categoryplus", "groupbuy", "groupbuyplus"];
  var KW_TYPES = ["", "keywordplus", "cps", "power_rankup"];

  // 상품별 PV 열 (판매자센터 응답의 fieldNm 순서) · 고객 열
  var PV_FIELDS = ("mainPv mnMegawariPv mnMegapoPv mnMyinterestPv mnSpotlightBrandPv mnBestsellerPv mnBeautyRankingPv mnBeautyPv " +
    "mnTimesalePv mnDailydealPv mnGroupbuyPv mnChancedealPv mnEtcPv searchPv schKeywordplusPv schPowerrankPv schCpsPv " +
    "schTimesalePv schEtcPv bestsellerPv beautyhubPv supplementhubPv dealPv dlTodaysmegaPv dlTodaysmegaPoPv dlTimesalePv " +
    "dlDailydealPv dlGroupbuyPv dlOnedaychancePv wishPv todaysviewPv cartPv sellershopPv specialPv categoryPv vipPv catalogPv " +
    "myPv livePv externalPv extGooglePv extFacebookPv extTwitterPv extInstagramPv extTiktokPv extYahooPv extKakakuPv extLinePv " +
    "extEmailPv extOthersPv directurlPv etcPv totalPv").split(" ");
  var CUSTOMER_FIELDS = ["newbuyerCnt", "newbuyerRate", "existingbuyerCnt", "existingbuyerRate", "buyerCnt", "shopFollowerInc", "shopFollowerCnt", "shopPageView"];
  function snake(s) { return s.replace(/([A-Z])/g, function (m) { return "_" + m.toLowerCase(); }); }

  // ---------- 날짜 ----------
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parse(s) { var a = String(s).slice(0, 10).split("-"); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function addD(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
  function windows(start, end, days) {
    var out = [], a = start;
    while (a <= end) { var e = addD(a, days - 1); if (e > end) e = end; out.push([a, e]); a = addD(e, 1); }
    return out;
  }
  function daysIn(a, b) { var out = []; for (var d = a; d <= b; d = addD(d, 1)) out.push(d); return out; }
  function nz(v) { return v === undefined || v === null || v === "" ? null : v; }

  // ---------- 동시 호출 제한 ----------
  // limiter(n, pauseMs, ctx): 동시에 n 개까지 실행하고, 각 호출이 끝난 뒤 pauseMs 만큼 그 자리를 비우지 않고 쉰다(요청이 몰리지 않게)
  function limiter(n, pause, ctx) {
    var active = 0, queue = [];
    function next() {
      if (active >= n || !queue.length) return;
      var job = queue.shift(); active++;
      Promise.resolve().then(function () {
        if (ctx.cancelled && ctx.cancelled()) throw new Error("수집이 취소됐어요");
        return job.fn();
      }).then(function (v) { return ctx.sleep(pause).then(function () { return v; }); }, function (e) { return ctx.sleep(pause).then(function () { throw e; }); })
        .then(function (v) { active--; job.resolve(v); next(); }, function (e) { active--; job.reject(e); next(); });
    }
    return function (fn) { return new Promise(function (resolve, reject) { queue.push({ fn: fn, resolve: resolve, reject: reject }); next(); }); };
  }
  // 호출 함수를 사이트별 제한 아래로 감싼 ctx (원래 ctx 의 나머지는 그대로)
  function limited(ctx) {
    var L = { seller: limiter(LIMITS.seller[0], LIMITS.seller[1], ctx), ads: limiter(LIMITS.ads[0], LIMITS.ads[1], ctx), qsm: limiter(LIMITS.qsm[0], LIMITS.qsm[1], ctx) };
    var c = Object.create(ctx);
    c.seller = function (url, payload) { return L.seller(function () { return ctx.seller(url, payload); }); };
    c.ads = ctx.ads ? function (path, payload) { return L.ads(function () { return ctx.ads(path, payload); }); } : null;
    c.qsm = ctx.qsm ? function (m, p, f, r) { return L.qsm(function () { return ctx.qsm(m, p, f, r); }); } : null;
    return c;
  }

  // ============================================================
  // 판매자센터 (상품별 PV · 고객 · 찜/장바구니)
  // ============================================================
  function sellerPayload(start, end, sort) {
    return { dateType: "D", startDt: start, endDt: end, from: 0, size: 9999, gdNos: [], gdlcCds: [], sortCd: sort, sortType: "Desc" };
  }
  async function fetchPvGoods(ctx, a, b) {
    var j = await ctx.seller(SELLER + "pageview/table/date-goods", sellerPayload(a, b, "D1")), items = j.datas || [];
    if (items.length < (j.totalCnt || 0)) throw new Error("상품별 PV " + a + "~" + b + ": " + items.length + "/" + j.totalCnt + "건만 받음");
    var rows = [];
    items.forEach(function (it) {
      var gd = String(it.gdNo || "").trim(), d = String(it.baseStartDt || "").slice(0, 10);
      if (!gd || !d) return;
      var r = { base_date: d, gd_no: gd, brand_nm: it.brandNm, gd_nm: it.gdNm, outer_gd_no: it.outerGdNo };
      PV_FIELDS.forEach(function (f) { r[snake(f)] = nz(it[f]); });
      rows.push(r);
    });
    return rows;
  }
  // 판매자센터가 가끔 일부 행만 돌려줘서(2026-11 백필 때 확인) 일자별 상품 PV 합계가 스토어 총 PV 와 같을 때까지 다시 받는다
  async function fetchPvGoodsChecked(ctx, a, b) {
    var bad = null;
    for (var t = 0; t < 4; t++) {
      var got0 = await Promise.all([fetchPvGoods(ctx, a, b), ctx.seller(SELLER + "pageview/table/date", sellerPayload(a, b, "D1"))]);   // 상품별과 스토어 총 PV 를 동시에
      var rows = got0[0], st = got0[1], store = {};
      (st.datas || []).forEach(function (d) { store[String(d.baseStartDt || "").slice(0, 10)] = d.totalPv; });
      var got = {}; rows.forEach(function (r) { got[r.base_date] = (got[r.base_date] || 0) + (r.total_pv || 0); });
      bad = {}; var nb = 0;
      Object.keys(store).forEach(function (d) { if (store[d] != null && (got[d] || 0) !== store[d]) { bad[d] = [got[d] || 0, store[d]]; nb++; } });
      if (!nb) return rows;
      ctx.progress("상품별 PV " + a + "~" + b + " 합계가 안 맞아 다시 받는 중 (" + nb + "일, " + (t + 1) + "/4)");
      await ctx.sleep(3000);
    }
    throw new Error("상품별 PV " + a + "~" + b + ": 4번 받아도 스토어 총 PV 와 안 맞아요 " + JSON.stringify(bad).slice(0, 120));
  }
  async function fetchCustomerDaily(ctx, a, b) {
    var j = await ctx.seller(SELLER + "customer/table/date", sellerPayload(a, b, "N0")), rows = [];
    (j.datas || []).forEach(function (it) {
      var d = String(it.baseStartDt || "").slice(0, 10); if (!d) return;
      var r = { base_date: d }; CUSTOMER_FIELDS.forEach(function (f) { r[snake(f)] = nz(it[f]); }); rows.push(r);
    });
    return rows;
  }
  async function fetchCustomerGoods(ctx) {
    var p = sellerPayload("", "", "N0"); p.startDt = ""; p.endDt = "";
    var j = await ctx.seller(SELLER + "customer/table/goods", p), items = j.datas || [];
    if (items.length < (j.totalCnt || 0)) throw new Error("찜·장바구니 " + items.length + "/" + j.totalCnt + "건만 받음");
    return items.filter(function (it) { return it.gdNo; }).map(function (it) {
      return { gd_no: String(it.gdNo), brand_nm: it.brandNm, gd_nm: it.gdNm, outer_gd_no: it.outerGdNo, wish_cnt: nz(it.wishCnt), basket_cnt: nz(it.basketCnt) };
    });
  }

  async function sellerExtras(ctx, range) {
    var ws = windows(range.start, range.end, 10);
    ctx.progress("추가 수집 · 상품별 PV " + range.start + "~" + range.end + " (" + ws.length + "구간 동시)");
    var rows = await Promise.all(ws.map(function (w) { return fetchPvGoodsChecked(ctx, w[0], w[1]); }));
    return ws.map(function (w, i) { return { name: "상품별 PV " + w[0] + "~" + w[1], fn: "inni_replace_pageview_goods", args: { p_from: w[0], p_to: w[1], p_rows: rows[i] }, expect: rows[i].length }; });
  }
  async function customerExtras(ctx, range) {
    var ws = windows(range.start, range.end, 10);
    ctx.progress("추가 수집 · 고객 " + range.start + "~" + range.end + " (" + ws.length + "구간 동시)");
    var rows = await Promise.all(ws.map(function (w) { return fetchCustomerDaily(ctx, w[0], w[1]); }));
    return ws.map(function (w, i) { return { name: "고객(일자) " + w[0] + "~" + w[1], fn: "inni_replace_customer_daily", args: { p_from: w[0], p_to: w[1], p_rows: rows[i] }, expect: rows[i].length }; });
  }
  async function custGoodsExtra(ctx) {
    ctx.progress("추가 수집 · 찜·장바구니 스냅샷");
    var rows = await fetchCustomerGoods(ctx), d = ctx.today();
    return [{ name: "찜·장바구니 스냅샷 " + d, fn: "inni_replace_customer_goods", args: { p_date: d, p_rows: rows }, expect: rows.length }];
  }

  // ============================================================
  // 광고센터
  // ============================================================
  function adBody(type, start, end) {
    return { dateType: "DAY", startDt: start, endDt: end, prevStartDt: start, prevEndDt: start, adTypes: type ? [type] : [], gdNos: [], gdNosAll: [], scopeType: type ? "AD" : "ALL" };
  }
  async function adChart(ctx, type, a, b) {
    var j = await ctx.ads("sales/chart", adBody(type, a, b));
    if (String(j.resultCode) !== "1") throw new Error("광고센터 응답 오류(" + (type || "all") + "): " + j.message + " " + j.resultCode);
    return j.datas || [];
  }
  // a~b 의 (일자 × 유형) 행. 유형별 광고비 합이 전체와 다르면 예외(모르는 광고 유형이 생겼을 때). 12번 호출(전체 + 유형 11개)을 동시에
  async function adDailyWindow(ctx, a, b) {
    var res = await Promise.all([adChart(ctx, "", a, b)].concat(AD_TYPES.map(function (t) { return adChart(ctx, t, a, b); })));
    var rows = [], allP = {}, allS = {}, got = {};
    res[0].forEach(function (d) {
      allP[d.resDate] = d.adPrice || 0; allS[d.resDate] = d.adSalesAmt || 0;
      rows.push({ base_date: d.resDate, ad_type: "all", ad_price: d.adPrice || 0, ad_sales: d.adSalesAmt || 0, total_sales: d.salesAmt || 0 });
    });
    AD_TYPES.forEach(function (t, i) {
      res[i + 1].forEach(function (d) {
        var p = d.adPrice || 0, s = d.adSalesAmt || 0;
        if (p || s) { rows.push({ base_date: d.resDate, ad_type: t, ad_price: p, ad_sales: s, total_sales: null }); got[d.resDate] = (got[d.resDate] || 0) + p; }
      });
    });
    var bad = 0, ex = null;
    Object.keys(allP).forEach(function (d) { if (Math.abs((got[d] || 0) - allP[d]) > 1) { bad++; ex = ex || d + ":" + (got[d] || 0) + "/" + allP[d]; } });
    if (bad) throw new Error("광고비 " + a + "~" + b + ": 유형별 합이 전체와 안 맞아요 " + bad + "일 (예 " + ex + ")");
    return { rows: rows, allSales: allS };
  }
  async function adGoodsDay(ctx, day) {
    var rows = [], off = 0, size = 100;
    for (;;) {
      var b = adBody("", day, day); b.offset = off; b.size = size;
      var j = await ctx.ads("goods/rank", b);
      if (String(j.resultCode) !== "1") throw new Error("광고센터 상품 응답 오류(" + day + "): " + j.message + " " + j.resultCode);
      var datas = j.datas || [];
      datas.forEach(function (x) {
        var g = x.goods || {};
        (x.adValues || []).forEach(function (v) {
          rows.push({ base_date: day, gd_no: x.gdNo, ad_type: v.adType, brand_nm: g.brandNm, gd_nm: g.gdNm, outer_gd_no: g.outerGdNo, ad_price: v.adPrice || 0, ad_sales: v.adSalesAmt || 0,
            expose_cnt: v.exposeCnt || 0, click_cnt: v.clickCnt || 0, cart_cnt: v.cartCnt || 0, purchase_cnt: v.purchaseCnt || 0 });
        });
      });
      if (datas.length < size) return rows;
      off += size;
    }
  }
  async function adKeywords(ctx, type, a, b) {
    var j = await ctx.ads("keyword/rank", adBody(type, a, b));
    if (String(j.resultCode) !== "1") throw new Error("광고센터 키워드 응답 오류: " + j.message + " " + j.resultCode);
    var rows = [];
    (j.datas || []).forEach(function (k) {
      (k.dayValue || []).forEach(function (d) {
        if (d.exposeCnt || d.clickCnt || d.purchaseCnt) rows.push({ base_date: d.dayDate, ad_type: type || "all", keyword: k.searchKeyword, rank_in_window: k.rankValue, expose_cnt: d.exposeCnt || 0, click_cnt: d.clickCnt || 0, purchase_cnt: d.purchaseCnt || 0 });
      });
    });
    return rows;
  }

  // 광고센터 묶음: 행사 달력 · 일별 광고비 · 상품별 광고 · 키워드를 동시에 받고, 상품별 광고는 일별 광고비(전체 광고 매출)와 맞는지 검증
  async function adsExtras(ctx, range, errors) {
    var a = range.start < AD_FROM ? AD_FROM : range.start, b = range.end, out = { cal: [], daily: [], goods: [], kw: [] };
    if (a > b) return out;
    ctx.progress("추가 수집 · 광고센터 (달력 · 광고비 · 상품별 · 키워드 동시)");
    var ga = addD(b, -(AD_GOODS_DAYS - 1)); if (ga < a) ga = a;
    var ka = addD(b, -(AD_KW_DAYS - 1)); if (ka < a) ka = a;
    var calP = (async function () {
      var cal = await ctx.ads("calendar/mega", null);
      if (String(cal.resultCode) !== "1") throw new Error("행사 달력 응답 오류: " + cal.message);
      var ev = (cal.datas || []).map(function (x) { return { promotion_no: x.promotionNo, promotion_nm: x.promotionNm, promotion_type: x.promotionType, start_at: x.startDt, end_at: x.endDt }; });
      return [{ name: "행사 달력 " + ev.length + "건", fn: "inni_upsert_mega_events", args: { p_rows: ev }, expect: ev.length }];
    })();
    var ws = windows(a, b, 92);
    var dailyP = Promise.all(ws.map(function (w) { return adDailyWindow(ctx, w[0], w[1]); }));
    var gws = windows(ga, b, 7);
    var goodsP = Promise.all(gws.map(function (w) { return Promise.all(daysIn(w[0], w[1]).map(function (d) { return adGoodsDay(ctx, d); })); }));
    var kws = windows(ka, b, KW_WINDOW);
    var kwP = Promise.all(kws.map(function (w) { return Promise.all(KW_TYPES.map(function (t) { return adKeywords(ctx, t, w[0], w[1]); })); }));
    var r = await Promise.all([calP, dailyP, goodsP, kwP].map(function (p, i) { return p.then(function (v) { return { ok: true, v: v }; }, function (e) { return { ok: false, e: e, i: i }; }); }));
    var NAMES = ["행사 달력", "광고비·광고 매출", "상품별 광고", "광고 키워드"];
    r.forEach(function (x, i) { if (!x.ok) errors.push({ name: NAMES[i], message: (x.e && x.e.message) || String(x.e) }); });
    if (r[0].ok) out.cal = r[0].v;
    var allSales = {};
    if (r[1].ok) {
      r[1].v.forEach(function (w, i) {
        Object.keys(w.allSales).forEach(function (d) { allSales[d] = w.allSales[d]; });
        out.daily.push({ name: "광고비·광고 매출 " + ws[i][0] + "~" + ws[i][1], fn: "inni_replace_ad_daily", args: { p_from: ws[i][0], p_to: ws[i][1], p_rows: w.rows }, expect: w.rows.length });
      });
    }
    if (r[2].ok) {
      r[2].v.forEach(function (perDay, k) {
        var rows = [].concat.apply([], perDay), mine = {};
        rows.forEach(function (x) { mine[x.base_date] = (mine[x.base_date] || 0) + x.ad_sales; });
        // 검증: 일자별 상품 광고 매출 합 == 전체 광고 매출 (일별 광고비 묶음에서 받은 값). 일별 광고비를 못 받았으면 검증할 수 없어서 저장하지 않는다
        if (!r[1].ok) { errors.push({ name: "상품별 광고", message: "일별 광고비를 받지 못해 전체와 맞는지 검증할 수 없어서 저장하지 않았어요" }); return; }
        var bad = Object.keys(mine).filter(function (d) { return allSales[d] != null && Math.abs(mine[d] - allSales[d]) > 1; });
        if (bad.length) { errors.push({ name: "상품별 광고", message: "상품별 광고 매출 " + gws[k][0] + "~" + gws[k][1] + ": 전체와 안 맞아요 " + bad.length + "일 (예 " + bad[0] + ")" }); return; }
        out.goods.push({ name: "상품별 광고 " + gws[k][0] + "~" + gws[k][1], fn: "inni_replace_ad_goods_daily", args: { p_from: gws[k][0], p_to: gws[k][1], p_rows: rows }, expect: rows.length });
      });
    }
    if (r[3].ok) {
      r[3].v.forEach(function (perType, m) {
        var rows = [].concat.apply([], perType);
        out.kw.push({ name: "광고 키워드 " + kws[m][0] + "~" + kws[m][1], fn: "inni_replace_ad_keyword_daily", args: { p_from: kws[m][0], p_to: kws[m][1], p_rows: rows }, expect: rows.length });
      });
    }
    return out;
  }

  // ============================================================
  // QSM Beauty Brand AD (CPM)
  // ============================================================
  var ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
  function unesc(s) { return String(s).replace(/&(amp|lt|gt|quot|nbsp|#39);|&#(\d+);/g, function (m, n, c) { return c ? String.fromCharCode(+c) : ENT[m] || m; }); }
  function cells(html) {
    var out = [], trs = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    trs.forEach(function (tr) {
      var c = (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map(function (x) { return unesc(x.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim(); });
      if (c.length) out.push(c);
    });
    return out;
  }
  function numOf(t) { t = String(t || "").replace(/[^\d.\-]/g, ""); return t && t !== "-" && t !== "." ? Math.trunc(Number(t)) : 0; }
  function dateOf(t) { var m = /(\d{4})\/(\d{2})\/(\d{2})/.exec(t || ""); return m ? m[1] + "-" + m[2] + "-" + m[3] : null; }
  function isNo(s) { return /^[\d,]+$/.test(s || ""); }
  function slash(s) { return String(s).replace(/-/g, "/"); }
  async function qsm(ctx, method, path, form, referer) {
    var r = await ctx.qsm(method, path, form, referer);
    if (/login\.aspx/i.test(r.url || "") || /QSM LOGIN/.test(String(r.text || "").slice(0, 3000))) throw new Error("QSM 로그인이 풀렸어요");
    return r;
  }

  async function cpmExtras(ctx, range) {
    var from = addD(range.end, -(CPM_DAYS - 1)); if (from < range.start) from = range.start;
    var to = range.end;
    ctx.progress("추가 수집 · Beauty Brand AD 캠페인 목록");
    var list = await qsm(ctx, "GET", "CPMList.aspx", null, "CPMManagementReport.aspx"), camps = [];
    cells(list.text).forEach(function (c) {
      if (c.length >= 9 && isNo(c[0])) camps.push({ campaign_no: numOf(c[0]), title: c[1], status: c[2], campaign_type: c[3], max_amt: numOf(c[4]), daily_budget: numOf(c[5]), total_budget: numOf(c[6]), start_dt: dateOf(c[7]), end_dt: dateOf(c[8]) });
    });
    if (!camps.length) throw new Error("CPM 캠페인 목록을 못 읽었어요 (화면 구조가 바뀌었을 수 있어요)");
    var active = camps.filter(function (c) { return c.start_dt && c.end_dt && c.status !== "キャンセル" && !((c.start_dt > from ? c.start_dt : from) > (c.end_dt < to ? c.end_dt : to)); });
    // 캠페인마다 키워드 목록을 동시에 받고, 그다음 (캠페인 × 일자)와 (캠페인 × 일자 × 키워드)를 모두 동시에 (사이트별 상한 아래에서)
    var kwLists = await Promise.all(active.map(function (c) {
      return qsm(ctx, "POST", "InnerAjax/CPMManagementAjaxSelect.aspx", { cpm_no: String(c.campaign_no), start_dt: slash(c.start_dt), end_dt: slash(c.end_dt), selectbox_type: "keyword" }, "CPMManagementKeywordReport.aspx")
        .then(function (sel) { var kws = []; String(sel.text).replace(/data-value="([^"]*)"/g, function (m, v) { kws.push(unesc(v)); return m; }); return kws; });
    }));
    var dailyT = [], kwT = [];
    active.forEach(function (c, i) {
      var a = c.start_dt > from ? c.start_dt : from, b = c.end_dt < to ? c.end_dt : to;
      daysIn(a, b).forEach(function (d) {
        dailyT.push(qsm(ctx, "POST", "InnerAjax/CPMManagementDetailList.aspx", { start_dt: slash(d), end_dt: slash(d), cpm_nos: String(c.campaign_no), tab_kind: "all" }, "CPMManagementReport.aspx")
          .then(function (r) { var out = []; cells(r.text).forEach(function (x) { if (x.length >= 14 && isNo(x[0]) && numOf(x[0]) === c.campaign_no) out.push({ base_date: d, campaign_no: c.campaign_no, impressions: numOf(x[9]), ad_cost: numOf(x[10]), detail_cnt: numOf(x[11]), purchase_cnt: numOf(x[12]) }); }); return out; }));
        kwLists[i].forEach(function (kw) {
          kwT.push(qsm(ctx, "POST", "InnerAjax/CPMManagementDetailList.aspx", { start_dt: slash(d), end_dt: slash(d), cpm_no: String(c.campaign_no), keywords: kw, tab_kind: "keyword" }, "CPMManagementKeywordReport.aspx")
            .then(function (r) { var out = []; cells(r.text).forEach(function (x) { if (x.length >= 2 && x[0] === kw && isNo(x[1])) out.push({ base_date: d, campaign_no: c.campaign_no, keyword: kw, impressions: numOf(x[1]) }); }); return out; }));
        });
      });
    });
    ctx.progress("추가 수집 · Beauty Brand AD " + active.length + "개 캠페인 (일자 " + dailyT.length + "건 · 키워드 " + kwT.length + "건 동시)");
    var res = await Promise.all([Promise.all(dailyT), Promise.all(kwT)]);
    var daily = [].concat.apply([], res[0]), kwrows = [].concat.apply([], res[1]);
    return [{ name: "Beauty Brand AD " + from + "~" + to, fn: "inni_replace_cpm", args: { p_from: from, p_to: to, p_campaigns: camps, p_daily: daily, p_keywords: kwrows }, expect: { daily: daily.length, keywords: kwrows.length } }];
  }

  // ============================================================
  // 실행: 판매자센터 · 광고센터 · QSM 묶음을 동시에. 한 묶음이 실패해도 나머지는 계속. 작업 목록은 정해진 순서
  // ============================================================
  async function run(ctx0, range) {
    var ctx = limited(ctx0), errors = [], want = function (n) { return !ctx0.only || ctx0.only.indexOf(n) >= 0; };   // ctx.only 는 시험용(일부 묶음만)
    function part(name, fn) {   // → Promise<jobs[]> (실패하면 errors 에 기록하고 빈 배열)
      if (!want(name)) return Promise.resolve([]);
      return Promise.resolve().then(fn).then(function (j) { return j || []; }, function (e) { errors.push({ name: name, message: (e && e.message) || String(e) }); return []; });
    }
    var lanes = [
      part("상품별 PV", function () { return sellerExtras(ctx, range); }),
      part("고객(일자)", function () { return customerExtras(ctx, range); }),
      part("찜·장바구니", function () { return custGoodsExtra(ctx); }),
      want("광고센터") ? (ctx.ads ? adsExtras(ctx, range, errors).then(function (o) { return o.cal.concat(o.daily, o.goods, o.kw); }, function (e) { errors.push({ name: "광고센터", message: (e && e.message) || String(e) }); return []; })
        : (errors.push({ name: "광고센터", message: "광고센터 로그인(토큰)을 받지 못해 건너뛰었어요" }), Promise.resolve([]))) : Promise.resolve([]),
      want("Beauty Brand AD") ? (ctx.qsm ? part("Beauty Brand AD", function () { return cpmExtras(ctx, range); })
        : (errors.push({ name: "Beauty Brand AD", message: "QSM 화면을 열지 못해 건너뛰었어요" }), Promise.resolve([]))) : Promise.resolve([])
    ];
    var res = await Promise.all(lanes);
    return { jobs: [].concat.apply([], res), errors: errors };
  }

  root.Q10Extra = { run: run, windows: windows, _t: { cells: cells, unesc: unesc, fetchPvGoodsChecked: fetchPvGoodsChecked, adDailyWindow: adDailyWindow, adGoodsDay: adGoodsDay, adKeywords: adKeywords, limiter: limiter } };
})(typeof self !== "undefined" ? self : globalThis);

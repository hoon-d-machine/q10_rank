/* DY-AI 데이터 화면: 수집해서 DB에 쌓인 원본 표를 보고, 엑셀(xlsx)로 내려받는다
 * 읽기는 Supabase RPC dy_data_page 로만 한다 (표는 잠겨 있음, supabase/data_view.sql).
 * 필요: dy.js(dyToast), auth.js(dyAuth), xlsx-writer.js(dyXlsx), dy-cal.js(dyCal)
 */
(function () {
  "use strict";

  var SIZES = [50, 100, 200];
  var FETCH = 1000;      // RPC 한 번에 가져오는 행 수 (함수 상한)
  var PARALLEL = 3;      // 엑셀 만들 때 동시에 보내는 요청 수
  var XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  function snake(s) { return s.replace(/[A-Z]/g, function (m) { return "_" + m.toLowerCase(); }); }

  // ---- 열 정의: [DB 열, 화면·엑셀 머리글]  (머리글은 구글 시트 raw_* 의 1행과 같음) ----
  var GOODS = [
    ["base_date", "날짜"], ["weekday", "요일"], ["brand_nm", "브랜드"], ["gd_nm", "상품명"], ["gd_no", "상품코드"],
    ["outer_gd_no", "외부상품코드"], ["buy_cnt", "수주수량"], ["cancel_cnt", "취소수량"], ["net_cnt", "순수량"],
    ["buy_bpv", "수주금액"], ["cancel_bpv", "취소금액"], ["net_bpv", "순수금액"],
    ["product_name", "제품명(상품코드표)"], ["line", "라인"], ["category", "카테고리"]
  ];
  var SALES = [
    ["base_year", "기준연도"], ["base_start_dt", "시작일"], ["base_end_dt", "종료일"], ["base_weekday_no", "요일"],
    ["base_week", "주"], ["base_month", "월"], ["buy_cnt", "주문건수"], ["cancel_cnt", "취소건수"],
    ["total_buy_cnt", "주문상품수량"], ["total_cancel_cnt", "취소상품수량"], ["final_total_buy_cnt", "총상품수량"],
    ["buy_bpv", "주문금액"], ["cancel_bpv", "취소금액"], ["final_buy_bpv", "총금액"]
  ];
  // 페이지뷰 62열: 영문 이름 목록(Qoo10_RPA.py CONVERSION_COLUMNS 와 같은 순서) + 시트에서 한글로 바꾼 머리글
  var PV_NAMES = ("baseYear baseStartDt baseEndDt baseWeekdayNo baseWeek baseMonth mainPv mnMegawariPv mnMegapoPv mnMyinterestPv " +
    "mnSpotlightBrandPv mnBestsellerPv mnBeautyRankingPv mnBeautyPv mnTimesalePv mnDailydealPv mnGroupbuyPv mnChancedealPv mnEtcPv " +
    "searchPv schKeywordplusPv schPowerrankPv schCpsPv schTimesalePv schEtcPv bestsellerPv beautyhubPv supplementhubPv dealPv " +
    "dlTodaysmegaPv dlTodaysmegaPoPv dlTimesalePv dlDailydealPv dlGroupbuyPv dlOnedaychancePv wishPv todaysviewPv cartPv " +
    "sellershopPv specialPv categoryPv vipPv catalogPv myPv livePv externalPv extGooglePv extFacebookPv extTwitterPv " +
    "extInstagramPv extYahooPv extKakakuPv extLinePv extEmailPv extOthersPv directurlPv etcPv totalPv userCnt addCnt " +
    "purchaseCnt purchaseRate").split(" ");
  var PV_RENAME = {
    baseYear: "기준연도", baseStartDt: "시작일", baseEndDt: "종료일", baseWeekdayNo: "요일", baseWeek: "주", baseMonth: "월",
    mainPv: "홈페이지", mnMegawariPv: "메가와리", mnMegapoPv: "메가포", mnMyinterestPv: "즐겨찾기", searchPv: "총 검색"
  };
  var PAGEVIEW = PV_NAMES.map(function (n) { return [snake(n), PV_RENAME[n] || n]; });
  var PRODUCTS = [["gd_no", "상품번호"], ["product_name", "제품명"], ["line", "라인"], ["category", "카테고리"]];

  // 랭킹 기록 (루트 data/*.csv 3개와 같은 내용, q10_rank_log)
  var RANK = [["rank_date", "일자"], ["category", "카테고리"], ["rank", "순위"], ["brand", "브랜드"], ["product_name", "상품명"], ["price", "가격"], ["period", "구분"]];

  // 쉼표를 넣지 않는 숫자 열 (연도·요일 번호 등)
  var PLAIN = { rank: 1, base_year: 1, base_weekday_no: 1, base_week: 1, base_month: 1 };
  var TEXTY = { gd_nm: 1, brand: 1, product_name: 1, brand_nm: 1 };

  var SOURCES = {
    goods:    { label: "일자·품목별 거래", cols: GOODS,    dated: true,  file: "품목별거래",
                hint: "상품명 · 브랜드 · 상품코드 · 제품명 · 라인 · 카테고리 검색" },
    sales:    { label: "일자별 거래",     cols: SALES,    dated: true,  file: "일자별거래", hint: "" },
    pageview: { label: "일자별 페이지뷰", cols: PAGEVIEW, dated: true,  file: "페이지뷰",   hint: "" },
    rank:     { label: "랭킹(일·주·월)", cols: RANK,   dated: true,  file: "랭킹",
                hint: "상품명 · 브랜드 · 카테고리 검색" },
    products: { label: "상품코드",        cols: PRODUCTS, dated: false, file: "상품코드",
                hint: "상품번호 · 제품명 · 라인 · 카테고리 검색" }
  };
  var ORDER = ["goods", "sales", "pageview", "rank", "products"];
  var BOUNDS_KEY = { goods: "goods", sales: "sales", pageview: "pageview", rank: "rank" };

  // ---- DOM ----
  var $ = function (s) { return document.querySelector(s); };
  var tabsEl = $(".js-tabs"), rangeBtn = $(".js-range"), clearBtn = $(".js-range-clear"), qIn = $(".js-q");
  var qWrap = $(".js-qwrap"), countEl = $(".js-count"), statusEl = $(".js-status"), wrap = $(".js-wrap");
  var thead = $(".js-thead"), tbody = $(".js-tbody"), prevBtn = $(".js-prev"), nextBtn = $(".js-next");
  var pageInfo = $(".js-pageinfo"), sizeSel = $(".js-size"), dlOne = $(".js-dl-one"), dlAll = $(".js-dl-all");

  var client = null, bounds = null;
  var cur = "goods";
  var st = {};            // 표마다 따로: { from, to, q, page, size }
  var reqSeq = 0, busy = false;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parse(s) { var a = s.split("-"); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
  function dayCount(a, b) { return Math.round((parse(b) - parse(a)) / 86400000) + 1; }
  function fmt(n) { return Number(n).toLocaleString("ko-KR"); }
  function toast(m) { if (window.dyToast) window.dyToast(m); }

  function state(src) {
    if (!st[src]) {
      var s = { from: null, to: null, q: "", page: 0, size: 100 };
      var b = bounds && bounds[BOUNDS_KEY[src]];
      if (SOURCES[src].dated && b && b.max) {      // 처음엔 데이터가 있는 마지막 30일
        s.to = b.max;
        s.from = b.min && addDays(b.max, -29) < b.min ? b.min : addDays(b.max, -29);
      }
      st[src] = s;
    }
    return st[src];
  }

  // ---- 서버 호출 (잠깐 실패하면 두 번까지 다시 시도) ----
  function rpc(src, s, offset, limit) {
    var args = {
      p_source: src, p_from: s.from || null, p_to: s.to || null,
      p_q: SOURCES[src].hint && s.q ? s.q : null, p_limit: limit, p_offset: offset
    };
    function once(n) {
      return client.rpc("dy_data_page", args).then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      }).catch(function (e) {
        if (n < 2 && !/login required|bad source|does not exist|schema cache/i.test(e.message || "")) {
          return new Promise(function (r) { setTimeout(r, 600 * (n + 1)); }).then(function () { return once(n + 1); });
        }
        throw e;
      });
    }
    return once(0);
  }

  function errText(e) {
    var m = (e && e.message) || String(e);
    if (/dy_data_page|Could not find the function|schema cache/i.test(m))
      return "데이터 조회 함수가 아직 없어요. Supabase SQL Editor 에서 dy-ai/supabase/data_view.sql 을 실행해 주세요.";
    if (/login required|JWT|expired/i.test(m)) return "로그인이 만료됐어요. 다시 로그인해 주세요.";
    return "불러오지 못했어요: " + m;
  }

  // ---- 표 그리기 ----
  function cellText(c, v) {
    if (v == null || v === "") return "";
    if (typeof v === "number") return PLAIN[c] ? String(v) : (Number.isInteger(v) ? fmt(v) : String(v));
    return String(v);
  }

  function renderHead(src) {
    thead.textContent = "";
    var tr = el("tr");
    SOURCES[src].cols.forEach(function (c) { var th = el("th", null, c[1]); th.scope = "col"; tr.appendChild(th); });
    thead.appendChild(tr);
  }

  function renderRows(src, rows) {
    tbody.textContent = "";
    var cols = SOURCES[src].cols;
    var frag = document.createDocumentFragment();
    rows.forEach(function (r) {
      var tr = el("tr");
      cols.forEach(function (c) {
        var v = r[c[0]];
        var td = el("td", typeof v === "number" ? "is-num" : "", cellText(c[0], v));
        if (TEXTY[c[0]] && v) td.title = v;
        tr.appendChild(td);
      });
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
  }

  function rangeLabel(s) {
    return s.from && s.to ? s.from + " ~ " + s.to + " (" + dayCount(s.from, s.to) + "일)" : "전체 기간";
  }

  function syncControls() {
    var src = SOURCES[cur], s = state(cur);
    tabsEl.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.src === cur ? "true" : "false"); });
    rangeBtn.hidden = !src.dated;
    clearBtn.hidden = !src.dated || !(s.from && s.to);
    rangeBtn.querySelector("span").textContent = rangeLabel(s);
    qWrap.hidden = !src.hint;
    qIn.placeholder = src.hint || "";
    if (qIn.value !== s.q) qIn.value = s.q;
    sizeSel.value = String(s.size);
    dlAll.title = "표 5개를 시트로 나눠 한 파일로 받아요 (기간 필터는 날짜가 있는 표 4개에 적용돼요)";
  }

  function setStatus(msg, kind) {
    statusEl.textContent = msg || "";
    statusEl.className = "data-status js-status" + (kind ? " is-" + kind : "");
    statusEl.hidden = !msg;
  }

  function load() {
    var src = cur, s = state(src), seq = ++reqSeq;
    syncControls();
    wrap.setAttribute("aria-busy", "true");
    setStatus("불러오는 중…", "load");
    return rpc(src, s, s.page * s.size, s.size).then(function (data) {
      if (seq !== reqSeq) return;            // 그 사이 다른 조건으로 바뀜
      var pages = Math.max(1, Math.ceil(data.total / s.size));
      if (s.page > 0 && s.page >= pages) { s.page = pages - 1; return load(); }
      renderHead(src);
      renderRows(src, data.rows);
      wrap.hidden = !data.rows.length;
      setStatus(data.rows.length ? "" : "조건에 맞는 데이터가 없어요. 기간을 넓히거나 검색어를 바꿔 보세요.", data.rows.length ? "" : "empty");
      var from = s.page * s.size + 1;
      countEl.textContent = data.total ? "총 " + fmt(data.total) + "행 · " + fmt(from) + "–" + fmt(from + data.rows.length - 1) + "행" : "총 0행";
      pageInfo.textContent = "페이지 " + fmt(s.page + 1) + " / " + fmt(pages);
      prevBtn.disabled = s.page <= 0;
      nextBtn.disabled = s.page >= pages - 1;
      wrap.setAttribute("aria-busy", "false");
      if (data.rows.length) wrap.scrollTop = 0;
    }).catch(function (e) {
      if (seq !== reqSeq) return;
      wrap.hidden = true; countEl.textContent = ""; pageInfo.textContent = "";
      prevBtn.disabled = nextBtn.disabled = true;
      setStatus(errText(e), "err");
      wrap.setAttribute("aria-busy", "false");
    });
  }

  // ---- 엑셀 ----
  function fetchAll(src, s, onProgress) {
    return rpc(src, s, 0, FETCH).then(function (first) {
      var total = first.total, parts = [first.rows], offsets = [], done = first.rows.length;
      for (var o = FETCH; o < total; o += FETCH) offsets.push(o);
      onProgress(done, total);
      var idx = 0;
      function worker() {
        if (idx >= offsets.length) return Promise.resolve();
        var my = idx++;
        return rpc(src, s, offsets[my], FETCH).then(function (r) {
          parts[my + 1] = r.rows; done += r.rows.length; onProgress(done, total);
          return worker();
        });
      }
      var ws = [];
      for (var i = 0; i < Math.min(PARALLEL, offsets.length); i++) ws.push(worker());
      return Promise.all(ws).then(function () {
        var rows = [].concat.apply([], parts);
        return { rows: rows, total: total };
      });
    });
  }

  function toSheet(src, rows) {
    var cols = SOURCES[src].cols;
    return {
      name: SOURCES[src].label,
      header: cols.map(function (c) { return c[1]; }),
      rows: rows.map(function (r) { return cols.map(function (c) { var v = r[c[0]]; return v == null ? "" : v; }); })
    };
  }

  function saveFile(bytes, filename) {
    var url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function today() { var d = new Date(); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }

  function setBusy(on) {
    busy = on;
    dlOne.disabled = dlAll.disabled = on;
    dlOne.classList.toggle("is-busy", on); dlAll.classList.toggle("is-busy", on);
  }

  // srcs: 내려받을 표 목록, useQuery: 검색어를 적용할지 (현재 표 한 개일 때만)
  function download(srcs, useQuery, nameLabel) {
    if (busy) return;
    setBusy(true);
    var sheets = [], problems = [], totals = [];
    var ref = state(cur);
    var chain = Promise.resolve();
    srcs.forEach(function (src) {
      chain = chain.then(function () {
        var own = state(src);
        var s = { from: own.from, to: own.to, q: useQuery ? own.q : "" };
        if (srcs.length > 1) { s.from = ref.from; s.to = ref.to; }    // 전체 받기: 지금 고른 기간을 모든 날짜 표에 적용
        return fetchAll(src, s, function (done, total) {
          setStatus("엑셀 만드는 중… " + SOURCES[src].label + " " + fmt(done) + " / " + fmt(total) + "행", "load");
        }).then(function (r) {
          if (r.rows.length !== r.total) problems.push(SOURCES[src].label);   // 받는 사이에 수집으로 행이 바뀐 경우
          totals.push(SOURCES[src].label + " " + fmt(r.rows.length) + "행");
          sheets.push(toSheet(src, r.rows));
        });
      });
    });
    return chain.then(function () {
      if (!sheets.some(function (x) { return x.rows.length; })) {
        setStatus("내려받을 데이터가 없어요. 기간이나 검색어를 확인해 주세요.", "empty");
        return;
      }
      setStatus("엑셀 파일 만드는 중…", "load");
      return Promise.resolve(window.dyXlsx.buildXlsx(sheets)).then(function (bytes) {
        var range = srcs.length > 1 || SOURCES[srcs[0]].dated ? (ref.from && ref.to ? ref.from + "_" + ref.to : "전체기간") : "";
        var name = "DY-AI_데이터_" + nameLabel + (range ? "_" + range : "") + "_" + today() + ".xlsx";
        saveFile(bytes, name);
        setStatus("");
        toast("엑셀을 내려받았어요 · " + totals.join(", "));
        if (problems.length) toast("받는 중에 데이터가 바뀌었을 수 있어요 (" + problems.join(", ") + "). 필요하면 다시 받아 주세요.");
      });
    }).catch(function (e) {
      setStatus("엑셀을 만들지 못했어요: " + ((e && e.message) || e), "err");
    }).then(function () { setBusy(false); if (statusEl.classList.contains("is-load")) setStatus(""); });
  }

  // ---- 이벤트 ----
  function reset() { state(cur).page = 0; load(); }

  ORDER.forEach(function (src) {
    var b = el("button", "data-tab", SOURCES[src].label);
    b.type = "button"; b.dataset.src = src; b.setAttribute("role", "tab");
    b.addEventListener("click", function () {
      if (busy || cur === src) return;
      cur = src;
      try { history.replaceState(null, "", "#" + src); } catch (e) {}
      load();
    });
    tabsEl.appendChild(b);
  });

  rangeBtn.addEventListener("click", function () {
    var s = state(cur), b = bounds && bounds[BOUNDS_KEY[cur]];
    window.dyCal.range({ anchor: rangeBtn, from: s.from, to: s.to, min: b && b.min, max: b && b.max }).then(function (r) {
      if (!r) return;
      s.from = r.from; s.to = r.to; reset();
    });
  });
  clearBtn.addEventListener("click", function () { var s = state(cur); s.from = s.to = null; reset(); });

  var qTimer = null;
  qIn.addEventListener("input", function () {
    clearTimeout(qTimer);
    qTimer = setTimeout(function () { var s = state(cur); s.q = qIn.value.trim(); reset(); }, 350);
  });
  sizeSel.addEventListener("change", function () { var s = state(cur); s.size = +sizeSel.value; s.page = 0; load(); });
  prevBtn.addEventListener("click", function () { var s = state(cur); if (s.page > 0) { s.page--; load(); } });
  nextBtn.addEventListener("click", function () { state(cur).page++; load(); });

  dlOne.addEventListener("click", function () { download([cur], true, SOURCES[cur].file); });
  dlAll.addEventListener("click", function () { download(ORDER.slice(), false, "전체"); });

  SIZES.forEach(function (n) { var o = el("option", null, n + "행씩"); o.value = String(n); sizeSel.appendChild(o); });

  // ---- 시작 ----
  window.dyAuth.requireLogin().then(function (sess) {
    if (!sess) return;
    client = window.dyAuth.client;
    var h = (location.hash || "").replace("#", "");
    if (SOURCES[h]) cur = h;
    return client.rpc("dy_dash_bounds").then(function (res) {
      bounds = res.error ? null : res.data;     // 범위를 못 읽어도 화면은 동작 (처음부터 전체 기간)
    }).then(load);
  });
})();

/* DY-AI 수집 결과 → Supabase DB + 구글 시트 (inni_RPA/Qoo10_RPA.py 와 같은 규칙)
 *   dyQ10Sync.run(payload, run) → Promise<{ ok, parts: [{ target, name, ok, message }] }>
 *   - DB: inni_replace_sales_goods / _sales_daily / _pageview_daily 로 cutoff(전전월 1일) 이후 구간을 한 번에 교체
 *         (로그인 사용자 권한으로 호출, supabase/web_collector.sql 필요)
 *   - 시트: Worker(/api/sheet/*)를 거쳐 raw_* 탭의 cutoff 이후 행부터 덮어쓰고, 남는 행은 비움
 *   - 행이 0개인 데이터셋은 건너뜀 (Python 과 같음)
 * 필요: auth.js(dyAuth), q10-log.js 의 run (없어도 됨)
 */
(function () {
  "use strict";

  var TRADE_COLUMNS = [
    "baseYear", "baseStartDt", "baseEndDt", "baseWeekdayNo", "baseWeek", "baseMonth",
    "buyCnt", "cancelCnt", "totalBuyCnt", "totalCancelCnt", "finalTotalBuyCnt",
    "buyBpv", "cancelBpv", "finalBuyBpv"
  ];
  var CONVERSION_COLUMNS = [
    "baseYear", "baseStartDt", "baseEndDt", "baseWeekdayNo", "baseWeek", "baseMonth",
    "mainPv", "mnMegawariPv", "mnMegapoPv", "mnMyinterestPv", "mnSpotlightBrandPv",
    "mnBestsellerPv", "mnBeautyRankingPv", "mnBeautyPv", "mnTimesalePv", "mnDailydealPv",
    "mnGroupbuyPv", "mnChancedealPv", "mnEtcPv", "searchPv", "schKeywordplusPv",
    "schPowerrankPv", "schCpsPv", "schTimesalePv", "schEtcPv", "bestsellerPv",
    "beautyhubPv", "supplementhubPv", "dealPv", "dlTodaysmegaPv", "dlTodaysmegaPoPv",
    "dlTimesalePv", "dlDailydealPv", "dlGroupbuyPv", "dlOnedaychancePv", "wishPv",
    "todaysviewPv", "cartPv", "sellershopPv", "specialPv", "categoryPv", "vipPv",
    "catalogPv", "myPv", "livePv", "externalPv", "extGooglePv", "extFacebookPv",
    "extTwitterPv", "extInstagramPv", "extYahooPv", "extKakakuPv", "extLinePv",
    "extEmailPv", "extOthersPv", "directurlPv", "etcPv", "totalPv", "userCnt",
    "addCnt", "purchaseCnt", "purchaseRate"
  ];
  function snake(s) { return s.replace(/([A-Z])/g, function (m) { return "_" + m.toLowerCase(); }); }

  // 시트명 → DB 함수, 열, 텍스트 열 (Qoo10_RPA.py SUPABASE_TARGETS)
  var DB = {
    raw_data: {
      fn: "inni_replace_sales_goods",
      cols: ["base_date", "weekday", "brand_nm", "gd_nm", "gd_no", "outer_gd_no",
        "buy_cnt", "cancel_cnt", "net_cnt", "buy_bpv", "cancel_bpv", "net_bpv"],
      text: { weekday: 1, brand_nm: 1, gd_nm: 1, gd_no: 1, outer_gd_no: 1 }
    },
    raw_trade: { fn: "inni_replace_sales_daily", cols: TRADE_COLUMNS.map(snake), text: {} },
    raw_conversion: { fn: "inni_replace_pageview_daily", cols: CONVERSION_COLUMNS.map(snake), text: {} }
  };
  var DATE_COLS = { base_date: 1, base_start_dt: 1, base_end_dt: 1 };
  var BATCH = 5000; // 시트 한 번에 올리는 행 수

  function toNum(v) {
    if (v === null || v === undefined) return null;
    var s = String(v).replace(/,/g, "").trim();
    if (s === "") return null;
    var f = Number(s);
    if (isNaN(f)) throw new Error("숫자가 아닌 값: " + v);
    return f;
  }
  function numOr(v) { // 시트용: 숫자로 바꿀 수 있으면 숫자, 아니면 그대로
    if (typeof v === "number") return v;
    var s = String(v == null ? "" : v).replace(/,/g, "").trim();
    return s !== "" && !isNaN(Number(s)) ? Number(s) : (v == null ? "" : v);
  }
  function fmt(n) { return Number(n).toLocaleString("ko-KR"); }
  function colName(n) { var s = ""; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

  // ---------- DB ----------
  function dbRows(name, rows) {
    var t = DB[name];
    return rows.map(function (r) {
      var d = {};
      t.cols.forEach(function (c, i) {
        var v = r[i];
        if (DATE_COLS[c]) d[c] = String(v == null ? "" : v).trim() || null;
        else if (t.text[c]) d[c] = v === "" || v == null ? null : String(v);
        else d[c] = toNum(v);
      });
      return d;
    });
  }

  async function syncDb(sheet, cutoff) {
    var t = DB[sheet.name];
    var payload = dbRows(sheet.name, sheet.rows);
    var res = await window.dyAuth.client.rpc(t.fn, { p_from: cutoff, p_rows: payload });
    if (res.error) {
      var m = res.error.message || String(res.error);
      if (/permission denied/i.test(m)) m += " (Supabase 에 supabase/web_collector.sql 을 실행해야 해요)";
      throw new Error(m);
    }
    if (res.data !== payload.length) throw new Error("보낸 " + payload.length + "행 중 " + res.data + "행만 반영됐어요");
    return payload.length;
  }

  // ---------- 시트 (Worker 경유) ----------
  async function api(method, path, body) {
    var s = await window.dyAuth.getSession();
    if (!s) throw new Error("로그인이 풀렸어요. 다시 로그인해 주세요");
    var r = await fetch(path, {
      method: method,
      headers: { Authorization: "Bearer " + s.access_token, "Content-Type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body)
    });
    var j = {};
    try { j = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error(j.error || ("서버 오류 " + r.status));
    return j;
  }

  function sheetRows(sheet) {
    var raw = sheet.name === "raw_data";
    var n = raw ? 12 : sheet.header.length;
    var rows = sheet.rows.map(function (r) {
      var out = [];
      for (var i = 0; i < n; i++) {
        var v = r[i];
        if (raw) out.push(i >= 6 ? numOr(v) : String(v == null ? "" : v));
        else out.push(i === 1 || i === 2 ? String(v == null ? "" : v) : numOr(v));
      }
      return out;
    });
    var di = sheet.dateIdx;
    rows.sort(function (a, b) { return String(a[di]).localeCompare(String(b[di])); });
    return rows;
  }

  async function syncSheet(sheet, cutoff, run) {
    var name = sheet.name;
    var raw = name === "raw_data";
    var ncol = raw ? 12 : sheet.header.length;
    var last = colName(ncol);
    var col = sheet.dateIdx === 0 ? "A" : "B";
    var rows = sheetRows(sheet);

    // 탭 확인 (없으면 헤더와 함께 생성)
    var prep = await api("POST", "/api/sheet/prepare", { name: name, rows: 1, cols: ncol, header: sheet.header.slice(0, ncol) });
    var dates = (await api("GET", "/api/sheet/col?name=" + name + "&col=" + col)).values;
    var oldTotal = dates.length; // 헤더 포함
    var start = null;
    for (var i = 1; i < dates.length; i++) {
      if (dates[i] && dates[i] >= cutoff) { start = i + 1; break; }
    }
    if (start === null) start = Math.max(oldTotal, 1) + 1;
    var newEnd = start + rows.length - 1;
    if (prep.rowCount < newEnd + 10) await api("POST", "/api/sheet/prepare", { name: name, rows: newEnd + 100, cols: ncol });

    for (var k = 0; k < rows.length; k += BATCH) {
      var part = rows.slice(k, k + BATCH);
      var s = start + k, e = s + part.length - 1;
      await api("PUT", "/api/sheet/values?name=" + name + "&range=A" + s + ":" + last + e, { values: part });
      if (run && rows.length > BATCH) run.step("시트 " + name, "info", s + "~" + e + "행 올림 (" + fmt(part.length) + "건)");
    }
    if (newEnd < oldTotal) await api("POST", "/api/sheet/clear?name=" + name + "&range=A" + (newEnd + 1) + ":" + last + oldTotal);
    return { kept: Math.max(start - 2, 0), added: rows.length, created: !!prep.created, removed: Math.max(oldTotal - newEnd, 0) };
  }

  // ---------- 전체 ----------
  async function run(p, log) {
    var parts = [];
    var cutoff = p.cutoff;
    var sheets = p.sheets.filter(function (s) { return s.rows && s.rows.length; });
    var L = log || { step: function () {} };

    // DB
    if (!window.dyAuth || !window.dyAuth.client) {
      parts.push({ target: "DB", name: "전체", ok: false, message: "Supabase 설정이 없어요" });
    } else {
      for (var i = 0; i < sheets.length; i++) {
        var sh = sheets[i];
        L.step("DB " + sh.name, "info", DB[sh.name].fn + " 호출 (" + cutoff + " 이후 " + fmt(sh.rows.length) + "행)");
        try {
          var n = await syncDb(sh, cutoff);
          parts.push({ target: "DB", name: sh.name, ok: true, message: fmt(n) + "행 교체" });
          L.step("DB " + sh.name, "ok", cutoff + " 이후 " + fmt(n) + "행 교체 완료");
        } catch (e) {
          parts.push({ target: "DB", name: sh.name, ok: false, message: e.message || String(e) });
          L.step("DB " + sh.name, "error", e.message || String(e));
        }
      }
    }

    // 시트
    var status = null;
    try { status = await api("GET", "/api/sheet/status"); }
    catch (e) { parts.push({ target: "시트", name: "전체", ok: false, message: e.message || String(e) }); L.step("시트", "error", e.message || String(e)); }
    if (status && !status.configured) {
      parts.push({ target: "시트", name: "전체", ok: false, message: "Worker 에 구글 시트 설정이 없어요" });
      L.step("시트", "error", "Worker 에 GOOGLE_SA_JSON / SHEET_ID 가 없어요");
    } else if (status) {
      L.step("시트", "info", "스프레드시트: " + status.title);
      for (var j = 0; j < sheets.length; j++) {
        var s2 = sheets[j];
        L.step("시트 " + s2.name, "info", cutoff + " 이후 " + fmt(s2.rows.length) + "행 덮어쓰기 시작");
        try {
          var r = await syncSheet(s2, cutoff, L);
          var msg = (r.created ? "새 탭 · " : "유지 " + fmt(r.kept) + " + ") + "새로 " + fmt(r.added) + "행" + (r.removed ? " · 남은 " + fmt(r.removed) + "행 비움" : "");
          parts.push({ target: "시트", name: s2.name, ok: true, message: msg });
          L.step("시트 " + s2.name, "ok", msg, r);
        } catch (e) {
          parts.push({ target: "시트", name: s2.name, ok: false, message: e.message || String(e) });
          L.step("시트 " + s2.name, "error", e.message || String(e));
        }
      }
    }
    return { ok: parts.every(function (x) { return x.ok; }), parts: parts };
  }

  window.dyQ10Sync = { run: run };
})();

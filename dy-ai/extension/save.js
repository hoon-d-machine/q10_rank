/* DY-AI Q10 수집 확장 — 저장 (수집기 페이지가 열려 있지 않을 때 확장이 대신 저장)
 *   public/assets/q10-sync.js(판매 3종: DB + 구글 시트)와 q10-extra.js(추가 항목)·q10-log.js(로그)를 같은 규칙으로 옮긴 것.
 *   로그인 정보는 사이트 페이지(auth.js)가 확장에 넘겨 둔 세션을 쓴다: { url, anonKey, origin, access_token, expires_at }.
 *   엑셀 원본 파일은 브라우저 보안상 페이지에서만 열 수 있어서 여기서는 건드리지 않는다(그때는 xlsx 를 내려받음).
 *
 *   Q10Save.save(payload, S, opt) → { ok, parts: [{ target, name, ok, message }], extra: { done, failed, errors, total } | null }
 *     payload = 확장이 수집한 결과 { sheets, cutoff, start, end, extra }
 *     opt = { runId, progress(text) }   runId 가 있으면 그 수집 건(dy_collect_runs)에 단계 로그를 이어 쓴다
 */
(function (root) {
  "use strict";

  var TRADE_COLUMNS = ["baseYear", "baseStartDt", "baseEndDt", "baseWeekdayNo", "baseWeek", "baseMonth", "buyCnt", "cancelCnt", "totalBuyCnt", "totalCancelCnt", "finalTotalBuyCnt", "buyBpv", "cancelBpv", "finalBuyBpv"];
  var CONVERSION_COLUMNS = ["baseYear", "baseStartDt", "baseEndDt", "baseWeekdayNo", "baseWeek", "baseMonth", "mainPv", "mnMegawariPv", "mnMegapoPv", "mnMyinterestPv", "mnSpotlightBrandPv",
    "mnBestsellerPv", "mnBeautyRankingPv", "mnBeautyPv", "mnTimesalePv", "mnDailydealPv", "mnGroupbuyPv", "mnChancedealPv", "mnEtcPv", "searchPv", "schKeywordplusPv", "schPowerrankPv", "schCpsPv",
    "schTimesalePv", "schEtcPv", "bestsellerPv", "beautyhubPv", "supplementhubPv", "dealPv", "dlTodaysmegaPv", "dlTodaysmegaPoPv", "dlTimesalePv", "dlDailydealPv", "dlGroupbuyPv", "dlOnedaychancePv",
    "wishPv", "todaysviewPv", "cartPv", "sellershopPv", "specialPv", "categoryPv", "vipPv", "catalogPv", "myPv", "livePv", "externalPv", "extGooglePv", "extFacebookPv", "extTwitterPv", "extInstagramPv",
    "extYahooPv", "extKakakuPv", "extLinePv", "extEmailPv", "extOthersPv", "directurlPv", "etcPv", "totalPv", "userCnt", "addCnt", "purchaseCnt", "purchaseRate"];
  function snake(s) { return s.replace(/([A-Z])/g, function (m) { return "_" + m.toLowerCase(); }); }
  var DB = {
    raw_data: { fn: "inni_replace_sales_goods", cols: ["base_date", "weekday", "brand_nm", "gd_nm", "gd_no", "outer_gd_no", "buy_cnt", "cancel_cnt", "net_cnt", "buy_bpv", "cancel_bpv", "net_bpv"],
      text: { weekday: 1, brand_nm: 1, gd_nm: 1, gd_no: 1, outer_gd_no: 1 } },
    raw_trade: { fn: "inni_replace_sales_daily", cols: TRADE_COLUMNS.map(snake), text: {} },
    raw_conversion: { fn: "inni_replace_pageview_daily", cols: CONVERSION_COLUMNS.map(snake), text: {} }
  };
  var DATE_COLS = { base_date: 1, base_start_dt: 1, base_end_dt: 1 };
  var BATCH = 5000;

  function toNum(v) {
    if (v === null || v === undefined) return null;
    var s = String(v).replace(/,/g, "").trim();
    if (s === "") return null;
    var f = Number(s);
    if (isNaN(f)) throw new Error("숫자가 아닌 값: " + v);
    return f;
  }
  function numOr(v) { if (typeof v === "number") return v; var s = String(v == null ? "" : v).replace(/,/g, "").trim(); return s !== "" && !isNaN(Number(s)) ? Number(s) : (v == null ? "" : v); }
  function fmt(n) { return Number(n).toLocaleString("ko-KR"); }
  function colName(n) { var s = ""; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function show(v) { return v && typeof v === "object" ? JSON.stringify(v) : String(v); }
  function same(got, expect) { return expect && typeof expect === "object" ? Object.keys(expect).every(function (k) { return got && got[k] === expect[k]; }) : got === expect; }

  // ---------- Supabase REST ----------
  function headers(S, extra) {
    var h = { apikey: S.anonKey, Authorization: "Bearer " + S.access_token, "Content-Type": "application/json" };
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }
  async function rpc(S, fn, args) {
    var r = await fetch(S.url.replace(/\/$/, "") + "/rest/v1/rpc/" + fn, { method: "POST", headers: headers(S), body: JSON.stringify(args) });
    var t = await r.text(), j = null;
    try { j = JSON.parse(t); } catch (e) {}
    if (!r.ok) {
      var m = (j && (j.message || j.error)) || t.slice(0, 200) || ("HTTP " + r.status);
      if (/permission denied|Could not find the function/i.test(m)) m += " (Supabase 에 supabase/web_collector.sql 을 실행해야 해요)";
      throw new Error(m);
    }
    return j;
  }
  async function restWrite(S, method, path, body) {   // 로그 표 쓰기 (실패해도 저장은 계속)
    try {
      var r = await fetch(S.url.replace(/\/$/, "") + "/rest/v1/" + path, { method: method, headers: headers(S, { Prefer: "return=minimal" }), body: JSON.stringify(body) });
      return r.ok;
    } catch (e) { return false; }
  }

  // ---------- 판매 3종: DB ----------
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
  async function syncDb(S, sheet, cutoff) {
    var t = DB[sheet.name], payload = dbRows(sheet.name, sheet.rows);
    var n = await rpc(S, t.fn, { p_from: cutoff, p_rows: payload });
    if (n !== payload.length) throw new Error("보낸 " + payload.length + "행 중 " + n + "행만 반영됐어요");
    return payload.length;
  }

  // ---------- 판매 3종: 구글 시트 (Worker /api/sheet/*) ----------
  async function api(S, method, path, body) {
    var r = await fetch(S.origin + path, { method: method, headers: { Authorization: "Bearer " + S.access_token, "Content-Type": "application/json" }, body: body == null ? undefined : JSON.stringify(body) });
    var j = {};
    try { j = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error(j.error || ("서버 오류 " + r.status));
    return j;
  }
  function sheetRows(sheet) {
    var raw = sheet.name === "raw_data", n = raw ? 12 : sheet.header.length;
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
  async function syncSheet(S, sheet, cutoff) {
    var name = sheet.name, raw = name === "raw_data", ncol = raw ? 12 : sheet.header.length, last = colName(ncol), col = sheet.dateIdx === 0 ? "A" : "B", rows = sheetRows(sheet);
    var prep = await api(S, "POST", "/api/sheet/prepare", { name: name, rows: 1, cols: ncol, header: sheet.header.slice(0, ncol) });
    var dates = (await api(S, "GET", "/api/sheet/col?name=" + name + "&col=" + col)).values, oldTotal = dates.length, start = null;
    for (var i = 1; i < dates.length; i++) { if (dates[i] && dates[i] >= cutoff) { start = i + 1; break; } }
    if (start === null) start = Math.max(oldTotal, 1) + 1;
    var newEnd = start + rows.length - 1;
    if (prep.rowCount < newEnd + 10) await api(S, "POST", "/api/sheet/prepare", { name: name, rows: newEnd + 100, cols: ncol });
    for (var k = 0; k < rows.length; k += BATCH) {
      var part = rows.slice(k, k + BATCH), s = start + k, e = s + part.length - 1;
      await api(S, "PUT", "/api/sheet/values?name=" + name + "&range=A" + s + ":" + last + e, { values: part });
    }
    if (newEnd < oldTotal) await api(S, "POST", "/api/sheet/clear?name=" + name + "&range=A" + (newEnd + 1) + ":" + last + oldTotal);
    return { kept: Math.max(start - 2, 0), added: rows.length, created: !!prep.created, removed: Math.max(oldTotal - newEnd, 0) };
  }

  // ---------- 전체 ----------
  async function save(payload, S, opt) {
    opt = opt || {};
    var progress = opt.progress || function () {}, runId = opt.runId || null, chain = Promise.resolve();
    function L(step, level, message) {   // 순서대로 한 줄씩 (로그 저장이 실패해도 저장은 계속)
      if (!runId) return;
      chain = chain.then(function () { return restWrite(S, "POST", "dy_collect_steps", { run_id: runId, step: step, level: level || "info", message: message == null ? null : String(message).slice(0, 2000), ts: new Date().toISOString() }); });
    }
    var parts = [], cutoff = payload.cutoff, sheets = (payload.sheets || []).filter(function (s) { return s.rows && s.rows.length; });
    L("저장(확장)", "info", "수집기 페이지가 닫혀 있어서 확장 프로그램이 DB·구글 시트·추가 항목을 대신 저장해요 (엑셀 원본은 페이지에서만 저장할 수 있어요)");
    if (runId) chain = chain.then(function () { return restWrite(S, "PATCH", "dy_collect_runs?id=eq." + runId, { period_start: payload.start || null, period_end: payload.end || null }); });
    var i, sh;
    for (i = 0; i < sheets.length; i++) {
      sh = sheets[i]; progress("저장 중 · DB " + sh.name);
      L("DB " + sh.name, "info", DB[sh.name].fn + " 호출 (" + cutoff + " 이후 " + fmt(sh.rows.length) + "행)");
      try { var n = await syncDb(S, sh, cutoff); parts.push({ target: "DB", name: sh.name, ok: true, message: fmt(n) + "행 교체" }); L("DB " + sh.name, "ok", cutoff + " 이후 " + fmt(n) + "행 교체 완료"); }
      catch (e) { parts.push({ target: "DB", name: sh.name, ok: false, message: e.message || String(e) }); L("DB " + sh.name, "error", e.message || String(e)); }
    }
    var st = null;
    try { st = await api(S, "GET", "/api/sheet/status"); } catch (e) { parts.push({ target: "시트", name: "전체", ok: false, message: e.message || String(e) }); L("시트", "error", e.message || String(e)); }
    if (st && !st.configured) { parts.push({ target: "시트", name: "전체", ok: false, message: "Worker 에 구글 시트 설정이 없어요" }); L("시트", "error", "Worker 에 구글 시트 설정이 없어요"); }
    else if (st) {
      L("시트", "info", "스프레드시트: " + st.title);
      for (i = 0; i < sheets.length; i++) {
        sh = sheets[i]; progress("저장 중 · 시트 " + sh.name);
        try {
          var r = await syncSheet(S, sh, cutoff), msg = (r.created ? "새 탭 · " : "유지 " + fmt(r.kept) + " + ") + "새로 " + fmt(r.added) + "행" + (r.removed ? " · 남은 " + fmt(r.removed) + "행 비움" : "");
          parts.push({ target: "시트", name: sh.name, ok: true, message: msg }); L("시트 " + sh.name, "ok", msg);
        } catch (e) { parts.push({ target: "시트", name: sh.name, ok: false, message: e.message || String(e) }); L("시트 " + sh.name, "error", e.message || String(e)); }
      }
    }
    // 추가 항목 (extra.js 가 만든 작업 목록)
    var ex = null;
    if (payload.extra) {
      ex = { done: 0, failed: [], errors: payload.extra.errors || [], total: (payload.extra.jobs || []).length };
      ex.errors.forEach(function (e) { L("추가 수집 · " + e.name, "error", "수집 실패: " + e.message); });
      var jobs = payload.extra.jobs || [];
      for (i = 0; i < jobs.length; i++) {
        var j = jobs[i]; progress("저장 중 · 추가 " + j.name);
        L("추가 · " + j.name, "info", j.fn + " 호출 (" + (typeof j.expect === "number" ? fmt(j.expect) + "행" : show(j.expect)) + ")");
        try {
          var got = await rpc(S, j.fn, j.args);
          if (!same(got, j.expect)) throw new Error("보낸 " + show(j.expect) + " 중 " + show(got) + " 만 반영됐어요");
          ex.done++; L("추가 · " + j.name, "ok", (typeof j.expect === "number" ? fmt(j.expect) + "행" : show(j.expect)) + " 반영 완료");
        } catch (e) { ex.failed.push({ name: j.name, message: e.message || String(e) }); L("추가 · " + j.name, "error", e.message || String(e)); }
      }
    }
    var bad = parts.filter(function (x) { return !x.ok; }), exBad = ex ? ex.failed.length + ex.errors.length : 0, ok = !bad.length && !exBad;
    var line = "엑셀 - · DB " + (bad.some(function (x) { return x.target === "DB"; }) ? "✕" : "✓") + " · 시트 " + (bad.some(function (x) { return x.target === "시트"; }) ? "✕" : "✓") +
      (ex ? " · 추가 " + (exBad ? "✕ " + exBad + "건" : "✓ " + ex.done + "건") : "");
    if (runId) {
      chain = chain.then(function () { return restWrite(S, "PATCH", "dy_collect_runs?id=eq." + runId, { status: ok ? "ok" : "partial", ended_at: new Date().toISOString(),
        summary: (line + " (" + payload.start + " ~ " + payload.end + ") — 확장 프로그램이 저장").slice(0, 1000) }); });
    }
    await chain;
    return { ok: ok, parts: parts, extra: ex, line: line };
  }

  root.Q10Save = { save: save, _t: { dbRows: dbRows, sheetRows: sheetRows } };
})(typeof self !== "undefined" ? self : globalThis);

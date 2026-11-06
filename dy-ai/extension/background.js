/* DY-AI Q10 수집 - 서비스 워커
 * 흐름 (inni_RPA/Qoo10_RPA.py 와 동일한 API·컬럼):
 *   1. seller.qoo10.jp 거래 페이지 탭을 연다
 *   2. 로그인 안 돼 있으면 QSM 로그인 화면에서 사람이 로그인할 때까지 기다린다
 *   3. 페이지가 보내는 API 요청에서 Authorization / X-SELL-CUST-NO 헤더를 잡는다
 *   4. 그 탭 안에서(같은 출처라 쿠키·Origin 그대로) API를 호출해 수집한다
 *   5. 결과를 DY-AI 페이지로 넘긴다 → 페이지가 원본 엑셀의 시트를 덮어쓰거나 새 파일로 저장
 *      (페이지가 없으면/구버전 페이지면 여기서 xlsx 를 만들어 다운로드)
 */
importScripts("xlsx-writer.js");

// ============================================================
// 상수
// ============================================================
var QSM_LOGIN_URL = "https://qsm.qoo10.jp/GMKT.INC.Gsm.Web/login.aspx";
var SELLER_TRADE_URL = "https://seller.qoo10.jp/ko/trade";
var TEST_API_URL = "https://seller.qoo10.jp/api/transaction/table/goods";
var DATE_GOODS_API_URL = "https://seller.qoo10.jp/api/transaction/table/date-goods";
var TRADE_API_URL = "https://seller.qoo10.jp/api/transaction/table/date";
var CONVERSION_API_URL = "https://seller.qoo10.jp/api/pageview/table/date";

var LOGIN_WAIT_MS = 10 * 60 * 1000;   // 로그인 대기 최대 10분
var TOKEN_WAIT_MS = 15 * 1000;        // 판매자 페이지에서 토큰이 안 잡히면 로그인 필요로 판단
var MAX_DAYS_PER_REQUEST = 31;
var MAX_RETRY = 3;

var WEEKDAYS = { 1: "월", 2: "화", 3: "수", 4: "목", 5: "금", 6: "토", 7: "일" };

var RAW_DATA_COLUMNS = [
  "날짜", "요일", "브랜드", "상품명", "상품코드", "외부상품코드",
  "수주수량", "취소수량", "순수량", "수주금액", "취소금액", "순수금액"
];

var TRADE_COLUMNS = [
  "baseYear", "baseStartDt", "baseEndDt", "baseWeekdayNo", "baseWeek", "baseMonth",
  "buyCnt", "cancelCnt", "totalBuyCnt", "totalCancelCnt", "finalTotalBuyCnt",
  "buyBpv", "cancelBpv", "finalBuyBpv"
];
var TRADE_HEADERS = [
  "기준연도", "시작일", "종료일", "요일", "주", "월", "주문건수", "취소건수",
  "주문상품수량", "취소상품수량", "총상품수량", "주문금액", "취소금액", "총금액"
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
var CONVERSION_RENAME = {
  baseYear: "기준연도", baseStartDt: "시작일", baseEndDt: "종료일",
  baseWeekdayNo: "요일", baseWeek: "주", baseMonth: "월",
  mainPv: "홈페이지", mnMegawariPv: "메가와리", mnMegapoPv: "메가포",
  mnMyinterestPv: "즐겨찾기", searchPv: "총 검색"
};
var CONVERSION_HEADERS = CONVERSION_COLUMNS.map(function (c) { return CONVERSION_RENAME[c] || c; });

// ============================================================
// 상태
// ============================================================
var job = null; // { dyTabId, tabId, token, custNo, deliver }

function UserError(msg) { this.message = msg; }

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function status(state, text) {
  if (!job || job.dyTabId == null) return;
  chrome.tabs.sendMessage(job.dyTabId, { type: "q10-status", state: state, text: text }).catch(function () {});
}

// 판매자 페이지가 보내는 요청에서 인증 헤더 캡처 (Qoo10_RPA.py 의 capture_request 와 동일)
chrome.webRequest.onSendHeaders.addListener(function (d) {
  if (!job || d.tabId !== job.tabId) return;
  (d.requestHeaders || []).forEach(function (h) {
    var n = h.name.toLowerCase();
    var v = h.value || "";
    if (n === "authorization" && /^(bearer\s+)?ey/i.test(v)) job.token = v;
    if (n === "x-sell-cust-no" && v) job.custNo = v;
  });
}, { urls: ["https://seller.qoo10.jp/*"] }, ["requestHeaders", "extraHeaders"]);

chrome.runtime.onMessage.addListener(function (msg, sender) {
  if (!msg || msg.type !== "q10-collect" || !sender.tab) return;
  if (job) {
    chrome.tabs.sendMessage(sender.tab.id, { type: "q10-status", state: "busy", text: "이미 수집 중이에요. 끝날 때까지 기다려 주세요." }).catch(function () {});
    return;
  }
  run(sender.tab.id, msg.deliver === "page" ? "page" : "download");
});

// ============================================================
// 날짜 / 기간
// ============================================================
function ymd(d) {
  var m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
}
function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }

// 기본 기간: 전전월 1일 ~ 어제
function defaultRange() {
  var now = new Date();
  var yesterday = addDays(now, -1);
  var start = new Date(yesterday.getFullYear(), yesterday.getMonth() - 2, 1);
  return { start: start, end: yesterday };
}

// 월 단위 기간 (date-goods)
function monthPeriods(start, end) {
  var out = [];
  var cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    var monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    var pe = monthEnd < end ? monthEnd : end;
    out.push({ label: ymd(cur).slice(0, 7), start: ymd(cur), end: ymd(pe) });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return out;
}

// 31일 단위 기간 (trade / conversion)
function splitPeriods(start, end) {
  var out = [];
  var cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cur <= end) {
    var pe = addDays(cur, MAX_DAYS_PER_REQUEST - 1);
    if (pe > end) pe = end;
    out.push({ start: ymd(cur), end: ymd(pe) });
    cur = addDays(pe, 1);
  }
  return out;
}

// ============================================================
// 판매자 탭 안에서 API 호출 (같은 출처 → 쿠키/Origin/Referer 가 실제 페이지와 동일)
// ============================================================
function pageFetch(url, payload, token, custNo) {
  var headers = { "Content-Type": "application/json", "Accept": "application/json, text/plain, */*" };
  if (token) headers["Authorization"] = token;
  if (custNo) headers["X-SELL-CUST-NO"] = custNo;
  return fetch(url, { method: "POST", headers: headers, body: JSON.stringify(payload), credentials: "include" })
    .then(function (r) {
      return r.text().then(function (t) {
        var body = null;
        try { body = JSON.parse(t); } catch (e) {}
        return { status: r.status, body: body };
      });
    })
    .catch(function (e) { return { status: 0, error: String(e) }; });
}

function execFetch(url, payload) {
  return chrome.scripting.executeScript({
    target: { tabId: job.tabId },
    func: pageFetch,
    args: [url, payload, job.token, job.custNo]
  }).then(function (res) {
    return (res && res[0] && res[0].result) || { status: 0, error: "no result" };
  }).catch(function (e) {
    return { status: 0, error: String(e && e.message || e) };
  });
}

// 재시도 + 인증 만료 처리
async function callApi(url, payload) {
  var last = null;
  for (var attempt = 0; attempt <= MAX_RETRY; attempt++) {
    var r = await execFetch(url, payload);
    if (r.status === 200 && r.body) return r.body;
    if (r.status === 401 || r.status === 403) throw new UserError("Qoo10 로그인이 만료됐어요. 다시 'Q10 수집'을 눌러 로그인해 주세요.");
    last = r;
    if (attempt < MAX_RETRY) await sleep(2000 * Math.pow(2, attempt));
  }
  throw new UserError("Qoo10 API 호출 실패 (" + (last && (last.status || last.error)) + ")");
}

function testPayload() {
  var y = addDays(new Date(), -1);
  return {
    dateType: "D", startDt: ymd(addDays(y, -1)), endDt: ymd(y),
    from: 0, page: 0, size: 1, gdNos: [], gdlcCds: [], sortCd: "", sortType: "Desc"
  };
}

// ============================================================
// 로그인 대기
// ============================================================
function hostOf(url) { try { return new URL(url).hostname; } catch (e) { return ""; } }

async function waitForAuth() {
  var deadline = Date.now() + LOGIN_WAIT_MS;
  var loginNotified = false, lastNav = Date.now(), sellerSince = 0, errors = 0;

  async function go(url) {
    lastNav = Date.now(); sellerSince = 0;
    await chrome.tabs.update(job.tabId, { url: url });
  }

  while (Date.now() < deadline) {
    var tab;
    try { tab = await chrome.tabs.get(job.tabId); }
    catch (e) { throw new UserError("Qoo10 창이 닫혀서 수집을 멈췄어요."); }

    var url = tab.pendingUrl || tab.url || "";
    var host = hostOf(url);
    var loading = tab.status !== "complete";
    var settled = !loading && Date.now() - lastNav > 3000;

    var isLogin = /login\.aspx/i.test(url) || (host === "seller.qoo10.jp" && /\/login/i.test(url));
    if (isLogin) {
      sellerSince = 0;
      if (!loginNotified) {
        loginNotified = true;
        status("login", "Qoo10 로그인 창에서 로그인해 주세요. 로그인이 끝나면 자동으로 수집을 시작해요.");
        chrome.tabs.update(job.tabId, { active: true }).catch(function () {});
        if (tab.windowId != null) chrome.windows.update(tab.windowId, { focused: true }).catch(function () {});
      }
    } else if (host === "qsm.qoo10.jp" && settled) {
      // QSM 로그인 완료 후 돌아온 화면 → 판매자 거래 페이지로 (토큰 발급)
      job.token = null;
      await go(SELLER_TRADE_URL);
    } else if (host === "seller.qoo10.jp" && !loading) {
      if (!sellerSince) sellerSince = Date.now();
      if (job.token) {
        var r = await execFetch(TEST_API_URL, testPayload());
        if (r.status === 200) return;
        if (r.status === 401 || r.status === 403) {
          job.token = null;
          await go(QSM_LOGIN_URL);
        } else if (++errors >= 5) {
          throw new UserError("Qoo10 판매자 API가 응답하지 않아요 (" + (r.status || r.error) + ")");
        }
      } else if (Date.now() - sellerSince > TOKEN_WAIT_MS && settled) {
        await go(QSM_LOGIN_URL);
      }
    } else if (settled && host !== "qsm.qoo10.jp" && host !== "seller.qoo10.jp") {
      // 다른 곳으로 이동해 버렸으면 다시 판매자 페이지로
      await go(SELLER_TRADE_URL);
    }
    await sleep(1000);
  }
  throw new UserError("로그인 대기 시간(10분)이 지나 수집을 멈췄어요.");
}

// ============================================================
// 수집 (Qoo10_RPA.py 의 collect_data / collect_trade_data / collect_conversion_data)
// ============================================================
function listOf(body, label, warnings) {
  var items = (body && body.datas) || [];
  var total = (body && body.totalCnt) || 0;
  if (items.length < total) warnings.push(label + " " + items.length + "/" + total + "건만 받음");
  return items;
}

async function collectDateGoods(range, warnings) {
  var periods = monthPeriods(range.start, range.end);
  var rows = [];
  for (var i = 0; i < periods.length; i++) {
    var p = periods[i];
    status("progress", "수집 중 (1/3) 일자·품목별 거래 " + p.label + " [" + (i + 1) + "/" + periods.length + "]");
    var body = await callApi(DATE_GOODS_API_URL, {
      dateType: "D", startDt: p.start, endDt: p.end, from: 0, size: 9999,
      gdNos: [], gdlcCds: [], sortCd: "D1", sortType: "Desc"
    });
    listOf(body, "date-goods " + p.label, warnings).forEach(function (it) {
      var buy = it.totalBuyCnt || 0, cancel = it.totalCancelCnt || 0;
      var bpv = it.buyBpv || 0, cbpv = it.cancelBpv || 0;
      rows.push([
        it.baseStartDt || "", WEEKDAYS[it.baseWeekdayNo] || "", it.brandNm || "", it.gdNm || "",
        it.gdNo || "", it.outerGdNo || "",
        buy, cancel, buy - cancel, bpv, cbpv, bpv - cbpv
      ]);
    });
  }
  rows.sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); });
  return rows;
}

async function collectDaily(range, url, columns, sortCd, step, label, warnings) {
  var periods = splitPeriods(range.start, range.end);
  var rows = [];
  for (var i = 0; i < periods.length; i++) {
    var p = periods[i];
    status("progress", "수집 중 (" + step + "/3) " + label + " " + p.start + "~" + p.end + " [" + (i + 1) + "/" + periods.length + "]");
    var body = await callApi(url, {
      dateType: "D", startDt: p.start, endDt: p.end, from: 0, page: 0, size: 9999,
      gdNos: [], gdlcCds: [], sortCd: sortCd, sortType: "Desc"
    });
    listOf(body, label + " " + p.start, warnings).forEach(function (it) {
      rows.push(columns.map(function (c) { var v = it[c]; return v === undefined || v === null ? "" : v; }));
    });
    if (i < periods.length - 1) await sleep(1000); // API 부하 방지
  }
  rows.sort(function (a, b) { return String(a[1]).localeCompare(String(b[1])); });
  return rows;
}

// ============================================================
// 다운로드
// ============================================================
function toBase64(bytes) {
  var bin = "", CHUNK = 0x8000;
  for (var i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

async function downloadXlsx(filename, sheets) {
  var bytes = await self.buildXlsx(sheets);
  var url = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + toBase64(bytes);
  return chrome.downloads.download({ url: url, filename: filename, conflictAction: "uniquify", saveAs: false });
}

// ============================================================
// 실행
// ============================================================
// 수집 결과를 DY-AI 페이지로 보낸다. 페이지가 받았다고 답하면 true
async function deliverToPage(payload) {
  try {
    var ack = await chrome.tabs.sendMessage(job.dyTabId, { type: "q10-status", state: "data", text: "수집 완료! 엑셀에 저장하는 중…", payload: payload });
    return !!(ack && ack.ok);
  } catch (e) {
    return false;
  }
}

async function run(dyTabId, deliver) {
  job = { dyTabId: dyTabId, tabId: null, token: null, custNo: null, deliver: deliver };
  // 수집 중 서비스 워커가 잠들지 않도록 주기적으로 확장 API 호출
  var keepAlive = setInterval(function () { chrome.runtime.getPlatformInfo(function () {}); }, 20000);

  try {
    status("progress", "Qoo10 판매자 페이지를 여는 중…");
    var tab = await chrome.tabs.create({ url: SELLER_TRADE_URL, active: true });
    job.tabId = tab.id;

    await waitForAuth();
    status("progress", "Qoo10 로그인 확인 완료. 수집을 시작해요.");
    chrome.tabs.update(dyTabId, { active: true }).catch(function () {});

    var range = defaultRange();
    var warnings = [];
    var dataRows = await collectDateGoods(range, warnings);
    var tradeRows = await collectDaily(range, TRADE_API_URL, TRADE_COLUMNS, "", 2, "일자별 거래", warnings);
    var convRows = await collectDaily(range, CONVERSION_API_URL, CONVERSION_COLUMNS, "N0G", 3, "페이지뷰", warnings);

    var now = new Date();
    var stamp = ymd(now).replace(/-/g, "") + "_" + String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0");
    var filename = "Qoo10_RPA_data_" + stamp + ".xlsx";
    // dateIdx: 기존 파일에서 남길 행을 고를 날짜 열 (Qoo10_RPA.py 와 동일)
    var sheets = [
      { name: "raw_data", header: RAW_DATA_COLUMNS, rows: dataRows, dateIdx: 0 },
      { name: "raw_trade", header: TRADE_HEADERS, rows: tradeRows, dateIdx: 1 },
      { name: "raw_conversion", header: CONVERSION_HEADERS, rows: convRows, dateIdx: 1 }
    ];
    chrome.tabs.remove(job.tabId).catch(function () {});

    if (job.deliver === "page") {
      var delivered = await deliverToPage({
        sheets: sheets, cutoff: ymd(range.start), start: ymd(range.start), end: ymd(range.end),
        filename: filename, warnings: warnings
      });
      if (delivered) return; // 저장·완료 안내는 페이지가 한다
    }

    status("progress", "엑셀 파일 만드는 중…");
    await downloadXlsx(filename, sheets);
    var summary = filename + " 다운로드 완료 (" + ymd(range.start) + " ~ " + ymd(range.end) +
      ", 품목별 " + dataRows.length + "행 · 거래 " + tradeRows.length + "행 · 페이지뷰 " + convRows.length + "행)";
    if (warnings.length) summary += " ⚠ 일부 누락 가능: " + warnings.join(", ");
    status("done", summary);
  } catch (e) {
    var msg = e instanceof UserError ? e.message : "수집 중 오류가 났어요: " + (e && e.message || e);
    console.error("[DY-AI Q10]", e);
    status("error", msg);
  } finally {
    clearInterval(keepAlive);
    job = null;
  }
}

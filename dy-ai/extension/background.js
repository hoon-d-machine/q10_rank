/* DY-AI Q10 수집 - 서비스 워커
 * 흐름 (inni_RPA/Qoo10_RPA.py 와 동일한 API·컬럼):
 *   1. seller.qoo10.jp 거래 페이지 탭을 연다
 *   2. 로그인 안 돼 있으면 QSM 로그인 화면에서 사람이 로그인할 때까지 기다린다
 *   3. 페이지가 보내는 API 요청에서 Authorization / X-SELL-CUST-NO 헤더를 잡는다
 *   4. 그 탭 안에서(같은 출처라 쿠키·Origin 그대로) API를 호출해 수집한다
 *   5. (0.5.0~) 추가 수집(extra.js): 상품별 PV·고객·찜장바구니(판매자센터), 광고센터(새 탭에서 토큰), Beauty Brand AD(QSM 탭) → DB 에 호출할 작업 목록
 *   6. 결과를 DY-AI 페이지로 넘긴다 → 페이지가 원본 엑셀의 시트를 덮어쓰거나 새 파일로 저장하고, 추가 작업 목록을 DB 에 반영
 *      (페이지가 없으면/구버전 페이지면 여기서 xlsx 를 만들어 다운로드 — 이때는 추가 수집을 하지 않는다)
 */
importScripts("xlsx-writer.js", "extra.js");

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
var job = null; // { dyTabId, tabId, token, custNo, deliver, adsTabId, adsToken, qsmTabId }

function UserError(msg) { this.message = msg; }

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function status(state, text) {
  if (!job || job.dyTabId == null) return;
  chrome.tabs.sendMessage(job.dyTabId, { type: "q10-status", state: state, text: text }).catch(function () {});
}

// 판매자 페이지가 보내는 요청에서 인증 헤더 캡처 (Qoo10_RPA.py 의 capture_request 와 동일)
chrome.webRequest.onSendHeaders.addListener(function (d) {
  if (!job) return;
  var ads = job.adsTabId != null && d.tabId === job.adsTabId;   // 광고센터 탭이 보내는 요청에서는 광고센터 토큰만 잡는다
  if (!ads && d.tabId !== job.tabId) return;
  (d.requestHeaders || []).forEach(function (h) {
    var n = h.name.toLowerCase();
    var v = h.value || "";
    if (n === "authorization" && /^(bearer\s+)?ey/i.test(v)) { if (ads) job.adsToken = v; else job.token = v; }
    if (!ads && n === "x-sell-cust-no" && v) job.custNo = v;
  });
}, { urls: ["https://seller.qoo10.jp/*", "https://ads.qoo10.jp/*"] }, ["requestHeaders", "extraHeaders"]);

chrome.runtime.onMessage.addListener(function (msg, sender) {
  if (!msg || msg.type !== "q10-collect" || !sender.tab) return;
  if (job) {
    chrome.tabs.sendMessage(sender.tab.id, { type: "q10-status", state: "busy", text: "이미 수집 중이에요. 끝날 때까지 기다려 주세요." }).catch(function () {});
    return;
  }
  run(sender.tab.id, msg.deliver === "page" ? "page" : "download");
});

// ---------- QSM 로그인 자동 입력 (qsm-login.js) · 설정 화면 ----------
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg) return;
  if (msg.type === "qsm-autofill") {
    // 수집 중에 확장이 연 탭에만 로그인 정보를 줌
    if (!job || !sender.tab || sender.tab.id !== job.tabId) { sendResponse(null); return; }
    chrome.storage.local.get("qsmLogin").then(function (o) {
      var v = o.qsmLogin;
      sendResponse(v && v.id && v.auto !== false ? { id: v.id, pw: v.pw || "", ep: v.ep || "" } : null);
    }, function () { sendResponse(null); });
    return true; // 비동기 응답
  }
  if (msg.type === "qsm-autofill-done") {
    if (!job || !sender.tab || sender.tab.id !== job.tabId) return;
    var text = {
      "login": "아이디·비밀번호를 자동으로 넣었어요. reCAPTCHA 확인 후 로그인 버튼을 눌러 주세요.",
      "login-id": "아이디를 자동으로 넣었어요. 비밀번호와 reCAPTCHA 확인 후 로그인 버튼을 눌러 주세요.",
      "ep": "로그인 뒤 아이디 확인 화면을 자동으로 넘겼어요.",
      "ep-nobutton": "아이디 확인 칸은 채웠는데 확인 버튼을 찾지 못했어요. 직접 눌러 주세요."
    }[msg.what];
    if (text) status(msg.what === "ep" ? "progress" : "login", text);
    return;
  }
  if (msg.type === "open-options") {
    chrome.runtime.openOptionsPage();
  }
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
  return fetch(url, { method: "POST", headers: headers, body: payload == null ? undefined : JSON.stringify(payload), credentials: "include" })
    .then(function (r) {
      return r.text().then(function (t) {
        var body = null;
        try { body = JSON.parse(t); } catch (e) {}
        return { status: r.status, body: body };
      });
    })
    .catch(function (e) { return { status: 0, error: String(e) }; });
}

// QSM 화면(HTML) 호출용: 그 탭 안에서 같은 출처로 호출해 쿠키·헤더가 실제 화면과 같게 한다
function pageFetchRaw(method, url, headers, bodyText) {
  return fetch(url, { method: method, headers: headers, body: bodyText == null ? undefined : bodyText, credentials: "include" })
    .then(function (r) { return r.text().then(function (t) { return { status: r.status, url: r.url, text: t }; }); })
    .catch(function (e) { return { status: 0, url: "", text: "", error: String(e) }; });
}

function execIn(tabId, func, args) {
  return chrome.scripting.executeScript({ target: { tabId: tabId }, func: func, args: args })
    .then(function (res) { return (res && res[0] && res[0].result) || { status: 0, error: "no result" }; })
    .catch(function (e) { return { status: 0, error: String(e && e.message || e) }; });
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
        var saved = (await chrome.storage.local.get("qsmLogin").catch(function () { return {}; })).qsmLogin;
        status("login", saved && saved.id && saved.auto !== false
          ? "Qoo10 로그인 창을 열었어요. 아이디·비밀번호는 자동으로 들어가요. 로그인이 끝나면 자동으로 수집을 시작해요."
          : "Qoo10 로그인 창에서 로그인해 주세요. (설명서의 '로그인 정보 설정'에 저장하면 아이디·비밀번호를 자동으로 넣어 줘요)");
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
// 경고 기준 (Qoo10_RPA.py 와 같음): totalCnt 가 요청 크기(9999)보다 크면 일부만 받았을 수 있음.
// 일자별 API 의 totalCnt 는 행 수가 아니라 합계(주문 수·페이지뷰 등)라서 받은 행 수와 비교하면 안 됨.
// 대신 일자별은 받은 행 수가 기간의 날짜 수보다 적으면 경고.
var PAGE_SIZE = 9999;
function listOf(body, label, warnings, days) {
  var items = (body && body.datas) || [];
  var total = (body && body.totalCnt) || 0;
  if (total > PAGE_SIZE) warnings.push(label + " 결과가 " + total + "건이라 " + PAGE_SIZE + "건까지만 받았을 수 있음");
  if (days && items.length < days) warnings.push(label + " " + days + "일 중 " + items.length + "일치만 받음");
  return items;
}
function daysBetween(s, e) { return Math.round((new Date(e) - new Date(s)) / 86400000) + 1; }

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
    listOf(body, label + " " + p.start + "~" + p.end, warnings, daysBetween(p.start, p.end)).forEach(function (it) {
      rows.push(columns.map(function (c) { var v = it[c]; return v === undefined || v === null ? "" : v; }));
    });
    if (i < periods.length - 1) await sleep(1000); // API 부하 방지
  }
  rows.sort(function (a, b) { return String(a[1]).localeCompare(String(b[1])); });
  return rows;
}

// ============================================================
// 추가 수집 (extra.js): 광고센터·QSM 는 각자 탭을 열어 그 안에서 호출한다
// ============================================================
async function waitTab(tabId, ms) {
  var until = Date.now() + ms;
  while (Date.now() < until) {
    try { var t = await chrome.tabs.get(tabId); if (t.status === "complete") return t; } catch (e) { return null; }
    await sleep(500);
  }
  return null;
}

// 광고센터: QSM 로그인(SSO)이 돼 있으면 열기만 해도 토큰이 붙은 요청이 나간다 → 그 헤더를 잡아 쓴다. 못 받으면 null
async function openAds() {
  try {
    var tab = await chrome.tabs.create({ url: "https://ads.qoo10.jp/conversion", active: false });
    job.adsTabId = tab.id; job.adsToken = null;
    var until = Date.now() + 45000;
    while (Date.now() < until && !job.adsToken) await sleep(800);
    if (!job.adsToken) return null;
    return async function (path, payload) {
      var last = null;
      for (var i = 0; i < 3; i++) {
        var r = await execIn(job.adsTabId, pageFetch, ["https://ads.qoo10.jp/api/" + path, payload, job.adsToken, null]);
        if (r.status === 200 && r.body) return r.body;
        if (r.status === 401 || r.status === 403) throw new Error("광고센터 토큰이 만료됐어요");
        last = r; await sleep(2000 * (i + 1));
      }
      throw new Error("광고센터 호출 실패 (" + (last && (last.status || last.error)) + ")");
    };
  } catch (e) { return null; }
}

// QSM Beauty Brand AD 화면: 그 화면 탭을 열고 안에서 호출
async function openQsm() {
  var BASE = "https://qsm.qoo10.jp/GMKT.INC.Gsm.Web/Promotion/";
  try {
    var tab = await chrome.tabs.create({ url: BASE + "CPMManagementReport.aspx", active: false });
    job.qsmTabId = tab.id;
    var t = await waitTab(tab.id, 30000);
    if (!t || /login\.aspx/i.test(t.url || "")) return null;
    return async function (method, path, form, referer) {
      var headers = { "Accept": "*/*" }, body = null;
      if (method === "POST") {
        headers["X-Requested-With"] = "XMLHttpRequest"; headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
        body = new URLSearchParams(form || {}).toString();
      }
      var r = null;
      for (var i = 0; i < 3; i++) {
        r = await execIn(job.qsmTabId, pageFetchRaw, [method, BASE + path, headers, body]);
        if (r.status === 200) return r;
        await sleep(1500 * (i + 1));
      }
      throw new Error("QSM 호출 실패 (" + (r && (r.status || r.error)) + ")");
    };
  } catch (e) { return null; }
}

function closeTabs() {
  [job && job.adsTabId, job && job.qsmTabId].forEach(function (id) { if (id != null) chrome.tabs.remove(id).catch(function () {}); });
  if (job) { job.adsTabId = null; job.qsmTabId = null; }
}

async function collectExtras(range) {
  var ctx = {
    sleep: sleep, today: function () { return ymd(new Date()); }, progress: function (t) { status("progress", t); },
    seller: callApi, ads: null, qsm: null
  };
  try {
    status("progress", "추가 수집 · 광고센터에 연결하는 중…");
    ctx.ads = await openAds();
    status("progress", "추가 수집 · Beauty Brand AD 화면에 연결하는 중…");
    ctx.qsm = await openQsm();
    return await self.Q10Extra.run(ctx, { start: ymd(range.start), end: ymd(range.end) });
  } catch (e) {
    if (e instanceof UserError) throw e;   // 판매자센터 로그인 만료는 사용자에게 알린다
    return { jobs: [], errors: [{ name: "추가 수집", message: (e && e.message) || String(e) }] };
  } finally { closeTabs(); }
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
    // 추가 수집 (페이지로 넘길 때만): 한 묶음이 실패해도 나머지는 계속, 판매 3종 결과는 그대로 둔다
    var extra = null;
    if (job.deliver === "page") {
      try { extra = await collectExtras(range); }
      catch (e) { if (e instanceof UserError) warnings.push("추가 수집 중단: " + e.message); else extra = { jobs: [], errors: [{ name: "추가 수집", message: (e && e.message) || String(e) }] }; }
    }
    chrome.tabs.remove(job.tabId).catch(function () {});

    if (job.deliver === "page") {
      var delivered = await deliverToPage({
        sheets: sheets, cutoff: ymd(range.start), start: ymd(range.start), end: ymd(range.end),
        filename: filename, warnings: warnings, extra: extra
      });
      if (delivered) return; // 저장·완료 안내는 페이지가 한다
      // 수집기 페이지가 열려 있지 않다(다른 페이지로 이동했거나 탭을 닫음): 결과를 보관해 두고, 수집기 페이지를 다시 열면 저장할지 물어본다
      try {
        await chrome.storage.local.set({ pendingResult: { savedAt: Date.now(), payload: {
          sheets: sheets, cutoff: ymd(range.start), start: ymd(range.start), end: ymd(range.end), filename: filename, warnings: warnings, extra: extra
        } } });
        warnings.push("수집기 페이지가 닫혀 있어서 결과를 보관해 뒀어요. DY-AI 수집기 페이지를 열면 DB·시트에 저장할지 물어봐요");
      } catch (e) { console.error("[DY-AI Q10] 결과 보관 실패", e); }
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

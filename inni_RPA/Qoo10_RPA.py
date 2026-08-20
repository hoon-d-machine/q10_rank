# -*- coding: utf-8 -*-
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import os
import json
import re
import time
import calendar
import logging
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

"""
Qoo10 RPA - QSM 로그인 및 세션 추출
1. Playwright로 QSM 로그인 페이지 표시
2. 사용자가 직접 로그인
3. 로그인 완료 감지 후 쿠키/세션 추출
4. Playwright 종료

수집 대상:
- raw_data: /api/transaction/table/date-goods (일자/품목별 거래)
- raw_trade: /api/transaction/table/date (일자별 거래)
- raw_conversion: /api/pageview/table/date (일자별 페이지뷰)
"""

# ============================================================
# 로깅 설정
# ============================================================
LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(LOG_DIR, exist_ok=True)

log_filename = os.path.join(LOG_DIR, f"qoo10_rpa_{datetime.now().strftime('%Y%m%d')}.log")

logger = logging.getLogger("qoo10_rpa")
logger.setLevel(logging.DEBUG)

fh = logging.FileHandler(log_filename, encoding='utf-8', mode='a')
fh.setLevel(logging.DEBUG)
fh.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s', datefmt='%Y-%m-%d %H:%M:%S'))
logger.addHandler(fh)

ch = logging.StreamHandler(sys.stdout)
ch.setLevel(logging.INFO)
ch.setFormatter(logging.Formatter('[%(levelname)s] %(message)s'))
logger.addHandler(ch)

logger.info(f"\n{'='*60}\n실행 시작: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n{'='*60}")
logger.info(f"로그 파일: {log_filename}")

# ============================================================
# QSM 로그인 설정
# ============================================================
QSM_LOGIN_URL = "https://qsm.qoo10.jp/GMKT.INC.Gsm.Web/login.aspx"
QSM_DOMAIN = "qsm.qoo10.jp"
LOGIN_TIMEOUT = 300  # 로그인 대기 최대 5분 (초)

# ============================================================
# 공통 유틸리티
# ============================================================
def get_env_path():
    """env 파일 경로 반환 (env 또는 .env)."""
    base = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(base, "env")
    if not os.path.exists(env_path):
        env_path = os.path.join(base, ".env")
    return env_path


def get_default_test_dates():
    """세션 검증용 기본 테스트 날짜 (최근 2일) 동적 생성."""
    yesterday = datetime.now().date() - timedelta(days=1)
    day_before = yesterday - timedelta(days=1)
    return day_before.strftime("%Y-%m-%d"), yesterday.strftime("%Y-%m-%d")


def build_test_payload(size=5):
    """세션 검증용 테스트 payload 생성."""
    start_dt, end_dt = get_default_test_dates()
    return {
        "dateType": "D", "startDt": start_dt, "endDt": end_dt,
        "from": 0, "page": 0, "size": size,
        "gdNos": [], "gdlcCds": [], "sortCd": "", "sortType": "Desc"
    }


def qsm_login():
    """QSM 로그인 페이지를 띄우고 로그인 완료 후 세션 정보를 반환.
    
    Returns:
        dict: {
            "cookies": list,        # 전체 쿠키 목록
            "session": requests.Session,  # 쿠키 주입된 requests 세션
            "headers": dict,        # 필요 헤더
        }
        또는 None (로그인 실패/타임아웃)
    """
    logger.info("=" * 60)
    logger.info("QSM 로그인 시작")
    logger.info(f"  URL: {QSM_LOGIN_URL}")
    logger.info(f"  타임아웃: {LOGIN_TIMEOUT}초")
    logger.info("=" * 60)
    
    with sync_playwright() as p:
        # Chromium headful 모드 (사용자에게 보이는 브라우저)
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={"width": 1280, "height": 900},
            locale="ja-JP",
        )
        page = context.new_page()
        
        # 로그인 페이지 이동
        logger.info("로그인 페이지 이동 중...")
        page.goto(QSM_LOGIN_URL, wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        logger.info("로그인 페이지 표시 완료")
        logger.info(f"  현재 URL: {page.url}")
        
        # ID/PW 자동 입력 (env 파일에서 읽기)
        from dotenv import dotenv_values
        env_path = get_env_path()
        env_vals = dotenv_values(env_path)
        login_id = env_vals.get("USER_ID", "")
        login_pw = env_vals.get("PASSWORD", "")
        
        if login_id and login_pw:
            try:
                page.locator('//*[@id="txtLoginID"]').fill(login_id)
                page.locator('//*[@id="txtLoginPwd"]').fill(login_pw)
                logger.info("  ID/PW 자동 입력 완료")
            except Exception as e:
                logger.warning(f"  자동 입력 실패: {e}")
        
        logger.info("")
        logger.info(">>> reCAPTCHA 인증 후 로그인 버튼을 클릭해주세요 <<<")
        logger.info("")
        
        # ep_id 입력창 대기 (로그인 버튼 클릭 후 나타남)
        try:
            ep_input = page.locator('//*[@id="ep_id"]')
            ep_input.wait_for(state="visible", timeout=LOGIN_TIMEOUT * 1000)
            logger.info("  EP 선택 화면 감지!")
            
            # ep_id에 아이디 입력 + 확인 버튼 클릭
            ep_input.fill(login_id)
            page.locator('xpath=//*[@id="subIdSection"]/div/div/a').click()
            logger.info("  EP 자동 선택 완료")
        except PlaywrightTimeout:
            logger.info("  EP 선택 없이 바로 로그인됨")
        except Exception as e:
            logger.warning(f"  EP 처리 실패: {e}")
        
        # 로그인 완료 대기 (URL 변경 감지)
        try:
            page.wait_for_url(
                lambda url: "login.aspx" not in url.lower(),
                timeout=30000  # EP 처리 후 30초 대기
            )
            logger.info(f"로그인 완료 감지!")
            logger.info(f"  리다이렉트 URL: {page.url}")
        except PlaywrightTimeout:
            logger.error(f"로그인 타임아웃")
            browser.close()
            return None
        
        # 페이지 완전 로딩 대기
        page.wait_for_load_state("networkidle")
        
        # ===== seller.qoo10.jp로 이동하여 Authorization 토큰 추출 =====
        logger.info("seller.qoo10.jp 토큰 추출 시작...")
        
        auth_token = None
        sell_cust_no = None
        
        def capture_request(request):
            nonlocal auth_token, sell_cust_no
            headers = request.headers
            if "authorization" in headers and headers["authorization"].startswith("ey"):
                auth_token = headers["authorization"]
                logger.debug(f"  Authorization 캡처: {auth_token[:50]}...")
            if "x-sell-cust-no" in headers:
                sell_cust_no = headers["x-sell-cust-no"]
                logger.debug(f"  X-SELL-CUST-NO 캡처: {sell_cust_no[:30]}...")
        
        page.on("request", capture_request)
        
        # seller.qoo10.jp 거래 페이지로 이동 (API 요청이 자동 발생)
        page.goto("https://seller.qoo10.jp/ko/trade", wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        
        # 토큰이 아직 없으면 잠시 대기 (XHR이 늦게 발생할 수 있음)
        if not auth_token:
            logger.info("  토큰 대기 중 (3초)...")
            page.wait_for_timeout(3000)
        
        if auth_token:
            logger.info(f"  Authorization 토큰 추출 완료!")
            logger.info(f"    토큰: {auth_token[:60]}...")
        else:
            logger.warning("  Authorization 토큰을 추출하지 못했습니다.")
            # localStorage에서 시도
            logger.info("  localStorage에서 토큰 검색 중...")
            try:
                storage = page.evaluate("() => { let r={}; for(let i=0;i<localStorage.length;i++){let k=localStorage.key(i); r[k]=localStorage.getItem(k);} return r; }")
                for k, v in storage.items():
                    if v and v.startswith("ey"):
                        auth_token = v
                        logger.info(f"    localStorage에서 발견: {k} = {v[:50]}...")
                        break
                    logger.debug(f"    {k}: {str(v)[:50]}")
            except Exception as e:
                logger.warning(f"  localStorage 접근 실패: {e}")
        
        if sell_cust_no:
            logger.info(f"  X-SELL-CUST-NO 추출 완료!")
        else:
            logger.warning("  X-SELL-CUST-NO를 추출하지 못했습니다.")
        
        # 쿠키 추출 (seller 도메인 포함)
        cookies = context.cookies()
        logger.info(f"쿠키 추출: {len(cookies)}개")
        for c in cookies:
            logger.debug(f"  {c['name']}: {c['value'][:30]}... (domain={c['domain']})")
        
        # 현재 페이지 URL, 타이틀 기록
        logger.info(f"  현재 페이지: {page.title()}")
        
        # requests.Session에 쿠키 주입
        session = requests.Session()
        for c in cookies:
            session.cookies.set(
                c["name"], c["value"],
                domain=c.get("domain", ""),
                path=c.get("path", "/"),
            )
        
        # 기본 헤더 설정
        user_agent = page.evaluate("navigator.userAgent")
        headers = {
            "User-Agent": user_agent,
            "Referer": "https://seller.qoo10.jp/ko/trade",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "Content-Type": "application/json",
            "Origin": "https://seller.qoo10.jp",
        }
        if auth_token:
            headers["Authorization"] = auth_token
        if sell_cust_no:
            headers["X-SELL-CUST-NO"] = sell_cust_no
        
        session.headers.update(headers)
        
        logger.info(f"  User-Agent: {user_agent[:60]}...")
        
        # 세션 검증 - seller API 호출 테스트
        logger.info("seller API 검증 중...")
        test_payload = build_test_payload(size=5)
        try:
            resp = session.post(
                "https://seller.qoo10.jp/api/transaction/table/goods",
                json=test_payload, timeout=15
            )
            if resp.status_code == 200:
                data = resp.json()
                logger.info(f"  seller API 성공! (status={resp.status_code})")
                logger.info(f"  응답: {json.dumps(data, ensure_ascii=False)[:200]}...")
            else:
                logger.warning(f"  seller API 실패: status={resp.status_code}, body={resp.text[:200]}")
        except Exception as e:
            logger.warning(f"  seller API 검증 오류: {e}")
        
        # 쿠키 + 토큰 파일로 저장
        cookie_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "qsm_cookies.json")
        save_data = {
            "cookies": cookies,
            "auth_token": auth_token,
            "sell_cust_no": sell_cust_no,
            "user_agent": user_agent,
            "saved_at": datetime.now().isoformat(),
        }
        with open(cookie_file, 'w', encoding='utf-8') as f:
            json.dump(save_data, f, ensure_ascii=False, indent=2)
        logger.info(f"세션 정보 저장: {cookie_file}")
        
        # 브라우저 종료
        browser.close()
        logger.info("Playwright 브라우저 종료")
        
        result = {
            "cookies": cookies,
            "session": session,
            "headers": headers,
            "auth_token": auth_token,
            "sell_cust_no": sell_cust_no,
        }
        
        logger.info("")
        logger.info("=" * 60)
        logger.info("QSM 로그인 완료. 세션 사용 준비됨.")
        logger.info("=" * 60)
        
        return result


# ============================================================
# 세션 로드 (저장된 세션 재사용 또는 신규 로그인)
# ============================================================
def load_session():
    """저장된 세션 로드. 만료 시 None 반환 (재로그인은 메인에서 처리)."""
    cookie_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "qsm_cookies.json")
    
    if not os.path.exists(cookie_file):
        logger.info("저장된 세션 파일 없음.")
        return None
    
    logger.info("저장된 세션 로드 중...")
    with open(cookie_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    session = requests.Session()
    for c in data.get("cookies", []):
        session.cookies.set(c["name"], c["value"],
            domain=c.get("domain",""), path=c.get("path","/"))
    
    headers = {
        "User-Agent": data.get("user_agent", ""),
        "Referer": "https://seller.qoo10.jp/ko/trade",
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "Origin": "https://seller.qoo10.jp",
    }
    if data.get("auth_token"):
        headers["Authorization"] = data["auth_token"]
    if data.get("sell_cust_no"):
        headers["X-SELL-CUST-NO"] = data["sell_cust_no"]
    session.headers.update(headers)
    
    # 세션 유효성 확인 (동적 날짜 사용)
    try:
        resp = session.post(
            "https://seller.qoo10.jp/api/transaction/table/goods",
            json=build_test_payload(size=1),
            timeout=10)
        if resp.status_code == 200:
            logger.info("  저장된 세션 유효!")
            return session
        else:
            logger.warning(f"  세션 만료 (status={resp.status_code}).")
    except Exception as e:
        logger.warning(f"  세션 검증 실패: {e}")
    
    return None


# ============================================================
# seller API 조회 (공통)
# ============================================================
# 재시도 백오프 설정
MAX_RETRY = 3
BACKOFF_BASE = 2  # 초 단위 지수 백오프: 2, 4, 8, 16...
MAX_DAYS_PER_REQUEST = 31  # API 요청 최대 기간 (31일 단위)


def fetch_api(session, url, payload, retry=MAX_RETRY):
    """seller API 공통 조회 함수 (재시도/백오프/세션 갱신 포함).
    
    Args:
        session: requests.Session
        url: API URL
        payload: 요청 payload
        retry: 실패 시 재시도 횟수 (지수 백오프 적용)
    
    Returns:
        dict (API 응답 JSON) or None
    """
    for attempt in range(retry + 1):
        try:
            resp = session.post(url, json=payload, timeout=60)
            
            if resp.status_code == 403 and attempt < retry:
                backoff = BACKOFF_BASE ** (attempt + 1)
                logger.warning(f"  세션 만료(403). 재로그인 후 재시도... (대기 {backoff}초)")
                result = qsm_login()
                if result:
                    # 세션 갱신
                    session.cookies.clear()
                    for c in result["cookies"]:
                        session.cookies.set(c["name"], c["value"],
                            domain=c.get("domain",""), path=c.get("path","/"))
                    session.headers.update(result["headers"])
                    time.sleep(backoff)
                    continue
                else:
                    logger.error("  재로그인 실패.")
                    return None
            
            if resp.status_code != 200:
                # 5xx 또는 429 등 일시적 오류는 백오프 후 재시도
                if resp.status_code >= 500 or resp.status_code == 429:
                    if attempt < retry:
                        backoff = BACKOFF_BASE ** (attempt + 1)
                        logger.warning(f"  서버 오류(status={resp.status_code}). {backoff}초 후 재시도...")
                        time.sleep(backoff)
                        continue
                logger.error(f"  API 오류: status={resp.status_code}, body={resp.text[:200]}")
                return None
            
            return resp.json()
        except requests.exceptions.Timeout:
            if attempt < retry:
                backoff = BACKOFF_BASE ** (attempt + 1)
                logger.warning(f"  API 타임아웃. {backoff}초 후 재시도...")
                time.sleep(backoff)
                continue
            logger.error(f"  API 타임아웃 - 재시도 초과")
            return None
        except requests.exceptions.ConnectionError:
            if attempt < retry:
                backoff = BACKOFF_BASE ** (attempt + 1)
                logger.warning(f"  연결 오류. {backoff}초 후 재시도...")
                time.sleep(backoff)
                continue
            logger.error(f"  연결 오류 - 재시도 초과")
            return None
        except Exception as e:
            logger.error(f"  API 요청 실패: {e}")
            return None
    
    return None


# ============================================================
# 기간 분할 (31일 단위)
# ============================================================
def split_periods(start_date, end_date, max_days=MAX_DAYS_PER_REQUEST):
    """시작일~종료일을 max_days 단위로 분할.
    
    Returns:
        list of (start_str, end_str)
    """
    start = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()
    
    periods = []
    current = start
    while current <= end:
        period_end = min(current + timedelta(days=max_days - 1), end)
        periods.append((current.strftime("%Y-%m-%d"), period_end.strftime("%Y-%m-%d")))
        current = period_end + timedelta(days=1)
    
    return periods


# ============================================================
# Trade API (일자별 거래) - /api/transaction/table/date
# ============================================================
TRADE_API_URL = "https://seller.qoo10.jp/api/transaction/table/date"

# Trade 시트 컬럼
TRADE_COLUMNS = [
    "baseYear", "baseStartDt", "baseEndDt", "baseWeekdayNo", "baseWeek", "baseMonth",
    "buyCnt", "cancelCnt", "totalBuyCnt", "totalCancelCnt", "finalTotalBuyCnt",
    "buyBpv", "cancelBpv", "finalBuyBpv"
]


def fetch_trade_date(session, start_dt, end_dt, size=9999):
    """Trade API 일자별 거래 데이터 조회 (31일 단위)."""
    payload = {
        "dateType": "D",
        "startDt": start_dt,
        "endDt": end_dt,
        "from": 0,
        "page": 0,
        "size": size,
        "gdNos": [],
        "gdlcCds": [],
        "sortCd": "",
        "sortType": "Desc",
    }
    
    data = fetch_api(session, TRADE_API_URL, payload)
    if data is None:
        return None
    
    total_cnt = data.get("totalCnt", 0)
    items = data.get("datas", [])
    
    logger.info(f"  Trade {start_dt}~{end_dt}: {len(items)}/{total_cnt}건")
    
    if len(items) < total_cnt:
        logger.warning(f"  size({size}) < totalCnt({total_cnt}). 데이터 누락 가능.")
    
    return items


def collect_trade_data(session, start_date, end_date):
    """Trade 데이터 수집 (31일 단위 분할)."""
    periods = split_periods(start_date, end_date)
    logger.info(f"Trade: {len(periods)}개 기간 (31일 단위)")
    
    all_rows = []
    for i, (s, e) in enumerate(periods, 1):
        logger.info(f"  [{i}/{len(periods)}] Trade {s}~{e}")
        items = fetch_trade_date(session, s, e)
        
        if items:
            for item in items:
                row = [item.get(col, "") for col in TRADE_COLUMNS]
                all_rows.append(row)
        
        logger.info(f"  → 누적 {len(all_rows)}행")
        time.sleep(1)  # API 부하 방지
    
    # 날짜순 정렬
    all_rows.sort(key=lambda r: r[1] if r and r[1] else "")
    logger.info(f"Trade 수집 완료: 총 {len(all_rows)}행")
    return all_rows


# ============================================================
# Conversion API (일자별 페이지뷰) - /api/pageview/table/date
# ============================================================
CONVERSION_API_URL = "https://seller.qoo10.jp/api/pageview/table/date"

# Conversion 시트 컬럼
CONVERSION_COLUMNS = [
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
]


def fetch_conversion_date(session, start_dt, end_dt, size=9999):
    """Conversion API 일자별 페이지뷰 데이터 조회 (31일 단위)."""
    payload = {
        "dateType": "D",
        "startDt": start_dt,
        "endDt": end_dt,
        "from": 0,
        "page": 0,
        "size": size,
        "gdNos": [],
        "gdlcCds": [],
        "sortCd": "N0G",
        "sortType": "Desc",
    }
    
    data = fetch_api(session, CONVERSION_API_URL, payload)
    if data is None:
        return None
    
    total_cnt = data.get("totalCnt", 0)
    items = data.get("datas", [])
    
    logger.info(f"  Conv {start_dt}~{end_dt}: {len(items)}/{total_cnt}건")
    
    if len(items) < total_cnt:
        logger.warning(f"  size({size}) < totalCnt({total_cnt}). 데이터 누락 가능.")
    
    return items


def collect_conversion_data(session, start_date, end_date):
    """Conversion 데이터 수집 (31일 단위 분할)."""
    periods = split_periods(start_date, end_date)
    logger.info(f"Conversion: {len(periods)}개 기간 (31일 단위)")
    
    all_rows = []
    for i, (s, e) in enumerate(periods, 1):
        logger.info(f"  [{i}/{len(periods)}] Conv {s}~{e}")
        items = fetch_conversion_date(session, s, e)
        
        if items:
            for item in items:
                row = [item.get(col, "") for col in CONVERSION_COLUMNS]
                all_rows.append(row)
        
        logger.info(f"  → 누적 {len(all_rows)}행")
        time.sleep(1)  # API 부하 방지
    
    # 날짜순 정렬
    all_rows.sort(key=lambda r: r[1] if r and r[1] else "")
    logger.info(f"Conversion 수집 완료: 총 {len(all_rows)}행")
    return all_rows


# ============================================================
# date-goods API (일자/품목별 거래) - /api/transaction/table/date-goods
# ============================================================
SELLER_API_URL = "https://seller.qoo10.jp/api/transaction/table/date-goods"


def fetch_date_goods(session, start_dt, end_dt, size=9999):
    """date-goods API 일자/품목별 거래 데이터 조회."""
    payload = {
        "dateType": "D",
        "startDt": start_dt,
        "endDt": end_dt,
        "from": 0,
        "size": size,
        "gdNos": [],
        "gdlcCds": [],
        "sortCd": "D1",
        "sortType": "Desc",
    }
    
    data = fetch_api(session, SELLER_API_URL, payload)
    if data is None:
        return None
    
    total_cnt = data.get("totalCnt", 0)
    items = data.get("datas", [])
    
    logger.info(f"  date-goods {start_dt}~{end_dt}: {len(items)}/{total_cnt}건")
    
    if len(items) < total_cnt:
        logger.warning(f"  size({size}) < totalCnt({total_cnt}). 데이터 누락 가능.")
    
    return items


# ============================================================
# 기간 계산 (월별)
# ============================================================
def calculate_periods(start_month=None, end_month=None):
    """월별 기간 리스트 생성.
    
    Args:
        start_month: "YYYY-MM" (기본: 전전월)
        end_month: "YYYY-MM" (기본: 당월, 어제까지)
    
    Returns:
        list of {label, start, end}
    """
    yesterday = datetime.now().date() - timedelta(days=1)
    
    if start_month:
        start = datetime.strptime(start_month, "%Y-%m").date()
    else:
        # 기본: 전전월 1일
        start = (yesterday.replace(day=1) - relativedelta(months=2))
    
    if end_month:
        end_dt = datetime.strptime(end_month, "%Y-%m").date()
        # 해당 월의 마지막 날
        end_last = end_dt.replace(day=calendar.monthrange(end_dt.year, end_dt.month)[1])
        # 어제보다 미래면 어제까지
        end_date = min(end_last, yesterday)
    else:
        end_date = yesterday
    
    periods = []
    current = start.replace(day=1)
    while current <= end_date:
        month_end = current.replace(day=calendar.monthrange(current.year, current.month)[1])
        period_end = min(month_end, end_date)
        
        label = current.strftime("%Y-%m")
        periods.append({
            "label": label,
            "start": current,
            "end": period_end,
        })
        current = month_end + timedelta(days=1)
    
    return periods


# ============================================================
# date-goods 데이터 수집
# ============================================================
def _collect_period(session, period):
    """단일 기간 date-goods 데이터 수집 (병렬 처리용 워커)."""
    WEEKDAYS = {1: "월", 2: "화", 3: "수", 4: "목", 5: "금", 6: "토", 7: "일"}
    
    label = period["label"]
    start_str = period["start"].strftime("%Y-%m-%d")
    end_str = period["end"].strftime("%Y-%m-%d")
    
    logger.info(f"[{label}] 데이터 수집 시작 ({start_str}~{end_str})")
    items = fetch_date_goods(session, start_str, end_str)
    
    rows = []
    if items:
        for item in items:
            buy_cnt = item.get("totalBuyCnt", 0) or 0
            cancel_cnt = item.get("totalCancelCnt", 0) or 0
            buy_bpv = item.get("buyBpv", 0) or 0
            cancel_bpv = item.get("cancelBpv", 0) or 0
            
            vals = [
                item.get("baseStartDt", ""),
                WEEKDAYS.get(item.get("baseWeekdayNo", 0), ""),
                item.get("brandNm", ""),
                item.get("gdNm", ""),
                item.get("gdNo", ""),
                item.get("outerGdNo", ""),
                buy_cnt,
                cancel_cnt,
                buy_cnt - cancel_cnt,
                buy_bpv,
                cancel_bpv,
                buy_bpv - cancel_bpv,
            ]
            rows.append(vals)
    
    logger.info(f"[{label}] 완료: {len(rows)}행")
    return rows


def collect_data(session, start_month=None, end_month=None, max_workers=3):
    """date-goods 데이터 수집 (월별 병렬 처리)."""
    periods = calculate_periods(start_month, end_month)
    logger.info(f"date-goods: 총 {len(periods)}개 기간, 병렬 워커 {max_workers}개")
    
    all_rows = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_map = {
            executor.submit(_collect_period, session, p): p["label"]
            for p in periods
        }
        
        for future in as_completed(future_map):
            label = future_map[future]
            try:
                rows = future.result()
                all_rows.extend(rows)
                logger.info(f"[{label}] → 누적 {len(all_rows)}행")
            except Exception as e:
                logger.error(f"[{label}] 수집 실패: {e}")
    
    # 날짜순 정렬
    all_rows.sort(key=lambda r: r[0] if r and r[0] else "")
    
    logger.info(f"\ndate-goods 수집 완료: 총 {len(all_rows)}행")
    return all_rows


# ============================================================
# env 파싱 (멀티라인 JSON 지원)
# ============================================================
def load_env_config():
    """SHEET_ID와 GOOGLE_JSON을 env 파일에서 직접 파싱."""
    env_path = get_env_path()
    with open(env_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    m = re.search(r'SHEET_ID\s*=\s*(.+)', content)
    sheet_id = m.group(1).strip() if m else ""
    
    json_start = content.find('GOOGLE_JSON')
    creds_info = None
    if json_start >= 0:
        brace_start = content.find('{', json_start)
        brace_end = content.rfind('}')
        if brace_start >= 0 and brace_end >= 0:
            creds_info = json.loads(content[brace_start:brace_end+1])
    
    return sheet_id, creds_info


# ============================================================
# 스프레드시트 업데이트 (공통)
# ============================================================
def get_gspread_client():
    """gspread 클라이언트 반환."""
    import gspread
    from google.oauth2.service_account import Credentials
    
    SHEET_ID, CREDS_INFO = load_env_config()
    if not SHEET_ID or not CREDS_INFO:
        logger.error("SHEET_ID 또는 GOOGLE_JSON을 env 파일에서 찾을 수 없습니다.")
        return None, None
    
    SCOPES = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]
    creds = Credentials.from_service_account_info(CREDS_INFO, scopes=SCOPES)
    gc = gspread.authorize(creds)
    
    sh = gc.open_by_key(SHEET_ID)
    return gc, sh


def update_spreadsheet_raw_data(data_rows):
    """raw_data 시트에서 전전월 1일 이후 행부터 새 데이터로 덮어쓰기.
    기존 데이터(전전월 이전)는 건드리지 않음.
    
    Args:
        data_rows: list of list (헤더 제외, 각 행 = [날짜, 요일, ...])
    """
    from gspread.utils import rowcol_to_a1
    
    gc, sh = get_gspread_client()
    if not sh:
        return False
    
    ws = sh.worksheet("raw_data")
    logger.info(f"스프레드시트: {sh.title} / {ws.title}")
    
    # 전전월 1일 계산
    yesterday = datetime.now().date() - timedelta(days=1)
    cutoff_date = (yesterday.replace(day=1) - relativedelta(months=2)).strftime("%Y-%m-%d")
    logger.info(f"기준일: {cutoff_date}")
    
    # 날짜 컬럼(A열)만 읽어서 cutoff 시작 행 찾기
    date_col = ws.col_values(1)  # A열 전체
    old_total = len(date_col)  # 기존 전체 행수 (헤더 포함)
    
    # cutoff_date 이상인 첫 행 찾기 (1-indexed, 헤더=1행)
    write_start = None
    for idx, val in enumerate(date_col):
        if idx == 0:  # 헤더 스킵
            continue
        if val >= cutoff_date:
            write_start = idx + 1  # 1-indexed
            break
    
    # cutoff 이상 데이터가 없으면 기존 데이터 끝 다음부터
    if write_start is None:
        write_start = old_total + 1
    
    logger.info(f"기존 데이터: {old_total - 1}행 (헤더 제외)")
    logger.info(f"덮어쓰기 시작: {write_start}행 (cutoff 이후)")
    logger.info(f"유지: {write_start - 2}행, 삭제 대상: {old_total - write_start + 1}행")
    
    # 새 데이터 변환 (수량/금액=int, 나머지=str)
    NUM_COLS = {6, 7, 8, 9, 10, 11}
    new_rows = []
    for r in data_rows:
        row = []
        for i, v in enumerate(r):
            if i in NUM_COLS:
                try:
                    row.append(int(v))
                except (ValueError, TypeError):
                    row.append(v)
            else:
                row.append(str(v))
        new_rows.append(row)
    
    # 날짜순 정렬
    new_rows.sort(key=lambda r: r[0])
    logger.info(f"신규 데이터: {len(new_rows)}행")
    
    col_count = 12  # 헤더 컬럼 수
    new_end = write_start + len(new_rows) - 1  # 새 데이터 끝 행
    
    try:
        # 시트 크기 확보
        if ws.row_count < new_end + 10:
            ws.resize(rows=new_end + 100)
        
        # 새 데이터 덮어쓰기 (cutoff 행부터)
        BATCH_SIZE = 5000
        for i in range(0, len(new_rows), BATCH_SIZE):
            batch = new_rows[i:i+BATCH_SIZE]
            s_row = write_start + i
            e_row = s_row + len(batch) - 1
            
            s_cell = rowcol_to_a1(s_row, 1)
            e_cell = rowcol_to_a1(e_row, col_count)
            
            ws.update(values=batch, range_name=f"{s_cell}:{e_cell}",
                      value_input_option='USER_ENTERED')
            logger.info(f"  업로드: {s_row}~{e_row}행 ({len(batch)}건)")
            
            if i + BATCH_SIZE < len(new_rows):
                time.sleep(2)
        
        # 기존 데이터가 더 길면 남은 행 비우기
        if new_end < old_total:
            empty_start = new_end + 1
            empty_rows = [[""] * col_count] * (old_total - new_end)
            s_cell = rowcol_to_a1(empty_start, 1)
            e_cell = rowcol_to_a1(old_total, col_count)
            ws.update(values=empty_rows, range_name=f"{s_cell}:{e_cell}")
            logger.info(f"  잔여 행 삭제: {empty_start}~{old_total}행")
        
        logger.info(f"\n스프레드시트 업데이트 완료! (유지:{write_start-2} + 신규:{len(new_rows)} = 총 {write_start-2+len(new_rows)}행)")
        return True
    
    except Exception as e:
        logger.error(f"스프레드시트 업로드 실패: {e}")
        return False


def update_spreadsheet_date_sheet(sheet_name, data_rows, columns, cutoff_days=62):
    """raw_trade / raw_conversion 시트 업데이트.
    cutoff_days 이전 데이터는 유지하고, 이후 데이터는 덮어쓰기.
    
    Args:
        sheet_name: 시트명 ("raw_trade" 또는 "raw_conversion")
        data_rows: list of list (헤더 제외)
        columns: 컬럼명 리스트
        cutoff_days: 덮어쓰기 기준일 (기본 62일 = 전전월 1일)
    """
    from gspread.utils import rowcol_to_a1
    
    gc, sh = get_gspread_client()
    if not sh:
        return False
    
    # 시트 존재 확인, 없으면 생성
    try:
        ws = sh.worksheet(sheet_name)
        logger.info(f"시트 '{sheet_name}' 기존 사용")
    except Exception:
        ws = sh.add_worksheet(title=sheet_name, rows=1000, cols=len(columns))
        logger.info(f"시트 '{sheet_name}' 신규 생성")
    
    # cutoff 날짜 계산 (전전월 1일)
    yesterday = datetime.now().date() - timedelta(days=1)
    cutoff_date = (yesterday.replace(day=1) - relativedelta(months=2)).strftime("%Y-%m-%d")
    logger.info(f"기준일: {cutoff_date}")
    
    # 날짜 컬럼(B열)만 읽어서 cutoff 시작 행 찾기
    date_col = ws.col_values(2)  # B열 (baseStartDt)
    old_total = len(date_col)  # 기존 전체 행수 (헤더 포함)
    
    # cutoff_date 이상인 첫 행 찾기 (1-indexed, 헤더=1행)
    write_start = None
    for idx, val in enumerate(date_col):
        if idx == 0:  # 헤더 스킵
            continue
        if val and val >= cutoff_date:
            write_start = idx + 1  # 1-indexed
            break
    
    # cutoff 이상 데이터가 없으면 기존 데이터 끝 다음부터
    if write_start is None:
        write_start = old_total + 1
    
    logger.info(f"기존 데이터: {old_total - 1}행 (헤더 제외)")
    logger.info(f"덮어쓰기 시작: {write_start}행 (cutoff 이후)")
    logger.info(f"유지: {write_start - 2}행, 삭제 대상: {old_total - write_start + 1}행")
    
    # 새 데이터 변환 (숫자는 int/float, 날짜는 str)
    new_rows = []
    for r in data_rows:
        row = []
        for i, v in enumerate(r):
            if i in (0, 3, 4, 5):  # baseYear, baseWeekdayNo, baseWeek, baseMonth
                try:
                    row.append(int(v))
                except (ValueError, TypeError):
                    row.append(v)
            elif i == len(columns) - 1 and "Rate" in columns[i]:  # purchaseRate
                try:
                    row.append(float(v))
                except (ValueError, TypeError):
                    row.append(v)
            elif i in (1, 2):  # baseStartDt, baseEndDt
                row.append(str(v))
            else:
                try:
                    row.append(int(v))
                except (ValueError, TypeError):
                    try:
                        row.append(float(v))
                    except (ValueError, TypeError):
                        row.append(v)
        new_rows.append(row)
    
    # 날짜순 정렬 (baseStartDt 기준)
    new_rows.sort(key=lambda r: r[1] if r and r[1] else "")
    logger.info(f"신규 데이터: {len(new_rows)}행")
    
    col_count = len(columns)
    new_end = write_start + len(new_rows) - 1  # 새 데이터 끝 행
    
    try:
        # 시트 크기 확보
        if ws.row_count < new_end + 10:
            ws.resize(rows=new_end + 100)
        
        # 새 데이터 덮어쓰기 (cutoff 행부터)
        BATCH_SIZE = 5000
        for i in range(0, len(new_rows), BATCH_SIZE):
            batch = new_rows[i:i+BATCH_SIZE]
            s_row = write_start + i
            e_row = s_row + len(batch) - 1
            
            s_cell = rowcol_to_a1(s_row, 1)
            e_cell = rowcol_to_a1(e_row, col_count)
            
            ws.update(values=batch, range_name=f"{s_cell}:{e_cell}",
                      value_input_option='USER_ENTERED')
            logger.info(f"  업로드: {s_row}~{e_row}행 ({len(batch)}건)")
            
            if i + BATCH_SIZE < len(new_rows):
                time.sleep(2)
        
        # 기존 데이터가 더 길면 남은 행 비우기
        if new_end < old_total:
            empty_start = new_end + 1
            empty_rows = [[""] * col_count] * (old_total - new_end)
            s_cell = rowcol_to_a1(empty_start, 1)
            e_cell = rowcol_to_a1(old_total, col_count)
            ws.update(values=empty_rows, range_name=f"{s_cell}:{e_cell}")
            logger.info(f"  잔여 행 삭제: {empty_start}~{old_total}행")
        
        logger.info(f"\n'{sheet_name}' 시트 업데이트 완료! (유지:{write_start-2} + 신규:{len(new_rows)} = 총 {write_start-2+len(new_rows)}행)")
        return True
    
    except Exception as e:
        logger.error(f"'{sheet_name}' 시트 업로드 실패: {e}")
        return False


# ============================================================
# 메인 실행
# ============================================================
if __name__ == "__main__":
    # 1. 세션 로드 (만료 시 자동 로그인)
    session = load_session()
    if not session:
        result = qsm_login()
        if not result:
            print("로그인 실패.")
            sys.exit(1)
        session = load_session()
        if not session:
            print("세션을 로드할 수 없습니다.")
            sys.exit(1)
    
    # 2. 수집 기간 계산
    yesterday = datetime.now().date() - timedelta(days=1)
    end_date = yesterday.strftime("%Y-%m-%d")
    
    # 3. date-goods 데이터 수집 (전전월~어제, 병렬 처리)
    logger.info("\n" + "="*60)
    logger.info("[1/3] date-goods 데이터 수집 (raw_data)")
    logger.info("="*60)
    data_rows = collect_data(session)
    
    # 4. Trade 데이터 수집 (전전월~어제, 31일 단위)
    logger.info("\n" + "="*60)
    logger.info("[2/3] Trade 데이터 수집 (raw_trade)")
    logger.info("="*60)
    start_month = (yesterday.replace(day=1) - relativedelta(months=2)).strftime("%Y-%m-%d")
    trade_rows = collect_trade_data(session, start_month, end_date)
    
    # 5. Conversion 데이터 수집 (전전월~어제, 31일 단위)
    logger.info("\n" + "="*60)
    logger.info("[3/3] Conversion 데이터 수집 (raw_conversion)")
    logger.info("="*60)
    conv_rows = collect_conversion_data(session, start_month, end_date)
    
    # 6. 스프레드시트 업데이트
    logger.info("\n" + "="*60)
    logger.info("스프레드시트 업데이트 시작")
    logger.info("="*60)
    
    if data_rows:
        logger.info("\n[raw_data] 시트 업데이트...")
        update_spreadsheet_raw_data(data_rows)
    
    if trade_rows:
        logger.info("\n[raw_trade] 시트 업데이트...")
        update_spreadsheet_date_sheet("raw_trade", trade_rows, TRADE_COLUMNS)
    
    if conv_rows:
        logger.info("\n[raw_conversion] 시트 업데이트...")
        update_spreadsheet_date_sheet("raw_conversion", conv_rows, CONVERSION_COLUMNS)
    
    logger.info("\n전체 프로세스 완료!")
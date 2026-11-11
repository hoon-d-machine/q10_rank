# -*- coding: utf-8 -*-
"""QSM 추가 수집 — 상품별 일자 PV · 고객(일자) · 고객-상품(찜·장바구니 스냅샷) → Supabase

  seller.qoo10.jp/api/pageview/table/date-goods  → inni_pageview_goods   (일자 × 상품, 유입 경로별 PV)
  seller.qoo10.jp/api/customer/table/date        → inni_customer_daily   (신규·기존 구매자, 팔로워, 샵 방문)
  seller.qoo10.jp/api/customer/table/goods       → inni_customer_goods   (상품별 찜·장바구니 '현재 누적' 스냅샷, 과거는 못 받음)

사용 (이 PC, QSM 로그인 세션이 필요):
  python qsm_extra.py --session-file 세션.json --from 2024-01-01 --to 2026-11-10   # 백필 (10일 단위로 교체)
  python qsm_extra.py --session-file 세션.json --snapshot                          # 찜·장바구니 오늘 스냅샷
  python qsm_extra.py --print-sql                                                  # 표·함수 SQL 출력 (supabase_schema_extra.sql)
Qoo10_RPA.py 의 일 수집이 끝나면 sync_range()/snapshot_customer_goods() 를 같은 세션으로 부른다.
세션 파일(JSON): {"cookie": "...", "auth": "Bearer 없는 JWT", "sell_cust_no": "...", "user_agent": "..."} — 저장소에 두지 말 것.
"""
import argparse
import json
import os
import re
import sys
import time
import logging
from datetime import date, datetime, timedelta

import requests

logger = logging.getLogger("qsm_extra")
API = "https://seller.qoo10.jp/api/"
WINDOW_DAYS = 10     # 한 번에 받아 한 번에 교체하는 기간 (본문 크기·재실행 단위)
PAUSE = 1.0          # 요청·DB 호출 사이 대기(초): 한꺼번에 몰아 쓰지 않기

# 상품별 PV 열 (판매자센터 응답의 fieldNm 순서). 일자별 페이지뷰(raw_conversion)와 같고 extTiktokPv 가 더 있다.
PV_FIELDS = (
    "mainPv mnMegawariPv mnMegapoPv mnMyinterestPv mnSpotlightBrandPv mnBestsellerPv mnBeautyRankingPv mnBeautyPv "
    "mnTimesalePv mnDailydealPv mnGroupbuyPv mnChancedealPv mnEtcPv searchPv schKeywordplusPv schPowerrankPv schCpsPv "
    "schTimesalePv schEtcPv bestsellerPv beautyhubPv supplementhubPv dealPv dlTodaysmegaPv dlTodaysmegaPoPv dlTimesalePv "
    "dlDailydealPv dlGroupbuyPv dlOnedaychancePv wishPv todaysviewPv cartPv sellershopPv specialPv categoryPv vipPv catalogPv "
    "myPv livePv externalPv extGooglePv extFacebookPv extTwitterPv extInstagramPv extTiktokPv extYahooPv extKakakuPv extLinePv "
    "extEmailPv extOthersPv directurlPv etcPv totalPv").split()
CUSTOMER_FIELDS = ["newbuyerCnt", "newbuyerRate", "existingbuyerCnt", "existingbuyerRate", "buyerCnt",
                   "shopFollowerInc", "shopFollowerCnt", "shopPageView"]


def snake(s):
    return re.sub(r"([A-Z])", lambda m: "_" + m.group(1).lower(), s)


PV_COLS = [snake(f) for f in PV_FIELDS]
CUSTOMER_COLS = [snake(f) for f in CUSTOMER_FIELDS]
RATE_COLS = {"newbuyer_rate", "existingbuyer_rate"}


# ---------------- SQL (표·교체 함수) ----------------
def schema_sql():
    pv_defs = ",\n  ".join(f"{c} integer" for c in PV_COLS)
    pv_cols = ", ".join(PV_COLS)
    pv_rec = ", ".join(f"{c} integer" for c in PV_COLS)
    cu_defs = ",\n  ".join(f"{c} {'numeric' if c in RATE_COLS else 'bigint'}" for c in CUSTOMER_COLS)
    cu_cols = ", ".join(CUSTOMER_COLS)
    cu_rec = ", ".join(f"{c} {'numeric' if c in RATE_COLS else 'bigint'}" for c in CUSTOMER_COLS)
    return f"""-- QSM 추가 수집 표 (상품별 일자 PV · 고객 일자 · 고객-상품 스냅샷) + 기간 교체 함수
-- 접근은 service_role(RPA·백필 스크립트)만: RLS 활성 + 권한 회수. 다시 실행해도 안전.

create table if not exists inni_pageview_goods (
  base_date date not null,
  gd_no text not null,
  brand_nm text,
  gd_nm text,
  outer_gd_no text,
  {pv_defs},
  collected_at timestamptz not null default now(),
  primary key (base_date, gd_no)
);
alter table inni_pageview_goods enable row level security;
revoke all on inni_pageview_goods from anon, authenticated;

create table if not exists inni_customer_daily (
  base_date date primary key,
  {cu_defs},
  collected_at timestamptz not null default now()
);
alter table inni_customer_daily enable row level security;
revoke all on inni_customer_daily from anon, authenticated;

-- 찜·장바구니는 '현재 누적값'이라 과거를 받을 수 없고, 수집한 날의 스냅샷으로만 쌓는다
create table if not exists inni_customer_goods (
  snapshot_date date not null,
  gd_no text not null,
  brand_nm text,
  gd_nm text,
  outer_gd_no text,
  wish_cnt bigint,
  basket_cnt bigint,
  collected_at timestamptz not null default now(),
  primary key (snapshot_date, gd_no)
);
alter table inni_customer_goods enable row level security;
revoke all on inni_customer_goods from anon, authenticated;

-- p_from~p_to(양끝 포함) 구간만 교체 (한 트랜잭션: 중간 실패 시 전부 롤백)
create or replace function inni_replace_pageview_goods(p_from date, p_to date, p_rows jsonb)
returns integer language plpgsql as $$
declare n integer;
begin
  delete from inni_pageview_goods where base_date between p_from and p_to;
  insert into inni_pageview_goods (base_date, gd_no, brand_nm, gd_nm, outer_gd_no, {pv_cols})
  select base_date, gd_no, brand_nm, gd_nm, outer_gd_no, {pv_cols}
  from jsonb_to_recordset(p_rows) as t(base_date date, gd_no text, brand_nm text, gd_nm text, outer_gd_no text, {pv_rec})
  where base_date between p_from and p_to;
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function inni_replace_pageview_goods(date, date, jsonb) from public, anon, authenticated;

create or replace function inni_replace_customer_daily(p_from date, p_to date, p_rows jsonb)
returns integer language plpgsql as $$
declare n integer;
begin
  delete from inni_customer_daily where base_date between p_from and p_to;
  insert into inni_customer_daily (base_date, {cu_cols})
  select base_date, {cu_cols}
  from jsonb_to_recordset(p_rows) as t(base_date date, {cu_rec})
  where base_date between p_from and p_to;
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function inni_replace_customer_daily(date, date, jsonb) from public, anon, authenticated;

create or replace function inni_replace_customer_goods(p_date date, p_rows jsonb)
returns integer language plpgsql as $$
declare n integer;
begin
  delete from inni_customer_goods where snapshot_date = p_date;
  insert into inni_customer_goods (snapshot_date, gd_no, brand_nm, gd_nm, outer_gd_no, wish_cnt, basket_cnt)
  select p_date, gd_no, brand_nm, gd_nm, outer_gd_no, wish_cnt, basket_cnt
  from jsonb_to_recordset(p_rows) as t(gd_no text, brand_nm text, gd_nm text, outer_gd_no text, wish_cnt bigint, basket_cnt bigint);
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function inni_replace_customer_goods(date, jsonb) from public, anon, authenticated;
"""


# ---------------- 세션·요청 ----------------
def session_from_file(path):
    s = json.load(open(path, encoding="utf-8"))
    sess = requests.Session()
    sess.headers.update({
        "accept": "application/json, text/plain, */*", "content-type": "application/json",
        "origin": "https://seller.qoo10.jp", "referer": "https://seller.qoo10.jp/ko/conversion",
        "user-agent": s.get("user_agent", ""), "authorization": s["auth"],
        "x-sell-cust-no": s["sell_cust_no"], "cookie": s["cookie"],
    })
    return sess


def _make_poster(session):
    """기본 호출기: 재시도(5xx·429·시간초과)만 하고 로그인 갱신은 하지 않는다. 401/403 이면 즉시 중단."""
    def post(endpoint, payload):
        for attempt in range(4):
            try:
                r = session.post(API + endpoint, json=payload, timeout=90)
            except requests.exceptions.RequestException as e:
                if attempt == 3:
                    raise RuntimeError(f"{endpoint} 요청 실패: {e}")
                time.sleep(2 ** (attempt + 1)); continue
            if r.status_code in (401, 403):
                raise PermissionError(f"{endpoint} 인증 실패({r.status_code}): 세션이 만료됐어요")
            if r.status_code >= 500 or r.status_code == 429:
                if attempt == 3:
                    raise RuntimeError(f"{endpoint} HTTP {r.status_code}")
                time.sleep(2 ** (attempt + 1)); continue
            if r.status_code != 200:
                raise RuntimeError(f"{endpoint} HTTP {r.status_code}: {r.text[:150]}")
            return r.json()
    return post


def _payload(start, end, sort, size=9999):
    return {"dateType": "D", "startDt": start, "endDt": end, "from": 0, "size": size,
            "gdNos": [], "gdlcCds": [], "sortCd": sort, "sortType": "Desc"}


def _num(v):
    return None if v is None or v == "" else v


# ---------------- 수집 ----------------
def fetch_pv_goods(post, start, end):
    """일자×상품 PV. 반환: DB 형식 dict 목록"""
    j = post("pageview/table/date-goods", _payload(start, end, "D1"))
    items = j.get("datas") or []
    if len(items) < (j.get("totalCnt") or 0):
        raise RuntimeError(f"pageview/date-goods {start}~{end}: {len(items)}/{j.get('totalCnt')}건만 받음 (size 부족)")
    rows = []
    for it in items:
        gd = str(it.get("gdNo") or "").strip()
        d = str(it.get("baseStartDt") or "")[:10]
        if not gd or not d:
            continue
        r = {"base_date": d, "gd_no": gd, "brand_nm": it.get("brandNm"), "gd_nm": it.get("gdNm"), "outer_gd_no": it.get("outerGdNo")}
        for f, c in zip(PV_FIELDS, PV_COLS):
            r[c] = _num(it.get(f))
        rows.append(r)
    return rows


def fetch_customer_daily(post, start, end):
    j = post("customer/table/date", _payload(start, end, "N0"))
    rows = []
    for it in j.get("datas") or []:
        d = str(it.get("baseStartDt") or "")[:10]
        if not d:
            continue
        r = {"base_date": d}
        for f, c in zip(CUSTOMER_FIELDS, CUSTOMER_COLS):
            r[c] = _num(it.get(f))
        rows.append(r)
    return rows


def fetch_customer_goods(post):
    j = post("customer/table/goods", {**_payload("", "", "N0"), "startDt": "", "endDt": ""})
    items = j.get("datas") or []
    if len(items) < (j.get("totalCnt") or 0):
        raise RuntimeError(f"customer/goods {len(items)}/{j.get('totalCnt')}건만 받음")
    return [{"gd_no": str(it.get("gdNo")), "brand_nm": it.get("brandNm"), "gd_nm": it.get("gdNm"), "outer_gd_no": it.get("outerGdNo"),
             "wish_cnt": _num(it.get("wishCnt")), "basket_cnt": _num(it.get("basketCnt"))} for it in items if it.get("gdNo")]


# ---------------- DB ----------------
def _supabase():
    base = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(base, "env") if os.path.exists(os.path.join(base, "env")) else os.path.join(base, ".env")
    t = open(path, encoding="utf-8").read()
    g = lambda k: (re.search(rf"^{k}\s*=\s*(.+)$", t, re.M) or [None, ""])[1].strip().strip("\"'")
    return g("SUPABASE_URL").rstrip("/"), g("SUPABASE_KEY")


def rpc(fn, args):
    url, key = _supabase()
    if not url or not key:
        raise RuntimeError("SUPABASE_URL/SUPABASE_KEY 가 env 에 없어요")
    h = {"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json"}
    for attempt in range(3):
        r = requests.post(f"{url}/rest/v1/rpc/{fn}", headers=h, json=args, timeout=120)
        if r.status_code == 200:
            return r.json()
        if attempt == 2:
            raise RuntimeError(f"{fn} 실패 {r.status_code}: {r.text[:200]}")
        time.sleep(2 ** (attempt + 1))   # 교체 함수는 다시 실행해도 결과가 같다


def windows(start, end, days=WINDOW_DAYS):
    a = datetime.strptime(start, "%Y-%m-%d").date(); b = datetime.strptime(end, "%Y-%m-%d").date()
    while a <= b:
        e = min(a + timedelta(days=days - 1), b)
        yield a.isoformat(), e.isoformat()
        a = e + timedelta(days=1)


def fetch_store_pv(post, start, end):
    """스토어 전체 일자별 총 PV {날짜: totalPv} — 상품별 합계 검증용"""
    j = post("pageview/table/date", _payload(start, end, "D1"))
    return {str(d.get("baseStartDt"))[:10]: d.get("totalPv") for d in (j.get("datas") or [])}


def fetch_pv_goods_checked(post, a, b, tries=4, log=print):
    """판매자센터가 가끔 일부 행만 돌려줘서(2026-11 백필 때 확인), 일자별 상품 PV 합계가
    스토어 총 PV와 같을 때까지 다시 받는다. 끝까지 안 맞으면 예외."""
    for t in range(tries):
        pv = fetch_pv_goods(post, a, b)
        store = fetch_store_pv(post, a, b)
        got = {}
        for r in pv:
            got[r["base_date"]] = got.get(r["base_date"], 0) + (r["total_pv"] or 0)
        bad = {d: (got.get(d, 0), v) for d, v in store.items() if v is not None and got.get(d, 0) != v}
        if not bad:
            return pv
        log(f"  [검증] {a}~{b} 상품PV 합계 불일치 {len(bad)}일 (예: {next(iter(bad.items()))}) — 다시 받음 {t + 1}/{tries}")
        time.sleep(PAUSE * 3)
    raise RuntimeError(f"상품PV {a}~{b}: {tries}번 받아도 스토어 총 PV와 안 맞아요 {bad}")


def sync_range(session, start, end, poster=None, log=print):
    """start~end 를 10일 단위로 받아 DB 구간 교체. 반환: {'pv': 행수, 'customer': 행수}"""
    post = poster or _make_poster(session)
    tot = {"pv": 0, "customer": 0}
    for a, b in windows(start, end):
        pv = fetch_pv_goods_checked(post, a, b, log=log)
        n1 = rpc("inni_replace_pageview_goods", {"p_from": a, "p_to": b, "p_rows": pv})
        if n1 != len(pv):
            raise RuntimeError(f"[pv {a}~{b}] 입력 {len(pv)}행 != 반영 {n1}행")
        time.sleep(PAUSE)
        cu = fetch_customer_daily(post, a, b)
        n2 = rpc("inni_replace_customer_daily", {"p_from": a, "p_to": b, "p_rows": cu})
        if n2 != len(cu):
            raise RuntimeError(f"[customer {a}~{b}] 입력 {len(cu)}행 != 반영 {n2}행")
        tot["pv"] += n1; tot["customer"] += n2
        log(f"  {a}~{b}: 상품PV {n1}행, 고객 {n2}행")
        time.sleep(PAUSE)
    return tot


def snapshot_customer_goods(session, poster=None, today=None):
    post = poster or _make_poster(session)
    rows = fetch_customer_goods(post)
    d = (today or date.today()).isoformat()
    n = rpc("inni_replace_customer_goods", {"p_date": d, "p_rows": rows})
    if n != len(rows):
        raise RuntimeError(f"[customer_goods] 입력 {len(rows)}행 != 반영 {n}행")
    return n


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--session-file")
    ap.add_argument("--from", dest="start")
    ap.add_argument("--to", dest="end")
    ap.add_argument("--snapshot", action="store_true")
    ap.add_argument("--print-sql", action="store_true")
    ap.add_argument("--dry", action="store_true", help="받기만 하고 DB 에 쓰지 않음 (개수 확인)")
    a = ap.parse_args()
    if a.print_sql:
        sys.stdout.write(schema_sql()); sys.exit(0)
    if not a.session_file:
        ap.error("--session-file 이 필요해요")
    sess = session_from_file(a.session_file)
    if a.dry and a.start and a.end:
        post = _make_poster(sess)
        for x, y in windows(a.start, a.end):
            print(x, y, "pv", len(fetch_pv_goods(post, x, y)), "customer", len(fetch_customer_daily(post, x, y))); time.sleep(PAUSE)
        sys.exit(0)
    if a.start and a.end:
        t0 = time.time(); r = sync_range(sess, a.start, a.end)
        print("완료", r, "%.0f초" % (time.time() - t0))
    if a.snapshot:
        print("고객-상품 스냅샷", snapshot_customer_goods(sess), "행")

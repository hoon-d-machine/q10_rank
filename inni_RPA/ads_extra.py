# -*- coding: utf-8 -*-
"""Qoo10 광고센터(ads.qoo10.jp) 일별 광고비·광고 매출 수집 → Supabase inni_ad_daily

  POST https://ads.qoo10.jp/api/sales/chart  (adTypes 비우면 전체, 코드를 넣으면 그 광고 유형만)
    → 일자 × 광고유형: adPrice(광고비, 엔), adSalesAmt(광고 매출, 엔). 전체('all') 행엔 salesAmt(스토어 총 매출)도 있다.
  2026-02-01 이전에는 광고 데이터가 없다(시트 ONSITE AD 도 2월부터).

토큰: 판매자센터(QSM) 로그인 쿠키(qsm_cookies.json)로 ads.qoo10.jp 에 들어가면 자동 발급된다 → get_ads_token().
Qoo10_RPA.py 의 일 수집이 끝나면 sync_range() 를 부른다. 단독 실행(백필):
  python ads_extra.py --from 2026-02-01 --to 2026-11-10
  python ads_extra.py --print-sql                      # 표·함수 SQL
"""
import argparse
import json
import os
import re
import sys
import time
from datetime import date, datetime, timedelta

import requests

API = "https://ads.qoo10.jp/api/"
PAUSE = 3.0     # 광고센터 호출 사이 대기(초)
WINDOW_DAYS = 92
# 광고센터 광고 유형 코드 → 이름 (사이트 JS 의 목록 기준)
AD_TYPES = {
    "keywordplus": "키워드플러스", "cps": "스마트세일즈", "power_rankup": "파워랭크업", "timesale": "타임세일",
    "horidashimono": "호리다시모노", "mega": "Mega AD", "dailydeal": "데일리딜", "dealplus": "딜플러스",
    "categoryplus": "카테고리플러스", "groupbuy": "공동구매", "groupbuyplus": "공동구매플러스",
}
BASE = os.path.dirname(os.path.abspath(__file__))


def schema_sql():
    return """-- 광고센터 일별 광고비·광고 매출 (일자 × 광고유형). ad_type='all' 은 전체(스토어 총 매출 포함). 다시 실행해도 안전.
create table if not exists inni_ad_daily (
  base_date date not null,
  ad_type text not null,
  ad_price numeric not null default 0,
  ad_sales numeric not null default 0,
  total_sales numeric,
  collected_at timestamptz not null default now(),
  primary key (base_date, ad_type)
);
alter table inni_ad_daily enable row level security;
revoke all on inni_ad_daily from anon, authenticated;

create or replace function inni_replace_ad_daily(p_from date, p_to date, p_rows jsonb)
returns integer language plpgsql as $$
declare n integer;
begin
  delete from inni_ad_daily where base_date between p_from and p_to;
  insert into inni_ad_daily (base_date, ad_type, ad_price, ad_sales, total_sales)
  select base_date, ad_type, coalesce(ad_price, 0), coalesce(ad_sales, 0), total_sales
  from jsonb_to_recordset(p_rows) as t(base_date date, ad_type text, ad_price numeric, ad_sales numeric, total_sales numeric)
  where base_date between p_from and p_to;
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function inni_replace_ad_daily(date, date, jsonb) from public, anon, authenticated;

-- 키워드별 일자 노출·클릭·구매수량 (광고센터 트래픽 > 키워드). 구간마다 상위 20개 키워드만 받을 수 있어 7일 단위로 모은다.
-- ad_type: 'all'(전체) 또는 keywordplus / cps / power_rankup. rank_in_window = 그 7일 구간 안의 순위.
create table if not exists inni_ad_keyword_daily (
  base_date date not null,
  ad_type text not null,
  keyword text not null,
  rank_in_window integer,
  expose_cnt bigint not null default 0,
  click_cnt bigint not null default 0,
  purchase_cnt bigint not null default 0,
  collected_at timestamptz not null default now(),
  primary key (base_date, ad_type, keyword)
);
alter table inni_ad_keyword_daily enable row level security;
revoke all on inni_ad_keyword_daily from anon, authenticated;

create or replace function inni_replace_ad_keyword_daily(p_from date, p_to date, p_rows jsonb)
returns integer language plpgsql as $$
declare n integer;
begin
  delete from inni_ad_keyword_daily where base_date between p_from and p_to;
  insert into inni_ad_keyword_daily (base_date, ad_type, keyword, rank_in_window, expose_cnt, click_cnt, purchase_cnt)
  select base_date, ad_type, keyword, rank_in_window, coalesce(expose_cnt, 0), coalesce(click_cnt, 0), coalesce(purchase_cnt, 0)
  from jsonb_to_recordset(p_rows) as t(base_date date, ad_type text, keyword text, rank_in_window integer, expose_cnt bigint, click_cnt bigint, purchase_cnt bigint)
  where base_date between p_from and p_to;
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function inni_replace_ad_keyword_daily(date, date, jsonb) from public, anon, authenticated;

-- 상품별 일자 × 광고유형 광고비·광고 매출·노출·클릭·장바구니·구매 (광고센터 /api/goods/rank). 상품에 안 묶이는 광고분은 빠진다(전체는 inni_ad_daily).
create table if not exists inni_ad_goods_daily (
  base_date date not null,
  gd_no text not null,
  ad_type text not null,
  brand_nm text,
  gd_nm text,
  outer_gd_no text,
  ad_price numeric not null default 0,
  ad_sales numeric not null default 0,
  expose_cnt bigint not null default 0,
  click_cnt bigint not null default 0,
  cart_cnt bigint not null default 0,
  purchase_cnt bigint not null default 0,
  collected_at timestamptz not null default now(),
  primary key (base_date, gd_no, ad_type)
);
alter table inni_ad_goods_daily enable row level security;
revoke all on inni_ad_goods_daily from anon, authenticated;

create or replace function inni_replace_ad_goods_daily(p_from date, p_to date, p_rows jsonb)
returns integer language plpgsql as $$
declare n integer;
begin
  delete from inni_ad_goods_daily where base_date between p_from and p_to;
  insert into inni_ad_goods_daily (base_date, gd_no, ad_type, brand_nm, gd_nm, outer_gd_no, ad_price, ad_sales, expose_cnt, click_cnt, cart_cnt, purchase_cnt)
  select base_date, gd_no, ad_type, brand_nm, gd_nm, outer_gd_no, coalesce(ad_price, 0), coalesce(ad_sales, 0),
         coalesce(expose_cnt, 0), coalesce(click_cnt, 0), coalesce(cart_cnt, 0), coalesce(purchase_cnt, 0)
  from jsonb_to_recordset(p_rows) as t(base_date date, gd_no text, ad_type text, brand_nm text, gd_nm text, outer_gd_no text,
       ad_price numeric, ad_sales numeric, expose_cnt bigint, click_cnt bigint, cart_cnt bigint, purchase_cnt bigint)
  where base_date between p_from and p_to;
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function inni_replace_ad_goods_daily(date, date, jsonb) from public, anon, authenticated;
"""


def get_ads_token(cookie_file=None, log=print):
    """qsm_cookies.json 의 QSM 로그인 쿠키로 ads.qoo10.jp 에 들어가 Authorization 토큰을 받는다. 실패하면 None."""
    from playwright.sync_api import sync_playwright
    path = cookie_file or os.path.join(BASE, "qsm_cookies.json")
    if not os.path.exists(path):
        log("  광고센터 토큰: qsm_cookies.json 없음"); return None
    d = json.load(open(path, encoding="utf-8"))
    ck = [dict((k, v) for k, v in c.items() if k != "partitionKey") for c in d.get("cookies", []) if "qoo10" in c.get("domain", "")]
    tok = []
    with sync_playwright() as p:
        try:
            b = p.chromium.launch(channel="chrome", headless=True)
        except Exception:
            b = p.chromium.launch(headless=True)
        try:
            ctx = b.new_context(locale="ja-JP", user_agent=d.get("user_agent") or None)
            ctx.add_cookies(ck)
            pg = ctx.new_page()
            pg.on("request", lambda r: tok.append(r.headers["authorization"]) if "ads.qoo10.jp/api" in r.url and r.headers.get("authorization") else None)
            pg.goto("https://ads.qoo10.jp/conversion", wait_until="domcontentloaded")
            for _ in range(20):
                if tok:
                    break
                pg.wait_for_timeout(1000)
            if not tok:
                log(f"  광고센터 토큰: 못 받음 (현재 {pg.url[:80]})")
        finally:
            b.close()
    return tok[0] if tok else None


def _headers(token):
    return {"Accept": "application/json, text/plain", "Authorization": token, "Content-Type": "application/json;charset=UTF-8",
            "Origin": "https://ads.qoo10.jp", "Referer": "https://ads.qoo10.jp/conversion",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"}


def fetch_type(token, ad_type, start, end):
    """ad_type '' = 전체. 반환: [{'resDate','adPrice','adSalesAmt','salesAmt'}]"""
    body = {"dateType": "DAY", "startDt": start, "endDt": end, "prevStartDt": start, "prevEndDt": start,
            "adTypes": [ad_type] if ad_type else [], "gdNos": [], "gdNosAll": [], "scopeType": "AD" if ad_type else "ALL"}
    for attempt in range(4):
        try:
            r = requests.post(API + "sales/chart", headers=_headers(token), json=body, timeout=90)
        except requests.exceptions.RequestException as e:
            if attempt == 3:
                raise RuntimeError(f"광고센터 요청 실패: {e}")
            time.sleep(2 ** (attempt + 1)); continue
        if r.status_code in (401, 403):
            raise PermissionError(f"광고센터 인증 실패({r.status_code}): 토큰이 만료됐어요")
        if r.status_code >= 500 or r.status_code == 429:
            if attempt == 3:
                raise RuntimeError(f"광고센터 HTTP {r.status_code}")
            time.sleep(2 ** (attempt + 1)); continue
        j = r.json()
        if str(j.get("resultCode")) != "1":
            raise RuntimeError(f"광고센터 응답 오류({ad_type or 'all'}): {j.get('message')} {j.get('resultCode')}")
        return j.get("datas") or []
    return []


def _supabase():
    path = os.path.join(BASE, "env") if os.path.exists(os.path.join(BASE, "env")) else os.path.join(BASE, ".env")
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
        time.sleep(2 ** (attempt + 1))


def windows(start, end, days=WINDOW_DAYS):
    a = datetime.strptime(start, "%Y-%m-%d").date(); b = datetime.strptime(end, "%Y-%m-%d").date()
    while a <= b:
        e = min(a + timedelta(days=days - 1), b)
        yield a.isoformat(), e.isoformat()
        a = e + timedelta(days=1)


def collect_window(token, a, b, log=print):
    """a~b 의 (일자 × 유형) 행. 유형별 광고비 합이 전체와 다르면 예외(모르는 광고 유형이 생겼을 때)."""
    rows, allp = [], {}
    for d in fetch_type(token, "", a, b):
        day = d["resDate"]; allp[day] = d["adPrice"] or 0
        rows.append({"base_date": day, "ad_type": "all", "ad_price": d["adPrice"] or 0, "ad_sales": d["adSalesAmt"] or 0, "total_sales": d["salesAmt"] or 0})
    time.sleep(PAUSE)
    got = {}
    for t in AD_TYPES:
        for d in fetch_type(token, t, a, b):
            p, s = d["adPrice"] or 0, d["adSalesAmt"] or 0
            if p or s:
                rows.append({"base_date": d["resDate"], "ad_type": t, "ad_price": p, "ad_sales": s, "total_sales": None})
                got[d["resDate"]] = got.get(d["resDate"], 0) + p
        time.sleep(PAUSE)
    bad = {k: (got.get(k, 0), v) for k, v in allp.items() if abs(got.get(k, 0) - v) > 1}
    if bad:
        raise RuntimeError(f"광고비 {a}~{b}: 유형별 합이 전체와 안 맞아요 {len(bad)}일 (예: {next(iter(bad.items()))})")
    return rows


def sync_range(token, start, end, log=print):
    """start~end 를 받아 DB 구간 교체. 반환: 행수. 2026-02-01 이전은 자른다."""
    start = max(start, "2026-02-01")
    if start > end:
        return 0
    tot = 0
    for a, b in windows(start, end):
        rows = collect_window(token, a, b, log=log)
        n = rpc("inni_replace_ad_daily", {"p_from": a, "p_to": b, "p_rows": rows})
        if n != len(rows):
            raise RuntimeError(f"[ad {a}~{b}] 입력 {len(rows)}행 != 반영 {n}행")
        tot += n
        log(f"  광고 {a}~{b}: {n}행")
    return tot


KW_TYPES = ["", "keywordplus", "cps", "power_rankup"]   # '' = 전체
KW_WINDOW = 7


def fetch_keywords(token, ad_type, start, end):
    """키워드별 일자 값 [{'base_date','ad_type','keyword','rank_in_window','expose_cnt','click_cnt','purchase_cnt'}] (상위 20개 키워드)"""
    body = {"dateType": "DAY", "startDt": start, "endDt": end, "prevStartDt": start, "prevEndDt": start,
            "adTypes": [ad_type] if ad_type else [], "gdNos": [], "gdNosAll": [], "scopeType": "AD" if ad_type else "ALL"}
    for attempt in range(4):
        try:
            r = requests.post(API + "keyword/rank", headers=_headers(token), json=body, timeout=90)
        except requests.exceptions.RequestException as e:
            if attempt == 3:
                raise RuntimeError(f"광고센터 키워드 요청 실패: {e}")
            time.sleep(2 ** (attempt + 1)); continue
        if r.status_code in (401, 403):
            raise PermissionError(f"광고센터 인증 실패({r.status_code}): 토큰이 만료됐어요")
        if r.status_code >= 500 or r.status_code == 429:
            if attempt == 3:
                raise RuntimeError(f"광고센터 키워드 HTTP {r.status_code}")
            time.sleep(2 ** (attempt + 1)); continue
        j = r.json()
        if str(j.get("resultCode")) != "1":
            raise RuntimeError(f"광고센터 키워드 응답 오류: {j.get('message')} {j.get('resultCode')}")
        rows = []
        for k in j.get("datas") or []:
            for d in k.get("dayValue") or []:
                if d.get("exposeCnt") or d.get("clickCnt") or d.get("purchaseCnt"):
                    rows.append({"base_date": d["dayDate"], "ad_type": ad_type or "all", "keyword": k["searchKeyword"],
                                 "rank_in_window": k.get("rankValue"), "expose_cnt": d.get("exposeCnt") or 0,
                                 "click_cnt": d.get("clickCnt") or 0, "purchase_cnt": d.get("purchaseCnt") or 0})
        return rows
    return []


def sync_keywords(token, start, end, log=print):
    """start~end 를 7일 단위로 받아 DB 구간 교체. 반환: 행수"""
    start = max(start, "2026-02-01")
    if start > end:
        return 0
    tot = 0
    for a, b in windows(start, end, KW_WINDOW):
        rows = []
        for t in KW_TYPES:
            rows += fetch_keywords(token, t, a, b)
            time.sleep(PAUSE)
        n = rpc("inni_replace_ad_keyword_daily", {"p_from": a, "p_to": b, "p_rows": rows})
        if n != len(rows):
            raise RuntimeError(f"[ad keyword {a}~{b}] 입력 {len(rows)}행 != 반영 {n}행")
        tot += n
        log(f"  광고 키워드 {a}~{b}: {n}행")
    return tot


def fetch_goods_day(token, day):
    """하루치 상품 × 광고유형 행. /api/goods/rank 는 offset·size(최대 100)로 나눠 받는다."""
    rows, off, size = [], 0, 100
    while True:
        body = {"dateType": "DAY", "startDt": day, "endDt": day, "prevStartDt": day, "prevEndDt": day, "adTypes": [], "gdNos": [],
                "gdNosAll": [], "scopeType": "ALL", "offset": off, "size": size}
        for attempt in range(4):
            try:
                r = requests.post(API + "goods/rank", headers=_headers(token), json=body, timeout=90)
            except requests.exceptions.RequestException as e:
                if attempt == 3:
                    raise RuntimeError(f"광고센터 상품 요청 실패: {e}")
                time.sleep(2 ** (attempt + 1)); continue
            if r.status_code in (401, 403):
                raise PermissionError(f"광고센터 인증 실패({r.status_code}): 토큰이 만료됐어요")
            if r.status_code >= 500 or r.status_code == 429:
                if attempt == 3:
                    raise RuntimeError(f"광고센터 상품 HTTP {r.status_code}")
                time.sleep(2 ** (attempt + 1)); continue
            break
        j = r.json()
        if str(j.get("resultCode")) != "1":
            raise RuntimeError(f"광고센터 상품 응답 오류({day}): {j.get('message')} {j.get('resultCode')}")
        datas = j.get("datas") or []
        for x in datas:
            g = x.get("goods") or {}
            for v in x.get("adValues") or []:
                rows.append({"base_date": day, "gd_no": x["gdNo"], "ad_type": v["adType"], "brand_nm": g.get("brandNm"), "gd_nm": g.get("gdNm"),
                             "outer_gd_no": g.get("outerGdNo"), "ad_price": v.get("adPrice") or 0, "ad_sales": v.get("adSalesAmt") or 0,
                             "expose_cnt": v.get("exposeCnt") or 0, "click_cnt": v.get("clickCnt") or 0, "cart_cnt": v.get("cartCnt") or 0,
                             "purchase_cnt": v.get("purchaseCnt") or 0})
        time.sleep(PAUSE)
        if len(datas) < size:
            return rows
        off += size


def sync_goods(token, start, end, log=print):
    """start~end 를 7일 단위로 받아 DB 구간 교체. 광고 매출은 일자별로 전체(inni_ad_daily)와 맞는지 검증. 반환: 행수"""
    start = max(start, "2026-02-01")
    if start > end:
        return 0
    tot = 0
    for a, b in windows(start, end, 7):
        rows = []
        d = datetime.strptime(a, "%Y-%m-%d").date(); e = datetime.strptime(b, "%Y-%m-%d").date()
        while d <= e:
            rows += fetch_goods_day(token, d.isoformat()); d += timedelta(days=1)
        # 검증: 일자별 광고 매출 합 == 전체 (광고센터 전체 합계와 같아야 한다)
        mine = {}
        for r in rows:
            mine[r["base_date"]] = mine.get(r["base_date"], 0) + r["ad_sales"]
        allv = {x["resDate"]: (x["adSalesAmt"] or 0) for x in fetch_type(token, "", a, b)}
        time.sleep(PAUSE)
        bad = {k: (mine.get(k, 0), v) for k, v in allv.items() if abs(mine.get(k, 0) - v) > 1}
        if bad:
            raise RuntimeError(f"상품별 광고 매출 {a}~{b}: 전체와 안 맞아요 {len(bad)}일 (예: {next(iter(bad.items()))})")
        n = rpc("inni_replace_ad_goods_daily", {"p_from": a, "p_to": b, "p_rows": rows})
        if n != len(rows):
            raise RuntimeError(f"[ad goods {a}~{b}] 입력 {len(rows)}행 != 반영 {n}행")
        tot += n
        log(f"  광고 상품 {a}~{b}: {n}행")
    return tot


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start"); ap.add_argument("--to", dest="end")
    ap.add_argument("--print-sql", action="store_true")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--keywords", action="store_true", help="키워드별 노출·클릭·구매만 수집")
    ap.add_argument("--goods", action="store_true", help="상품별 광고만 수집")
    a = ap.parse_args()
    if a.print_sql:
        sys.stdout.write(schema_sql()); sys.exit(0)
    if not (a.start and a.end):
        ap.error("--from 과 --to 가 필요해요")
    tok = get_ads_token()
    if not tok:
        sys.exit("광고센터 토큰을 못 받았어요 (QSM 로그인 필요)")
    if a.goods:
        print("완료:", sync_goods(tok, a.start, a.end), "행"); sys.exit(0)
    if a.keywords:
        print("완료:", sync_keywords(tok, a.start, a.end), "행"); sys.exit(0)
    if a.dry:
        for x, y in windows(max(a.start, "2026-02-01"), a.end):
            print(x, y, len(collect_window(tok, x, y)), "행")
    else:
        print("완료:", sync_range(tok, a.start, a.end), "행")

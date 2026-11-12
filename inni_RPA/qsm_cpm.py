# -*- coding: utf-8 -*-
"""QSM Beauty Brand AD(CPM 광고) 수집 → Supabase  (캠페인 · 일자별 성과 · 일자별 키워드 노출)

  qsm.qoo10.jp/GMKT.INC.Gsm.Web/Promotion/CPMList.aspx                          → inni_cpm_campaign       (캠페인 목록)
  .../Promotion/InnerAjax/CPMManagementDetailList.aspx (tab_kind=all, 하루씩)    → inni_cpm_daily          (노출·광고비·상품 열람 시작·구매)
  .../Promotion/InnerAjax/CPMManagementDetailList.aspx (tab_kind=keyword)        → inni_cpm_keyword_daily  (키워드별 노출)
  (카테고리별 리포트는 카테고리형 캠페인이 없어서 비어 있다 — 생기면 CPMManagementAjaxSelect selectbox_type=category 로 추가할 것)
판매자센터 API 가 아니라 QSM 화면(HTML)이라 로그인 쿠키만 쓴다. Qoo10_RPA.py 의 일 수집이 끝나면 sync_range() 를 같은 세션으로 부른다. 단독 실행(백필):
  python qsm_cpm.py --from 2025-11-01 --to 2026-11-11     (qsm_cookies.json 의 쿠키 사용)
  python qsm_cpm.py --print-sql
"""
import argparse
import html as _html
import json
import os
import re
import sys
import time
from datetime import date, datetime, timedelta

import requests

BASE = os.path.dirname(os.path.abspath(__file__))
PROMO = "https://qsm.qoo10.jp/GMKT.INC.Gsm.Web/Promotion/"
PAUSE = 1.2


def schema_sql():
    return """-- QSM Beauty Brand AD(CPM) 수집 표. 접근은 service_role(RPA)만: RLS 활성 + 권한 회수. 다시 실행해도 안전.
create table if not exists inni_cpm_campaign (
  campaign_no integer primary key,
  title text,
  status text,
  campaign_type text,
  max_amt integer,          -- 광고당 최대 금액(엔)
  daily_budget integer,
  total_budget integer,
  start_dt date,
  end_dt date,
  collected_at timestamptz not null default now()
);
alter table inni_cpm_campaign enable row level security;
revoke all on inni_cpm_campaign from anon, authenticated;

create table if not exists inni_cpm_daily (
  base_date date not null,
  campaign_no integer not null,
  impressions bigint not null default 0,    -- 광고 노출 수
  ad_cost numeric not null default 0,       -- 광고비(엔)
  detail_cnt bigint not null default 0,     -- 상품 열람 시작 수
  purchase_cnt bigint not null default 0,   -- 구매 수
  collected_at timestamptz not null default now(),
  primary key (base_date, campaign_no)
);
alter table inni_cpm_daily enable row level security;
revoke all on inni_cpm_daily from anon, authenticated;

create table if not exists inni_cpm_keyword_daily (
  base_date date not null,
  campaign_no integer not null,
  keyword text not null,
  impressions bigint not null default 0,
  collected_at timestamptz not null default now(),
  primary key (base_date, campaign_no, keyword)
);
alter table inni_cpm_keyword_daily enable row level security;
revoke all on inni_cpm_keyword_daily from anon, authenticated;

-- 캠페인은 있는 그대로 갱신하고, p_from~p_to 구간의 일자별 성과·키워드는 통째로 교체 (한 트랜잭션)
create or replace function inni_replace_cpm(p_from date, p_to date, p_campaigns jsonb, p_daily jsonb, p_keywords jsonb)
returns jsonb language plpgsql as $$
declare nc integer; nd integer; nk integer;
begin
  insert into inni_cpm_campaign (campaign_no, title, status, campaign_type, max_amt, daily_budget, total_budget, start_dt, end_dt, collected_at)
  select campaign_no, title, status, campaign_type, max_amt, daily_budget, total_budget, start_dt, end_dt, now()
  from jsonb_to_recordset(p_campaigns) as t(campaign_no integer, title text, status text, campaign_type text, max_amt integer, daily_budget integer, total_budget integer, start_dt date, end_dt date)
  on conflict (campaign_no) do update set title = excluded.title, status = excluded.status, campaign_type = excluded.campaign_type,
    max_amt = excluded.max_amt, daily_budget = excluded.daily_budget, total_budget = excluded.total_budget,
    start_dt = excluded.start_dt, end_dt = excluded.end_dt, collected_at = now();
  get diagnostics nc = row_count;
  delete from inni_cpm_daily where base_date between p_from and p_to;
  insert into inni_cpm_daily (base_date, campaign_no, impressions, ad_cost, detail_cnt, purchase_cnt)
  select base_date, campaign_no, coalesce(impressions, 0), coalesce(ad_cost, 0), coalesce(detail_cnt, 0), coalesce(purchase_cnt, 0)
  from jsonb_to_recordset(p_daily) as t(base_date date, campaign_no integer, impressions bigint, ad_cost numeric, detail_cnt bigint, purchase_cnt bigint)
  where base_date between p_from and p_to;
  get diagnostics nd = row_count;
  delete from inni_cpm_keyword_daily where base_date between p_from and p_to;
  insert into inni_cpm_keyword_daily (base_date, campaign_no, keyword, impressions)
  select base_date, campaign_no, keyword, coalesce(impressions, 0)
  from jsonb_to_recordset(p_keywords) as t(base_date date, campaign_no integer, keyword text, impressions bigint)
  where base_date between p_from and p_to;
  get diagnostics nk = row_count;
  return jsonb_build_object('campaigns', nc, 'daily', nd, 'keywords', nk);
end; $$;
revoke all on function inni_replace_cpm(date, date, jsonb, jsonb, jsonb) from public, anon, authenticated;
"""


def session_from_cookie_file(path=None):
    d = json.load(open(path or os.path.join(BASE, "qsm_cookies.json"), encoding="utf-8"))
    s = requests.Session()
    for c in d.get("cookies", []):
        if "qoo10" in c.get("domain", ""):
            s.cookies.set(c["name"], c["value"], domain=c["domain"], path=c.get("path", "/"))
    s.headers.update({"User-Agent": d.get("user_agent", "")})
    return s


def _num(t):
    t = re.sub(r"[^\d.\-]", "", t or "")
    return int(float(t)) if t not in ("", "-", ".") else 0


def _date(t):
    m = re.search(r"(\d{4})/(\d{2})/(\d{2})", t or "")
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None


def _cells(html):
    out = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S):
        c = [_html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", x))).strip() for x in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)]
        if c:
            out.append(c)
    return out


def _send(session, method, url, referer, data=None, ajax=False):
    # 판매자센터 API 용 헤더(Authorization 등)가 세션에 있어도 QSM 화면 호출에는 보내지 않는다
    h = {"Origin": "https://qsm.qoo10.jp", "Referer": referer, "Authorization": None, "X-SELL-CUST-NO": None, "Accept": "*/*"}
    if ajax:
        h["X-Requested-With"] = "XMLHttpRequest"
        h["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"
    for attempt in range(4):
        try:
            r = session.request(method, url, data=data, headers=h, timeout=90)
        except requests.exceptions.RequestException as e:
            if attempt == 3:
                raise RuntimeError(f"QSM CPM 요청 실패: {e}")
            time.sleep(2 ** (attempt + 1)); continue
        if r.status_code >= 500 or r.status_code == 429:
            if attempt == 3:
                raise RuntimeError(f"QSM CPM HTTP {r.status_code}")
            time.sleep(2 ** (attempt + 1)); continue
        if "login.aspx" in r.url.lower() or "QSM LOGIN" in r.text[:3000]:
            raise PermissionError("QSM 로그인이 풀렸어요 (세션 만료)")
        return r
    return None


def fetch_campaigns(session):
    r = _send(session, "GET", PROMO + "CPMList.aspx", PROMO + "CPMManagementReport.aspx")
    out = []
    for c in _cells(r.text):
        if len(c) >= 9 and re.fullmatch(r"[\d,]+", c[0]):
            out.append({"campaign_no": _num(c[0]), "title": c[1], "status": c[2], "campaign_type": c[3], "max_amt": _num(c[4]),
                        "daily_budget": _num(c[5]), "total_budget": _num(c[6]), "start_dt": _date(c[7]), "end_dt": _date(c[8])})
    if not out:
        raise RuntimeError("CPM 캠페인 목록을 못 읽었어요 (화면 구조가 바뀌었을 수 있어요)")
    return out


def fetch_keywords(session, cpm_no, start, end):
    r = _send(session, "POST", PROMO + "InnerAjax/CPMManagementAjaxSelect.aspx", PROMO + "CPMManagementKeywordReport.aspx",
              {"cpm_no": str(cpm_no), "start_dt": start.replace("-", "/"), "end_dt": end.replace("-", "/"), "selectbox_type": "keyword"}, ajax=True)
    time.sleep(PAUSE)
    return [_html.unescape(x) for x in re.findall(r'data-value="([^"]*)"', r.text)]


def fetch_day(session, cpm_no, day, keywords):
    """하루치: (캠페인 성과 dict 또는 None, [(키워드, 노출)])"""
    d = day.replace("-", "/")
    r = _send(session, "POST", PROMO + "InnerAjax/CPMManagementDetailList.aspx", PROMO + "CPMManagementReport.aspx",
              {"start_dt": d, "end_dt": d, "cpm_nos": str(cpm_no), "tab_kind": "all"}, ajax=True)
    time.sleep(PAUSE)
    perf = None
    for c in _cells(r.text):
        if len(c) >= 14 and re.fullmatch(r"[\d,]+", c[0]) and _num(c[0]) == cpm_no:
            perf = {"impressions": _num(c[9]), "ad_cost": _num(c[10]), "detail_cnt": _num(c[11]), "purchase_cnt": _num(c[12])}
    kws = []
    for kw in keywords:
        r = _send(session, "POST", PROMO + "InnerAjax/CPMManagementDetailList.aspx", PROMO + "CPMManagementKeywordReport.aspx",
                  {"start_dt": d, "end_dt": d, "cpm_no": str(cpm_no), "keywords": kw, "tab_kind": "keyword"}, ajax=True)
        time.sleep(PAUSE)
        for c in _cells(r.text):
            if len(c) >= 2 and c[0] == kw and re.fullmatch(r"[\d,]+", c[1]):
                kws.append((kw, _num(c[1])))
    return perf, kws


def sync_range(session, start, end, log=print):
    """start~end 와 겹치는 캠페인의 일자별 성과·키워드 노출을 받아 DB 구간 교체. 반환: {'campaigns','daily','keywords'}"""
    from ads_extra import rpc
    camps = fetch_campaigns(session)
    time.sleep(PAUSE)
    daily, kwrows, used = [], [], 0
    for c in camps:
        if not c["start_dt"] or not c["end_dt"] or c["status"] == "キャンセル":
            continue
        a, b = max(c["start_dt"], start), min(c["end_dt"], end)
        if a > b:
            continue
        used += 1
        kws = fetch_keywords(session, c["campaign_no"], c["start_dt"], c["end_dt"])
        d = datetime.strptime(a, "%Y-%m-%d").date(); e = datetime.strptime(b, "%Y-%m-%d").date()
        while d <= e:
            perf, kw = fetch_day(session, c["campaign_no"], d.isoformat(), kws)
            if perf is not None:
                daily.append({"base_date": d.isoformat(), "campaign_no": c["campaign_no"], **perf})
            for k, n in kw:
                kwrows.append({"base_date": d.isoformat(), "campaign_no": c["campaign_no"], "keyword": k, "impressions": n})
            d += timedelta(days=1)
        log(f"  CPM 캠페인 {c['campaign_no']} {a}~{b}: 일자 {sum(1 for x in daily if x['campaign_no'] == c['campaign_no'])}행")
    res = rpc("inni_replace_cpm", {"p_from": start, "p_to": end, "p_campaigns": camps, "p_daily": daily, "p_keywords": kwrows})
    if res.get("daily") != len(daily) or res.get("keywords") != len(kwrows):
        raise RuntimeError(f"[cpm] 입력 {len(daily)}/{len(kwrows)}행 != 반영 {res}")
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start"); ap.add_argument("--to", dest="end")
    ap.add_argument("--print-sql", action="store_true")
    a = ap.parse_args()
    if a.print_sql:
        sys.stdout.write(schema_sql()); sys.exit(0)
    if not (a.start and a.end):
        ap.error("--from 과 --to 가 필요해요")
    print("완료:", sync_range(session_from_cookie_file(), a.start, a.end))

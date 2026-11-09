# -*- coding: utf-8 -*-
"""data/*.csv 랭킹 기록 → Supabase q10_rank_log (표 만들기: dy-ai/supabase/rank_log.sql)

  python rank_log_db.py --dry      # 변환·검증만 (DB 쓰기 없음)
  python rank_log_db.py --test     # 일간 최근 1일만 올려 확인
  python rank_log_db.py --all      # CSV 전체를 올림 (한 번, 같은 키는 덮어쓰기라 다시 해도 안전)
  python rank_log_db.py --since 2026-10-20   # 그 날짜 이후만

접속 값: 환경변수 DY_SUPABASE_URL / DY_SUPABASE_KEY(서비스 키), 없으면 inni_RPA/env 의 SUPABASE_URL / SUPABASE_KEY.
csv_logger.py 가 일 수집 뒤 sync_frames() 로 그날 수집분만 올린다(실패해도 CSV 수집은 영향 없음).
"""
import argparse
import os
import re
import time

import pandas as pd
import requests

BATCH = 1000
FILES = ["bestseller_daily.csv", "official_weekly.csv", "official_monthly.csv"]
HERE = os.path.dirname(os.path.abspath(__file__))


def conn():
    url, key = os.environ.get("DY_SUPABASE_URL"), os.environ.get("DY_SUPABASE_KEY")
    if not (url and key):
        p = os.path.join(HERE, "inni_RPA", "env")
        if os.path.exists(p):
            t = open(p, encoding="utf-8").read()
            g = lambda k: (re.search(rf"^{k}\s*=\s*(.+)$", t, re.M) or [None, ""])[1].strip().strip("\"'")
            url, key = g("SUPABASE_URL"), g("SUPABASE_KEY")
    return (url or "").rstrip("/"), key or ""


def period_of(cat):
    return "weekly" if cat.endswith("_주간") else "monthly" if cat.endswith("_월간") else "daily"


def to_rows(df):
    """CSV 데이터프레임(일자·카테고리?·순위·브랜드·상품명·가격) → DB 행. 같은 (일자,카테고리,순위)는 마지막 것만."""
    d = df.copy()
    if "카테고리" not in d.columns:
        d["카테고리"] = "데일리 뷰티"
    d = d.drop_duplicates(["일자", "카테고리", "순위"], keep="last")
    rows = []
    for r in d.itertuples(index=False):
        rows.append({
            "rank_date": str(r.일자)[:10], "category": r.카테고리, "rank": int(r.순위),
            "brand": None if pd.isna(r.브랜드) else str(r.브랜드),
            "product_name": None if pd.isna(r.상품명) else str(r.상품명),
            "price": None if pd.isna(r.가격) else int(r.가격),
            "period": period_of(r.카테고리),
        })
    return rows


def upsert(rows, url, key):
    h = {"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json",
         "Prefer": "resolution=merge-duplicates,return=minimal"}
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        for attempt in range(3):
            r = requests.post(f"{url}/rest/v1/q10_rank_log?on_conflict=rank_date,category,rank", headers=h, json=chunk, timeout=60)
            if r.status_code in (200, 201, 204):
                break
            if attempt == 2:
                raise RuntimeError(f"q10_rank_log 업서트 실패 {r.status_code}: {r.text[:200]}")
            time.sleep(2 ** (attempt + 1))
        print(f"  q10_rank_log: {min(i + BATCH, len(rows))}/{len(rows)}")
        time.sleep(0.5)   # DB 부담 줄이기


def sync_frames(*dfs):
    """csv_logger 용: 방금 수집한 데이터프레임들을 올린다. 설정이 없으면 건너뜀."""
    url, key = conn()
    if not (url and key):
        print("ℹ️ DB 접속 값이 없어 랭킹 DB 반영은 건너뜀")
        return
    rows = [x for df in dfs if df is not None and not df.empty for x in to_rows(df)]
    if rows:
        upsert(rows, url, key)
        print(f"✅ 랭킹 DB 반영 {len(rows)}행")


def db_count(url, key, since=None):
    h = {"apikey": key, "Authorization": "Bearer " + key, "Prefer": "count=exact", "Range": "0-0"}
    q = f"{url}/rest/v1/q10_rank_log?select=rank_date" + (f"&rank_date=gte.{since}" if since else "")
    r = requests.get(q, headers=h, timeout=60)
    return int(r.headers.get("content-range", "*/0").split("/")[-1]) if r.status_code in (200, 206) else r.text[:200]


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry", action="store_true")
    g.add_argument("--test", action="store_true")
    g.add_argument("--all", action="store_true")
    g.add_argument("--since")
    a = ap.parse_args()
    frames = [pd.read_csv(os.path.join(HERE, "data", f)) for f in FILES]
    since = a.since
    if a.test:
        since = str(frames[0]["일자"].max())[:10]
        frames = frames[:1]
    if since:
        frames = [f[f["일자"] >= since] for f in frames]
    rows = [x for f in frames for x in to_rows(f)]
    print(f"변환: {len(rows)}행 (일간 {sum(r['period']=='daily' for r in rows)} / 주간 {sum(r['period']=='weekly' for r in rows)} / 월간 {sum(r['period']=='monthly' for r in rows)})")
    keys = {(r["rank_date"], r["category"], r["rank"]) for r in rows}
    assert len(keys) == len(rows), "키 중복"
    if a.dry:
        return
    url, key = conn()
    assert url and key, "접속 값 없음"
    upsert(rows, url, key)
    print("DB 행 수:", db_count(url, key, since))


if __name__ == "__main__":
    main()

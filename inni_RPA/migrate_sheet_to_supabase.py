# -*- coding: utf-8 -*-
"""구글 시트(raw_data/raw_trade/raw_conversion) → Supabase 이관 (시트는 읽기만 함).

사용:
  python migrate_sheet_to_supabase.py --dry          # 변환/검증만 (DB 쓰기 없음)
  python migrate_sheet_to_supabase.py --days 5       # 시트 최근 5일치만 이관 (시험)
  python migrate_sheet_to_supabase.py --all          # 전체 이관 후 행 수·합계 검증
"""
import argparse
import re
import time
import requests
import Qoo10_RPA as m

BATCH = 1000

GOODS_COLS = ["base_date", "weekday", "brand_nm", "gd_nm", "gd_no", "outer_gd_no",
              "buy_cnt", "cancel_cnt", "net_cnt", "buy_bpv", "cancel_bpv", "net_bpv"]
GOODS_TEXT = {"weekday", "brand_nm", "gd_nm", "gd_no", "outer_gd_no"}


def snake(s):
    return re.sub(r"([A-Z])", lambda x: "_" + x.group(1).lower(), s)


TRADE_DB = [snake(c) for c in m.TRADE_COLUMNS]
CONV_DB = [snake(c) for c in m.CONVERSION_COLUMNS]
SMALLINT_DATE = {"base_year", "base_weekday_no", "base_week", "base_month"}

# (시트명, DB 테이블, DB 열 목록, 날짜 열 위치, 텍스트 열 집합, 합계 검증할 열)
DATASETS = [
    ("raw_data", "inni_sales_goods", GOODS_COLS, 0, GOODS_TEXT, ["buy_cnt", "net_bpv"]),
    ("raw_trade", "inni_sales_daily", TRADE_DB, 1, set(), ["final_total_buy_cnt", "final_buy_bpv"]),
    ("raw_conversion", "inni_pageview_daily", CONV_DB, 1, set(), ["total_pv", "user_cnt"]),
]


def load_env():
    t = open(m.get_env_path(), encoding="utf-8").read()
    g = lambda k: (re.search(rf"^{k}\s*=\s*(.+)$", t, re.M) or [None, ""])[1].strip().strip("\"'")
    return g("SUPABASE_URL").rstrip("/"), g("SUPABASE_KEY")


def to_num(s):
    s = str(s).replace(",", "").strip()
    if s == "":
        return None
    f = float(s)
    return int(f) if f == int(f) else f


def convert(sheet_rows, cols, text_cols, date_idx, bad):
    """시트 행 → DB dict 목록. 변환 불가 값은 bad에 모으고 None 처리."""
    out = []
    for r in sheet_rows:
        r = list(r) + [""] * (len(cols) - len(r))
        if not str(r[date_idx]).strip():
            continue
        d = {}
        for i, c in enumerate(cols):
            v = r[i]
            if c in ("base_date", "base_start_dt", "base_end_dt"):
                d[c] = str(v).strip() or None
            elif c in text_cols:
                d[c] = str(v) if v != "" else None
            else:
                try:
                    d[c] = to_num(v)
                except ValueError:
                    bad.append((c, str(v)[:30]))
                    d[c] = None
        out.append(d)
    return out


def post_batches(url, key, table, rows, pk):
    h = {"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json",
         "Prefer": "resolution=merge-duplicates,return=minimal"}
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        for attempt in range(3):
            r = requests.post(f"{url}/rest/v1/{table}?on_conflict={pk}", headers=h, json=chunk, timeout=60)
            if r.status_code in (200, 201, 204):
                break
            if attempt == 2:
                raise RuntimeError(f"{table} 업서트 실패 {r.status_code}: {r.text[:200]}")
            time.sleep(2 ** (attempt + 1))
        print(f"  {table}: {min(i + BATCH, len(rows))}/{len(rows)}")
        time.sleep(0.3)


def db_stats(url, key, table, sum_cols, order):
    """DB 행 수와 합계 (PostgREST 집계 대신 페이지 조회로 계산)."""
    h = {"apikey": key, "Authorization": "Bearer " + key}
    n, sums, start = 0, {c: 0 for c in sum_cols}, 0
    while True:
        r = requests.get(f"{url}/rest/v1/{table}?select={','.join(sum_cols)}&order={order}",
                         headers={**h, "Range": f"{start}-{start + 999}"}, timeout=60)
        rows = r.json()
        if not isinstance(rows, list) or not rows:
            break
        n += len(rows)
        for row in rows:
            for c in sum_cols:
                sums[c] += row[c] or 0
        if len(rows) < 1000:
            break
        start += 1000
    return n, sums


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry", action="store_true")
    g.add_argument("--days", type=int)
    g.add_argument("--all", action="store_true")
    args = ap.parse_args()

    url, key = load_env()
    gc, sh = m.get_gspread_client()
    for sheet, table, cols, date_idx, text_cols, sum_cols in DATASETS:
        print(f"\n=== {sheet} → {table} ===")
        values = sh.worksheet(sheet).get_all_values()
        sheet_rows = [r for r in values[1:] if r and str(r[date_idx]).strip()]
        bad = []
        rows = convert(sheet_rows, cols, text_cols, date_idx, bad)
        dates = sorted({str(r[date_idx]) for r in sheet_rows})
        print(f"시트 유효 행 {len(rows)}, 날짜 {len(dates)}일 ({dates[0]} ~ {dates[-1]}), 변환불가 값 {len(bad)}")
        if bad:
            print("  변환불가 예:", bad[:5])
        pk = "base_date,gd_no" if table == "inni_sales_goods" else "base_start_dt"
        keycol = cols[date_idx]
        if len({tuple(r[k] for k in pk.split(",")) for r in rows}) != len(rows):
            print("  !! 기본키 중복 있음 - 건너뜀")
            continue
        if args.dry:
            continue
        if args.days:
            keep = set(dates[-args.days:])
            rows = [r for r in rows if r[keycol] in keep]
            print(f"  시험 이관: 최근 {args.days}일 {len(rows)}행")
        post_batches(url, key, table, rows, pk)
        if args.all:
            n, sums = db_stats(url, key, table, sum_cols, pk)
            s_sums = {c: sum((r[c] or 0) for r in rows) for c in sum_cols}
            ok = n == len(rows) and all(abs(sums[c] - s_sums[c]) < 1e-6 for c in sum_cols)
            print(f"  검증: DB {n}행 / 시트 {len(rows)}행, 합계 DB {sums} / 시트 {s_sums} → {'일치' if ok else '불일치!'}")


if __name__ == "__main__":
    main()

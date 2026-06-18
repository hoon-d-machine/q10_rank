import requests
from bs4 import BeautifulSoup
import pandas as pd
from datetime import datetime, timedelta, timezone
import os
import time

# 1. 전역 설정
HEADERS = {
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    'accept': 'application/json, text/plain, */*',
    'referer': 'https://m.qoo10.jp/',
}
KST = timezone(timedelta(hours=9))

def update_csv(df, file_name):
    if df is None or df.empty: return
    file_path = f"data/{file_name}"
    os.makedirs("data", exist_ok=True)
    
    df['순위'] = df['순위'].astype(int)
    
    if os.path.exists(file_path):
        old_df = pd.read_csv(file_path)
        updated_df = pd.concat([old_df, df], ignore_index=True)
        subset = ['일자', '순위', '카테고리', '상품명'] if '카테고리' in df.columns else ['일자', '순위', '상품명']
        updated_df = updated_df.drop_duplicates(subset=subset, keep='last')
    else:
        updated_df = df
    
    updated_df.to_csv(file_path, index=False, encoding='utf-8-sig')

def get_daily_bestsellers(current_date): # 날짜를 인자로 받음
    url = 'https://m.qoo10.jp/gmkt.inc/BestSellers/?g=2'
    res = requests.get(url, headers=HEADERS)
    soup = BeautifulSoup(res.text, 'html.parser')
    items = soup.select('li[data_gd_no]')
    data = []
    for item in items:
        try:
            rank = int(item.select_one('.rank_current').text.strip())
            if rank > 200: continue
            data.append({
                "일자": current_date, # 전달받은 날짜 사용
                "순위": rank,
                "카테고리": "데일리 뷰티",
                "브랜드": item.select_one('.common_ui_seller_brand').text.strip() if item.select_one('.common_ui_seller_brand') else "",
                "상품명": item.select_one('.list_v2_title').text.strip(),
                "가격": int(item.select_one('.price_final_value').text.strip().replace(',', ''))
            })
        except: continue
    return pd.DataFrame(data)

def get_official_ranking(period, current_date): # 날짜를 인자로 받음
    # (카테고리명, gdlcCd, gdmcCd, gdscCd)
    categories = [
        ('전체', None, None, None),
        ('스킨케어', '120000012', None, None),
        ('스킨케어>화장수', '120000012', '220000159', '320001619'),
        ('스킨케어>미용액', '120000012', '220000159', '320001623'),
        ('베이스', '120000013', None, None),
        ('베이스>루스파우더', '120000013', '220000166', '320001665'),
    ]
    url = 'https://m.qoo10.jp/gmkt.inc/Mobile/Beauty/OfficialRanking.aspx/GetBestSellerBeautyOfficialRanking'
    all_data = []
    period_name = "주간" if period == 'W' else "월간"
    
    for name, gdlc, gdmc, gdsc in categories:
        payload = {
            'gdlcCd': gdlc, 'gdmcCd': gdmc, 'gdscCd': gdsc, 
            'period': period, 'pageNo': 1, 'pageSize': 100, 
            'showMegaoshi': 'Y', '___cache_expire___': str(int(time.time()*1000))
        }
        res = requests.post(url, headers=HEADERS, json=payload)
        items = res.json().get('d', {}).get('goods', [])
        for item in items:
            all_data.append({
                "일자": current_date, # 전달받은 날짜 사용
                "순위": int(item.get("ROW_NUMBER")),
                "카테고리": f"{name}_{period_name}",
                "브랜드": item.get("BRAND_INFO", {}).get("BRAND_NM", ""),
                "상품명": item.get("GD_NM", ""),
                "가격": int(item.get("FINAL_PRICE", 0))
            })
    return pd.DataFrame(all_data)

if __name__ == "__main__":
    now = datetime.now(KST)
    today_str = now.strftime('%Y-%m-%d')
    print(f"🚀 수집 시작 (기준 시간: {now.strftime('%Y-%m-%d %H:%M:%S')} KST)")

    # 1. 데일리 수집
    update_csv(get_daily_bestsellers(today_str), "bestseller_daily.csv")

    # 2. 주간 수집
    if now.weekday() == 0 or not os.path.exists("data/official_weekly.csv"):
        print("2. 주간 랭킹 수집 중...")
        update_csv(get_official_ranking('W', today_str), "official_weekly.csv")
    else:
        print("2. 주간 랭킹 수집 일자 아님, PASS")
    # 3. 월간 수집
    if now.day == 1 or not os.path.exists("data/official_monthly.csv"):
        print("3. 월간 랭킹 수집 중...")
        update_csv(get_official_ranking('M', today_str), "official_monthly.csv")
    else:
        print("3. 월간 랭킹 수집 일자 아님, PASS")
    
    print("✨ 모든 수집 프로세스 완료")

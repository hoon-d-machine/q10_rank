import os
import time
import json
import requests
from datetime import datetime
from bs4 import BeautifulSoup
from supabase import create_client
from concurrent.futures import ThreadPoolExecutor, as_completed

# --- [1] 설정 로드 (GitHub가 넣어줄 정보들) ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
EVENT_SID = os.environ.get("EVENT_SID")

# DB 연결
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
goods_cache = {}

def get_goods_detail(session, goodscode):
    """상세 페이지 정보 수집 (캐싱 적용)"""
    if goodscode in goods_cache: return goods_cache[goodscode]
    
    url = 'https://www.qoo10.jp/gmkt.inc/goods/goods.aspx'
    headers_common = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3',
            # 'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Priority': 'u=0, i',
        }
    
    brand, cats, review = "", [], 0
    try:
        res = session.get(url, params={'goodscode': goodscode}, headers=headers_common, timeout=5)
        if res.status_code == 200:
            soup = BeautifulSoup(res.text, 'html.parser')
            b_tag = soup.select_one('div.text_title > a.title_brand')
            if b_tag: brand = b_tag.get('title', '').strip()
            cats = [t.get_text(strip=True) for t in soup.select('ul.category_depth_list li span')]
            r_tag = soup.select_one('.review_count span')
            if r_tag:
                txt = r_tag.get_text(strip=True).replace(',', '').replace('(', '').replace(')', '')
                if txt.isdigit(): review = int(txt)
    except: pass
    
    data = (brand, cats, review)
    goods_cache[goodscode] = data
    return goodscode, data

def run_collector():
    print(f"=== 수집 시작 (SID: {EVENT_SID}) ===")
    
    session = requests.Session()
    
    headers_common = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3',
            # 'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Priority': 'u=0, i',
        }
    try:
        url_init = 'https://www.qoo10.jp/gmkt.inc/Special/Special.aspx'
        res = session.get(url_init, params={'sid': EVENT_SID}, headers=headers_common)
        print(f"초기 접속 상태: {res.status_code}")
        if "Queue-it" in res.text:
            print("🚨 [비상] 대기열(Queue-it) 페이지가 떴습니다. GitHub IP가 차단되었거나 대기열이 있습니다.")
            print(res.text[:500]) # 내용 일부 출력
            return
    except Exception as e:
        return
    # 세션 초기화
    headers_api = headers_common.copy()
    headers_api.update({
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/json; charset=UTF-8',
        'Origin': 'https://www.qoo10.jp',
        'Referer': f'https://www.qoo10.jp/gmkt.inc/Special/Special.aspx?sid={EVENT_SID}',
        'X-Requested-With': 'XMLHttpRequest'
    })

    rank_types = {'Q': '누적건수', 'T': '누적금액'}
    target_ages = [0, 10, 20, 30, 40, 50]
    
    db_rows = []

    for r_code, r_name in rank_types.items():
        # 내부 수집 함수
        def fetch(g_code, age_val, v_mode, s_name):
            payload = {
                'mobileYn': 'N', 'type': r_code, 
                'tab': 'C' if g_code==2 else 'A', 
                'groupCode': g_code, 'age': age_val,
                '___cache_expire___': str(int(time.time()*1000))
            }
            try:
                res = session.post('https://www.qoo10.jp/gmkt.inc/swe_SpecialAjaxService.asmx/GetPromotionRankingData', headers=headers_api, json=payload)
                if res.status_code == 200:
                    d = res.json()
                    root = None
                    if 'd' in d:
                        root = json.loads(d['d']) if isinstance(d['d'], str) else d['d']
                    else: root = d
                    
                    items = []
                    if root:
                        if root.get('firstItem'): items.append(root['firstItem'])
                        if root.get('items'): items.extend(root['items'])
                    
                    if items:
                        print(f"[{r_name}-{s_name}] {len(items)}개 확인.")
                        
                        # 상세 수집 (멀티스레드)
                        targets = [str(i.get('GD_NO')) for i in items]
                        missing = [gd for gd in targets if gd not in goods_cache]
                        
                        if missing:
                            with ThreadPoolExecutor(max_workers=4) as exc:
                                fs = [exc.submit(get_goods_detail, session, gd) for gd in missing]
                                for _ in as_completed(fs): pass
                        
                        now_ts = datetime.now().isoformat()
                        
                        for idx, item in enumerate(items):
                            gd_no = str(item.get('GD_NO', ''))
                            br, ca, rv = goods_cache.get(gd_no, ("", [], 0))
                            
                            c1 = ca[0] if len(ca)>0 else ""
                            c2 = ca[1] if len(ca)>1 else ""
                            c3 = ca[2] if len(ca)>2 else ""
                            c4 = ca[3] if len(ca)>3 else ""

                            price = item.get('FINAL_PRICE', 0)
                            sale = price
                            rate = item.get('DISCOUNT_RATE', 0)
                            if item.get('PROMOTION_INFO'):
                                p = item['PROMOTION_INFO'][0]
                                if p.get('PROMOTION_PRICE'): sale = p['PROMOTION_PRICE']
                                if p.get('DISCOUNT_RATE'): rate = p['DISCOUNT_RATE']

                            # DB 포맷으로 데이터 추가
                            db_rows.append({
                                "event_sid": EVENT_SID,
                                "collected_at": now_ts,
                                "rank_type": r_name,
                                "category": s_name,
                                "rank": idx + 1,
                                "brand": br,
                                "goods_no": gd_no,
                                "goods_name": item.get('GD_NM', ''),
                                "sale_price": sale,
                                "review_count": rv,
                                "large_category": c2,
                                "medium_category": c3,
                                "small_category": c4
                            })
            except Exception as e:
                print(f"Error: {e}")

        # 1. 뷰티
        fetch(2, 0, '카테고리(뷰티)', '뷰티전체')
        time.sleep(1)
        # 2. 연령별
        for age in target_ages:
            lbl = "전연령" if age==0 else f"{age}대" if age<50 else "50대이상"
            fetch(0, age, '연령별', lbl)
            time.sleep(1)

    # DB로 한 방에 전송 (Bulk Insert)
    if db_rows:
        try:
            # 1000개씩 끊어서 저장 (안정성 확보)
            batch_size = 1000
            for i in range(0, len(db_rows), batch_size):
                batch = db_rows[i:i + batch_size]
                supabase.table("qoo10_rankings").insert(batch).execute()
                print(f"Saved batch {i}~{i+len(batch)}")
            print("✅ 모든 데이터 저장 완료!")
        except Exception as e:
            print(f"❌ 저장 실패: {e}")
    else:
        print("수집된 데이터가 없습니다.")

if __name__ == "__main__":
    run_collector()

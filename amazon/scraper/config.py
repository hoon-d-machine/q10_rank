import os

# 캡쳐 대상 카테고리
# url은 브라우저 주소창에서 그대로 복사한 값. Amazon이 node id/ref를 바꾸면
# 이 값도 갱신해야 함.
CATEGORIES = {
    "beauty_all": {
        "label": "뷰티 전체 (대카테고리)",
        "url": "https://www.amazon.co.jp/gp/bestsellers/beauty/ref=zg_bs_unv_beauty_1_170134011_4",
    },
    "serum": {
        "label": "스킨케어>기초화장품>미용액",
        "url": "https://www.amazon.co.jp/gp/bestsellers/beauty/170134011/ref=zg_bs_nav_beauty_3_170040011",
    },
    "powder": {
        "label": "메이크업>베이스메이크업>파우더",
        "url": "https://www.amazon.co.jp/gp/bestsellers/beauty/170212011/ref=zg_bs_nav_beauty_3_5263280051",
    },
}

# 배송지 설정 (일관된 랭킹/가격 결과를 위해 고정)
# 京都市上京区糸屋町 602-8238
POSTAL_CODE = "6028238"

LOCALE = "ja-JP"
TIMEZONE = "Asia/Seoul"  # 09~00시 스케줄 계산 기준 (JST와 동일한 UTC+9)

SCREENSHOTS_DIR = "screenshots"
DATA_DIR = "data"
EXCEL_PATH = os.path.join(DATA_DIR, "rankings.xlsx")

VIEWPORT = {"width": 2300, "height": 1080}
ITEMS_PER_PAGE = 50
MAX_PAGES = 2  # 100위까지 (페이지당 50개)

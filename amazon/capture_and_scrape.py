import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

from scraper.config import (
    CATEGORIES,
    POSTAL_CODE,
    LOCALE,
    TIMEZONE,
    SCREENSHOTS_DIR,
    EXCEL_PATH,
    VIEWPORT,
)
from scraper.browser_utils import new_stealth_context, LAUNCH_ARGS
from scraper.location import set_location
from scraper.scrape import scrape_category
from scraper.excel_writer import append_rows

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def _capture_timestamp(now):
    if now.hour == 0:
        now = now - timedelta(days=1)
    return now.strftime("%Y-%m-%d %H")


def main():
    actual_ts = datetime.now(ZoneInfo(TIMEZONE))
    run_ts = actual_ts - timedelta(days=1) if actual_ts.hour == 0 else actual_ts
    timestamp = _capture_timestamp(actual_ts)
    logger.info("=== 캡쳐 시작: %s ===", actual_ts.isoformat())

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=LAUNCH_ARGS)
        context = new_stealth_context(browser, LOCALE, VIEWPORT)
        page = context.new_page()

        # 디버그용 스크린샷(_debug_location.png 등)이 필요하면 아래 주석을 해제하고 debug_dir=SCREENSHOTS_DIR로 바꿔서 실행
        # location_ok = set_location(page, POSTAL_CODE, debug_dir=SCREENSHOTS_DIR)
        location_ok = set_location(page, POSTAL_CODE)
        if not location_ok:
            logger.warning("배송지 설정에 실패했지만 캡쳐는 계속 진행합니다.")

        all_rows = []
        for key, cat in CATEGORIES.items():
            logger.info("카테고리 수집 시작: %s", cat["label"])
            items = scrape_category(page, key, cat, SCREENSHOTS_DIR, run_ts)
            for item in items:
                item["timestamp"] = timestamp
                item["category_key"] = key
                item["category_label"] = cat["label"]
                all_rows.append(item)
            logger.info(" -> %d개 항목 수집됨", len(items))

        browser.close()

    append_rows(EXCEL_PATH, all_rows)
    logger.info("=== 캡쳐 완료: 총 %d행 저장 ===", len(all_rows))


if __name__ == "__main__":
    main()

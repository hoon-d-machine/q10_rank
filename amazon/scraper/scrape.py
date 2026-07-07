import re
import time
import logging
from pathlib import Path

from scraper.config import ITEMS_PER_PAGE, MAX_PAGES
from scraper.browser_utils import bypass_interstitial

logger = logging.getLogger(__name__)

RANK_RE = re.compile(r"#?\s*(\d{1,3})\s*位")
PRICE_RE = re.compile(r"[¥￥]\s?[\d,]+")
RATING_RE = re.compile(r"5つ星のうち\s*([\d.]+)")
REVIEW_RE = re.compile(r"([\d,]+)\s*個の評価|([\d,]+)\s*件のカスタマーレビュー|\(\s*([\d,]+)\s*\)")
NUMBER_RE = re.compile(r"^[\d,]+$")


def _page_url_for(base_url: str, page_num: int) -> str:
    if page_num <= 1:
        return base_url
    sep = "&" if "?" in base_url else "?"
    return f"{base_url}{sep}pg={page_num}"


def _first_value(*values):
    for value in values:
        if value:
            return value
    return None


def _extract_items_from_page(page, page_num):
    """현재 로드된 페이지의 DOM에서 상품 정보를 추출한다.

    Amazon의 클래스명은 자주 바뀌므로, 대부분의 상품 컨테이너에
    공통으로 붙는 data-asin 속성을 기준으로 잡아 안정성을 높였다.
    각 항목의 순위/가격/평점/리뷰수는 텍스트 정규식으로 파싱한다.
    """
    blocks = page.eval_on_selector_all(
        "[data-asin]:not([data-asin=''])",
        """els => els.map(el => {
            const getContainer = (e) => e.closest('.a-cardui, [role="gridcell"], .zg-item-immersion, .zg-grid-general-faceout, .p13n-grid-content') || e;
            const container = getContainer(el);
            const textOf = (selector) => {
                const node = container.querySelector(selector);
                return node ? (node.innerText || node.textContent || node.getAttribute('aria-label') || '').trim() : null;
            };
            const attrOf = (selector, attr) => {
                const node = container.querySelector(selector);
                return node ? node.getAttribute(attr) : null;
            };
            
            // For review text, sometimes it's just a raw number next to the stars inside .a-icon-row
            return {
                asin: el.getAttribute('data-asin'),
                text: container.innerText || container.textContent || '',
                rankText: textOf('.zg-bdg-text, [class*="zg-bdg"]'),
                priceText: textOf('.a-price .a-offscreen, .p13n-sc-price, .a-color-price'),
                ratingText: attrOf('.a-icon-alt', 'textContent') || textOf('.a-icon-alt'),
                ratingLabel: attrOf('[aria-label*="5つ星"]', 'aria-label'),
                reviewText: textOf('a[href*="customerReviews"] span, a[href*="#customerReviews"] span, .a-icon-row .a-size-small, .a-icon-row a:not([title])'),
                reviewLabel: attrOf('a[href*="customerReviews"], a[href*="#customerReviews"], [aria-label*="個の評価"], [aria-label*="件のカスタマーレビュー"]', 'aria-label')
            };
        })""",
    )

    items = []
    seen = set()
    for b in blocks:
        asin = b.get("asin")
        if not asin or asin in seen:
            continue
        seen.add(asin)
        text = b.get("text") or ""

        rank_text = _first_value(b.get("rankText"), text)
        price_text = _first_value(b.get("priceText"), text)
        rating_text = _first_value(b.get("ratingText"), b.get("ratingLabel"), text)
        review_text = _first_value(b.get("reviewText"), b.get("reviewLabel"), text)

        rank_match = RANK_RE.search(rank_text or "")
        price_match = PRICE_RE.search(price_text or "")
        rating_match = RATING_RE.search(rating_text or "")
        review_match = REVIEW_RE.search(review_text or "")

        review_count = None
        if review_match:
            review_count = next((g for g in review_match.groups() if g), None)
        elif review_text and NUMBER_RE.fullmatch(review_text.strip()):
            review_count = review_text.strip()

        # 상품명 추정: 순위 표기(#1위 등) 줄을 제외한 첫 유의미한 줄
        name = None
        for line in (l.strip() for l in text.split("\n") if l.strip()):
            if RANK_RE.fullmatch(line):
                continue
            if len(line) > 5:
                name = line
                break

        rank = int(rank_match.group(1)) if rank_match else (page_num - 1) * ITEMS_PER_PAGE + len(items) + 1
        items.append(
            {
                "asin": asin,
                "rank": rank,
                "name": name,
                "price": price_match.group(0) if price_match else None,
                "rating": float(rating_match.group(1)) if rating_match else None,
                "review_count": review_count,
                "url": f"https://www.amazon.co.jp/dp/{asin}",
            }
        )

    return items


def _load_all_visible_items(page, expected_count: int) -> None:
    previous_count = 0
    stable_rounds = 0

    for _ in range(12):
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(1200)

        current_count = page.locator("[data-asin]:not([data-asin=''])").count()
        if current_count >= expected_count:
            break

        if current_count == previous_count:
            stable_rounds += 1
            if stable_rounds >= 3:
                break
        else:
            stable_rounds = 0
            previous_count = current_count

    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(500)


def scrape_category(page, category_key, category, screenshots_dir, run_ts):
    """카테고리 1개에 대해 최대 100위(2페이지)까지 데이터와 스크린샷을 수집한다."""
    all_items = []
    cat_dir = Path(screenshots_dir) / run_ts.strftime("%Y-%m-%d")
    cat_dir.mkdir(parents=True, exist_ok=True)

    for page_num in range(1, MAX_PAGES + 1):
        url = _page_url_for(category["url"], page_num)
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(3000)
            bypass_interstitial(page)
            page.wait_for_selector("[data-asin]", timeout=20000)
            _load_all_visible_items(page, ITEMS_PER_PAGE)
        except Exception as e:
            logger.error("페이지 로드 실패 (%s, page %s): %s", category_key, page_num, e)
            continue

        screenshot_path = cat_dir / f"{run_ts.strftime('%Y%m%d_%H')}_{category_key}_{page_num}.png"
        try:
            page.screenshot(path=str(screenshot_path), full_page=True)
        except Exception as e:
            logger.error("스크린샷 실패 (%s, page %s): %s", category_key, page_num, e)

        page_items = _extract_items_from_page(page, page_num)
        logger.info("%s page %s: %d개 항목 감지", category_key, page_num, len(page_items))
        all_items.extend(page_items)
        time.sleep(1)

    return all_items

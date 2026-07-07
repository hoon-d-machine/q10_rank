import logging
from pathlib import Path

from scraper.browser_utils import bypass_interstitial

logger = logging.getLogger(__name__)

ZIP_INPUT_SELECTOR = "#GLUXZipUpdateInput, #GLUXZipUpdateInput_0, #GLUXZipUpdateInput_1"


def _zip_modal_open(page) -> bool:
    try:
        return page.locator(ZIP_INPUT_SELECTOR).first.is_visible()
    except Exception:
        return False


def _open_location_modal(page) -> None:
    """배송지 모달을 연다.

    서울 등 한국 IP로 접속하면 헤더 위에 국경간 배송 배너
    ('韓国へ発送する商品を表示しています...')가 뜨는데, 이 배너의
    '住所を変更' 버튼을 누르면 곧바로 배송지 모달('場所を選択')이 열린다.
    이미 그 모달이 열렸으면 nav-global-location-popover-link는 절대
    누르지 않는다 (같은 버튼처럼 동작해서 다시 닫아버리는 토글 이슈가 있었음).
    배너가 없는 경우에만 nav 팝오버를 눌러 연다.
    """
    try:
        change_address_in_banner = page.get_by_text("住所を変更", exact=False).first
        if change_address_in_banner.count() and change_address_in_banner.is_visible():
            change_address_in_banner.click(timeout=5000)
            page.wait_for_timeout(1200)
            logger.info("국경간 배송 배너 감지 → 住所を変更 클릭으로 모달 오픈")
    except Exception:
        pass

    if _zip_modal_open(page):
        return  # 배너 클릭으로 이미 모달이 열렸으면 여기서 끝

    # 배너가 없거나 배너 클릭으로 안 열린 경우, 일반 nav 팝오버로 시도
    try:
        page.locator("#nav-global-location-popover-link").click(timeout=10000)
        page.wait_for_timeout(800)
    except Exception as e:
        logger.warning("nav 배송지 팝오버 클릭 실패: %s", e)


def _click_save_button(page) -> None:
    """우편번호 입력 후 저장 버튼을 누른다.
    구버전 GLUX 모달은 '#GLUXZipUpdate' id를 쓰지만,
    신버전 '場所を選択' 모달은 같은 id가 없고 텍스트가 '保存'인 버튼을 쓴다.
    id 우선 시도 후, 텍스트 기반으로 폴백한다.
    """
    id_button = page.locator("#GLUXZipUpdate")
    if id_button.count() and id_button.first.is_visible():
        id_button.first.click(timeout=5000)
        return

    text_button = page.get_by_role("button", name="保存", exact=False)
    if text_button.count() and text_button.first.is_visible():
        text_button.first.click(timeout=5000)
        return

    fallback = page.get_by_text("保存", exact=False).first
    if fallback.count():
        fallback.click(timeout=5000)
        return

    raise RuntimeError("우편번호 저장 버튼을 찾지 못했습니다.")


def _fill_postal_code(page, postal_code: str) -> None:
    digits = "".join(ch for ch in postal_code if ch.isdigit())

    split_first = page.locator("#GLUXZipUpdateInput_0")
    split_second = page.locator("#GLUXZipUpdateInput_1")
    if split_first.count() and split_second.count():
        split_first.fill(digits[:3])
        split_second.fill(digits[3:])
        return

    single_input = page.locator("#GLUXZipUpdateInput")
    if single_input.count():
        single_input.fill(digits)
        return

    raise RuntimeError("배송지 우편번호 입력칸을 찾지 못했습니다.")


def set_location(page, postal_code: str, debug_dir: str | None = None) -> bool:
    """
    Amazon.co.jp 상단의 배송지를 지정한 우편번호로 변경한다.

    Amazon은 이 모달의 UI/선택자를 종종 바꾸고, 접속 IP의 국가에 따라
    국경간 배송 배너가 끼어들기도 한다. 실패하더라도 전체 캡쳐가 중단되지
    않도록 예외를 흡수하고 False를 반환한다.
    debug_dir을 넘기면 설정 시도 직후 화면을 스크린샷으로 남겨
    실패 원인을 눈으로 바로 확인할 수 있다.
    """
    ok = False
    try:
        page.goto("https://www.amazon.co.jp/", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(1500)
        bypass_interstitial(page)

        _open_location_modal(page)

        page.wait_for_selector(ZIP_INPUT_SELECTOR, timeout=10000)
        _fill_postal_code(page, postal_code)
        _click_save_button(page)
        page.wait_for_timeout(1500)

        # 적용 확인 버튼 (모달 종류에 따라 없을 수도 있음)
        for selector in ("#GLUXConfirmClose", "input[name='glowDoneButton']", ".a-popover-footer button"):
            try:
                button = page.locator(selector).first
                button.wait_for(state="visible", timeout=5000)
                button.click(timeout=5000)
                break
            except Exception:
                pass

        # 신버전 '場所を選択' 모달은 저장 후 자동으로 닫히지 않고 남아있을 수 있어,
        # X 닫기 버튼이 여전히 보이면 직접 닫아준다.
        try:
            close_x = page.locator(
                "button[aria-label*='close'], button[aria-label*='閉じる'], .a-popover-header button"
            ).first
            if close_x.count() and close_x.is_visible():
                close_x.click(timeout=3000)
        except Exception:
            pass

        page.wait_for_timeout(2000)
        logger.info("배송지 설정 완료: %s", postal_code)
        ok = True

    except Exception as e:
        logger.warning("배송지 설정 실패 (기본 위치로 진행): %s", e)
        ok = False

    finally:
        if debug_dir:
            try:
                path = Path(debug_dir)
                path.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(path / "_debug_location.png"), full_page=False)
            except Exception as e:
                logger.warning("디버그 스크린샷 저장 실패: %s", e)

    return ok

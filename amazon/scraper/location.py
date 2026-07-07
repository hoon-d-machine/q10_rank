import logging

logger = logging.getLogger(__name__)


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


def set_location(page, postal_code: str) -> bool:
    """
    Amazon.co.jp 상단의 배송지를 지정한 우편번호로 변경한다.

    Amazon은 이 모달의 UI/선택자를 종종 바꾸기 때문에, 실패하더라도
    전체 캡쳐가 중단되지 않도록 예외를 흡수하고 False를 반환한다.
    선택자가 깨진 경우 이 함수만 다시 확인/수정하면 된다.
    """
    try:
        page.goto("https://www.amazon.co.jp/", wait_until="domcontentloaded", timeout=30000)

        # 배송지 변경 팝오버 열기
        page.locator("#nav-global-location-popover-link").click(timeout=10000)

        # Amazon.co.jp는 우편번호 입력칸이 1개 또는 3자리/4자리 2개로 노출될 수 있다.
        page.wait_for_selector(
            "#GLUXZipUpdateInput, #GLUXZipUpdateInput_0, #GLUXZipUpdateInput_1",
            timeout=10000,
        )
        _fill_postal_code(page, postal_code)
        page.locator("#GLUXZipUpdate").click(timeout=10000)

        # 적용 확인 버튼 (모달 종류에 따라 없을 수도 있음)
        for selector in ("#GLUXConfirmClose", "input[name='glowDoneButton']", ".a-popover-footer button"):
            try:
                button = page.locator(selector).first
                button.wait_for(state="visible", timeout=5000)
                button.click(timeout=5000)
                break
            except Exception:
                pass

        page.wait_for_timeout(2000)
        logger.info("배송지 설정 완료: %s", postal_code)
        return True

    except Exception as e:
        logger.warning("배송지 설정 실패 (기본 위치로 진행): %s", e)
        return False

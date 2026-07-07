import logging

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

# navigator.webdriver 등 자동화 티가 나는 값들을 지워서
# 봇 탐지 스크립트가 헤드리스 브라우저를 덜 의심하게 만든다.
STEALTH_INIT_SCRIPT = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
window.chrome = window.chrome || { runtime: {} };
Object.defineProperty(navigator, 'languages', { get: () => ['ja-JP', 'ja'] });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
"""

LAUNCH_ARGS = [
    "--disable-blink-features=AutomationControlled",
]


def new_stealth_context(browser, locale: str, viewport: dict):
    context = browser.new_context(
        locale=locale,
        viewport=viewport,
        device_scale_factor=1,
        user_agent=USER_AGENT,
        extra_http_headers={"Accept-Language": "ja-JP,ja;q=0.9"},
    )
    context.add_init_script(STEALTH_INIT_SCRIPT)
    return context


INTERSTITIAL_BUTTON_TEXTS = ["ショッピングを続ける", "続ける", "Continue shopping"]


def bypass_interstitial(page) -> bool:
    """'下のボタンをクリックしてショッピングを続けてください' 류의
    아마존 자동화 탐지 인터스티셜이 뜨면 버튼을 눌러 넘어간다.
    페이지 이동 직후마다 호출해서 걸리면 바로 통과시키는 용도.
    존재하지 않으면 아무 것도 하지 않고 False를 반환한다.
    """
    for text in INTERSTITIAL_BUTTON_TEXTS:
        try:
            btn = page.get_by_text(text, exact=False).first
            if btn.count() and btn.is_visible():
                btn.click(timeout=5000)
                page.wait_for_timeout(1500)
                logger.warning("아마존 인터스티셜(봇 체크) 감지 → 버튼 클릭으로 통과 시도")
                return True
        except Exception:
            pass
    return False

import base64
import logging
import os
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

from scraper.config import SCREENSHOTS_DIR, EXCEL_PATH, TIMEZONE

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def build_zip_for_date(date_str: str):
    """screenshots/{date_str} 폴더의 png들을 zip으로 묶는다. 폴더가 없으면 None."""
    folder = Path(SCREENSHOTS_DIR) / date_str
    if not folder.exists():
        logger.warning("스크린샷 폴더 없음: %s (이전 캡쳐가 실행되지 않았을 수 있음)", folder)
        return None

    zip_path = Path(SCREENSHOTS_DIR) / f"{date_str}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(folder.glob("*.png")):
            zf.write(f, arcname=f.name)
    return zip_path


def _file_to_attachment(path: Path):
    with open(path, "rb") as f:
        content = base64.b64encode(f.read()).decode()
    return {"content": content, "filename": path.name}


def send_with_resend(date_str: str, zip_path, excel_path):
    api_key = os.environ["RESEND_API_KEY"]
    receiver_email = os.environ["RECEIVER_EMAIL"]

    attachments = []

    if zip_path and Path(zip_path).exists():
        attachments.append(_file_to_attachment(Path(zip_path)))
    else:
        logger.warning("첨부할 스크린샷 zip이 없습니다.")

    excel_path = Path(excel_path)
    if excel_path.exists():
        attachments.append(_file_to_attachment(excel_path))
    else:
        logger.warning("첨부할 엑셀 파일이 없습니다: %s", excel_path)

    if not attachments:
        print("❌ 첨부할 파일이 없어 발송을 취소합니다.")
        return

    res = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "from": "onboarding@resend.dev",
            "to": [receiver_email],
            "subject": f"🚀 아마존 재팬 뷰티 랭킹 리포트 ({date_str})",
            "html": f"<p>{date_str}에 수집된 스크린샷과 누적 랭킹 데이터를 첨부합니다.</p>",
            "attachments": attachments,
        },
    )
    print("📧 발송 완료" if res.status_code in (200, 201) else f"❌ 실패: {res.text}")


def main():
    now = datetime.now(ZoneInfo(TIMEZONE))
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")

    zip_path = build_zip_for_date(yesterday)
    send_with_resend(yesterday, zip_path, EXCEL_PATH)


if __name__ == "__main__":
    main()

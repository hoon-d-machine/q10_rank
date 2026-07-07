import logging
import os
import smtplib
import zipfile
from datetime import datetime, timedelta
from email.message import EmailMessage
from pathlib import Path
from zoneinfo import ZoneInfo

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


def send_email(date_str: str, zip_path, excel_path):
    smtp_server = os.environ["SMTP_SERVER"]
    smtp_port = int(os.environ.get("SMTP_PORT", 587))
    smtp_user = os.environ["SMTP_USER"]
    smtp_pass = os.environ["SMTP_PASS"]
    to_addr = os.environ["EMAIL_TO"]

    msg = EmailMessage()
    msg["Subject"] = f"[아마존 재팬 뷰티 랭킹] {date_str} 캡쳐 결과"
    msg["From"] = smtp_user
    msg["To"] = to_addr
    msg.set_content(f"{date_str}에 수집된 스크린샷과 누적 랭킹 데이터를 첨부합니다.")

    if zip_path and Path(zip_path).exists():
        with open(zip_path, "rb") as f:
            msg.add_attachment(
                f.read(), maintype="application", subtype="zip", filename=Path(zip_path).name
            )
    else:
        logger.warning("첨부할 스크린샷 zip이 없습니다.")

    excel_path = Path(excel_path)
    if excel_path.exists():
        with open(excel_path, "rb") as f:
            msg.add_attachment(
                f.read(),
                maintype="application",
                subtype="vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                filename=excel_path.name,
            )
    else:
        logger.warning("첨부할 엑셀 파일이 없습니다: %s", excel_path)

    with smtplib.SMTP(smtp_server, smtp_port) as server:
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)

    logger.info("이메일 발송 완료: %s", to_addr)


def main():
    now = datetime.now(ZoneInfo(TIMEZONE))
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")

    zip_path = build_zip_for_date(yesterday)
    send_email(yesterday, zip_path, EXCEL_PATH)


if __name__ == "__main__":
    main()

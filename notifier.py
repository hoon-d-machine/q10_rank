import os, requests, base64, pandas as pd
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
today_str = datetime.now(KST).strftime('%Y-%m-%d')
def send_with_resend():
    api_key = os.getenv("RESEND_API_KEY")
    receiver_email = os.getenv("RECEIVER_EMAIL")
    output_file = "Qoo10_Full_Data_Report.xlsx"
    files = {"Daily_All": "data/bestseller_daily.csv", "Weekly_All": "data/official_weekly.csv", "Monthly_All": "data/official_monthly.csv"}

    if not any(os.path.exists(f) for f in files.values()):
        print("❌ 첨부할 데이터 파일이 없습니다.")
        return

    with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
        for sheet_name, path in files.items():
            if os.path.exists(path):
                pd.read_csv(path).to_excel(writer, sheet_name=sheet_name, index=False)

    with open(output_file, "rb") as f:
        file_content = base64.b64encode(f.read()).decode()

    res = requests.post("https://api.resend.com/emails", 
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "from": "onboarding@resend.dev",
            "to": [receiver_email],
            "subject": f"🚀 Qoo10 누적 데이터 리포트 ({today_str})",
            "html": f"<p>{today_str} 기준 리포트입니다.</p>",
            "attachments": [{"content": file_content, "filename": output_file}]
        }
    )
    print("📧 발송 완료" if res.status_code in [200, 201] else f"❌ 실패: {res.text}")

if __name__ == "__main__":
    send_with_resend()

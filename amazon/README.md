# Amazon.co.jp 뷰티 카테고리 랭킹 트래커

3개 카테고리(뷰티 전체 / 스킨케어>기초화장품>미용액 / 메이크업>베이스메이크업>파우더)의
아마존 재팬 베스트셀러 랭킹(1~100위)을 09:00~00:00(KST) 사이 3시간 간격으로 캡쳐하고,
매일 08:00에 전날 캡쳐분을 이메일로 발송합니다.

## 전체 흐름

1. `cron-job.org`가 지정된 시간마다 GitHub API를 호출해 `amazon_capture.yml` 워크플로우를 실행
2. 워크플로우 안에서 Playwright가 배송지(602-8238)를 설정한 뒤 3개 카테고리 x 2페이지를 순회하며
   - 전체 페이지 스크린샷 저장 (`screenshots/YYYY-MM-DD/YYYYMMDD_HH_카테고리_페이지.png`)
   - 랭킹 데이터를 파싱해 누적 엑셀(`data/rankings.xlsx`)에 append
3. 결과물을 같은 repo에 자동 커밋
4. 매일 08:00(KST)에 `cron-job.org`가 `amazon_send_email.yml`을 트리거 → **전날** 스크린샷 폴더를 zip으로 묶고
   누적 엑셀과 함께 지정 이메일로 발송

## 1. GitHub 저장소 준비

1. `amazon/` 폴더와 `.github/workflows/amazon_*.yml` 파일을 기존 repo에 추가
2. `Settings > Actions > General > Workflow permissions`에서 **"Read and write permissions"** 선택
   (Actions가 결과물을 커밋/푸시하려면 필요)

## 2. GitHub Secrets 설정

`Settings > Secrets and variables > Actions > New repository secret`에서 아래 값 등록:

| Secret | 설명 |
|---|---|
| `SMTP_SERVER` | 예: `smtp.gmail.com` |
| `SMTP_PORT` | 예: `587` |
| `SMTP_USER` | 발신 이메일 계정 |
| `SMTP_PASS` | 앱 비밀번호 (Gmail은 일반 로그인 비밀번호 대신 [앱 비밀번호](https://myaccount.google.com/apppasswords) 사용 필요) |
| `EMAIL_TO` | 수신 이메일 주소 |

## 3. GitHub Personal Access Token (cron-job.org용)

`cron-job.org`가 외부에서 워크플로우를 실행시키려면 GitHub API 호출 권한이 있는 토큰이 필요합니다.

1. GitHub `Settings > Developer settings > Personal access tokens > Fine-grained tokens`
2. Repository access: 이 repo만 선택
3. Permissions: **Actions → Read and write**
4. 생성된 토큰(`github_pat_...`)을 복사해둠 (한 번만 표시됨)

## 4. cron-job.org 설정

가입 후 Job을 **2개** 생성합니다. (무료 플랜에서 커스텀 cron 표현식 + 타임존 지정 가능)

### Job 1: 캡쳐 (3시간 간격)

- URL: `https://api.github.com/repos/{owner}/{repo}/actions/workflows/amazon_capture.yml/dispatches`
- Method: `POST`
- Headers:
  - `Authorization: Bearer {발급받은 토큰}`
  - `Accept: application/vnd.github+json`
  - `Content-Type: application/json`
- Body: `{"ref":"main"}`
- Schedule: Custom cron → `0 9,12,15,18,21,0 * * *`
- Timezone: `Asia/Seoul`

### Job 2: 이메일 발송 (매일 08:00)

- URL: `https://api.github.com/repos/{owner}/{repo}/actions/workflows/amazon_send_email.yml/dispatches`
- Method/Headers/Body: 위와 동일
- Schedule: `0 8 * * *`
- Timezone: `Asia/Seoul`

## 로컬 테스트 방법

```bash
pip install -r requirements.txt
playwright install chromium
python capture_and_scrape.py
python send_daily_email.py   # SMTP 환경변수 미리 export 필요
```

## 알아두어야 할 점 (중요)

- **선택자(selector) 안정성**: 배송지 설정(`scraper/location.py`)과 데이터 파싱(`scraper/scrape.py`)은
  아마존이 페이지 구조를 바꾸면 깨질 수 있습니다. 특히 배송지 모달은 실패해도 캡쳐 자체는 계속
  진행되도록 만들어뒀지만, 배송지가 반영되지 않으면 카테고리/가격이 사용자 화면과 달라질 수 있어요.
  최초 몇 회 실행 후 `screenshots` 결과와 `data/rankings.xlsx`를 꼭 확인해보세요.
- **데이터 파싱은 규칙 기반(정규식 + DOM 선택자)**: 상품명/가격/평점/리뷰수는 `data-asin` 블록의
  DOM 요소와 텍스트를 함께 확인해 추출합니다. 실제 실행 결과에서 특정 필드가 계속 비어 있다면, 스크린샷 속 텍스트를
  캡쳐해서 알려주시면 정규식을 다시 맞춰드릴 수 있어요. (이 개발 환경에서는 amazon.co.jp에 직접
  접속해 테스트할 수 없어 실제 페이지 구조로 검증하지 못한 상태입니다.)
- **이메일 첨부 용량**: 하루 6회 x 3카테고리 x 2페이지 = 36장의 풀페이지 스크린샷이 쌓입니다.
  메일 서비스의 첨부파일 용량 제한(Gmail 약 25MB)을 넘으면 발송이 실패하니, 필요하면
  스크린샷을 페이지 1개만 찍거나 이미지 압축 로직을 추가할 수 있어요.
- **엑셀은 계속 누적**: `data/rankings.xlsx`는 절대 덮어쓰지 않고 매 실행마다 행이 추가되는
  구조라 시간이 지날수록 파일이 커집니다. 필요하면 분기별로 새 파일로 분리하는 로직을 추가할 수 있어요.

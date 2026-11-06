# DY-AI Q10 수집 (크롬 확장 프로그램)

DY-AI 메인의 **Q10 수집** 버튼을 누르면 Qoo10 판매자 통계를 수집해 원본 엑셀(raw 시트 3개)에 덮어쓰거나 새 xlsx로 저장합니다.
수집 API·기간·컬럼은 `inni_RPA/Qoo10_RPA.py` 와 같습니다.

## 설치 (개발자 모드)
DY-AI 메인 아래 설명서에서 zip을 받아 압축을 풀고 아래 순서대로 합니다. (이 폴더를 직접 로드해도 됨)

1. 크롬 주소창에 `chrome://extensions` 입력
2. 오른쪽 위 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램 로드** → `dy-ai-q10-extension` 폴더(또는 `dy-ai/extension`) 선택
4. DY-AI 메인 페이지가 열려 있었다면 새로고침

코드를 고친 뒤에는 `chrome://extensions` 에서 이 확장의 새로고침 아이콘을 누르고, DY-AI 페이지도 새로고침합니다.

## 동작
1. 메인의 **Q10 수집** 클릭 → 확장이 `seller.qoo10.jp/ko/trade` 탭을 연다
2. 로그인 안 돼 있으면 QSM 로그인 화면이 뜬다. 확장 설정(옵션 화면, DY-AI 6단계 'Qoo10 로그인 정보 설정')에 저장한 아이디·비밀번호를 자동 입력하고(`qsm-login.js`, 수집 중 확장이 연 탭에서만), reCAPTCHA·로그인 버튼은 직접. 로그인 뒤 `#ep_id` 아이디 확인 화면은 자동 입력 + 확인 클릭. 최대 10분 대기
3. 로그인되면 판매자 페이지 요청에서 `Authorization` / `X-SELL-CUST-NO` 헤더를 잡아 그 탭 안에서 API 호출
4. Qoo10 탭을 닫고 수집 결과를 DY-AI 페이지로 넘김 → 페이지가 저장
   - 버튼을 누를 때 고른 원본 엑셀에서 raw_data / raw_trade / raw_conversion 만 교체 (전전월 1일 이전 행은 유지, 다른 시트·서식·수식 그대로)
   - 엑셀에서 열려 있어 저장이 안 되면 [파일을 닫고 다시 시도] [새로운 파일로 저장] [취소] 선택 (다시 시도해도 열려 있으면 반복)
   - "새 파일로 받기"를 골랐으면 `Qoo10_RPA_data_YYYYMMDD_HHMM.xlsx` 다운로드
   - DY-AI 탭이 닫혀 있으면 확장이 직접 새 파일로 다운로드

| 시트 | API | 기간 |
|---|---|---|
| raw_data | `/api/transaction/table/date-goods` (일자/품목별 거래) | 전전월 1일 ~ 어제, 월 단위 |
| raw_trade | `/api/transaction/table/date` (일자별 거래) | 전전월 1일 ~ 어제, 31일 단위 |
| raw_conversion | `/api/pageview/table/date` (일자별 페이지뷰) | 전전월 1일 ~ 어제, 31일 단위 |

진행 상황은 DY-AI 화면 아래 토스트로 표시됩니다. 하나라도 실패하면 파일을 만들지 않습니다(부분 데이터 방지).

## 파일
- `manifest.json` — MV3. DY-AI 사이트(`dy-ai.xogns1381.workers.dev`, 로컬 `localhost:8765`)에서만 연결
- `bridge.js` — DY-AI 페이지 ↔ 확장 메시지 중계 (`window.postMessage`)
- `background.js` — 로그인 대기, 토큰 캡처, 수집, 다운로드
- `qsm-login.js` — QSM 로그인 창 자동 입력 (Qoo10_RPA.py qsm_login 과 같은 칸)
- `options.html` / `options.js` — Qoo10 로그인 정보 저장 (chrome.storage.local, 이 PC에만)
- `xlsx-writer.js` — 의존성 없는 xlsx 생성기 + zip 도구. 사이트(`public/assets/xlsx-writer.js`)도 이 파일의 사본을 씀 → 고친 뒤 빌드 스크립트 실행

DY-AI 주소가 바뀌면 `manifest.json` 의 `content_scripts.matches` 도 바꿔야 합니다.

## 배포
`manifest.json` 의 version 을 올리고 `python dy-ai/tools/build_extension.py` → `public/downloads/` 의 zip과 `extension.json` 이 갱신된다.
메인 화면은 설치된 확장 버전과 `extension.json` 을 비교해, 같으면 다운로드 버튼을 잠근다.

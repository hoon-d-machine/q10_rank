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

## 추가 수집 (0.5.0~)
판매 3종 수집이 끝나면 같은 버튼으로 아래 항목도 모아서 DB 에만 반영한다(엑셀·구글 시트는 위 3개 그대로). `extra.js` 가 `inni_RPA` 의 `qsm_extra.py` · `ads_extra.py` · `qsm_cpm.py` 와 같은 API·검증·열로 수집한다.

| 항목 | 출처 | 기간 |
|---|---|---|
| 상품별 일자 PV | 판매자센터 `pageview/table/date-goods` (스토어 총 PV 와 합계가 같을 때까지 재시도) | 전전월 1일 ~ 어제, 10일 단위 |
| 고객(일자) | `customer/table/date` | 같음 |
| 찜·장바구니 스냅샷 | `customer/table/goods` (수집한 날의 누적값) | 오늘 하루 |
| 행사 달력(메가와리·메가포) | 광고센터 `calendar/mega` | 전체 |
| 일별 광고비·광고 매출(유형별) | 광고센터 `sales/chart` (유형별 합 = 전체 검증) | 전전월 1일 ~ 어제 (2026-02~) |
| 상품별 광고 | 광고센터 `goods/rank` (일자별 광고 매출 합 = 전체 검증) | 최근 14일 |
| 광고 키워드 노출·클릭·구매 | 광고센터 `keyword/rank` | 최근 28일, 7일 단위 |
| Beauty Brand AD(CPM) 캠페인·일자별·키워드 | QSM `CPMList.aspx` · `InnerAjax/*` | 최근 35일과 겹치는 캠페인 |

- 광고센터는 새 탭(`ads.qoo10.jp/conversion`)을 열어 QSM 로그인(SSO)으로 붙은 요청의 `Authorization` 을 잡아 쓰고, QSM 화면은 `CPMManagementReport.aspx` 탭 안에서 호출한다. 끝나면 두 탭을 닫는다.
- 한 묶음이 실패해도 나머지는 계속하고, 실패한 묶음은 DY-AI 로그 메뉴에 남는다. 판매 3종 결과와 엑셀 저장은 영향받지 않는다.
- DB 반영은 로그인 사용자 권한으로 `inni_replace_*` 함수를 호출한다(`supabase/web_collector.sql` 3번 구간, 페이지 쪽 `public/assets/q10-extra.js`). 추가 항목은 DY-AI 페이지로 넘길 때만 수집한다(페이지가 없어 xlsx 만 내려받는 경우엔 건너뜀).
- 0.5.0 은 `ads.qoo10.jp` 접근 권한이 새로 필요해서, 업데이트 뒤 크롬이 확장을 꺼 두면 `chrome://extensions` 에서 다시 켜 주세요.

## 수집기 페이지 없이 저장 (0.6.0~)
수집 중에 수집기 페이지를 벗어나거나 탭을 닫아도 확장이 결과를 잃지 않는다.
- 사이트 페이지(`auth.js`)가 로그인 세션(access_token 만, refresh_token 은 제외)을 확장에 넘겨 두고(`bridge.js` → `background.js` 의 `chrome.storage.local.dySession`), 수집기 페이지가 열려 있지 않을 때 `save.js` 가 그 세션으로 **DB(판매 3종) · 구글 시트(Worker `/api/sheet/*`) · 추가 항목 · 수집 로그**를 직접 저장한다. 페이지가 열려 있으면 지금처럼 페이지가 저장한다(엑셀 원본 포함).
- 엑셀 원본은 브라우저 보안상 페이지에서만 열 수 있어서, 확장이 저장하는 경우에는 새 xlsx 파일을 내려받는다.
- 세션이 없거나 만료(1시간)돼서 저장하지 못하면 결과를 `pendingResult` 로 보관하고, 수집기 페이지를 열면 "저장하지 못한 수집 결과가 있어요" 모달로 저장할지 묻는다(48시간).
- 수집기가 아닌 DY-AI 페이지로 이동했다면 진행·완료 안내가 그 페이지의 토스트(`[Q10 수집] …`)로 보인다.
- 새 권한: `dy-ai.xogns1381.workers.dev`(시트 Worker), `*.supabase.co`(DB), 로컬 `localhost:8765`.

## 파일
- `manifest.json` — MV3. DY-AI 사이트(`dy-ai.xogns1381.workers.dev`, 로컬 `localhost:8765`)에서만 연결
- `bridge.js` — DY-AI 페이지 ↔ 확장 메시지 중계 (`window.postMessage`)
- `background.js` — 로그인 대기, 토큰 캡처, 수집, 다운로드, 추가 수집용 탭(광고센터·QSM) 열기
- `save.js` — 수집기 페이지 없이 DB·시트·추가 항목·로그를 저장 (`q10-sync.js`·`q10-extra.js`·`q10-log.js` 와 같은 규칙, 세션은 사이트가 넘겨 줌)
- `extra.js` — 추가 수집 로직(판매자센터·광고센터·QSM). `ctx` 만 바꾸면 Node 에서도 시험 가능
- `qsm-login.js` — QSM 로그인 창 자동 입력 (Qoo10_RPA.py qsm_login 과 같은 칸)
- `options.html` / `options.js` — Qoo10 로그인 정보 저장 (chrome.storage.local, 이 PC에만)
- `xlsx-writer.js` — 의존성 없는 xlsx 생성기 + zip 도구. 사이트(`public/assets/xlsx-writer.js`)도 이 파일의 사본을 씀 → 고친 뒤 빌드 스크립트 실행

DY-AI 주소가 바뀌면 `manifest.json` 의 `content_scripts.matches` 도 바꿔야 합니다.

## 배포
`manifest.json` 의 version 을 올리고 `python dy-ai/tools/build_extension.py` → `public/downloads/` 의 zip과 `extension.json` 이 갱신된다.
메인 화면은 설치된 확장 버전과 `extension.json` 을 비교해, 같으면 다운로드 버튼을 잠근다.

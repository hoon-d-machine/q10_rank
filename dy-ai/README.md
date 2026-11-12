# DY-AI

Cloudflare Workers(정적 자산)로 서빙하는 개인용 사이트. 지금은 UI 단계입니다.

## 화면
- `public/index.html` — 로그인 화면 (루트 `/`, Supabase Auth 이메일+비밀번호. 아이디만 넣으면 `@LOGIN_EMAIL_DOMAIN` 을 붙임)
- `public/assets/config.js` — Supabase URL / anon key / 로그인 이메일 도메인 설정
- `public/main.html` — 수집기 (`/main`, 로그인 안 돼 있으면 `/`로 보냄, 탑바 왼쪽 로고 + 메뉴(수집기·대시보드·데이터·로그) + 오른쪽 테마 선택·로그아웃, 가운데 Q10 수집 버튼 → 크롬 확장이 수집 → 원본 엑셀의 raw 시트 3개 덮어쓰기 또는 새 파일)
- 테마 3종: 러그(기본) / 풀잎(녹차 잎·돌·잎 그림자 실사 무드, 포인트 #11af5d) / 다크(해 질 녘 사진풍 배경, 에디토리얼 레이아웃). `assets/theme.js` 가 `<html data-theme>` 와 localStorage(`dy.theme`)를 관리하고, 덮어쓰기 스타일은 `assets/themes.css`, 테마별 SVG 그림과 배경 장면(.theme-scene/.theme-front)은 `assets/dy.js`
- 원본 엑셀 덮어쓰기: `assets/q10-save.js`(파일 고르기·권한·실패 시 다시 시도/새 파일/취소) + `assets/xlsx-patch.js`(대상 시트만 교체, 전전월 1일 이전 행 유지). `assets/xlsx-writer.js` 는 `extension/xlsx-writer.js` 의 사본(빌드 스크립트가 복사)
- 수집 후 순서: 엑셀 저장 → DB(Supabase `inni_replace_*` 함수, 로그인 사용자 권한) → 구글 시트(Worker `/api/sheet/*` 경유). 규칙은 `inni_RPA/Qoo10_RPA.py` 와 같음 (전전월 1일 이후 구간 교체). `assets/q10-sync.js`
- `public/logs.html` — 수집 로그 (`/logs`). 수집 한 번 = 묶음 하나, 단계별 기록은 클릭하면 펼침. 기록은 `assets/q10-log.js`, 화면은 `assets/logs.js`
- `public/dashboard.html` — 대시보드 (`/dashboard`). 기간·지표·단위를 골라 집계, 템플릿(기본 현황·전년 비교·분기 비교·주간 변화·월간 변화·유입 분석·상품 분석), 편집 모드에서 위젯 추가·설정·이동·너비·삭제, Supabase `dy_dashboards` 에 저장. 지표 목록·기간 계산·집계는 `assets/dash-core.js`, 화면은 `assets/dash.js`(Chart.js)
- 대시보드의 **inni 탭**(`#inni/sales` · `#inni/product` · `#inni/onsite` · `#inni/megapo`): AP Talk 시트의 월간 리포트 4종(SALES · PRODUCT · ONSITE AD · MEGAPO)을 하나씩 구현하는 곳. 탭 전환은 `assets/inni.js`, 스타일 `assets/inni.css`. 각 탭의 화면은 만드는 대로 `data-pane` 안에 채운다(지금은 틀만)
  - 각 리포트 툴바의 **설명** 버튼(`assets/inni-help.js`)은 화면 설명·숫자 정의·코멘트 기준·설정/엑셀 사용법을 모달로 보여 준다. 내용은 그 파일의 `HELP`에 있고, 코멘트 규칙(`autoLines`)을 바꾸면 같이 고친다. SALES·PRODUCT 에 있고 ONSITE AD·MEGAPO 는 만들 때 추가
  - **SALES**(`assets/inni-sales.js`): 회계연도(BY, 7월~6월) 선택 + 기준 월 선택. 월별 SALES·YoY·TGT·TGT %·PV·ORDERS·CVR·AOV(+누계), BY 별 월 매출 추이(그래프·표), 코멘트(자동 생성 + 직접 입력). 오른쪽 위 '설정' 버튼(모달 탭: 코멘트 · 강조 · 그래프)에서 직접 입력 코멘트(기준 월마다), 표 강조(표마다 행·열·색, 회계연도마다), 그래프 종류(막대 기본/꺾은선, 회계연도마다)를 설정하고 `inni_comments`·`inni_settings`에 저장. '엑셀 다운로드'는 ExcelJS(첫 사용 때 CDN 로드)로 화면과 같은 서식·강조 색·그래프 그림이 든 'SALES' 시트와 월별 원본 '월별 데이터' 시트를 만든다. 기준 월 이후 달은 표·그래프에서 숨김(이전 회계연도는 전체). SALES=순매출, ORDERS=구매수(purchase_cnt), CVR=ORDERS÷PV, AOV=SALES÷ORDERS. 진행 중인 달은 같은 일수끼리 비교(헤더 *). 월별 목표는 화면의 '월별 목표 입력'(천 엔 단위, DB 기간~회계연도 말)에서 입력, 코멘트와 함께 `supabase/inni.sql`(표 `inni_targets`·`inni_comments`·`inni_settings`, 함수 `dy_inni_*`)에 저장
  - **PRODUCT**(`assets/inni-product.js`): 라인별·카테고리별 막대 그래프(값 축은 0부터, 막대 끝에 값 표시, 설정에서 당월 vs 작년 동월 / 누계 vs 작년 누계·가로/세로) + 상품별 상세(No.·상품명, Sales(당월·상품수량·LY 상품수량·YoY)·PV(당월·YoY)·CVR(당월·YoY GAP)·온사이트 광고·YTD(Sales·LY·YoY·%), 당월 매출이 있는 상품만, 합계 행. 시트에서 '숨김 영역'이던 상품번호·라인·카테고리와 Sales·PV·CVR 의 작년 동월 열은 표·엑셀에서 뺌). 매출=상품 순수금액, CVR=수량÷PV, 누계=회계연도 7월~기준 월, 진행 중인 달은 같은 일수 비교. 라인·카테고리는 상품코드표(`inni_product_codes`, 영문 카테고리는 한글로 바꿔 표시, 없으면 '(미분류)'). 온사이트 광고 열은 광고 데이터가 연결되기 전까지 '-'. 이 화면은 카드가 화면 폭 가득(`.dash-inner.is-wide`, 약 1,500px 이하 화면에서만 표 가로스크롤). 설정(코멘트·강조(상품별 상세 표)·그래프)·엑셀은 SALES 와 같은 방식(`inni_settings` report='product')
- `public/data.html` — 데이터 (`/data`). 원본 표 8개(일자·품목별 거래 / 일자·상품별 PV / 일자별 거래 / 일자별 페이지뷰 / 고객(일자별) / 찜·장바구니(스냅샷) / 랭킹(일·주·월) / 상품코드)를 기간·검색·페이지로 보고, 엑셀(xlsx)로 내려받기(이 표 / 표 8개). 품목별 거래에는 상품코드표의 제품명·라인·카테고리가 붙음. 화면은 `assets/data.js`, 엑셀은 `assets/xlsx-writer.js`
- `supabase/data_view.sql` — 데이터 화면용 읽기 함수 `dy_data_page` (표는 계속 잠금, 로그인 사용자만 호출). Supabase SQL Editor 에서 한 번 실행
- 대시보드·데이터의 상품별 PV·고객 데이터: `inni_pageview_goods`(일자×상품 PV), `inni_customer_daily`(신규·기존 구매자·팔로워·샵 방문), `inni_customer_goods`(찜·장바구니 스냅샷)는 `inni_RPA/qsm_extra.py` 가 쌓는다(표 SQL `inni_RPA/supabase_schema_extra.sql`). 대시보드 지표 그룹 '상품별'(상품 PV·CVR)·'상품 유입 경로(PV)'·'상품별 찜·장바구니'·'고객·팔로워', 템플릿 '고객·상품 PV'. 'goods' 소스는 판매+PV를 합친 뷰 `inni_goods_daily`(dashboard.sql 이 만듦)를 읽는다. 상품 CVR = 상품 순수량 ÷ 상품 PV. 찜·장바구니는 누적 스냅샷이라 기간에 여러 개면 평균을 보여 주고, 수집한 날 아침에 찍혀 기준일(어제)의 하루 뒤까지 포함한다
- `supabase/dashboard.sql` — 대시보드용 집계 함수(`dy_dash_agg`, `dy_dash_bounds`, 표는 계속 잠금) + `dy_dashboards` 표. Supabase SQL Editor 에서 한 번 실행
- `supabase/rank_log.sql` — Q10 랭킹 기록 표 `q10_rank_log`(루트 `data/*.csv` 3개와 같은 내용)와 이니스프리(イニスフリー) 날짜·구분·카테고리별 요약 뷰 `inni_rank_cat`(진입 수량 cnt, 순위 합 rank_sum). SQL Editor 에서 실행한 뒤 `dashboard.sql` 을 다시 실행(대시보드의 `rank_d`·`rank_w`·`rank_m` 소스, 묶음 '랭킹 카테고리'). 기존 CSV(2026-01-07~10-28, 36,890행)는 DB 로 옮겼고 git 의 CSV 방식(csv_logger.py·Actions)은 없앴다. 이후 수집은 아래 Cloudflare 예약 작업이 DB 에 직접 쓴다. 대시보드 템플릿 '랭킹·판매 대조'(카테고리별 진입 수량·평균 순위 선그래프), 지표 그룹 '랭킹(이니스프리)'
- 예약 작업(Cloudflare cron, `wrangler.jsonc` triggers.crons, UTC): 매일 15:20(=00:20 KST) Q10 랭킹 수집 → DB (`src/rank_collect.js`, 일간 200위 + 월요일 주간 + 1일 월간), 월요일 00:00(=09:00 KST) 주간 랭킹 리포트 xlsx 메일 (`src/rank_report.js`, Resend). 수집 실패·메일 실패는 알림 메일(설정돼 있을 때)과 Workers 로그로 확인. 수동 실행: `POST /api/cron/rank?only=daily|weekly|monthly&dry=1`, `POST /api/cron/report?dry=1` + 헤더 `x-cron-token`. secret: `SUPABASE_SERVICE_KEY`, `CRON_TOKEN`, `RESEND_API_KEY`, `RECEIVER_EMAIL` (`npx wrangler secret put 이름`). 예전 cron-job.org 의 daily/weekly 작업은 삭제
- `public/event.html` — 행사 랭킹 (`/event`). 예전 Streamlit 대시보드(dashboard.py)를 옮긴 화면: 행사(SID)·랭킹 기준·타겟·기간·상위 N·브랜드 선택(즐겨찾기 색), 탭 3개(순위 트렌드 / 가격·리뷰 분석 / 카테고리 점유율, Plotly), 현재 데이터·전체 원본 CSV. 맨 위 '수집 설정'에서 행사 번호(SID)와 켜기/끄기, '지금 한 번 수집'. 화면은 `assets/event.js`, 스타일 `assets/event.css`
- `supabase/event_rank.sql` — 행사 랭킹용 설정 표 `dy_event_config`, 읽기 함수(`dy_event_meta`·`dy_event_rows`), 즐겨찾기 권한, `qoo10_rankings`·`brand_favorites` 표 잠금(예전에는 공개 키로 누구나 읽고 쓸 수 있었음). SQL Editor 에서 실행
- 행사 랭킹 수집: 매일 14:00 UTC(=23:00 KST) Cloudflare cron (`src/event_collect.js`, 예전 collector.py·Actions·cron-job.org 대체). SID 가 켜져 있을 때만 돌고 행사가 아니면 건너뜀. 새 상품은 상세 페이지에서 브랜드·카테고리·리뷰를 읽음(한 번에 최대 150개)
- `src/worker.js` — `/api/*` 만 처리하는 Worker (구글 시트 프록시, Supabase 로그인 토큰 확인, raw_data·raw_trade·raw_conversion 탭만 허용). secret: `GOOGLE_SA_JSON`, `SHEET_ID` (`npx wrangler secret put ...`)
- `supabase/web_collector.sql` — 로그 테이블(`dy_collect_runs`, `dy_collect_steps`) + `inni_replace_*` 함수 웹 호출 허용. Supabase SQL Editor 에서 한 번 실행

## 로컬 미리보기
```
cd dy-ai/public
python -m http.server 8765
# http://localhost:8765/ (로그인) , http://localhost:8765/main.html (메인)
```

## 배포 (Cloudflare 계정 필요)
```
cd dy-ai
npx wrangler deploy
```

## 디자인 메모
- 무드: wiggle-wiggle.com 러그 제품 사진 — 주황 바탕, 코발트 블루 러그 패치(노란 테두리·스티치), 데이지, 무지개, 털 질감
- 팔레트: 주황 `#ff7f21` / 블루 `#0072e4` / 노랑 `#fdc916` / 빨강 `#eb0104` / 초록 `#06ac78` / 크림 `#f7f8ee`
- 폰트: Pretendard / 외곽선 없이 부드러운 색 그림자 + 털 질감(SVG 노이즈 overlay)
- 3D: CSS 3D 변환만 사용 (의존성 없음). 포인터 틸트·깊이별 패럴랙스, `prefers-reduced-motion` 시 정지

## 앞으로
- 로그인: Supabase Auth 연동 완료 (회원가입 끔, 계정은 대시보드에서 생성)
- Q10 수집 확장 프로그램: `extension/` (설치·동작은 extension/README.md). 수집 결과는 웹에서 엑셀·DB·구글 시트에 모두 반영
  - 메인 하단 설명서에서 zip 다운로드. 확장 코드를 고치면 `manifest.json` version 을 올리고 `python dy-ai/tools/build_extension.py` 실행 후 커밋
  - 설명서 캡처: `public/assets/guide/step-*.png` (Playwright로 chrome://extensions 촬영)
- 확장 프로그램 → `/ingest` (전용 토큰, 쓰기 전용) → Supabase
- 엑셀 내보내기 화면

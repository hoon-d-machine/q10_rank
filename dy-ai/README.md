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
- `public/data.html` — 데이터 (`/data`). 원본 표 5개(일자·품목별 거래 / 일자별 거래 / 일자별 페이지뷰 / 랭킹(일·주·월) / 상품코드)를 기간·검색·페이지로 보고, 엑셀(xlsx)로 내려받기(이 표 / 표 5개). 품목별 거래에는 상품코드표의 제품명·라인·카테고리가 붙음. 화면은 `assets/data.js`, 엑셀은 `assets/xlsx-writer.js`
- `supabase/data_view.sql` — 데이터 화면용 읽기 함수 `dy_data_page` (표는 계속 잠금, 로그인 사용자만 호출). Supabase SQL Editor 에서 한 번 실행
- `supabase/dashboard.sql` — 대시보드용 집계 함수(`dy_dash_agg`, `dy_dash_bounds`, 표는 계속 잠금) + `dy_dashboards` 표. Supabase SQL Editor 에서 한 번 실행
- `supabase/rank_log.sql` — Q10 랭킹 기록 표 `q10_rank_log`(루트 `data/*.csv` 3개와 같은 내용)와 이니스프리 일별 요약 뷰 `inni_rank_daily`. SQL Editor 에서 실행한 뒤 `dashboard.sql` 을 다시 실행(대시보드의 'rank' 소스). 처음 한 번 `python rank_log_db.py --all` 로 CSV 전체를 올리고, 그 뒤로는 일 수집(`csv_logger.py`)이 그날 분량을 올림(Actions secret `DY_SUPABASE_URL`·`DY_SUPABASE_KEY`). 대시보드 템플릿 '랭킹·판매 대조', 지표 그룹 '랭킹(이니스프리)'
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

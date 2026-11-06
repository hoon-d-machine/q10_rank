# DY-AI

Cloudflare Workers(정적 자산)로 서빙하는 개인용 사이트. 지금은 UI 단계입니다.

## 화면
- `public/index.html` — 로그인 화면 (루트 `/`, Supabase Auth 이메일+비밀번호. 아이디만 넣으면 `@LOGIN_EMAIL_DOMAIN` 을 붙임)
- `public/assets/config.js` — Supabase URL / anon key / 로그인 이메일 도메인 설정
- `public/main.html` — 수집기 (`/main`, 로그인 안 돼 있으면 `/`로 보냄, 탑바 왼쪽 로고 + 메뉴(수집기·로그) + 오른쪽 테마 선택·로그아웃, 가운데 Q10 수집 버튼 → 크롬 확장이 수집 → 원본 엑셀의 raw 시트 3개 덮어쓰기 또는 새 파일)
- 테마 3종: 러그(기본) / 풀잎(녹차 잎·돌·잎 그림자 실사 무드, 포인트 #11af5d) / 다크(해 질 녘 사진풍 배경, 에디토리얼 레이아웃). `assets/theme.js` 가 `<html data-theme>` 와 localStorage(`dy.theme`)를 관리하고, 덮어쓰기 스타일은 `assets/themes.css`, 테마별 SVG 그림과 배경 장면(.theme-scene/.theme-front)은 `assets/dy.js`
- 원본 엑셀 덮어쓰기: `assets/q10-save.js`(파일 고르기·권한·실패 시 다시 시도/새 파일/취소) + `assets/xlsx-patch.js`(대상 시트만 교체, 전전월 1일 이전 행 유지). `assets/xlsx-writer.js` 는 `extension/xlsx-writer.js` 의 사본(빌드 스크립트가 복사)
- 수집 후 순서: 엑셀 저장 → DB(Supabase `inni_replace_*` 함수, 로그인 사용자 권한) → 구글 시트(Worker `/api/sheet/*` 경유). 규칙은 `inni_RPA/Qoo10_RPA.py` 와 같음 (전전월 1일 이후 구간 교체). `assets/q10-sync.js`
- `public/logs.html` — 수집 로그 (`/logs`). 수집 한 번 = 묶음 하나, 단계별 기록은 클릭하면 펼침. 기록은 `assets/q10-log.js`, 화면은 `assets/logs.js`
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

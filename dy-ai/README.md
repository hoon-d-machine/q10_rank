# DY-AI

Cloudflare Workers(정적 자산)로 서빙하는 개인용 사이트. 지금은 UI 단계입니다.

## 화면
- `public/index.html` — 로그인 화면 (루트 `/`, Supabase Auth 이메일+비밀번호. 아이디만 넣으면 `@LOGIN_EMAIL_DOMAIN` 을 붙임)
- `public/assets/config.js` — Supabase URL / anon key / 로그인 이메일 도메인 설정
- `public/main.html` — 메인 (`/main`, 로그인 안 돼 있으면 `/`로 보냄, 탑바 왼쪽 로고 + 오른쪽 로그아웃, 가운데 Q10 수집 버튼(장식용))

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
- 확장 프로그램 → `/ingest` (전용 토큰, 쓰기 전용) → Supabase
- 엑셀 내보내기 화면

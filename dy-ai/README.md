# DY-AI

Cloudflare Workers(정적 자산)로 서빙하는 개인용 사이트. 지금은 UI 단계입니다.

## 화면
- `public/login.html` — 로그인 (인증 연동 전, 누르면 메인으로 이동만 함)
- `public/index.html` — 메인 (움직이는 3D 로고 + 탑바의 Q10 수집 버튼, 버튼은 장식용)

## 로컬 미리보기
```
cd dy-ai/public
python -m http.server 8765
# http://localhost:8765/login.html , http://localhost:8765/
```

## 배포 (Cloudflare 계정 필요)
```
cd dy-ai
npx wrangler deploy
```

## 디자인 메모
- 팔레트: wiggle-wiggle.com 의 배너·강조색 (코발트 블루, 코랄, 노랑, 보라, 빨강 `#dd0035`, 잉크 `#111`)
- 폰트: Pretendard / 두꺼운 잉크 테두리 + 하드 섀도 / 픽셀 격자 / 데이지
- 3D: CSS 3D 변환만 사용 (의존성 없음). 포인터 틸트·깊이별 패럴랙스, `prefers-reduced-motion` 시 정지

## 앞으로
- 로그인: Cloudflare Access 또는 Supabase Auth 연동 (확정 전)
- 확장 프로그램 → `/ingest` (전용 토큰, 쓰기 전용) → Supabase
- 엑셀 내보내기 화면

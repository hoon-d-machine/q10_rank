# 전통 혼례 식순 (honrye)

QR로 접속해 휴대폰으로 보는 식순 페이지. Cloudflare Workers(정적 자산)로 서빙. 로그인 없음(하객 공개용).
식순 내용은 **데이터(한국어·English·日本語)** 로 관리하고, `/edit` 페이지에서 직접 고칠 수 있다.

## 화면
- 하늘색 포스터 머리(주황 제목·구름·단청 꽃 문양) → 족자가 아래로 펼쳐지는 연출 → 의식 이름과 한 줄 설명 → 이름을 누르면 **뜻**과 **진행 방식** (대사는 넣지 않음)
- 포스터 머리의 **한국어 / English / 日本語** 버튼으로 언어 선택 (고른 언어는 기억됨. 주소에 `?lang=en` 으로도 지정 가능)
- 족자는 위아래 주황 천 띠(가는 크림색 직선)·대 끝 장식·흰 걸이 끈·천 테두리 안 종이판·매듭 술. 구름은 굵은 직선 두 개를 가는 직선으로 이은 3가지 유형, 맨 아래는 구름과 꽃 문양
- 기기가 다크모드면 **다크 테마**(남색 밤하늘·어두운 종이판·밝은 글자)로 보임. 라이트/다크 모두 글자 대비 기준 충족. `color-scheme: light dark` 선언으로 브라우저가 색을 억지로 뒤집지 않게 함

## 식순 수정 페이지 `/edit`
- 주소창에 `…/edit` 를 직접 입력해서 들어간다 (공개 화면에는 링크가 없고 검색에도 잡히지 않음)
- **PIN** 으로 들어간다. 틀린 시도가 10분 안에 8번이면 잠시 잠긴다. PIN 은 `PIN 변경` 에서 바꿀 수 있다
- 고칠 수 있는 것: 순서(▲▼), 순서 추가/삭제, 각 순서의 제목·한 줄 설명·의식의 뜻·진행 방식·참고 박스, 소개 문구, 신랑·신부 이름
- 영어·일본어가 비어 있으면 그 칸은 한국어로 대신 보인다 (영어·일본어 탭에서는 한국어 원문을 참고로 같이 보여 줌)
- `**글자**` 는 굵게, 뜻은 빈 줄로 문단 나누기, 진행 방식은 줄마다 한 항목
- **미리보기**(저장 전 내용 그대로), 임시 저장(고치다 닫아도 복구), 다른 곳에서 먼저 저장했을 때의 충돌 안내, 기본 내용으로 되돌리기
- 저장하면 하객이 페이지를 새로 열 때부터 바로 바뀐다 (예식장 전파가 약해도 마지막으로 받은 내용으로 보인다)

## 파일
- `public/index.html`, `public/assets/honrye.js|css` — 공개 화면 (데이터를 그려 줌)
- `public/edit.html`, `public/assets/edit.js|css` — 수정 페이지
- `public/assets/store.js` — 저장소 접근, `public/config.js` — 저장소 주소와 공개 키
- `content/default.json` — 기본 식순(원본). 고친 뒤 `python honrye/tools/build_default_js.py` 로 `public/content-default.js` 를 다시 만든다 (저장소를 못 읽을 때 화면에 내장돼 있는 기본 내용)
- `supabase/honrye.sql` — 저장소 표·함수, `tools/seed_db.py` — 처음 세팅(표 만들기 + PIN 등록 + 기본 내용)
- `tools/make_qr.py`, `qr/` — QR 코드

## 저장소 처음 세팅 (한 번만)
수정 내용은 Supabase 에 저장된다 (표는 모두 잠겨 있고, PIN 을 확인하는 함수로만 읽고 쓴다).
1. Supabase SQL Editor 에서 `supabase/honrye.sql` 실행
2. 수정용 PIN 등록 (원하는 PIN 으로 바꿔서 실행):
   ```sql
   insert into honrye_auth (id, pin_hash) values (1, extensions.crypt('원하는PIN', extensions.gen_salt('bf')))
   on conflict (id) do update set pin_hash = excluded.pin_hash;
   ```
   (또는 `HONRYE_PIN=원하는PIN python honrye/tools/seed_db.py` 로 1·2번과 기본 내용 저장까지 한 번에)
3. 아직 저장된 내용이 없어도 화면은 내장된 기본 내용으로 정상 동작한다. 수정 페이지에서 처음 저장하면 그때부터 저장소 내용이 쓰인다

## 로컬 미리보기
```
cd honrye/public
python -m http.server 8765
# http://localhost:8765/ (식순) , http://localhost:8765/edit.html (수정)
```

## 배포 (Cloudflare)
Workers & Pages → Create → Workers → GitHub 저장소(q10_rank) 연결
- Project name: `honrye` (`wrangler.jsonc` 의 name 과 같아야 함)
- Root directory(Path): `honrye`
- Build command: 비움 / Deploy command: `npx wrangler deploy`
- 빌드 감시 경로(Build watch paths): `honrye/*` (다른 폴더 커밋에 빌드가 돌지 않게)
- Cloudflare Access 는 켜지 않음 (하객이 로그인 없이 봐야 함)

배포 주소: `https://honrye.xogns1381.workers.dev/`  (수정 페이지: `…/edit`)

## QR 코드
`honrye/qr/honrye-qr.png`(인쇄·화면용) / `honrye-qr.svg`(크게 뽑을 때). 주소가 바뀌면 `python honrye/tools/make_qr.py <새 주소>` 로 다시 만든다 (만든 뒤 디코딩해서 주소가 맞는지 확인함. 필요: `pip install qrcode pillow zxing-cpp`).
인쇄할 때는 한 변을 3cm 이상으로, 주변 여백(흰 테두리)은 자르지 않는다.

## 출처
식순과 뜻 풀이는 전통 사대부가 혼인례 홀기(궁중의례원, 2020년 6월 1일 수정본)를 바탕으로 정리했다. 홀기의 저작권은 궁중의례원에 있다. 페이지 맨 아래에 출처를 표시하고 있다.

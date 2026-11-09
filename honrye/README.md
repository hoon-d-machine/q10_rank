# 전통 혼례 식순 (honrye)

QR로 접속해 휴대폰으로 보는 식순 페이지. Cloudflare Workers(정적 자산) 로 서빙. 로그인 없음(하객 공개용).

## 화면
- 하늘색 포스터 머리(주황 제목·구름·단청 꽃 문양) → 족자가 아래로 펼쳐지는 연출 → 의식 이름과 한 줄 설명 → 이름을 누르면 **뜻**과 **진행 방식**이 펼쳐짐 (대사는 넣지 않음)
- 식순: 거례선언 · 친영례 · 전안례 · 점촉의 · 혼주상견례 · 교배지례 · 성혼선언(신랑 아버지) · 축사(신부 측 교회 목사님) · 예필
- 서천지례·서배우례·합근지례는 오늘 예식에서 제외. 절의 횟수 설명(교배지례), 사물놀이(있을 때만) 등 표시
- 포스터처럼 굵은 직선 둘을 가는 직선으로 이은 모양의 구름과 단청 꽃 문양, 두루마리는 족자(걸개) 모양: 위아래 주황 천 띠(가는 크림색 직선 줄무늬)와 대 끝 장식, 흰 걸이 끈, 천 테두리 안의 종이판, 아래에 매듭 술. 맨 아래는 구름과 꽃 문양으로 마무리
- "모두 펼치기" 버튼, 모션 줄이기 설정·JS 꺼짐에서도 내용은 그대로 보임

## 고칠 곳
- 예식 정보(신랑·신부 이름, 일시, 장소): `public/config.js` 의 따옴표 안만 고치면 됨. 비워 두면 표시 안 함
- 의식 내용: `public/index.html` 의 `<li>` 항목 (의식 하나 = `<li>` 하나)
- 모양: `public/assets/honrye.css`, 두루마리 연출: `public/assets/honrye.js` (`DUR` = 펼치는 시간)

## 로컬 미리보기
```
cd honrye/public
python -m http.server 8765
# http://localhost:8765/
```

## 배포 (Cloudflare)
Workers & Pages → Create → Workers → GitHub 저장소(q10_rank) 연결
- Project name: `honrye` (`wrangler.jsonc` 의 name 과 같아야 함)
- Root directory(Path): `honrye`
- Build command: 비움 / Deploy command: `npx wrangler deploy`
- 빌드 감시 경로(Build watch paths): `honrye/*` (다른 폴더 커밋에 빌드가 돌지 않게)
- Cloudflare Access 는 켜지 않음 (하객이 로그인 없이 봐야 함)

배포 주소: `https://honrye.xogns1381.workers.dev/`

## QR 코드
`honrye/qr/honrye-qr.png`(인쇄·화면용) / `honrye-qr.svg`(크게 뽑을 때). 주소가 바뀌면 `python honrye/tools/make_qr.py <새 주소>` 로 다시 만든다 (만든 뒤 디코딩해서 주소가 맞는지 확인함. 필요: `pip install qrcode pillow zxing-cpp`).
인쇄할 때는 한 변을 3cm 이상으로, 주변 여백(흰 테두리)은 자르지 않는다.

## 출처
식순과 뜻 풀이는 전통 사대부가 혼인례 홀기(궁중의례원, 2020년 6월 1일 수정본)를 바탕으로 정리했다. 홀기의 저작권은 궁중의례원에 있다. 페이지 맨 아래에 출처를 표시하고 있다.

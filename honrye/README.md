# 전통 혼례 식순 (honrye)

QR로 접속해 휴대폰으로 보는 식순 페이지. Cloudflare Workers(정적 자산) 로 서빙. 로그인 없음(하객 공개용).

## 화면
- 두루마리가 펼쳐지는 연출 → 열 가지 의식 이름과 한 줄 설명 → 이름을 누르면 **뜻**과 **진행 방식**이 펼쳐짐 (대사는 넣지 않음)
- 부록(행초례), 절의 횟수 설명(교배지례), 사물놀이(있을 때만) 등 표시
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

배포 주소(`https://honrye.<계정>.workers.dev`)로 QR 코드를 만들어 인쇄·공유.

## 출처
식순과 뜻 풀이는 전통 사대부가 혼인례 홀기(궁중의례원, 2020년 6월 1일 수정본)를 바탕으로 정리했다. 홀기의 저작권은 궁중의례원에 있다. 페이지 맨 아래에 출처를 표시하고 있다.

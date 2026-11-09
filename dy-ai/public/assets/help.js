/* DY-AI 사용 설명서: 탑바 오른쪽 위 '설명서' 버튼 → 모달 (탭: 수집기 · 대시보드 · 위젯 만들기 · 지표 사전 · 로그 · 화면·계정)
 * 탑바(.top-actions)가 있는 페이지에서 스스로 버튼을 끼워 넣음. 지금 화면에 맞는 탭이 먼저 열림.
 */
(function () {
  "use strict";

  var actions = document.querySelector(".topbar .top-actions");
  if (!actions) return;

  var TABS = [
    { key: "collect", label: "수집기", html: [
      "<h3>처음 한 번 준비</h3>",
      "<ol>",
      "<li><b>확장 프로그램 설치</b> — 수집기 화면 아래 <a href='/main#guide' data-close>설치 방법 1~5단계</a>대로 크롬 확장 프로그램을 설치해요. 새 버전이 나오면 상태 표시가 <em>업데이트 필요</em>로 바뀌어요.</li>",
      "<li><b>Qoo10 로그인 정보 저장</b> (선택) — 설치 방법 6단계의 <em>Qoo10 로그인 정보 설정</em>에 아이디·비밀번호를 저장하면 로그인 창에 자동으로 넣어 줘요. 정보는 이 PC의 확장 프로그램에만 저장돼요.</li>",
      "</ol>",
      "<h3>수집하기</h3>",
      "<ol class='help-steps'>",
      "<li><b>Q10 수집</b> 버튼을 눌러요.</li>",
      "<li><b>저장할 엑셀 정하기</b> — 처음엔 원본 엑셀 파일을 고르고, 다음부터는 “이 파일에 덮어쓸까요?” 확인만 해요. <em>다른 파일 고르기</em>, <em>새 파일로 받기</em>도 있어요. 크롬이 파일 수정 허용을 물으면 허용해 주세요. 사내 PC처럼 파일 선택이 막혀 있으면 <em>엑셀 없이 진행</em>을 고르세요 — DB·구글 시트에는 똑같이 쌓이고, 엑셀은 <b>데이터</b> 메뉴에서 내려받으면 돼요.</li>",
      "<li><b>Qoo10 탭이 열려요</b> — 로그인이 필요하면 reCAPTCHA를 풀고 로그인 버튼만 눌러요 (최대 10분 기다려요). 그다음 아이디 확인 화면은 자동으로 넘어가요.</li>",
      "<li><b>자동 수집</b> — <em>전전월 1일 ~ 어제</em> 데이터를 3종류(일자·품목별 거래, 일자별 거래, 일자별 페이지뷰) 모아요. 진행 상황은 화면 아래 알림에 나와요.</li>",
      "<li><b>저장</b> — 엑셀 → DB → 구글 시트 순서로 반영돼요. 끝나면 “엑셀 ✓ · DB ✓ · 시트 ✓”로 알려 줘요.</li>",
      "</ol>",
      "<h3>무엇이 바뀌나요</h3>",
      "<p>엑셀·DB·구글 시트 모두 같은 규칙이에요. <code>raw_data</code>, <code>raw_trade</code>, <code>raw_conversion</code> 세 곳에서 <b>전전월 1일 이전 행은 그대로 두고</b>, 그 이후만 새 데이터로 바꿔요. 엑셀의 다른 시트·서식·수식은 건드리지 않아요.</p>",
      "<h3>문제가 생기면</h3>",
      "<dl>",
      "<dt>“파일이 열려 있어서 저장하지 못했어요”</dt><dd>엑셀에서 그 파일을 닫고 <em>파일을 닫고 다시 시도</em>를 눌러요. 급하면 <em>새로운 파일로 저장</em>을 골라요.</dd>",
      "<dt>DB · 구글 시트 일부를 업데이트하지 못했어요</dt><dd>창에서 <em>다시 시도</em>를 누르면 같은 데이터로 다시 교체해요. 원인은 <a href='/logs' data-close>로그</a> 메뉴에서 볼 수 있어요.</dd>",
      "<dt>“설치해 주세요”만 떠요</dt><dd>확장 프로그램이 켜져 있는지 확인하고 이 페이지를 새로고침해요.</dd>",
      "<dt>로그인했는데 다시 로그인 화면이 떠요</dt><dd>Qoo10 탭을 닫고 Q10 수집을 다시 눌러요.</dd>",
      "</dl>"
    ].join("") },
    { key: "dash", label: "대시보드", html: [
      "<h3>화면 구성</h3>",
      "<table class='help-table'><tbody>",
      "<tr><th>대시보드</th><td>저장된 대시보드와 템플릿 목록. 마지막에 본 대시보드가 다음에도 열려요.</td></tr>",
      "<tr><th>기간</th><td>대시보드 전체 기간. <em>대시보드 기간 따르기</em>로 둔 위젯이 모두 이 기간으로 바뀌어요.</td></tr>",
      "<tr><th>📅 날짜 버튼</th><td>실제 날짜 범위. 누르면 달력이 열려 직접 고를 수 있어요 (시작일 → 종료일 → <em>적용</em>). 데이터가 없는 날은 막혀 있어요.</td></tr>",
      "<tr><th>새로고침</th><td>DB 에서 다시 불러와요. 방금 Q10 수집을 했다면 눌러 주세요.</td></tr>",
      "<tr><th>편집</th><td>위젯 추가·설정·순서·너비·삭제 (자세한 건 <a href='#' data-tab='widget'>위젯 만들기</a>)</td></tr>",
      "</tbody></table>",
      "<p>맨 위 <b>데이터:</b> 줄에 표마다 데이터가 있는 기간이 나와요. 데이터는 Q10 수집을 할 때마다 쌓여요 (전전월 1일 ~ 어제 구간이 매번 새로 교체).</p>",
      "<h3>템플릿</h3>",
      "<table class='help-table'><tbody>",
      "<tr><th>기본 현황</th><td>최근 30일 매출·주문·객단가·방문자·전환율·취소율 KPI, 일별 매출·주문 추이, 상위 순위, 요일 패턴</td></tr>",
      "<tr><th>전년 비교</th><td>올해 누적 KPI 전년비, 월별 매출·주문·전환율 전년비 막대, 상위 순위 전년비</td></tr>",
      "<tr><th>분기 비교</th><td>이번 분기를 직전 분기(같은 날수)·전년 같은 분기와 비교, 분기별 전년비·직전 분기 대비</td></tr>",
      "<tr><th>주간 변화</th><td>최근 7일 KPI, 주별 매출·방문자·전환율 변화율, 주별 표</td></tr>",
      "<tr><th>월간 변화</th><td>최근 12개월 월별 변화율, 월별 표</td></tr>",
      "<tr><th>유입 분석</th><td>방문자·PV·전환율, 유입 경로별·외부 유입 PV 비중, 요일별 전환율</td></tr>",
      "<tr><th>상품 분석</th><td>상품 금액·수량·단가, 상위 상품 추이, 상품 TOP 20</td></tr>",
      "</tbody></table>",
      "<p>템플릿을 바꿔도 템플릿 자체는 그대로예요. 바꾼 내용을 남기려면 <em>내 대시보드로 저장</em>하세요.</p>",
      "<h3>숫자 읽는 법</h3>",
      "<ul>",
      "<li><span class='help-up'>▲</span> 초록은 좋아짐, <span class='help-down'>▼</span> 빨강은 나빠짐이에요. 취소금액·취소율처럼 <b>줄어야 좋은 지표</b>는 색이 반대예요.</li>",
      "<li>KPI 카드의 큰 숫자 아래 <em>직전 2,214만</em>처럼 비교 기간 값이 작게 나와요. 만·억 단위로 줄여 보여 줘요.</li>",
      "<li><b>직전 기간</b>: 같은 날수만큼 바로 앞 기간. 이번 달·분기·해처럼 진행 중인 기간은 지난 달·분기·해의 <b>같은 날수</b>와 비교해요 (예: 이번 달 1~6일 ↔ 지난달 1~6일).</li>",
      "<li><b>전년 동기</b>: 같은 날짜의 1년 전.</li>",
      "<li>주·월 단위 그래프는 첫 묶음이 잘리지 않게 그 주(월요일)·달의 시작일부터 보여 줘요. 마지막 묶음은 진행 중이면 일부 기간이라 작게 보일 수 있어요.</li>",
      "<li>⚠ <b>비교 기간 일부는 데이터 없음</b>이 보이면 비교 쪽 데이터가 모자라 증감이 부풀려 보일 수 있어요.</li>",
      "<li>구매전환율 같은 비율은 <b>기간 합계끼리 나눈 값</b>이에요 (날마다 비율을 평균 낸 값이 아니에요).</li>",
      "<li>그래프에 마우스를 올리면 정확한 값과 날짜가 나와요. 범례를 누르면 그 선·막대를 숨기거나 다시 보여요.</li>",
      "<li>위젯 제목 아래 회색 줄에 그 위젯의 실제 기간·단위·비교 기간이 적혀 있어요.</li>",
      "</ul>",
      "<h3>저장 · 공유</h3>",
      "<ul>",
      "<li>템플릿이나 다른 사람 대시보드 → <em>내 대시보드로 저장</em> (이름을 붙여 복사)</li>",
      "<li>내 대시보드 → 바꾸면 <em>저장</em> 버튼이 생겨요. <em>다른 이름으로 저장</em>으로 복사본도 만들 수 있어요.</li>",
      "<li>저장한 대시보드는 로그인한 모두가 목록에서 볼 수 있고, <b>만든 사람만</b> 고치거나 지울 수 있어요.</li>",
      "<li>저장하지 않고 다른 대시보드로 바꾸거나 창을 닫으면 확인을 물어봐요.</li>",
      "</ul>"
    ].join("") },
    { key: "widget", label: "위젯 만들기", html: [
      "<h3>위젯 추가하는 순서</h3>",
      "<ol class='help-steps'>",
      "<li>오른쪽 위 <b>편집</b>을 눌러요. 위젯마다 도구가 나타나고 <em>+ 위젯 추가</em> 버튼이 생겨요.</li>",
      "<li><b>+ 위젯 추가</b>를 누르고 <b>종류</b>부터 골라요. 종류에 따라 아래 설정 칸이 바뀌어요.</li>",
      "<li><b>지표 · 기간 · 단위 · 비교</b>를 고르고 <em>추가</em>를 누르면 맨 뒤에 붙어요.</li>",
      "<li>도구로 자리를 잡아요: <kbd>←</kbd> <kbd>→</kbd> 순서, <kbd>↔</kbd> 너비, <kbd>설정</kbd> 다시 고치기, <kbd>복제</kbd> 같은 설정으로 하나 더, <kbd>삭제</kbd>.</li>",
      "<li>다 됐으면 <b>편집 끝내기</b> → <b>저장</b> (템플릿이면 <em>내 대시보드로 저장</em>).</li>",
      "</ol>",
      "<p class='help-note'>팁: 비슷한 위젯을 여러 개 만들 땐 하나를 만든 뒤 <kbd>복제</kbd> → <kbd>설정</kbd>에서 지표만 바꾸면 빨라요.</p>",
      "<h3>설정 칸 설명</h3>",
      "<table class='help-table'><tbody>",
      "<tr><th>종류</th><td>위젯 모양 (아래 ‘위젯 종류별 설명’)</td></tr>",
      "<tr><th>제목</th><td>비우면 지표·비교에 맞춰 자동으로 지어요 (예: “매출(순) · 전년 동기 비교”).</td></tr>",
      "<tr><th>지표</th><td>무엇을 볼지. 판매 · 방문·전환 · 유입 경로(PV) · 상품별로 묶여 있어요. 뜻은 <a href='#' data-tab='metrics'>지표 사전</a>.</td></tr>",
      "<tr><th>두 번째 지표</th><td>추이 그래프에만. 단위가 다른 지표를 <b>오른쪽 축</b>에 같이 그려요 (예: 방문자수 + 구매전환율).</td></tr>",
      "<tr><th>지표 (여러 개)</th><td>구성 비교·기간별 표에만. 묶음을 펼쳐 체크해요. 같은 종류(금액끼리, 개수끼리)를 고르면 <b>비중(%)</b>도 나와요.</td></tr>",
      "<tr><th>기간</th><td><em>대시보드 기간 따르기</em>(기본) 또는 이 위젯만의 기간. 예: 대시보드는 최근 30일이어도 ‘최근 24개월 분기 비교’ 위젯을 같이 둘 수 있어요. 위젯 기간이면 제목 아래에 <em>위젯 기간</em>이 표시돼요.</td></tr>",
      "<tr><th>직접 지정한 기간</th><td>기간을 <em>직접 지정</em>으로 고르면 나와요. 📅 버튼으로 달력에서 골라요.</td></tr>",
      "<tr><th>단위</th><td>일 · 주 · 월 · 분기 · 연. <b>자동</b>은 기간 길이에 맞춰 45일 이하 → 일, 200일 이하 → 주, 그보다 길면 → 월.</td></tr>",
      "<tr><th>비교</th><td><b>비교 안 함 / 직전 기간 / 전년 동기</b>. 추이 그래프에선 비교 기간이 점선으로 겹쳐져요. 기간 비교 위젯에선 ‘직전’이 <b>직전 묶음</b>(전 분기·전월·전주 대비)이에요.</td></tr>",
      "<tr><th>그래프</th><td>추이 그래프의 선 · 막대 · 영역</td></tr>",
      "<tr><th>묶음</th><td>브랜드 또는 상품별로 나눠 보기. <b>상품별 지표</b>(상품 순수금액 등)만 가능해요.</td></tr>",
      "<tr><th>상위 몇 개</th><td>묶음을 쓸 때 기간 전체 합계가 큰 순서로 몇 개까지 (3~50)</td></tr>",
      "<tr><th>너비</th><td>한 줄을 6칸으로 보고 1/3 · 1/2 · 2/3 · 전체. KPI 카드는 1/3 세 개가 한 줄이에요. 좁은 화면에서는 자동으로 넓게 보여요.</td></tr>",
      "</tbody></table>",
      "<h3>위젯 종류별 설명</h3>",
      "<dl>",
      "<dt>KPI 카드 — 한눈에 보는 핵심 숫자</dt><dd>설정: 지표, 비교. 기간 합계(비율 지표는 기간 비율) + 비교 대비 증감 + 작은 추이선. 너비 1/3 추천.</dd>",
      "<dt>추이 그래프 — 흐름 보기</dt><dd>설정: 지표, 두 번째 지표, 단위, 비교, 그래프, 묶음·상위. 비교를 켜면 같은 길이의 비교 기간을 점선으로 겹쳐요 (예: 이번 분기 주별 vs 직전 분기). 묶음을 브랜드·상품으로 하면 상위 N개를 선으로 따로 그려요 (이때 두 번째 지표·비교는 꺼져요).</dd>",
      "<dt>기간 비교 — 같은 기간끼리 나란히</dt><dd>설정: 지표, 단위(월·분기·주), 비교(<b>전년 동기</b> 또는 <b>직전 묶음</b>). 막대 두 개씩 + 아래 표에 묶음별 이번·비교·증감. 월별 전년비, 분기 QoQ에 써요.</dd>",
      "<dt>변화율 — 지난 주·달보다 얼마나</dt><dd>설정: 지표, 단위(주·월·일). 막대는 값, 선은 직전 대비 %(내려가면 빨강). 맨 위에 최근 묶음 값과 증감.</dd>",
      "<dt>순위표 — 무엇이 많이 팔렸나</dt><dd>설정: <b>상품별 지표</b>, 묶음(상품·브랜드), 상위 몇 개, 비교. 금액·비중·증감, 비교 기간에 없던 항목은 ‘신규’. 상품은 상품코드도 함께 보여요.</dd>",
      "<dt>구성 비교 — 여러 지표를 한 표로</dt><dd>설정: 지표(여러 개), 비교. 같은 종류 지표면 큰 순으로 정렬 + 비중 막대. 유입 경로별 PV, 핵심 지표 묶음 비교에 좋아요.</dd>",
      "<dt>요일 패턴 — 무슨 요일이 강한가</dt><dd>설정: 지표. 기간 안 요일별 <b>하루 평균</b> (비율 지표는 요일별 비율). 가장 높은 요일이 진하게.</dd>",
      "<dt>기간별 표 — 숫자로 꼼꼼히 + 엑셀로</dt><dd>설정: 지표(여러 개), 단위. 최근 기간이 위, 칸마다 직전 대비 증감. <em>CSV 내려받기</em>로 엑셀에서 열 수 있어요.</dd>",
      "</dl>",
      "<h3>따라 만들기 예시</h3>",
      "<table class='help-table help-recipes'><thead><tr><th>보고 싶은 것</th><th>이렇게 설정</th></tr></thead><tbody>",
      "<tr><th>올해 월별 매출 전년비</th><td>기간 비교 · 매출(순) · 단위 월 · 비교 전년 동기 · 기간 올해</td></tr>",
      "<tr><th>분기 매출 QoQ</th><td>기간 비교 · 매출(순) · 단위 분기 · 비교 직전 묶음 · 기간 최근 24개월</td></tr>",
      "<tr><th>이번 분기 vs 지난 분기 흐름</th><td>추이 그래프 · 매출(순) · 단위 주 · 비교 직전 기간 · 기간 이번 분기</td></tr>",
      "<tr><th>주간 매출 증감</th><td>변화율 · 매출(순) · 단위 주 · 기간 최근 90일</td></tr>",
      "<tr><th>방문자와 전환율 같이</th><td>추이 그래프 · 방문자수 + 두 번째 지표 구매전환율 · 그래프 선</td></tr>",
      "<tr><th>최근 7일 매출 (대시보드 기간과 별도)</th><td>KPI 카드 · 매출(순) · 비교 직전 기간 · 기간 최근 7일</td></tr>",
      "<tr><th>유입 경로 비중</th><td>구성 비교 · 유입 경로(PV) 묶음에서 홈·검색·베스트셀러·딜 … 체크 · 비교 직전 기간</td></tr>",
      "<tr><th>잘 팔린 상품 TOP 20</th><td>순위표 · 상품 순수금액 · 묶음 상품 · 상위 20 · 비교 직전 기간 · 너비 2/3</td></tr>",
      "<tr><th>상위 상품 5개 흐름</th><td>추이 그래프 · 상품 순수금액 · 묶음 상품 · 상위 5 · 그래프 선</td></tr>",
      "<tr><th>월별 실적 엑셀로</th><td>기간별 표 · 매출(순)·주문건수·주문당 금액·방문자수·구매전환율 · 단위 월 · 기간 최근 24개월 → CSV 내려받기</td></tr>",
      "</tbody></table>",
      "<h3>이럴 땐</h3>",
      "<dl>",
      "<dt>“순위표는 ‘상품별’ 지표만 쓸 수 있어요”</dt><dd>브랜드·상품 정보는 일자·상품별 표에만 있어요. 지표를 <em>상품 순수금액</em>, <em>상품 순수량</em> 등으로 바꿔 주세요.</dd>",
      "<dt>그래프가 비어 있거나 0이에요</dt><dd>그 기간에 데이터가 없을 수 있어요. 맨 위 <b>데이터:</b> 줄의 기간을 확인하고, 최근 데이터가 없으면 Q10 수집 후 <em>새로고침</em>.</dd>",
      "<dt>마지막 주·달 값이 작게 나와요</dt><dd>진행 중인 묶음이라 일부 날짜만 들어 있어서예요.</dd>",
      "<dt>저장 버튼이 안 보여요</dt><dd>다른 사람이 만든 대시보드나 템플릿이에요. <em>내 대시보드로 저장</em>으로 복사해서 쓰세요.</dd>",
      "</dl>"
    ].join("") },
    { key: "metrics", label: "지표 사전", html: [
      "<p>DB 의 세 표(일자별 거래, 일자별 페이지뷰, 일자·상품별 거래)에서 계산해요. 비율·평균 지표는 <b>기간 합계끼리 나눈 값</b>이에요. 금액은 Qoo10 원본 숫자 그대로예요.</p>",
      "<h3>판매 (일자별 거래)</h3>",
      "<table class='help-table'><tbody>",
      "<tr><th>매출(순)</th><td>주문금액에서 취소금액을 뺀 최종 금액</td></tr>",
      "<tr><th>주문금액</th><td>취소 전 주문 금액 합계</td></tr>",
      "<tr><th>취소금액</th><td>취소된 금액 <span class='help-down'>(줄어야 좋음)</span></td></tr>",
      "<tr><th>주문건수 · 취소건수</th><td>Qoo10 거래 통계의 주문·취소 건수</td></tr>",
      "<tr><th>주문상품수량 · 취소상품수량 · 총상품수량(순)</th><td>주문·취소된 상품 개수, 취소를 뺀 수량</td></tr>",
      "<tr><th>주문당 금액</th><td>주문금액 ÷ 주문건수</td></tr>",
      "<tr><th>주문당 수량</th><td>주문상품수량 ÷ 주문건수</td></tr>",
      "<tr><th>취소율(금액)</th><td>취소금액 ÷ 주문금액 × 100 <span class='help-down'>(줄어야 좋음)</span></td></tr>",
      "</tbody></table>",
      "<h3>방문 · 전환 (일자별 페이지뷰)</h3>",
      "<table class='help-table'><tbody>",
      "<tr><th>방문자수</th><td>상품 페이지를 본 사람 수 (user)</td></tr>",
      "<tr><th>총 PV</th><td>페이지뷰 합계</td></tr>",
      "<tr><th>장바구니 담기 · 구매수</th><td>장바구니에 담은 수, 구매 수</td></tr>",
      "<tr><th>구매전환율</th><td>구매수 ÷ 방문자수 × 100</td></tr>",
      "<tr><th>장바구니율</th><td>장바구니 담기 ÷ 방문자수 × 100</td></tr>",
      "<tr><th>장바구니→구매</th><td>구매수 ÷ 장바구니 담기 × 100</td></tr>",
      "<tr><th>방문자당 PV</th><td>총 PV ÷ 방문자수</td></tr>",
      "<tr><th>방문자당 매출</th><td>매출(순) ÷ 방문자수 (두 표를 날짜로 맞춰 계산)</td></tr>",
      "</tbody></table>",
      "<h3>유입 경로 (PV)</h3>",
      "<p>어디서 들어와 본 페이지뷰인지예요. 홈, 검색(키워드플러스·파워랭크 포함), 메가와리·메가포·타임세일·데일리딜, 베스트셀러·뷰티 랭킹·뷰티허브, 딜, 카테고리, 셀러샵, 기획전, 라이브, 장바구니 페이지, 찜, 오늘 본 상품, 마이페이지, <b>외부 유입 합계</b>와 외부 구글·야후·인스타그램·X·페이스북·라인·가카쿠, 직접 URL, 기타. 비중을 볼 땐 <em>구성 비교</em> 위젯이 좋아요. (외부 유입 합계는 외부·○○들의 합이라 같이 고르면 겹쳐요.)</p>",
      "<h3>상품별 (일자·상품별 거래)</h3>",
      "<table class='help-table'><tbody>",
      "<tr><th>상품 순수금액 · 순수량</th><td>상품별 수주에서 취소를 뺀 금액·수량. 순위표·브랜드/상품 묶음에 써요.</td></tr>",
      "<tr><th>상품 수주금액 · 수주수량</th><td>취소 전 금액·수량</td></tr>",
      "<tr><th>상품 취소금액 · 취소수량</th><td>취소된 금액·수량 <span class='help-down'>(줄어야 좋음)</span></td></tr>",
      "<tr><th>상품 평균 단가</th><td>상품 순수금액 ÷ 상품 순수량</td></tr>",
      "</tbody></table>",
      "<p class='help-note'>‘판매’ 지표(일자별 거래)와 ‘상품별’ 지표(상품별 거래 합계)는 같은 날의 합계가 대부분 같지만, 집계 방식이 달라 조금 다를 수 있어요.</p>"
    ].join("") },
    { key: "data", label: "데이터", html: [
      "<h3>원본 데이터 보기</h3>",
      "<p>수집해서 DB에 쌓인 원본을 그대로 보는 화면이에요. 위의 탭으로 표를 골라요.</p>",
      "<table class='help-table'><tbody>",
      "<tr><th>일자·품목별 거래</th><td>날짜 × 상품 한 줄씩. 상품코드표에 있는 <b>제품명 · 라인 · 카테고리</b>가 오른쪽에 같이 붙어요.</td></tr>",
      "<tr><th>일자별 거래</th><td>하루 한 줄. 주문 · 취소 건수, 수량, 금액</td></tr>",
      "<tr><th>일자별 페이지뷰</th><td>하루 한 줄, 유입 경로별 페이지뷰 등 62개 열 (옆으로 밀어서 봐요)</td></tr>",
      "<tr><th>상품코드</th><td>상품번호 ↔ 제품명 · 라인 · 카테고리 대응표</td></tr>",
      "</tbody></table>",
      "<h3>좁혀 보기</h3>",
      "<ul>",
      "<li><b>기간</b> — 처음엔 데이터가 있는 마지막 30일이에요. 기간 버튼으로 달력을 열어 바꾸고, <em>전체 기간</em>을 누르면 처음부터 끝까지 봐요.</li>",
      "<li><b>검색</b> — 일자·품목별 거래와 상품코드에서 쓸 수 있어요. 상품명 · 브랜드 · 상품코드 · 제품명 · 라인 · 카테고리 어디에 들어 있어도 찾아요.</li>",
      "<li>아래의 <em>이전 · 다음</em>과 <em>행씩</em> 목록으로 페이지를 넘기고 한 번에 볼 행 수를 바꿔요. 표는 날짜(첫 열)가 고정돼서 옆으로 밀어도 따라와요.</li>",
      "</ul>",
      "<h3>엑셀(xlsx)로 받기</h3>",
      "<ul>",
      "<li><b>엑셀 다운로드 (이 표)</b> — 지금 보는 표를 <b>현재 기간·검색어 그대로, 모든 페이지</b> 내려받아요. 화면에 100행씩 보여도 파일에는 조건에 맞는 전부가 들어가요.</li>",
      "<li><b>엑셀 다운로드 (표 4개)</b> — 표 4개를 시트로 나눠 한 파일로 받아요. 지금 고른 기간이 날짜가 있는 표 3개에 적용되고, 검색어는 적용되지 않으며, 상품코드는 항상 전체예요.</li>",
      "<li>파일 이름에 표 · 기간 · 받은 날짜가 들어가요. 전체 기간처럼 행이 많으면 몇 초 걸리고, 진행 상황이 화면에 나와요.</li>",
      "<li>머리글은 구글 시트(raw_data · raw_trade · raw_conversion)와 같아요. 금액·수량은 숫자, 상품코드는 문자로 들어가요.</li>",
      "</ul>"
    ].join("") },
    { key: "logs", label: "로그", html: [
      "<h3>로그 보기</h3>",
      "<ul>",
      "<li>Q10 수집을 한 번 할 때마다 <b>한 묶음</b>이 남고, 날짜별로 모여 보여요.</li>",
      "<li>묶음을 누르면 단계가 시간순으로 펼쳐져요: 시작 → 수집 진행 → 로그인 → 수집 완료(행 수·경고) → 엑셀 저장 → DB → 구글 시트.</li>",
      "<li>단계에 <em>상세 보기</em>가 있으면 한 번 더 눌러 원본 정보를 볼 수 있어요.</li>",
      "<li>위의 <em>새로고침</em>으로 최신 기록을 다시 불러오고, 맨 아래 <em>이전 로그 더 보기</em>로 예전 기록을 봐요.</li>",
      "</ul>",
      "<h3>상태</h3>",
      "<table class='help-table'><tbody>",
      "<tr><th>완료</th><td>엑셀·DB·시트 모두 끝남</td></tr>",
      "<tr><th>일부 실패</th><td>엑셀 저장을 취소했거나, DB·시트 중 일부가 실패함 (단계에 오류 내용)</td></tr>",
      "<tr><th>실패</th><td>수집 중 멈춤 (로그인 시간 초과, Qoo10 응답 없음 등)</td></tr>",
      "<tr><th>취소</th><td>이미 다른 수집이 진행 중이어서 시작하지 않음</td></tr>",
      "<tr><th>진행 중</th><td>지금 수집하고 있음</td></tr>",
      "<tr><th>중단됨</th><td>2시간 넘게 끝나지 않음 (창을 닫았거나 중간 오류)</td></tr>",
      "</tbody></table>"
    ].join("") },
    { key: "ui", label: "화면·계정", html: [
      "<h3>테마</h3>",
      "<p>오른쪽 위 <b>테마</b>에서 러그 · 풀잎 · 다크 중 골라요. 고른 테마는 이 브라우저에 저장돼 다음 접속(로그인 화면 포함)에도 그대로예요.</p>",
      "<h3>메뉴</h3>",
      "<ul>",
      "<li><b>수집기</b> — Q10 수집 버튼, 확장 프로그램 설치 방법</li>",
      "<li><b>대시보드</b> — 수집한 데이터 분석 · 비교</li>",
      "<li><b>데이터</b> — 원본 데이터 보기, 엑셀로 내려받기</li>",
      "<li><b>로그</b> — 수집 기록</li>",
      "</ul>",
      "<h3>계정</h3>",
      "<ul>",
      "<li>로그인 화면에서 <em>아이디 저장</em>을 켜면 다음에 아이디가 미리 채워져요. 크롬이 비밀번호 저장을 물으면 저장해 둘 수 있어요.</li>",
      "<li>다 쓰면 오른쪽 위 <b>로그아웃</b>을 눌러요.</li>",
      "</ul>"
    ].join("") }
  ];

  var ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7.7 7.6a2.4 2.4 0 1 1 3.3 2.2c-.6.3-1 .8-1 1.5v.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="10" cy="14.4" r="1" fill="currentColor"/></svg>';

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "help-btn";
  btn.setAttribute("aria-haspopup", "dialog");
  btn.title = "사용 설명서";
  btn.innerHTML = ICON + '<span class="help-btn-label">설명서</span>';
  actions.insertBefore(btn, actions.firstChild);

  function defaultTab() {
    var p = location.pathname;
    if (/dashboard/.test(p)) return "dash";
    if (/\/data\b/.test(p)) return "data";
    if (/logs/.test(p)) return "logs";
    return "collect";
  }

  function openHelp(tabKey) {
    var dlg = document.createElement("dialog");
    dlg.className = "help-dlg";
    dlg.setAttribute("aria-labelledby", "help-title");
    var head = document.createElement("header");
    head.className = "help-head";
    head.innerHTML = '<h2 id="help-title">사용 설명서</h2>';
    var x = document.createElement("button");
    x.type = "button"; x.className = "help-x"; x.setAttribute("aria-label", "닫기"); x.textContent = "✕";
    head.appendChild(x);

    var tl = document.createElement("div");
    tl.className = "help-tabs"; tl.setAttribute("role", "tablist"); tl.setAttribute("aria-label", "설명서 항목");
    var panels = document.createElement("div");
    panels.className = "help-panels";
    var tabs = TABS.map(function (t, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "help-tab"; b.setAttribute("role", "tab");
      b.id = "help-tab-" + t.key; b.setAttribute("aria-controls", "help-panel-" + t.key);
      b.textContent = t.label;
      var pnl = document.createElement("section");
      pnl.className = "help-panel"; pnl.id = "help-panel-" + t.key;
      pnl.setAttribute("role", "tabpanel"); pnl.setAttribute("aria-labelledby", b.id); pnl.tabIndex = 0;
      pnl.innerHTML = t.html;
      tl.appendChild(b); panels.appendChild(pnl);
      return { key: t.key, b: b, p: pnl, i: i };
    });
    function select(key, focus) {
      tabs.forEach(function (t) {
        var on = t.key === key;
        t.b.setAttribute("aria-selected", on ? "true" : "false");
        t.b.tabIndex = on ? 0 : -1;
        t.p.hidden = !on;
        if (on && focus) t.b.focus();
      });
      panels.scrollTop = 0;
    }
    tabs.forEach(function (t) { t.b.addEventListener("click", function () { select(t.key); }); });
    tl.addEventListener("keydown", function (e) {
      var i = tabs.findIndex(function (t) { return t.b === document.activeElement; });
      if (i < 0) return;
      var n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
      if (n === null) return;
      e.preventDefault();
      select(tabs[(n + tabs.length) % tabs.length].key, true);
    });

    dlg.appendChild(head); dlg.appendChild(tl); dlg.appendChild(panels);
    document.body.appendChild(dlg);

    function close() { dlg.close(); }
    x.addEventListener("click", close);
    dlg.addEventListener("click", function (e) {
      if (e.target === dlg) close();
      var a = e.target.closest && e.target.closest("[data-close]");
      if (a) close(); // 같은 사이트 링크로 이동할 때 닫기
      var tl2 = e.target.closest && e.target.closest("[data-tab]");
      if (tl2) { e.preventDefault(); select(tl2.getAttribute("data-tab"), true); } // 설명서 안 다른 탭으로
    });
    dlg.addEventListener("close", function () { dlg.remove(); btn.focus(); });

    select(tabKey || defaultTab());
    dlg.showModal();
    var cur = tabs.filter(function (t) { return t.b.getAttribute("aria-selected") === "true"; })[0];
    if (cur) cur.b.focus();
  }

  btn.addEventListener("click", function () { openHelp(); });
  window.dyHelp = { open: openHelp };
})();

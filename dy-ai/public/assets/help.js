/* DY-AI 사용 설명서: 탑바 오른쪽 위 '설명서' 버튼 → 모달 (탭: 수집기 · 대시보드 · 로그 · 화면·계정)
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
      "<li><b>저장할 엑셀 정하기</b> — 처음엔 원본 엑셀 파일을 고르고, 다음부터는 “이 파일에 덮어쓸까요?” 확인만 해요. <em>다른 파일 고르기</em>, <em>새 파일로 받기</em>도 있어요. 크롬이 파일 수정 허용을 물으면 허용해 주세요.</li>",
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
      "<h3>보기</h3>",
      "<ul>",
      "<li><b>대시보드</b> 목록에서 저장된 대시보드나 템플릿(기본 현황 · 전년 비교 · 분기 비교 · 주간 변화 · 월간 변화 · 유입 분석 · 상품 분석)을 골라요.</li>",
      "<li><b>기간</b> 목록(최근 30일, 이번 분기, 올해 …)이나 📅 날짜 버튼으로 기간을 바꿔요. 달력에서 시작일 → 종료일을 누르고 <em>적용</em>해요.</li>",
      "<li>데이터는 <b>Q10 수집을 할 때마다</b> 새로 쌓여요. 맨 위에 표마다 데이터가 있는 기간이 나와요.</li>",
      "</ul>",
      "<h3>숫자 읽는 법</h3>",
      "<ul>",
      "<li><span class='help-up'>▲</span> 초록은 좋아짐, <span class='help-down'>▼</span> 빨강은 나빠짐이에요. 취소금액·취소율처럼 <b>줄어야 좋은 지표</b>는 색이 반대예요.</li>",
      "<li><b>직전 기간</b>: 같은 날수만큼 바로 앞 기간. 이번 달·분기·해처럼 진행 중인 기간은 지난 달·분기·해의 <b>같은 날수</b>와 비교해요 (예: 이번 달 1~6일 ↔ 지난달 1~6일).</li>",
      "<li><b>전년 동기</b>: 같은 날짜의 1년 전.</li>",
      "<li><b>기간 비교 위젯의 ‘직전’</b>: 막대마다 바로 앞 묶음과 비교해요 (전 분기·전월·전주 대비).</li>",
      "<li>주·월 단위 그래프는 첫 묶음이 잘리지 않게 그 주·달의 시작일부터 보여 줘요. 마지막 묶음은 진행 중이면 일부 기간이에요.</li>",
      "<li>⚠ <b>비교 기간 일부는 데이터 없음</b>이 보이면 비교 쪽 데이터가 모자라 증감이 부풀려 보일 수 있어요.</li>",
      "<li>구매전환율 같은 비율 지표는 기간 합계끼리 나눈 값이에요 (날마다 비율의 평균이 아니에요).</li>",
      "</ul>",
      "<h3>편집하기</h3>",
      "<ol>",
      "<li><b>편집</b>을 누르면 위젯마다 도구가 나와요: <kbd>←</kbd> <kbd>→</kbd> 순서, <kbd>↔</kbd> 너비(1/3 · 1/2 · 2/3 · 전체), <kbd>설정</kbd>, <kbd>복제</kbd>, <kbd>삭제</kbd>.</li>",
      "<li><b>+ 위젯 추가</b>로 종류·지표·기간·단위·비교·그래프 모양을 골라 넣어요.</li>",
      "<li>위젯 기간을 <em>대시보드 기간 따르기</em>로 두면 맨 위 기간을 바꿀 때 같이 바뀌어요. 따로 정하면 그 위젯만 고정돼요.</li>",
      "<li><b>저장</b> — 템플릿이나 다른 사람 대시보드는 <em>내 대시보드로 저장</em>(이름 붙여 복사), 내 대시보드는 <em>저장</em>. 저장한 대시보드는 로그인한 모두가 볼 수 있고, 만든 사람만 고칠 수 있어요.</li>",
      "</ol>",
      "<h3>위젯 종류</h3>",
      "<table class='help-table'><tbody>",
      "<tr><th>KPI 카드</th><td>한 지표의 합계와 비교 기간 대비 증감, 작은 추이선</td></tr>",
      "<tr><th>추이 그래프</th><td>선·막대·영역. 비교 기간을 점선으로 겹치거나, 두 번째 지표를 오른쪽 축에. 상품별 지표는 브랜드·상품별 선</td></tr>",
      "<tr><th>기간 비교</th><td>전년 동기 또는 직전 묶음과 나란히 막대 + 증감 표 (월별 전년비, 분기 비교)</td></tr>",
      "<tr><th>변화율</th><td>주간·월간 값과 직전 대비 증감률</td></tr>",
      "<tr><th>순위표</th><td>상품·브랜드 상위 N, 비중, 증감, 새로 들어온 항목은 ‘신규’</td></tr>",
      "<tr><th>구성 비교</th><td>여러 지표를 나란히 (유입 경로별 PV 등), 비중과 증감</td></tr>",
      "<tr><th>요일 패턴</th><td>요일별 하루 평균</td></tr>",
      "<tr><th>기간별 표</th><td>기간별 여러 지표 + 직전 대비, <em>CSV 내려받기</em></td></tr>",
      "</tbody></table>",
      "<p class='help-note'>금액은 Qoo10 원본 숫자 그대로예요. 순위표·브랜드 묶음은 ‘상품별’ 지표만 쓸 수 있어요.</p>"
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

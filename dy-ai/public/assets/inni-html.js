/* Sell Thru(inni) 리포트 HTML 다운로드: 지금 화면의 리포트(설정·코멘트까지 반영된 모습)만 한 파일로 내려받는다.
 *   탑바·메뉴·탭·설정 줄(버튼·선택칸)은 빼고 리포트 카드만 담는다. 그래프는 그림으로 굳히고, CSS 는 파일 안에 넣어 혼자서도 열린다.
 *   네 화면(SALES·PRODUCT·ONSITE AD·MEGAPO) 모두 엑셀 다운로드 버튼 옆에 같은 버튼을 붙인다.
 */
(function () {
  "use strict";
  function toast(m) { if (window.dyToast) window.dyToast(m, 3500); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }

  function css() { // 화면에 적용된 스타일시트 전부(같은 출처). 막힌 건 <link> 로 대신한다
    var out = "", links = "";
    Array.prototype.forEach.call(document.styleSheets, function (ss) {
      try { out += Array.prototype.map.call(ss.cssRules, function (r) { return r.cssText; }).join("\n") + "\n"; }
      catch (e) { if (ss.href) links += '<link rel="stylesheet" href="' + esc(ss.href) + '">\n'; }
    });
    return { text: out, links: links };
  }

  function build(pane) {
    var card = pane.querySelector(".inni-report");
    if (!card || !card.querySelector("table, canvas")) return null;
    var clone = card.cloneNode(true);
    var src = card.querySelectorAll("canvas"), dst = clone.querySelectorAll("canvas");
    Array.prototype.forEach.call(dst, function (c, i) { // 그래프 → 그림
      var img = document.createElement("img");
      try { img.src = src[i].toDataURL("image/png"); } catch (e) { c.remove(); return; }
      img.className = c.className; img.alt = "그래프";
      img.style.cssText = "width:100%;height:100%;object-fit:contain;display:block";
      c.replaceWith(img);
    });
    Array.prototype.forEach.call(clone.querySelectorAll("[hidden], button, select, input, textarea, .inni-actions, .inni-link"), function (e) { e.remove(); });
    var title = (clone.querySelector("h2") || {}).textContent || "report";
    var sheet = css(), html = document.documentElement;
    var attrs = ' lang="ko" data-theme="' + esc(html.getAttribute("data-theme") || "rug") + '"';
    var doc = '<!doctype html>\n<html' + attrs + '>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + esc(title) + '</title>\n' +
      sheet.links + '<style>\n' + sheet.text + '\nbody{background:var(--lg-bg)!important;background-image:none!important;margin:0}[hidden]{display:none!important}.dash-inner{max-width:none;margin:0 auto;padding:24px}\n</style>\n</head>\n' +
      '<body class="' + esc(document.body.className) + '">\n<main class="dash-page"><div class="dash-inner"><section class="inni-pane">\n' + clone.outerHTML + '\n</section></div></main>\n</body>\n</html>\n';
    return { doc: doc, title: title };
  }

  function save(pane) {
    var r = build(pane);
    if (!r) { toast("내려받을 리포트가 아직 없어요 (불러온 뒤 다시 시도)"); return; }
    var d = new Date(), stamp = d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2);
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([r.doc], { type: "text/html;charset=utf-8" }));
    a.download = "Sell_Thru_" + r.title.replace(/[^\w가-힣-]+/g, "_") + "_" + stamp + ".html";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    toast("HTML을 내려받았어요");
  }

  Array.prototype.forEach.call(document.querySelectorAll("#view-inni .inni-pane"), function (pane) {
    var x = pane.querySelector('.inni-bar [class*="-xlsx"]');
    if (!x) return;
    var b = document.createElement("button");
    b.type = "button"; b.className = "dash-btn js-html"; b.textContent = "HTML 다운로드";
    b.title = "지금 화면의 리포트(코멘트·설정 반영)를 HTML 파일로 내려받기";
    b.addEventListener("click", function () { save(pane); });
    x.after(b);
  });
})();

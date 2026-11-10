# -*- coding: utf-8 -*-
"""예식장 게시용 A4 안내판 PDF: honrye/poster/honrye-poster.pdf (+ png 미리보기).
식순 페이지와 같은 하늘색 포스터 + 단청 꽃 + 직선 구름. QR 은 honrye/qr/honrye-qr.svg 를 그대로 쓴다.
사용: python honrye/tools/make_poster.py   (필요: pip install playwright, 인터넷: 글꼴)"""
import os, re
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
idx = open(os.path.join(ROOT, 'public', 'index.html'), encoding='utf-8').read()
defs = re.search(r'<svg width="0" height="0".*?</svg>', idx, flags=re.S).group(0)
qr = open(os.path.join(ROOT, 'qr', 'honrye-qr.svg'), encoding='utf-8').read()
qr = re.sub(r'<\?xml[^>]*\?>', '', qr)
qr = re.sub(r'width="[^"]*" height="[^"]*"', 'width="100%" height="100%"', qr, count=1)
qr = qr.replace('<svg ', '<svg shape-rendering="crispEdges" ', 1)
qr = qr.replace('viewBox="0 0 41 41"', 'viewBox="4 4 33 33"', 1)   # 흰 여백(조용한 영역)을 잘라 QR 점만 남기고, 여백은 흰 바탕 padding(10%)으로 준다
assert 'viewBox="4 4 33 33"' in qr

HTML = '''<!doctype html><html lang="ko"><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600;800&family=Noto+Serif+JP:wght@600&family=Hahmlet:wght@700;900&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 0 }
* { box-sizing: border-box }
html, body { margin: 0; width: 210mm; height: 296.5mm; overflow: hidden }
body { position: relative; -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #7b1e2b; font-family: "Noto Serif KR", serif;
  background: radial-gradient(120% 55% at 50% 0%, #a8d0e3 0%, #7db6d4 62%) }
/* 식순 페이지(포스터 머리)와 같은 색·문양: 하늘색 바탕, 주황 제목, 크림색 테두리, 단청 꽃, 직선 구름 */
.frame { position: absolute; inset: 9mm; border: .7mm solid #fbfaf3; border-radius: 3mm }
.frame::after { content: ""; position: absolute; inset: 2.2mm; border: .3mm solid rgba(251,250,243,.7); border-radius: 2mm }
.cloud { position: absolute }
.fl { position: absolute }
.title { position: absolute; top: 50mm; left: 0; right: 0; text-align: center }
.title small { display: block; font: 700 4.4mm/1 "Noto Serif KR", serif; letter-spacing: 1.4mm; color: #7b1e2b; margin-bottom: 7mm }
.title h1 { margin: 0; font: 900 27mm/1.05 Hahmlet, 'Noto Serif KR', serif; letter-spacing: 2mm; color: #e8661c; text-shadow: 1.2mm 1.2mm 0 rgba(123,30,43,.35) }
.jt { margin: 4mm 0 0; font: 700 13.2mm/1 "Noto Serif JP", serif; letter-spacing: 3.7mm; margin-right: -3.7mm; color: #1b4478 }
.rule { position: absolute; top: 103mm; left: 0; right: 0; display: flex; justify-content: center; align-items: center; gap: 4mm }
.rule i { display: block; width: 38mm; height: .6mm; background: #fbfaf3; border-radius: 1mm }
.rule b { display: block; width: 2.6mm; height: 2.6mm; background: #fbfaf3; transform: rotate(45deg) }
.qrbox { position: absolute; top: 112mm; left: 50%; transform: translateX(-50%); width: 92.4mm; height: 92.4mm; padding: 9.24mm; box-sizing: border-box; background: #fffdf4; border-radius: 3mm;
  box-shadow: 0 0 0 1.2mm #7b1e2b, 0 0 0 2.4mm #fbfaf3, 0 0 0 3.2mm #245c9f }
.qrbox > svg { width: 100%; height: 100% }
.cap { position: absolute; top: 217mm; left: 0; right: 0; text-align: center; font: 800 7mm/1.4 "Noto Serif KR", serif; letter-spacing: .8mm; color: #7b1e2b }
.jp { position: absolute; top: 228mm; left: 0; right: 0; text-align: center; font: 700 6.1mm/1.4 "Noto Serif JP", serif; letter-spacing: .4mm; color: #1b4478 }
.who { position: absolute; top: 252mm; left: 0; right: 0; text-align: center; font: 800 6mm/1.3 "Noto Serif KR", serif; letter-spacing: 1mm; color: #7b1e2b }
.who i { font-style: normal; color: #e8661c; margin: 0 2.4mm }
.when { position: absolute; top: 263mm; left: 0; right: 0; text-align: center; font: 700 4.6mm/1.3 "Noto Serif KR", serif; letter-spacing: 1mm; color: #1b4478 }
</style>
<body>__DEFS__
<div class="frame"></div>
<svg class="fl" style="top:-15mm;left:50%;margin-left:-21mm;width:42mm;height:42mm"><use href="#flower"/></svg>
<svg class="fl" style="top:52mm;left:-13mm;width:30mm;height:30mm"><use href="#flower"/></svg>
<svg class="fl" style="top:53.3mm;right:-12mm;width:27mm;height:27mm"><use href="#flower"/></svg>
<!-- 구름: 참고 포스터처럼 한쪽에 치우치게 흩어 놓는다 (굵은 직선 둘 + 가는 연결선) -->
<svg class="cloud" style="top:36mm;left:16mm;width:40mm" viewBox="0 0 130 34"><use href="#cloud-a"/></svg>
<svg class="cloud" style="top:42mm;right:17mm;width:34mm" viewBox="0 0 130 34"><use href="#cloud-d"/></svg>
<svg class="cloud" style="top:176mm;left:13mm;width:27mm" viewBox="0 0 130 49"><use href="#cloud-c"/></svg>
<svg class="cloud" style="top:196mm;right:13mm;width:30mm" viewBox="0 0 130 49"><use href="#cloud-e"/></svg>
<div class="title"><h1>식순 안내</h1><p class="jt">式次第のご案内</p></div>
<div class="rule"><i></i><b></b><i></i></div>
<div class="qrbox">__QR__</div>
<div class="cap">QR을 스캔하여 확인해주세요</div>
<div class="jp">QRコードをスキャンしてご確認ください</div>
<div class="who">신랑 유태훈<i>♥</i>신부 김도연</div>
<div class="when">2026. 11. 21 (토) 오후 1시</div>
</body></html>'''.replace('__DEFS__', defs).replace('__QR__', qr)

out = os.path.join(ROOT, 'poster'); os.makedirs(out, exist_ok=True)
hp = os.path.join(out, '_poster.html'); open(hp, 'w', encoding='utf-8').write(HTML)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 794, 'height': 1123}, device_scale_factor=2)
    pg.goto('file:///' + os.path.abspath(hp).replace(chr(92), '/')); pg.evaluate('document.fonts.ready'); pg.wait_for_timeout(2500)
    pg.pdf(path=os.path.join(out, 'honrye-poster.pdf'), width='210mm', height='297mm', print_background=True, prefer_css_page_size=True)
    pg.screenshot(path=os.path.join(out, 'honrye-poster.png'))
    b.close()
os.remove(hp); print('ok')

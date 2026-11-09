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

HTML = '''<!doctype html><html lang="ko"><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600;800;900&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 0 }
* { box-sizing: border-box }
html, body { margin: 0; width: 210mm; height: 296.5mm; overflow: hidden }
:root { --red: #8c1d2a; --red2: #b3263a; --gold: #b8924a; --gold2: #d9bc7e; --cream: #f7efdc; --ink: #3a2a1c }
body { position: relative; overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: "Noto Serif KR", serif; color: var(--red);
  background: radial-gradient(120% 80% at 50% 40%, #fbf5e6 0%, var(--cream) 60%, #efe3c6 100%) }
/* 청해파(물결) 무늬 띠 : 위·아래 */
.wave { position: absolute; left: 0; right: 0; height: 22mm }
.wave.t { top: 0 } .wave.b { bottom: 0; transform: scaleY(-1) }
.wave svg { width: 100%; height: 100% }
.frame { position: absolute; inset: 29mm 12mm; border: .8mm solid var(--red); }
.frame::before { content: ""; position: absolute; inset: 1.6mm; border: .3mm solid var(--gold) }
.corner { position: absolute; width: 9mm; height: 9mm; border: .8mm solid var(--gold); background: var(--cream) }
.corner::after { content: ""; position: absolute; inset: 1.6mm; background: var(--red) }
.fl { position: absolute }
.title { position: absolute; top: 58mm; left: 0; right: 0; text-align: center }
.title small { display: block; font: 600 4.4mm/1 "Noto Serif KR", serif; letter-spacing: 2.2mm; color: var(--gold); margin-bottom: 8mm }
.title h1 { margin: 0; font: 900 30mm/1.05 "Noto Serif KR", serif; letter-spacing: 2.5mm; color: var(--red); text-shadow: .9mm .9mm 0 rgba(184,146,74,.55) }
.rule { position: absolute; top: 106mm; left: 0; right: 0; display: flex; justify-content: center; align-items: center; gap: 4mm }
.rule i { display: block; width: 42mm; height: .5mm; background: linear-gradient(90deg, transparent, var(--gold) 40%, var(--gold)); }
.rule i:last-child { transform: scaleX(-1) }
.rule svg { width: 11mm; height: 11mm }
.qrbox { position: absolute; top: 126mm; left: 50%; transform: translateX(-50%); width: 104mm; height: 104mm; padding: 5.5mm; background: #fffdf6;
  box-shadow: 0 0 0 1.2mm var(--red), 0 0 0 2.2mm var(--cream), 0 0 0 3mm var(--gold) }
.qrbox > svg { width: 100%; height: 100% }
.cap { position: absolute; top: 241mm; left: 0; right: 0; text-align: center; font: 800 8.2mm/1.4 "Noto Serif KR", serif; letter-spacing: .8mm; color: var(--red) }
.cap2 { position: absolute; top: 254mm; left: 0; right: 0; text-align: center; font: 400 4mm/1.5 "Noto Serif KR", serif; letter-spacing: .6mm; color: var(--ink) }
</style>
<body>__DEFS__
<svg width="0" height="0" style="position:absolute"><defs>
  <pattern id="sea" width="16" height="8" patternUnits="userSpaceOnUse" patternTransform="scale(2.4)">
    <g fill="none" stroke="#fff3df" stroke-width=".7">
      <g id="sc"><circle cx="8" cy="8" r="7.4"/><circle cx="8" cy="8" r="5.2"/><circle cx="8" cy="8" r="3"/></g>
      <use href="#sc" x="-8" y="-4"/><use href="#sc" x="8" y="-4"/>
    </g>
  </pattern></defs></svg>
<div class="wave t"><svg><rect width="100%" height="100%" fill="#a9694f"/><rect width="100%" height="100%" fill="url(#sea)"/><rect y="100%" width="100%" height="0"/><rect x="0" y="calc(100% - 1.2mm)" width="100%" height="1.2mm" fill="#8c1d2a"/></svg></div>
<div class="wave b"><svg><rect width="100%" height="100%" fill="#a9694f"/><rect width="100%" height="100%" fill="url(#sea)"/><rect x="0" y="calc(100% - 1.2mm)" width="100%" height="1.2mm" fill="#8c1d2a"/></svg></div>
<div class="frame"></div>
<div class="corner" style="top:24.6mm;left:7.6mm"></div><div class="corner" style="top:24.6mm;right:7.6mm"></div>
<div class="corner" style="bottom:24.6mm;left:7.6mm"></div><div class="corner" style="bottom:24.6mm;right:7.6mm"></div>
<svg class="fl" style="top:34mm;left:50%;margin-left:-11mm;width:22mm;height:22mm"><use href="#flower"/></svg>
<div class="title"><small>傳統 士大夫家 婚禮</small><h1>식순 안내</h1></div>
<div class="rule"><i></i><svg><use href="#flower"/></svg><i></i></div>
<div class="qrbox">__QR__</div>
<div class="cap">QR을 스캔하여 확인해주세요</div>
<div class="cap2">휴대폰 카메라를 QR에 비추면 식순과 뜻풀이를 볼 수 있어요</div>
'''.replace('__DEFS__', defs).replace('__QR__', qr)

out = os.path.join(ROOT, 'poster'); os.makedirs(out, exist_ok=True)
hp = os.path.join(out, '_poster.html'); open(hp, 'w', encoding='utf-8').write(HTML)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 794, 'height': 1123}, device_scale_factor=2)
    pg.goto('file:///' + os.path.abspath(hp).replace(chr(92), '/')); pg.evaluate('document.fonts.ready'); pg.wait_for_timeout(2500)
    pg.pdf(path=os.path.join(out, 'honrye-poster.pdf'), width='210mm', height='297mm', print_background=True, prefer_css_page_size=True)
    pg.screenshot(path=os.path.join(out, 'honrye-poster.png'))
    b.close()
os.remove(hp); print('ok')

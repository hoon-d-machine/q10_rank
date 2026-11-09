# -*- coding: utf-8 -*-
"""honrye/content/default.json → honrye/public/content-default.js (페이지에 내장되는 기본 내용)

저장소(Supabase)를 읽지 못할 때와, 수정 페이지의 '기본 내용으로 되돌리기'에 쓰인다.
기본 내용을 고쳤으면 이 스크립트를 다시 실행: python honrye/tools/build_default_js.py
"""
import json
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
data = json.load(open(os.path.join(ROOT, 'content', 'default.json'), encoding='utf-8'))
body = json.dumps(data, ensure_ascii=False, indent=1)
out = '/* 자동 생성: honrye/tools/build_default_js.py (원본: honrye/content/default.json). 직접 고치지 말 것 */\nwindow.HONRYE_DEFAULT = ' + body + ';\n'
open(os.path.join(ROOT, 'public', 'content-default.js'), 'w', encoding='utf-8').write(out)
print('content-default.js 생성: steps', len(data['steps']))

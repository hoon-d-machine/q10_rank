# -*- coding: utf-8 -*-
"""2026-11 한국어 수정(교배지례 맞절, 성혼 선언과 축도 목사님)에 맞춰 영어·일본어를 고친다. 한국어는 건드리지 않는다.
사용(터미널에서, PIN 은 채팅·파일에 적지 말 것):
  PowerShell:  $env:HONRYE_PIN='내PIN'; python honrye/tools/sync_translations_2026_11.py
  bash:        HONRYE_PIN=내PIN python honrye/tools/sync_translations_2026_11.py
저장 전 내용은 honrye/tools/_backup_before_sync.json 에 남긴다. 다른 곳에서 먼저 저장됐으면(rev 충돌) 아무것도 쓰지 않고 멈춘다."""
import json, os, sys, urllib.request

PIN = os.environ.get('HONRYE_PIN')
if not PIN: sys.exit('HONRYE_PIN 환경변수에 PIN 을 넣어 주세요')
root = os.path.dirname(os.path.abspath(__file__))
cfg = open(os.path.join(root, '..', 'public', 'config.js'), encoding='utf-8').read()
import re
URL = re.search(r'SUPABASE_URL: "([^"]+)"', cfg).group(1); KEY = re.search(r'SUPABASE_KEY: "([^"]+)"', cfg).group(1)
def rpc(n, b):
    r = urllib.request.urlopen(urllib.request.Request(URL + '/rest/v1/rpc/' + n, json.dumps(b).encode(), {'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'}))
    return json.loads(r.read())

cur = rpc('honrye_get', {'p_slug': 'main'}); rev = cur['rev']; d = cur['data']
json.dump(d, open(os.path.join(root, '_backup_before_sync.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
s6, s7 = d['steps'][5], d['steps'][6]
assert s6['id'] == 's6' and s7['id'] == 's7', '순서가 바뀌었어요'
h = s6['how']['en'].split('\n'); assert len(h) == 4; h[3] = 'The bride and groom bow to each other (matjeol).'; s6['how']['en'] = '\n'.join(h)
h = s6['how']['ja'].split('\n'); assert len(h) == 4; h[3] = '新郎新婦が向かい合って、互いに礼(マッチョル)をします。'; s6['how']['ja'] = '\n'.join(h)
s6['note']['title']['en'] = 'Why do the numbers of bows differ in a traditional wedding?'
s6['note']['title']['ja'] = '伝統的な婚礼では、お辞儀の回数はなぜ違うの?'
s6['note']['body']['en'] = s6['note']['body']['en'].rstrip() + '\nHowever, in this ceremony the bride and groom will bow to each other as a pair (matjeol).'
s6['note']['body']['ja'] = s6['note']['body']['ja'].rstrip() + '\nただし、今回の式では、新郎新婦が向かい合って互いに礼をする「マッチョル」で進めます。'
s7['one']['en'] = 'The pastor declares the marriage and offers a prayer of blessing.'
s7['one']['ja'] = '牧師様が成婚を宣言し、祝福の祈りを捧げます。'
s7['meaning']['en'] = 'A declaration, made before the guests, that through the wedding rites the groom and bride have **become husband and wife**.\n\n**Pastor Park Seong-hun of the Urijip Community in Nonsan** declares the marriage,\nand the ceremony closes with a prayer blessing the future of the newly married couple.'
s7['meaning']['ja'] = '婚礼の儀式を経て、新郎新婦が**夫婦になったこと**をゲストの前で広く告げる宣言です。\n\n**論山市ウリジプ共同体のパク・ソンフン牧師様**が成婚を宣言し、\n続いて、新しく夫婦となった二人の未来を祝福する祈りで締めくくります。'
s7['how']['en'] = ''; s7['how']['ja'] = ''
s7['note']['body']['en'] = 'Urijip Church is the church the bride has attended since she was seven, and it is run together with a community facility for people with severe physical disabilities.'
s7['note']['body']['ja'] = 'ウリジプ教会は、新婦が7歳のときから通っている教会で、重度の肢体障がいのある方々のための共同体施設とともに運営されています。'
r = rpc('honrye_save', {'p_pin': PIN, 'p_data': d, 'p_slug': 'main', 'p_expected_rev': rev})
print({k: v for k, v in r.items() if k != 'data'})

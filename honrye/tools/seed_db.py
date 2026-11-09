# -*- coding: utf-8 -*-
"""honrye 저장소(Supabase) 처음 세팅: 표/함수 만들기 + 수정용 PIN 등록 + 기본 내용 넣기.

사용: HONRYE_PIN=123456 python honrye/tools/seed_db.py
  - DB 접속 문자열은 inni_RPA/env 의 SUPABASE_DB_URL 에서 읽는다 (git 에 올라가지 않는 파일).
  - PIN 은 환경 변수로만 받고 파일에 남기지 않는다. DB 에는 해시만 저장된다.
  - 'main' 내용이 이미 있으면 덮어쓰지 않는다 (--force 를 주면 기본 내용으로 되돌림).
"""
import json
import os
import re
import sys

import psycopg2

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def main():
    pin = os.environ.get('HONRYE_PIN', '')
    if len(pin) < 4:
        sys.exit('HONRYE_PIN 환경 변수에 4자 이상 PIN 을 넣어 주세요.')
    env = open(os.path.join(ROOT, '..', 'inni_RPA', 'env'), encoding='utf-8').read()
    dsn = re.search(r'^SUPABASE_DB_URL\s*=\s*(.+)$', env, re.M).group(1).strip().strip('"\'')
    sql = open(os.path.join(ROOT, 'supabase', 'honrye.sql'), encoding='utf-8').read()
    default = json.load(open(os.path.join(ROOT, 'content', 'default.json'), encoding='utf-8'))
    force = '--force' in sys.argv

    conn = psycopg2.connect(dsn, connect_timeout=15)
    cur = conn.cursor()
    cur.execute(sql)
    cur.execute("select count(*) from honrye_auth")
    if cur.fetchone()[0] == 0:
        cur.execute("insert into honrye_auth (id, pin_hash) values (1, extensions.crypt(%s, extensions.gen_salt('bf')))", (pin,))
        print('PIN 등록 완료')
    else:
        print('PIN 은 이미 등록돼 있어 그대로 둠 (바꾸려면 수정 페이지의 PIN 변경 사용)')
    cur.execute("select rev from honrye_content where slug = 'main'")
    row = cur.fetchone()
    if row is None or force:
        cur.execute("""insert into honrye_content (slug, data, rev) values ('main', %s, 1)
                       on conflict (slug) do update set data = excluded.data, rev = honrye_content.rev + 1, updated_at = now()""",
                    (json.dumps(default, ensure_ascii=False),))
        print('기본 내용 저장 완료 (slug=main)')
    else:
        print('main 내용이 이미 있어 그대로 둠 (rev %d)' % row[0])
    conn.commit()
    conn.close()


if __name__ == '__main__':
    main()

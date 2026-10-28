# -*- coding: utf-8 -*-
"""로컬 저장 폴더 변경: python change_save_dir.py"""
from local_config import load_save_dir, store_save_dir, pick_dir

current = load_save_dir()
print(f"현재 저장 폴더: {current or '(미설정)'}")
path = pick_dir(initial=current)
if path:
    store_save_dir(path)
    print(f"저장 폴더 변경 완료: {path}")
    print("※ 기존 폴더의 CSV는 자동으로 옮겨지지 않습니다. 필요하면 직접 복사하세요.")
else:
    print("선택이 취소되어 변경하지 않았습니다.")

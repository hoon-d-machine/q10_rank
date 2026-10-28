# -*- coding: utf-8 -*-
"""로컬 저장 폴더 설정 (최초 1회 GUI 선택 → local_config.json 저장)."""
import os
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, "local_config.json")


def load_save_dir():
    """저장된 폴더 경로 반환. 설정이 없거나 깨졌으면 None."""
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f).get("save_dir") or None
    except (OSError, ValueError):
        return None


def store_save_dir(path):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump({"save_dir": path}, f, ensure_ascii=False, indent=2)


def pick_dir(initial=None):
    """tkinter 폴더 선택 창. 취소/GUI 불가 시 None."""
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        path = filedialog.askdirectory(
            title="Qoo10 RPA 데이터를 저장할 폴더를 선택하세요",
            initialdir=initial or os.path.expanduser("~"),
            mustexist=False,
        )
        root.destroy()
        return os.path.normpath(path) if path else None
    except Exception:
        return None


def get_save_dir():
    """저장 폴더 반환. 최초 1회만 선택 창을 띄우고 이후엔 저장된 값을 사용.
    선택 취소/폴더 생성 실패 시 None (로컬 저장만 건너뜀)."""
    path = load_save_dir()
    if not path:
        path = pick_dir()
        if not path:
            return None
        store_save_dir(path)
    try:
        os.makedirs(path, exist_ok=True)
    except OSError:
        return None
    return path

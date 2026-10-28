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


def ask_retry_save(path):
    """저장 실패 시 경고창. '닫은 후 저장' → True(재시도), '취소' → False. GUI 불가 시 False."""
    try:
        import tkinter as tk
        root = tk.Tk()
        root.title("저장 실패")
        root.attributes("-topmost", True)
        root.resizable(False, False)
        result = {"retry": False}

        def choose(v):
            result["retry"] = v
            root.destroy()

        msg = (f"파일이 열려 있어 저장하지 못했습니다.\n\n{path}\n\n"
               "엑셀 등에서 파일을 닫은 뒤 '닫은 후 저장'을 누르세요.\n"
               "'취소'하면 로컬 저장 없이 종료되며 다시 실행해야 합니다.")
        tk.Label(root, text=msg, justify="left", padx=20, pady=15).pack()
        row = tk.Frame(root, pady=10)
        row.pack()
        tk.Button(row, text="닫은 후 저장", width=14, command=lambda: choose(True)).pack(side="left", padx=8)
        tk.Button(row, text="취소", width=14, command=lambda: choose(False)).pack(side="left", padx=8)
        root.protocol("WM_DELETE_WINDOW", lambda: choose(False))
        root.mainloop()
        return result["retry"]
    except Exception:
        return False

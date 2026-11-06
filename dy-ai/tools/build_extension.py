"""확장 프로그램(dy-ai/extension)을 사이트에서 받을 수 있게 묶는다.

결과:
  public/downloads/dy-ai-q10-extension.zip   (압축 풀면 dy-ai-q10-extension/ 폴더)
  public/downloads/extension.json            ({"version": manifest 버전}) - 메인 화면이 설치 버전과 비교

확장 코드를 고치면 manifest.json 의 version 을 올리고 이 스크립트를 실행한 뒤 커밋한다.
  python dy-ai/tools/build_extension.py
"""
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / "extension"
OUT = ROOT / "public" / "downloads"
FOLDER = "dy-ai-q10-extension"
FIXED_TIME = (2026, 1, 1, 0, 0, 0)  # 내용이 같으면 zip도 같게 (불필요한 diff 방지)


def main():
    version = json.loads((EXT / "manifest.json").read_text(encoding="utf-8"))["version"]
    OUT.mkdir(parents=True, exist_ok=True)

    zip_path = OUT / f"{FOLDER}.zip"
    files = sorted(p for p in EXT.rglob("*") if p.is_file() and not p.name.startswith("."))
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for p in files:
            info = zipfile.ZipInfo(f"{FOLDER}/{p.relative_to(EXT).as_posix()}", FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, p.read_bytes())

    (OUT / "extension.json").write_text(json.dumps({"version": version}) + "\n", encoding="utf-8")
    print(f"v{version}: {zip_path.relative_to(ROOT)} ({len(files)} files, {zip_path.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
"""배포 주소로 QR 코드 이미지(PNG·SVG)를 만든다.

사용: python honrye/tools/make_qr.py [주소]
  주소를 생략하면 아래 URL 을 쓴다. 결과는 honrye/qr/ 에 저장되고, 만든 뒤 디코딩해서 주소가 맞는지 확인한다.
필요: pip install qrcode pillow  (확인용: pip install zxing-cpp)
"""
import os
import sys

import qrcode
from qrcode.constants import ERROR_CORRECT_Q
from qrcode.image.svg import SvgPathImage

URL = "https://honrye.xogns1381.workers.dev/"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "qr")


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else URL
    os.makedirs(OUT, exist_ok=True)

    # Q 등급(약 25% 손상까지 복원): 인쇄물이 약간 구겨지거나 가려져도 읽힘
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_Q, box_size=24, border=4)
    qr.add_data(url)
    qr.make(fit=True)

    png = os.path.join(OUT, "honrye-qr.png")
    qr.make_image(fill_color="#1e2233", back_color="white").save(png)   # 짙은 남색 + 흰 배경 (대비 충분)
    svg = os.path.join(OUT, "honrye-qr.svg")
    qrcode.make(url, image_factory=SvgPathImage, error_correction=ERROR_CORRECT_Q).save(svg)
    print("저장:", os.path.normpath(png), "/", os.path.normpath(svg), f"(모듈 {qr.modules_count}×{qr.modules_count})")

    try:  # 만든 이미지를 실제로 읽어서 주소가 같은지 확인
        import zxingcpp
        from PIL import Image
        res = zxingcpp.read_barcodes(Image.open(png))
        got = res[0].text if res else None
        print("디코딩:", got, "→", "일치" if got == url else "불일치!")
        if got != url:
            sys.exit(1)
    except ImportError:
        print("(zxing-cpp 가 없어 디코딩 확인은 건너뜀)")


if __name__ == "__main__":
    main()

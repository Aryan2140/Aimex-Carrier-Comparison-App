#!/usr/bin/env python3
"""Generate crisp 16x16, 48x48, and 128x128 extension icons from assets/logos/aimex-icon.png."""

import math
import os
import struct
import subprocess
import tempfile
import zlib

BG_NAVY = (8, 20, 34)


def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    chunk = chunk_type + data
    crc = zlib.crc32(chunk) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + chunk + struct.pack(">I", crc)


def write_rgba_png(path: str, width: int, height: int, pixels: bytearray) -> None:
    stride = width * 4
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        start = y * stride
        raw.extend(pixels[start : start + stride])
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), level=9)
    png = b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", idat) + png_chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def decode_rgba_png(path: str):
    data = open(path, "rb").read()
    pos = 8
    width = height = 0
    idat = bytearray()
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        ctype = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if ctype == b"IHDR":
            width, height, bit_depth, color_type = struct.unpack(">IIBB", chunk[:10])
            if bit_depth != 8 or color_type != 6:
                raise ValueError(f"Expected 8-bit RGBA PNG, got depth={bit_depth} type={color_type}")
        elif ctype == b"IDAT":
            idat.extend(chunk)
        elif ctype == b"IEND":
            break

    raw = zlib.decompress(bytes(idat))
    stride = width * 4
    pixels = bytearray(width * height * 4)
    in_pos = 0
    for y in range(height):
        ftype = raw[in_pos]
        in_pos += 1
        row_start = y * stride
        prev_start = (y - 1) * stride
        for x in range(stride):
            val = raw[in_pos]
            in_pos += 1
            a = pixels[row_start + x - 4] if x >= 4 else 0
            b = pixels[prev_start + x] if y > 0 else 0
            c = pixels[prev_start + x - 4] if (y > 0 and x >= 4) else 0
            if ftype == 1:
                val = (val + a) & 0xFF
            elif ftype == 2:
                val = (val + b) & 0xFF
            elif ftype == 3:
                val = (val + ((a + b) >> 1)) & 0xFF
            elif ftype == 4:
                val = (val + paeth(a, b, c)) & 0xFF
            pixels[row_start + x] = val
    return width, height, pixels


def rounded_rect_sdf(px: float, py: float, half: float, radius: float) -> float:
    qx = abs(px - 0.5) - (half - radius)
    qy = abs(py - 0.5) - (half - radius)
    return math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - radius


def composite_icon(logo_path: str, size: int, out_path: str) -> None:
    pad = max(2, round(size * 0.14))
    max_w = size - pad * 2
    max_h = max(8, round(max_w * (379 / 442)))

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        subprocess.check_call(
            ["sips", "-z", str(max_h), str(max_w), logo_path, "--out", tmp_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        lw, lh, lpix = decode_rgba_png(tmp_path)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    out = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            nx = (x + 0.5) / size
            ny = (y + 0.5) / size
            sdf = rounded_rect_sdf(nx, ny, half=0.47, radius=0.12)
            idx = (y * size + x) * 4
            if sdf <= 0:
                out[idx] = BG_NAVY[0]
                out[idx + 1] = BG_NAVY[1]
                out[idx + 2] = BG_NAVY[2]
                out[idx + 3] = 255

    ox = (size - lw) // 2
    oy = (size - lh) // 2
    for ly in range(lh):
        dy = oy + ly
        if dy < 0 or dy >= size:
            continue
        for lx in range(lw):
            dx = ox + lx
            if dx < 0 or dx >= size:
                continue
            lidx = (ly * lw + lx) * 4
            sa = lpix[lidx + 3] / 255.0
            if sa <= 0:
                continue
            didx = (dy * size + dx) * 4
            da = out[didx + 3] / 255.0
            out_a = sa + da * (1.0 - sa)
            if out_a > 0:
                for c in range(3):
                    out[didx + c] = min(
                        255,
                        round((lpix[lidx + c] * sa + out[didx + c] * da * (1.0 - sa)) / out_a),
                    )
                out[didx + 3] = min(255, round(out_a * 255))

    write_rgba_png(out_path, size, size, out)
    print(f"Generated {out_path} ({size}x{size})")


def main() -> None:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    logo_path = os.path.join(root, "assets", "logos", "aimex-icon.png")
    icons_dir = os.path.join(root, "icons")
    os.makedirs(icons_dir, exist_ok=True)
    for size in (16, 48, 128):
        composite_icon(logo_path, size, os.path.join(icons_dir, f"icon-{size}.png"))


if __name__ == "__main__":
    main()

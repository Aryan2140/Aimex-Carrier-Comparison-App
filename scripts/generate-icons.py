#!/usr/bin/env python3
"""Generate crisp Aimex Carrier Comparison extension PNG icons at 16, 48, and 128px."""

import math
import os
import struct
import zlib

BG_NAVY = (8, 20, 34, 255)
BG_NAVY_HIGHLIGHT = (16, 36, 61, 255)
GOLD = (245, 197, 24, 255)
GOLD_BRIGHT = (253, 224, 71, 255)


def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    chunk = chunk_type + data
    crc = zlib.crc32(chunk) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + chunk + struct.pack(">I", crc)


def write_rgba_png(path: str, width: int, height: int, pixels: bytearray) -> None:
    stride = width * 4
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # Filter type 0 (None)
        start = y * stride
        raw.extend(pixels[start : start + stride])

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), level=9)
    png = b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", idat) + png_chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def point_in_triangle(px: float, py: float, a, b, c) -> bool:
    ax, ay = a
    bx, by = b
    cx, cy = c
    v0 = (cx - ax, cy - ay)
    v1 = (bx - ax, by - ay)
    v2 = (px - ax, py - ay)
    dot00 = v0[0] * v0[0] + v0[1] * v0[1]
    dot01 = v0[0] * v1[0] + v0[1] * v1[1]
    dot02 = v0[0] * v2[0] + v0[1] * v2[1]
    dot11 = v1[0] * v1[0] + v1[1] * v1[1]
    dot12 = v1[0] * v2[0] + v1[1] * v2[1]
    denom = dot00 * dot11 - dot01 * dot01
    if denom == 0:
        return False
    inv = 1.0 / denom
    u = (dot11 * dot02 - dot01 * dot12) * inv
    v = (dot00 * dot12 - dot01 * dot02) * inv
    return u >= 0 and v >= 0 and (u + v) <= 1


def rounded_rect_sdf(px: float, py: float, half: float, radius: float) -> float:
    qx = abs(px - 0.5) - (half - radius)
    qy = abs(py - 0.5) - (half - radius)
    ox = max(qx, 0.0)
    oy = max(qy, 0.0)
    return math.hypot(ox, oy) + min(max(qx, qy), 0.0) - radius


def sample_color(nx: float, ny: float):
    # Rounded square container with slight margin
    sdf = rounded_rect_sdf(nx, ny, half=0.46, radius=0.11)
    if sdf > 0.0:
        return (0, 0, 0, 0)

    # Subtle vertical sheen on navy background
    t = max(0.0, min(1.0, 1.0 - ny))
    r = int(BG_NAVY[0] + (BG_NAVY_HIGHLIGHT[0] - BG_NAVY[0]) * (t * 0.65))
    g = int(BG_NAVY[1] + (BG_NAVY_HIGHLIGHT[1] - BG_NAVY[1]) * (t * 0.65))
    b = int(BG_NAVY[2] + (BG_NAVY_HIGHLIGHT[2] - BG_NAVY[2]) * (t * 0.65))
    bg = (r, g, b, 255)

    # Thin subtle gold inner border near edge
    if -0.022 <= sdf <= -0.004:
        return (245, 197, 24, 90)

    # Aimex-inspired geometric delta/chevron emblem (split arrow/A-wing)
    apex = (0.50, 0.17)
    left_base = (0.19, 0.77)
    right_base = (0.81, 0.77)
    inner_notch = (0.50, 0.55)
    wing_cut_left = (0.37, 0.77)
    wing_cut_right = (0.63, 0.77)

    in_outer = point_in_triangle(nx, ny, apex, left_base, right_base)
    in_inner_cut = point_in_triangle(nx, ny, inner_notch, wing_cut_left, wing_cut_right)

    # Crossbar accent representing rate comparison delta
    in_bar = (0.39 <= nx <= 0.61) and (0.48 <= ny <= 0.55)

    if (in_outer and not in_inner_cut) or in_bar:
        if ny < 0.45:
            return GOLD_BRIGHT
        return GOLD

    return bg


def render_icon(size: int) -> bytearray:
    ss = 4  # 4x4 supersampling for clean anti-aliased edges
    pixels = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            ar = ag = ab = aa = 0
            for sy in range(ss):
                for sx in range(ss):
                    nx = (x + (sx + 0.5) / ss) / size
                    ny = (y + (sy + 0.5) / ss) / size
                    sr, sg, sb, sa = sample_color(nx, ny)
                    ar += sr * sa
                    ag += sg * sa
                    ab += sb * sa
                    aa += sa
            samples = ss * ss
            out_a = aa // samples
            if out_a == 0:
                out_r = out_g = out_b = 0
            else:
                out_r = min(255, ar // aa)
                out_g = min(255, ag // aa)
                out_b = min(255, ab // aa)
            idx = (y * size + x) * 4
            pixels[idx] = out_r
            pixels[idx + 1] = out_g
            pixels[idx + 2] = out_b
            pixels[idx + 3] = out_a
    return pixels


def main() -> None:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icons_dir = os.path.join(root, "icons")
    os.makedirs(icons_dir, exist_ok=True)
    for size in (16, 48, 128):
        out_path = os.path.join(icons_dir, f"icon-{size}.png")
        pixels = render_icon(size)
        write_rgba_png(out_path, size, size, pixels)
        print(f"Generated {out_path} ({size}x{size})")


if __name__ == "__main__":
    main()

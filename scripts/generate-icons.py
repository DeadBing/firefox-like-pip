#!/usr/bin/env python3
"""Generate Firefox-like Picture-in-Picture toolbar icons."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path: Path, size: int, rgba: list[int]) -> None:
    raw = b""
    for y in range(size):
        raw += b"\x00"
        start = y * size * 4
        raw += bytes(rgba[start : start + size * 4])
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def draw_icon(size: int) -> list[int]:
    pixels = [0] * (size * size * 4)
    bg = (0, 96, 223, 255)
    white = (255, 255, 255, 255)

    def set_px(x: int, y: int, color: tuple[int, int, int, int]) -> None:
        if 0 <= x < size and 0 <= y < size:
            i = (y * size + x) * 4
            pixels[i : i + 4] = color

    def fill(x0: int, y0: int, x1: int, y1: int, color: tuple[int, int, int, int]) -> None:
        for y in range(y0, y1):
            for x in range(x0, x1):
                set_px(x, y, color)

    # Rounded-ish square background
    pad = max(1, size // 16)
    fill(pad, pad, size - pad, size - pad, bg)

    # Large screen
    m = size // 6
    t = max(1, size // 16)
    fill(m, m, size - m, int(size * 0.62), white)
    fill(m + t, m + t, size - m - t, int(size * 0.62) - t, bg)

    # Small overlapping PiP screen
    sx0, sy0 = int(size * 0.46), int(size * 0.48)
    sx1, sy1 = size - m, size - m
    fill(sx0, sy0, sx1, sy1, white)
    fill(sx0 + t, sy0 + t, sx1 - t, sy1 - t, bg)
    return pixels


def main() -> None:
    out = Path(__file__).resolve().parents[1] / "icons"
    out.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        write_png(out / f"icon{size}.png", size, draw_icon(size))


if __name__ == "__main__":
    main()

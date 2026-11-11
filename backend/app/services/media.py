"""Image upload validation and dimension reading without extra dependencies (PNG, JPEG, GIF, WebP)."""
from __future__ import annotations

import base64
import re
import struct

MAX_BYTES = 2 * 1024 * 1024
TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}


def sniff(data: bytes) -> str | None:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def dimensions(data: bytes, ctype: str) -> tuple[int | None, int | None]:
    try:
        if ctype == "image/png":
            return struct.unpack(">II", data[16:24])
        if ctype == "image/gif":
            return struct.unpack("<HH", data[6:10])
        if ctype == "image/webp":
            chunk = data[12:16]
            if chunk == b"VP8X":
                return 1 + int.from_bytes(data[24:27], "little"), 1 + int.from_bytes(data[27:30], "little")
            if chunk == b"VP8 ":
                w, h = struct.unpack("<HH", data[26:30])
                return w & 0x3FFF, h & 0x3FFF
            if chunk == b"VP8L":
                b = data[21:25]
                return 1 + (((b[1] & 0x3F) << 8) | b[0]), 1 + (((b[3] & 0xF) << 10) | (b[2] << 2) | ((b[1] & 0xC0) >> 6))
        if ctype == "image/jpeg":
            i = 2
            while i < len(data) - 9:
                if data[i] != 0xFF:
                    i += 1
                    continue
                marker = data[i + 1]
                if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                    h, w = struct.unpack(">HH", data[i + 5:i + 9])
                    return w, h
                seg = struct.unpack(">H", data[i + 2:i + 4])[0]
                i += 2 + seg
    except (struct.error, IndexError):
        pass
    return None, None


def decode_data_url(data_url: str) -> tuple[bytes, str]:
    m = re.match(r"^data:(image/[a-z+.-]+);base64,(.+)$", data_url or "", re.S)
    if not m:
        raise ValueError("Upload an image (PNG, JPG, GIF or WebP).")
    raw = base64.b64decode(m.group(2), validate=False)
    if len(raw) > MAX_BYTES:
        raise ValueError("Images must be 2 MB or smaller. Try compressing it first.")
    ctype = sniff(raw)
    if ctype not in TYPES:
        raise ValueError("That file isn't a PNG, JPG, GIF or WebP image.")
    return raw, ctype

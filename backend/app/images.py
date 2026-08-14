"""
Image payload validation. No user-provided bytes are ever written to disk
here — everything stays in memory and is discarded after the model call.
"""

from __future__ import annotations

import base64
import binascii
import struct
from dataclasses import dataclass

_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_WEBP_RIFF = b"RIFF"
_WEBP_MAGIC = b"WEBP"


class InvalidImageError(ValueError):
    pass


@dataclass
class DecodedImage:
    data: bytes
    mime: str
    width: int
    height: int


def decode_and_validate_image(
    b64_data: str,
    *,
    declared_format: str,
    max_bytes: int,
    min_dimension: int,
    max_dimension: int,
) -> DecodedImage:
    """Decode a base64 image payload and validate it before it ever reaches
    the model adapter: size ceiling, valid base64, magic-byte format check
    (the declared format must match what's actually in the bytes — a
    mislabeled payload is rejected rather than trusted), and dimension
    bounds pulled from the file header itself (not from client-reported
    width/height, which could lie)."""

    if len(b64_data) > max_bytes * 4 // 3 + 8:  # base64 expands ~4/3; generous slack
        raise InvalidImageError("Image payload exceeds the configured size limit")

    try:
        data = base64.b64decode(b64_data, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise InvalidImageError("Image payload is not valid base64") from exc

    if len(data) == 0:
        raise InvalidImageError("Decoded image is empty")
    if len(data) > max_bytes:
        raise InvalidImageError("Decoded image exceeds the configured size limit")

    if declared_format == "png":
        width, height = _read_png_dimensions(data)
        mime = "image/png"
    elif declared_format == "webp":
        width, height = _read_webp_dimensions(data)
        mime = "image/webp"
    else:
        raise InvalidImageError(f"Unsupported declared image format: {declared_format}")

    if width < min_dimension or height < min_dimension:
        raise InvalidImageError(f"Image is smaller than the minimum allowed dimension ({min_dimension}px)")
    if width > max_dimension or height > max_dimension:
        raise InvalidImageError(f"Image exceeds the maximum allowed dimension ({max_dimension}px)")

    return DecodedImage(data=data, mime=mime, width=width, height=height)


def _read_png_dimensions(data: bytes) -> tuple[int, int]:
    if not data.startswith(_PNG_MAGIC):
        raise InvalidImageError("Declared format was png, but the payload is not a valid PNG")
    if len(data) < 24:
        raise InvalidImageError("PNG payload is truncated")
    width, height = struct.unpack(">II", data[16:24])
    return width, height


def _read_webp_dimensions(data: bytes) -> tuple[int, int]:
    if not (data[0:4] == _WEBP_RIFF and data[8:12] == _WEBP_MAGIC):
        raise InvalidImageError("Declared format was webp, but the payload is not a valid WebP")
    if len(data) < 30:
        raise InvalidImageError("WebP payload is truncated")

    chunk_id = data[12:16]
    if chunk_id == b"VP8 ":
        # Lossy WebP: 3-byte sync code then 14-bit width/height at offset 26.
        width = (data[26] | ((data[27] & 0x3F) << 8)) + 1
        height = (data[28] | ((data[29] & 0x3F) << 8)) + 1
        return width, height
    if chunk_id == b"VP8L":
        # Lossless WebP: 1 signature byte then packed 14-bit dimensions.
        b = data[21:25]
        bits = b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)
        width = (bits & 0x3FFF) + 1
        height = ((bits >> 14) & 0x3FFF) + 1
        return width, height
    if chunk_id == b"VP8X":
        width = (data[24] | (data[25] << 8) | (data[26] << 16)) + 1
        height = (data[27] | (data[28] << 8) | (data[29] << 16)) + 1
        return width, height

    raise InvalidImageError("Unrecognized WebP chunk format")


def ensure_png_bytes(data: bytes, mime: str) -> tuple[bytes, str]:
    """Ensures image bytes are in standard PNG format for multimodal models/Ollama."""
    if mime == "image/png" and data.startswith(_PNG_MAGIC):
        return data, "image/png"
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(data))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue(), "image/png"
    except Exception:
        return data, mime


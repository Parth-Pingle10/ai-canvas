import httpx
import base64
import struct
import zlib
import io

def make_test_png():
    width, height = 100, 100
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    raw = b""
    for y in range(height):
        row = b"\x00"
        for x in range(width):
            if 45 <= y <= 55 or 45 <= x <= 55:
                row += b"\x00\x00\x00"
            else:
                row += b"\xff\xff\xff"
        raw += row
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")

def make_test_webp():
    # Simple lossless or lossy webp bytes
    # Let's test with a minimal webp
    # RIFF ... WEBP VP8 ...
    # Or let's test converting PNG to WebP or checking what frontend sent
    pass

def test_ollama_png():
    png_bytes = make_test_png()
    b64 = base64.b64encode(png_bytes).decode("ascii")
    payload = {
        "model": "qwen3-vl:4b",
        "prompt": "describe this image",
        "images": [b64],
        "stream": False,
    }
    r = httpx.post("http://localhost:11434/api/generate", json=payload, timeout=60.0)
    print("PNG test status:", r.status_code)
    print("PNG test body:", r.text[:200])

if __name__ == "__main__":
    test_ollama_png()

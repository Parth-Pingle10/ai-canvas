import httpx
import json
import base64
import struct
import zlib
import uuid

def make_test_png(pattern="equation"):
    width, height = 300, 100
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    raw = b""
    for y in range(height):
        row = b"\x00"
        for x in range(width):
            is_stroke = False
            if pattern == "cross":
                if (height // 2 - 3 <= y <= height // 2 + 3 and 50 <= x <= 250) or \
                   (width // 2 - 3 <= x <= width // 2 + 3 and 20 <= y <= 80):
                    is_stroke = True
            elif pattern == "triangle":
                # Draw right triangle
                if (80 <= y <= 85 and 50 <= x <= 250) or \
                   (20 <= y <= 85 and 50 <= x <= 55) or \
                   (abs((y - 20) * (200) - (x - 50) * 65) < 300 and 50 <= x <= 250 and 20 <= y <= 85):
                    is_stroke = True
            else: # horizontal strokes
                if (30 <= y <= 35 and 40 <= x <= 260) or (65 <= y <= 70 and 40 <= x <= 260):
                    is_stroke = True

            if is_stroke:
                row += b"\x10\x10\x10"
            else:
                row += b"\xff\xff\xff"
        raw += row
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")

def test_analyze(pattern, desc):
    print(f"\n==========================================")
    print(f"Testing live /api/analyze with pattern: {desc}")
    png_bytes = make_test_png(pattern)
    image_b64 = base64.b64encode(png_bytes).decode("ascii")
    session_id = f"test_session_{uuid.uuid4().hex[:6]}"
    request_id = f"req_{uuid.uuid4().hex[:8]}"

    payload = {
        "request_id": request_id,
        "image": image_b64,
        "context": {
            "world_bounds": {"x": 50, "y": 50, "width": 300, "height": 100},
            "crop_width": 300,
            "crop_height": 100,
            "zoom": 1.0,
            "stroke_count": 4,
            "format": "png",
            "session_id": session_id,
            "t_capture_ms": 8.5,
            "t_dispatch_ms": 2.1,
        },
        "trigger": "manual"
    }

    try:
        resp = httpx.post("http://127.0.0.1:8000/api/analyze", json=payload, timeout=90.0)
        print(f"HTTP Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print("Response model:", data["model"])
            print("Response draft type:", data["draft"]["type"])
            print("Response draft title:", data["draft"]["title"])
            print("Response draft confidence:", data["draft"]["confidence"])
            print("Response draft content:\n", data["draft"]["content"])
            print("Tokens:", data["tokens"])
            print("Latency (ms):", data["latency_ms"])

            # Test outcome reporting
            outcome_resp = httpx.post(
                "http://127.0.0.1:8000/api/metrics/outcome",
                json={"request_id": request_id, "outcome": "accepted"},
                timeout=5.0
            )
            print(f"Report outcome HTTP Status: {outcome_resp.status_code}")

            # Test session metrics
            session_resp = httpx.get(
                f"http://127.0.0.1:8000/api/metrics/session?session_id={session_id}",
                timeout=5.0
            )
            print(f"Session metrics HTTP Status: {session_resp.status_code}")
            print(f"Session metrics: {session_resp.json()}")
            return True
        else:
            print("Error response:", resp.text)
            return False
    except Exception as e:
        print("Exception:", e)
        return False

def main():
    r1 = test_analyze("cross", "Cross / Plus Sign Sketch")
    r2 = test_analyze("triangle", "Right-angle Triangle Diagram")
    r3 = test_analyze("lines", "Parallel Line Annotations")
    print(f"\nResults: Cross={r1}, Triangle={r2}, Lines={r3}")

if __name__ == "__main__":
    main()

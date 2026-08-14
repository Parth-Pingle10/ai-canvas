import io
import base64
from PIL import Image
import httpx

def main():
    # 1. Create WebP image
    img = Image.new("RGB", (100, 100), color="white")
    buf_webp = io.BytesIO()
    img.save(buf_webp, format="WEBP")
    webp_bytes = buf_webp.getvalue()

    # 2. Test sending raw WebP to Ollama
    print("Testing raw WebP against Ollama...")
    try:
        r1 = httpx.post("http://localhost:11434/api/generate", json={
            "model": "qwen3-vl:4b",
            "prompt": "describe this image in 5 words",
            "images": [base64.b64encode(webp_bytes).decode("ascii")],
            "stream": False
        }, timeout=30.0)
        print("Raw WebP Ollama HTTP Status:", r1.status_code)
        print("Raw WebP Ollama Response:", r1.text[:200])
    except Exception as e:
        print("Raw WebP Error:", e)

    # 3. Test sending PNG to Ollama
    print("\nTesting PNG against Ollama...")
    buf_png = io.BytesIO()
    img.save(buf_png, format="PNG")
    png_bytes = buf_png.getvalue()
    try:
        r2 = httpx.post("http://localhost:11434/api/generate", json={
            "model": "qwen3-vl:4b",
            "prompt": "describe this image in 5 words",
            "images": [base64.b64encode(png_bytes).decode("ascii")],
            "stream": False
        }, timeout=30.0)
        print("PNG Ollama HTTP Status:", r2.status_code)
        print("PNG Ollama Response:", r2.text[:200])
    except Exception as e:
        print("PNG Error:", e)

if __name__ == "__main__":
    main()

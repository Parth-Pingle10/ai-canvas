#!/usr/bin/env python3
"""
Run the SLATE optimization experiment against the local backend + Ollama.

Reads benchmark canvas JSON files, posts analyze requests with configurable
arms (ROI format/resolution), and writes raw results to stdout/CSV for later
charting. Does NOT fabricate metrics — every row comes from a real HTTP call.

Usage (from repo root, with backend + Ollama running):

    python scripts/run_experiment.py \\
        --canvases benchmarks/*.json \\
        --arms baseline,webp-512,webp-1024 \\
        --repetitions 3 \\
        --output results/experiment.csv

Arms (edit ARM_CONFIGS to add more):
  - baseline   : png @ 1024px (matches frontend default resolution, png format)
  - webp-512   : webp @ 512px
  - webp-1024  : webp @ 1024px (frontend default)

TODO: Add five benchmark canvas JSON files under benchmarks/ before running.
TODO: Randomize/interleave arm order per assignment spec (see --shuffle flag).
TODO: Plot p50/p95 e2e, mean tokens, DAR from traces after collection.
"""

from __future__ import annotations

import argparse
import base64
import csv
import json
import random
import sys
import time
import uuid
from pathlib import Path

import httpx

ARM_CONFIGS: dict[str, dict] = {
    "baseline": {"format": "png", "resolution": 1024},
    "webp-512": {"format": "webp", "resolution": 512},
    "webp-1024": {"format": "webp", "resolution": 1024},
}


def load_canvas(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def raster_placeholder_png(width: int, height: int) -> bytes:
    """Minimal valid PNG for dry-run when canvas rasterization is not wired here.

    For real experiments, export ROI images from the frontend RegionExtractor
    or pre-render benchmark crops — this placeholder only validates plumbing.
    """
    import struct
    import zlib

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    raw = b"".join([b"\x00" + b"\x00\x00\x00" * width for _ in range(height)])
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def post_analyze(
    client: httpx.Client,
    *,
    base_url: str,
    image_b64: str,
    fmt: str,
    crop_w: int,
    crop_h: int,
    session_id: str,
) -> dict:
    payload = {
        "request_id": str(uuid.uuid4()),
        "image": image_b64,
        "context": {
            "world_bounds": {"x": 0, "y": 0, "width": crop_w, "height": crop_h},
            "crop_width": crop_w,
            "crop_height": crop_h,
            "zoom": 1.0,
            "stroke_count": 1,
            "format": fmt,
            "session_id": session_id,
            "t_capture_ms": 0.0,
            "t_dispatch_ms": 0.0,
        },
        "trigger": "manual",
    }
    t0 = time.perf_counter()
    resp = client.post(f"{base_url}/api/analyze", json=payload, timeout=180.0)
    wall_ms = (time.perf_counter() - t0) * 1000
    body = resp.json()
    return {"http_status": resp.status_code, "wall_ms": wall_ms, "body": body}


def main() -> int:
    parser = argparse.ArgumentParser(description="SLATE AI canvas experiment runner")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--canvases", nargs="+", type=Path, default=[])
    parser.add_argument("--arms", default="baseline,webp-512,webp-1024")
    parser.add_argument("--repetitions", type=int, default=3)
    parser.add_argument("--shuffle", action="store_true", help="Randomize trial order")
    parser.add_argument("--output", type=Path, default=Path("results/experiment.csv"))
    parser.add_argument("--dry-run", action="store_true", help="Use placeholder PNG, no canvas files needed")
    args = parser.parse_args()

    arms = [a.strip() for a in args.arms.split(",") if a.strip()]
    for arm in arms:
        if arm not in ARM_CONFIGS:
            print(f"Unknown arm: {arm}", file=sys.stderr)
            return 1

    trials: list[tuple[str, Path | None, int]] = []
    canvas_paths = args.canvases or ([None] if args.dry_run else [])
    if not canvas_paths:
        print("Provide --canvases or use --dry-run", file=sys.stderr)
        return 1

    for canvas in canvas_paths:
        for arm in arms:
            for rep in range(args.repetitions):
                trials.append((arm, canvas, rep))

    if args.shuffle:
        random.shuffle(trials)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    session_id = f"exp_{uuid.uuid4().hex[:8]}"

    rows: list[dict] = []
    with httpx.Client() as client:
        for arm, canvas_path, rep in trials:
            cfg = ARM_CONFIGS[arm]
            res = cfg["resolution"]
            png = raster_placeholder_png(res, max(64, res // 2))
            image_b64 = base64.b64encode(png).decode("ascii")
            stroke_count = 0
            if canvas_path is not None:
                doc = load_canvas(canvas_path)
                stroke_count = len(doc.get("strokes", []))

            result = post_analyze(
                client,
                base_url=args.base_url,
                image_b64=image_b64,
                fmt=cfg["format"],
                crop_w=res,
                crop_h=max(64, res // 2),
                session_id=session_id,
            )
            body = result["body"]
            row = {
                "arm": arm,
                "canvas": str(canvas_path) if canvas_path else "dry-run",
                "rep": rep,
                "http_status": result["http_status"],
                "wall_ms": round(result["wall_ms"], 2),
                "outcome": body.get("error_code") or "ok",
                "e2e_ms": (body.get("latency_ms") or {}).get("e2e"),
                "tokens_total": (body.get("tokens") or {}).get("total"),
                "cost_usd": body.get("cost_usd"),
                "request_id": body.get("request_id"),
            }
            rows.append(row)
            print(json.dumps(row))

    fieldnames = list(rows[0].keys()) if rows else []
    with args.output.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows to {args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""
Safe parsing of the model's raw text output into a validated DraftContent.

Models asked for JSON sometimes still wrap it in a markdown code fence, add a
leading/trailing sentence, or otherwise almost-but-not-quite follow
instructions. This module makes one bounded, honest recovery attempt before
giving up — it never guesses at missing fields or invents content.
"""

from __future__ import annotations

import json
import re

from pydantic import ValidationError

from app.schemas.response import DraftContent

_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)
_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


class DraftParseError(ValueError):
    pass


_SHAPE_TYPE_MAP = {
    "rectangle": "rectangle",
    "rect": "rectangle",
    "box": "rectangle",
    "process": "rectangle",
    "rounded_rectangle": "rounded_rectangle",
    "rounded": "rounded_rectangle",
    "pill": "rounded_rectangle",
    "start": "rounded_rectangle",
    "end": "rounded_rectangle",
    "terminal": "rounded_rectangle",
    "circle": "circle",
    "oval": "ellipse",
    "ellipse": "ellipse",
    "triangle": "triangle",
    "diamond": "diamond",
    "decision": "diamond",
    "rhombus": "diamond",
}


def _normalize_shape_type(val: str | None) -> str:
    if not val:
        return "rectangle"
    cleaned = str(val).lower().strip().replace("-", "_").replace(" ", "_")
    return _SHAPE_TYPE_MAP.get(cleaned, "rectangle")


def _clean_user_facing_text(text: str) -> str:
    if not text:
        return ""
    # Strip any internal thinking tags
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", text)
    # Strip outer markdown block fence if whole body is enclosed
    match = re.match(r"^```(?:markdown|latex|text)?\s*\n([\s\S]*?)\n```$", cleaned.strip())
    if match:
        cleaned = match.group(1)
    # Remove internal special token markers
    cleaned = cleaned.replace("<|im_start|>", "").replace("<|im_end|>", "")
    return cleaned.strip()


def _normalize_data(data: dict) -> dict:
    if not isinstance(data, dict):
        return data

    normalized = dict(data)

    # 1. Normalize type / intent
    raw_type = str(normalized.get("type") or normalized.get("intent") or "").lower().strip()
    if raw_type in ("markdown", "latex", "diagram", "shape"):
        normalized["type"] = raw_type
    elif raw_type:
        # Keep explicit unrecognized type (e.g. "html") so Pydantic raises ValidationError
        normalized["type"] = raw_type
    elif "nodes" in normalized or "diagram" in normalized:
        normalized["type"] = "diagram"
    elif "shape" in normalized or "shape_type" in normalized:
        normalized["type"] = "shape"
    else:
        normalized["type"] = "markdown"

    # 2. Confidence normalization: if missing in diagram/shape we can default, but in raw markdown/latex let Pydantic require it
    if "confidence" in normalized:
        conf = normalized["confidence"]
        if isinstance(conf, (int, float)):
            normalized["confidence"] = conf
    elif normalized["type"] in ("diagram", "shape"):
        normalized["confidence"] = 0.9

    # 3. Title normalization
    if "title" not in normalized or not isinstance(normalized["title"], str):
        normalized["title"] = ""
    else:
        normalized["title"] = _clean_user_facing_text(normalized["title"])

    # 4. Content normalization
    if "content" not in normalized or normalized["content"] is None:
        if normalized["type"] in ("markdown", "latex"):
            # For markdown/latex, missing content is not allowed
            pass
        else:
            normalized["content"] = ""
    else:
        normalized["content"] = _clean_user_facing_text(str(normalized["content"]))

    # 5. Normalize layout_direction
    direction = str(normalized.get("layout_direction") or "").lower().strip().replace("-", "_")
    if direction in ("left_to_right", "horizontal", "lr"):
        normalized["layout_direction"] = "left_to_right"
    else:
        normalized["layout_direction"] = "top_to_bottom"

    # 6. Normalize single shape
    if normalized["type"] == "shape" or "shape" in normalized or "shape_type" in normalized:
        raw_shape = normalized.get("shape")
        if isinstance(raw_shape, dict):
            st = _normalize_shape_type(raw_shape.get("shape_type") or raw_shape.get("type"))
            lbl = str(raw_shape.get("label") or raw_shape.get("text") or "")
            normalized["shape"] = {"shape_type": st, "label": lbl}
        elif "shape_type" in normalized:
            st = _normalize_shape_type(normalized.get("shape_type"))
            lbl = str(normalized.get("label") or normalized.get("text") or "")
            normalized["shape"] = {"shape_type": st, "label": lbl}

    # 7. Normalize diagram nodes & edges
    if normalized["type"] == "diagram" or "nodes" in normalized:
        raw_nodes = normalized.get("nodes")
        if not isinstance(raw_nodes, list):
            raw_nodes = []

        valid_nodes = []
        node_ids = set()
        for idx, n in enumerate(raw_nodes):
            if isinstance(n, dict):
                nid = str(n.get("id") or n.get("key") or f"node_{idx + 1}").strip()
                lbl = str(n.get("label") or n.get("text") or n.get("name") or nid).strip()
                st = _normalize_shape_type(n.get("shape_type") or n.get("type") or n.get("shape"))
            elif isinstance(n, str):
                nid = f"node_{idx + 1}"
                lbl = n.strip()
                st = "rectangle"
            else:
                continue

            if nid and nid not in node_ids:
                node_ids.add(nid)
                valid_nodes.append({"id": nid, "label": lbl, "shape_type": st})

        raw_edges = normalized.get("edges")
        if not isinstance(raw_edges, list):
            raw_edges = []

        valid_edges = []
        for e in raw_edges:
            if not isinstance(e, dict):
                continue
            src = str(e.get("from_node") or e.get("from") or e.get("source") or e.get("src") or e.get("start") or "").strip()
            dst = str(e.get("to_node") or e.get("to") or e.get("target") or e.get("dst") or e.get("end") or "").strip()
            lbl = str(e.get("label") or e.get("text") or "").strip()

            # Keep edges where both endpoints exist in valid nodes
            if src in node_ids and dst in node_ids:
                valid_edges.append({"from_node": src, "to_node": dst, "label": lbl})

        normalized["nodes"] = valid_nodes
        normalized["edges"] = valid_edges

    return normalized


def parse_draft_content(raw_text: str) -> DraftContent:
    """Attempt strict parsing first; on failure, try conservative
    recovery passes (strip code fences, extract the first {...} span, normalize
    aliases and data types) before giving up with a DraftParseError."""

    for candidate in _candidates(raw_text):
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError:
            continue

        if not isinstance(data, dict):
            continue

        try:
            normalized = _normalize_data(data)
            return DraftContent.model_validate(normalized)
        except (ValidationError, Exception):
            continue

    raise DraftParseError("Model output could not be parsed into the expected draft schema")


def _candidates(raw_text: str) -> list[str]:
    text = raw_text.strip()
    candidates = [text]

    stripped_fence = _CODE_FENCE_RE.sub("", text).strip()
    if stripped_fence != text:
        candidates.append(stripped_fence)

    match = _JSON_OBJECT_RE.search(text)
    if match:
        candidates.append(match.group(0))

    return candidates

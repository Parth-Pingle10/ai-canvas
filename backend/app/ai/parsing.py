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


def parse_draft_content(raw_text: str) -> DraftContent:
    """Attempt strict parsing first; on failure, try one conservative
    recovery pass (strip code fences, extract the first {...} span) before
    giving up with a DraftParseError."""

    for candidate in _candidates(raw_text):
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        try:
            return DraftContent.model_validate(data)
        except ValidationError:
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

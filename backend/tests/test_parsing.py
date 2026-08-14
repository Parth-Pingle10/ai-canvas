from __future__ import annotations

import pytest

from app.ai.parsing import DraftParseError, parse_draft_content


def test_parses_clean_json():
    draft = parse_draft_content('{"type": "markdown", "content": "hi", "title": "T", "confidence": 0.5}')
    assert draft.type.value == "markdown"
    assert draft.content == "hi"


def test_recovers_code_fenced_json():
    raw = '```json\n{"type": "latex", "content": "x=5", "title": "Solve", "confidence": 0.8}\n```'
    draft = parse_draft_content(raw)
    assert draft.type.value == "latex"
    assert draft.content == "x=5"


def test_recovers_json_embedded_in_prose():
    raw = 'Sure! Here is the answer: {"type": "markdown", "content": "42", "title": "A", "confidence": 0.7} Hope that helps!'
    draft = parse_draft_content(raw)
    assert draft.content == "42"


def test_raises_on_non_json_garbage():
    with pytest.raises(DraftParseError):
        parse_draft_content("I cannot help with that, sorry.")


def test_raises_on_valid_json_missing_required_fields():
    with pytest.raises(DraftParseError):
        parse_draft_content('{"type": "markdown"}')


def test_raises_on_invalid_confidence_range():
    with pytest.raises(DraftParseError):
        parse_draft_content('{"type": "markdown", "content": "x", "title": "T", "confidence": 5.0}')


def test_raises_on_invalid_type_enum():
    with pytest.raises(DraftParseError):
        parse_draft_content('{"type": "html", "content": "x", "title": "T", "confidence": 0.5}')

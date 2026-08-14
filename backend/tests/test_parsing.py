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


def test_parses_diagram_json():
    raw = '''{
        "type": "diagram",
        "title": "Login Flow",
        "layout_direction": "top_to_bottom",
        "nodes": [
            {"id": "start", "label": "Start", "shape_type": "rounded_rectangle"},
            {"id": "validate", "label": "Validate Credentials", "shape_type": "diamond"},
            {"id": "success", "label": "Dashboard", "shape_type": "rectangle"}
        ],
        "edges": [
            {"from": "start", "to": "validate", "label": ""},
            {"from": "validate", "to": "success", "label": "Valid"}
        ],
        "confidence": 0.95
    }'''
    draft = parse_draft_content(raw)
    assert draft.type.value == "diagram"
    assert draft.title == "Login Flow"
    assert len(draft.nodes) == 3
    assert draft.nodes[1].shape_type.value == "diamond"
    assert len(draft.edges) == 2
    assert draft.edges[1].from_node == "validate"
    assert draft.edges[1].label == "Valid"


def test_parses_clean_shape_json():
    raw = '''{
        "type": "shape",
        "title": "Clean Triangle",
        "shape": {
            "shape_type": "triangle",
            "label": "Pythagoras"
        },
        "confidence": 0.9
    }'''
    draft = parse_draft_content(raw)
    assert draft.type.value == "shape"
    assert draft.shape is not None
    assert draft.shape.shape_type.value == "triangle"
    assert draft.shape.label == "Pythagoras"


def test_diagram_filters_invalid_edge_references():
    raw = '''{
        "type": "diagram",
        "nodes": [
            {"id": "n1", "label": "Step 1"},
            {"id": "n2", "label": "Step 2"}
        ],
        "edges": [
            {"from": "n1", "to": "n2"},
            {"from": "n1", "to": "non_existent_node"}
        ]
    }'''
    draft = parse_draft_content(raw)
    assert len(draft.nodes) == 2
    assert len(draft.edges) == 1
    assert draft.edges[0].to_node == "n2"


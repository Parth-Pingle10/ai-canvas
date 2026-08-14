"""
Tests for generic dynamic intent understanding and canvas creation separation.
"""

from __future__ import annotations

import pytest
from app.ai.parsing import parse_draft_content
from app.ai.prompts import build_user_prompt


def test_build_user_prompt_with_canvas_text():
    prompt = build_user_prompt(
        stroke_count=0,
        zoom=1.0,
        canvas_texts=["Design an event-driven payment processing pipeline"],
    )
    assert "Design an event-driven payment processing pipeline" in prompt
    assert "Analyze the visual content" in prompt


def test_parse_dynamic_process_diagram():
    raw_ai_output = """{
      "type": "diagram",
      "title": "E-Commerce Checkout Flow",
      "layout_direction": "top_to_bottom",
      "nodes": [
        {"id": "cart", "label": "Review Shopping Cart", "shape_type": "rectangle"},
        {"id": "auth_check", "label": "User Authenticated?", "shape_type": "diamond"},
        {"id": "payment", "label": "Process Payment", "shape_type": "rectangle"},
        {"id": "receipt", "label": "Issue Receipt & Confirmation", "shape_type": "rounded_rectangle"}
      ],
      "edges": [
        {"from_node": "cart", "to_node": "auth_check"},
        {"from_node": "auth_check", "to_node": "payment", "label": "Yes"},
        {"from_node": "payment", "to_node": "receipt", "label": "Success"}
      ],
      "confidence": 0.98
    }"""
    draft = parse_draft_content(raw_ai_output)
    assert draft.type == "diagram"
    assert draft.title == "E-Commerce Checkout Flow"
    assert len(draft.nodes) == 4
    assert len(draft.edges) == 3
    assert draft.nodes[1].shape_type == "diamond"
    assert draft.nodes[3].shape_type == "rounded_rectangle"


def test_parse_dynamic_system_architecture_diagram():
    raw_ai_output = """{
      "type": "diagram",
      "title": "Microservices Architecture",
      "layout_direction": "left_to_right",
      "nodes": [
        {"id": "client", "label": "Web Client (React)", "shape_type": "rectangle"},
        {"id": "gateway", "label": "API Gateway / Envoy", "shape_type": "rectangle"},
        {"id": "orders_svc", "label": "Order Service", "shape_type": "rectangle"},
        {"id": "db", "label": "PostgreSQL Cluster", "shape_type": "circle"}
      ],
      "edges": [
        {"from_node": "client", "to_node": "gateway"},
        {"from_node": "gateway", "to_node": "orders_svc"},
        {"from_node": "orders_svc", "to_node": "db", "label": "Read/Write"}
      ],
      "confidence": 0.95
    }"""
    draft = parse_draft_content(raw_ai_output)
    assert draft.type == "diagram"
    assert draft.layout_direction == "left_to_right"
    assert len(draft.nodes) == 4
    assert draft.nodes[3].shape_type == "circle"


def test_parse_question_intent_remains_markdown():
    raw_ai_output = """{
      "type": "markdown",
      "title": "CAP Theorem Overview",
      "content": "In distributed systems, the CAP theorem states that a data store can only guarantee at most two of Consistency, Availability, and Partition tolerance.",
      "confidence": 0.95
    }"""
    draft = parse_draft_content(raw_ai_output)
    assert draft.type == "markdown"
    assert "CAP theorem" in draft.content
    assert len(draft.nodes) == 0


def test_parse_equation_intent_remains_latex():
    raw_ai_output = r"""{
      "type": "latex",
      "title": "Quadratic Formula",
      "content": "The roots of $ax^2 + bx + c = 0$ are given by:\n$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$",
      "confidence": 1.0
    }"""
    draft = parse_draft_content(raw_ai_output)
    assert draft.type == "latex"
    assert "\\frac" in draft.content

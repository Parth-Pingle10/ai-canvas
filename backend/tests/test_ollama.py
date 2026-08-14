from __future__ import annotations

from app.ai.ollama import _extract_generate_text


def test_extract_generate_text_prefers_response():
    data = {"response": '{"type":"markdown","content":"hi","title":"T","confidence":0.5}'}
    assert "hi" in _extract_generate_text(data)


def test_extract_generate_text_falls_back_to_thinking():
    """Qwen3-VL thinking models often emit JSON only in `thinking`."""
    data = {
        "response": "",
        "thinking": '{"type":"markdown","content":"x = 2.5","title":"Solution","confidence":0.9}',
    }
    text = _extract_generate_text(data)
    assert "x = 2.5" in text


def test_extract_generate_text_empty_when_both_missing():
    assert _extract_generate_text({}) == ""

from __future__ import annotations

from tests.conftest import make_analyze_payload


def test_analyze_happy_path(client, fake_provider, test_image_b64):
    payload = make_analyze_payload(test_image_b64)
    resp = client.post("/api/analyze", json=payload)

    assert resp.status_code == 200
    body = resp.json()
    assert body["request_id"] == "req_test_1"
    assert body["draft"]["type"] == "markdown"
    assert body["draft"]["content"] == "x = 5"
    assert body["draft"]["confidence"] == 0.9
    assert body["provider"] == "ollama"
    assert body["tokens"]["output"] == 48
    assert body["tokens"]["total"] == 262
    assert body["latency_ms"]["e2e"] is not None
    assert body["cost_usd"] == 0.0  # default rate table is all zero
    assert fake_provider.calls == 1


def test_analyze_recovers_code_fenced_json(client, fake_provider, test_image_b64):
    fake_provider.mode = "recoverable"
    resp = client.post("/api/analyze", json=make_analyze_payload(test_image_b64))
    assert resp.status_code == 200
    assert resp.json()["draft"]["content"] == "x = 5"


def test_analyze_malformed_model_output_returns_structured_error(client, fake_provider, test_image_b64):
    fake_provider.mode = "malformed"
    resp = client.post("/api/analyze", json=make_analyze_payload(test_image_b64))
    assert resp.status_code == 502
    body = resp.json()
    assert body["error_code"] == "invalid_model_output"
    assert body["request_id"] == "req_test_1"


def test_analyze_ollama_unavailable(client, fake_provider, test_image_b64):
    fake_provider.mode = "unavailable"
    resp = client.post("/api/analyze", json=make_analyze_payload(test_image_b64))
    assert resp.status_code == 503
    assert resp.json()["error_code"] == "ollama_unavailable"


def test_analyze_model_unavailable(client, fake_provider, test_image_b64):
    fake_provider.mode = "model_missing"
    resp = client.post("/api/analyze", json=make_analyze_payload(test_image_b64))
    assert resp.status_code == 503
    assert resp.json()["error_code"] == "model_unavailable"


def test_analyze_timeout(client, fake_provider, test_image_b64):
    fake_provider.mode = "timeout"
    resp = client.post("/api/analyze", json=make_analyze_payload(test_image_b64))
    assert resp.status_code == 504
    assert resp.json()["error_code"] == "timeout"


def test_analyze_rejects_data_uri_image(client, test_image_b64):
    payload = make_analyze_payload("data:image/png;base64," + test_image_b64)
    resp = client.post("/api/analyze", json=payload)
    assert resp.status_code == 422  # Pydantic validation error


def test_analyze_rejects_mismatched_format(client, test_image_b64):
    # Payload is a real PNG, but declared as webp — must be rejected rather
    # than silently trusted.
    payload = make_analyze_payload(test_image_b64, context={
        **make_analyze_payload(test_image_b64)["context"],
        "format": "webp",
    })
    resp = client.post("/api/analyze", json=payload)
    assert resp.status_code == 422
    assert resp.json()["error_code"] == "validation_error"


def test_analyze_rejects_invalid_base64(client):
    payload = make_analyze_payload("not-valid-base64!!! not-valid-base64!!!")
    resp = client.post("/api/analyze", json=payload)
    assert resp.status_code == 422


def test_analyze_never_crashes_on_unexpected_provider_exception(client, fake_provider, test_image_b64, monkeypatch):
    async def boom(*args, **kwargs):
        raise RuntimeError("something totally unexpected")

    monkeypatch.setattr(fake_provider, "analyze", boom)
    resp = client.post("/api/analyze", json=make_analyze_payload(test_image_b64))
    assert resp.status_code == 502
    assert resp.json()["error_code"] == "network_error"

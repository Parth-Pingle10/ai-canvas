from __future__ import annotations

from app.config import get_settings


def test_health_degraded_when_provider_unavailable(client, fake_provider):
    fake_provider.mode = "unavailable"
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "degraded"
    assert body["ollama"] is False
    assert body["model"] == get_settings().ollama_model
    assert body["model_installed"] is False


def test_health_ok_when_fake_provider_and_model_available(client, fake_provider):
    # FakeProvider isn't an OllamaProvider instance, so the health route's
    # `isinstance(provider, OllamaProvider)` model-installed check is
    # skipped and it trusts is_available() alone — documented behavior for
    # any provider that isn't specifically OllamaProvider.
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["ollama"] is True

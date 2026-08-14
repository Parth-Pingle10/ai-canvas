from __future__ import annotations

from tests.conftest import make_analyze_payload


def test_outcome_reporting_updates_session_metrics(client, test_image_b64):
    payload = make_analyze_payload(test_image_b64, request_id="req_outcome_1")
    payload["context"]["session_id"] = "ses_outcome_test"
    resp = client.post("/api/analyze", json=payload)
    assert resp.status_code == 200

    metrics_before = client.get("/api/metrics/session", params={"session_id": "ses_outcome_test"}).json()
    assert metrics_before["requests"] == 1
    assert metrics_before["accepted"] == 0

    outcome_resp = client.post("/api/metrics/outcome", json={"request_id": "req_outcome_1", "outcome": "accepted"})
    assert outcome_resp.status_code == 200
    assert outcome_resp.json() == {"request_id": "req_outcome_1", "outcome": "accepted"}

    metrics_after = client.get("/api/metrics/session", params={"session_id": "ses_outcome_test"}).json()
    assert metrics_after["accepted"] == 1
    assert metrics_after["dar"] == 1.0


def test_outcome_for_unknown_request_id_returns_404(client):
    resp = client.post("/api/metrics/outcome", json={"request_id": "does_not_exist", "outcome": "accepted"})
    assert resp.status_code == 404


def test_session_metrics_for_unseen_session_is_empty(client):
    resp = client.get("/api/metrics/session", params={"session_id": "ses_never_used"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["requests"] == 0
    assert body["dar"] is None

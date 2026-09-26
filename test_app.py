import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

import app


client = TestClient(app.app)


def model_response(content: str) -> dict:
    return {"choices": [{"message": {"content": content}}]}


@respx.mock
def test_health_and_review_contract():
    route = respx.post(app.settings.model_url).mock(return_value=httpx.Response(200, json=model_response('{"findings": [], "improved_code": null}')))
    assert client.get("/health").json() == {"status": "ok"}
    assert "Review your Python code" in client.get("/").text
    response = client.post("/review", json={"code": "print('ok')", "filename": "main.py"})
    assert response.status_code == 200
    assert response.json() == {"findings": [], "improved_code": None}
    assert route.called
    assert json.loads(route.calls.last.request.content)["reasoning_effort"] == "none"


@pytest.mark.parametrize(("code", "status", "detail"), [("def broken(:", 400, "syntax_error"), ("x = 1", 422, "unsupported_language")])
def test_input_validation(code, status, detail):
    response = client.post("/review", json={"code": code, "language": "javascript" if status == 422 else "python"})
    assert response.status_code == status
    assert response.json()["detail"] == detail


@respx.mock
def test_model_timeout():
    respx.post(app.settings.model_url).mock(side_effect=httpx.ReadTimeout("slow"))
    assert client.post("/review", json={"code": "x = 1"}).json() == {"detail": "model_timeout"}
    assert client.post("/review", json={"code": "x = 1"}).status_code == 504


@respx.mock
@pytest.mark.parametrize("body", [{}, {"choices": []}, {"choices": [{"message": {"content": "not json"}}]}])
def test_malformed_model_output(body):
    respx.post(app.settings.model_url).mock(return_value=httpx.Response(200, json=body))
    response = client.post("/review", json={"code": "x = 1"})
    assert response.status_code == 502
    assert response.json()["detail"] == "malformed_model_output"


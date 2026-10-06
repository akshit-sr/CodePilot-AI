import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

import app


client = TestClient(app.app)


def model_response(content: str) -> dict:
    return {"choices": [{"message": {"content": content}}]}


@pytest.fixture(autouse=True)
def single_backend(monkeypatch):
    monkeypatch.setattr(app.settings, "primary_model_url", app.settings.model_url)


@respx.mock
def test_falls_back_to_local_model(monkeypatch):
    monkeypatch.setattr(app.settings, "primary_model_url", "https://primary.test/v1/chat/completions")
    respx.post("https://primary.test/v1/chat/completions").mock(side_effect=httpx.ConnectError("down"))
    local = respx.post(app.settings.model_url).mock(return_value=httpx.Response(200, json=model_response('{"findings": []}')))
    assert client.post("/review", json={"code": "x = 1"}).status_code == 200
    assert json.loads(local.calls.last.request.content)["model"] == "qwen3.5-9b"


@respx.mock
def test_health_and_review_contract():
    route = respx.post(app.settings.model_url).mock(return_value=httpx.Response(200, json=model_response('{"findings": [], "improved_code": null}')))
    assert client.get("/health").json() == {"status": "ok"}
    assert "Review your code" in client.get("/").text
    assert client.get("/languages").json() == app.LANGUAGES
    response = client.post("/review", json={"code": "print('ok')", "filename": "main.py"})
    assert response.status_code == 200
    assert response.json() == {"findings": [], "improved_code": None}
    assert route.called
    assert json.loads(route.calls.last.request.content)["reasoning_effort"] == "none"


@pytest.mark.parametrize(("code", "status", "detail"), [("def broken(:", 400, "syntax_error"), ("x = 1", 422, "unsupported_language")])
def test_input_validation(code, status, detail):
    response = client.post("/review", json={"code": code, "language": "brainfuck" if status == 422 else "python"})
    assert response.status_code == status
    assert response.json()["detail"] == detail


SAMPLES = {
    "python": ("x = 1", "def broken(:"),
    "javascript": ("const x = 1;", "function ( {"),
    "typescript": ("const x: number = 1;", "function ( {"),
    "java": ("class A { int x = 1; }", "class A { int x = ; "),
    "c": ("int main(void) { return 0; }", "int main( {"),
    "cpp": ("int main() { return 0; }", "int main( {"),
    "csharp": ("class A { int x = 1; }", "class A { int x = ; "),
    "go": ("package main\nfunc main() {}", "package main\nfunc main( {"),
    "rust": ("fn main() {}", "fn main( {"),
    "php": ("<?php echo 1;", "<?php function ( {"),
    "ruby": ("x = 1", "def (("),
    "kotlin": ("fun main() {}", "fun main( {"),
}


def test_samples_cover_every_language():
    assert SAMPLES.keys() == app.LANGUAGES.keys()


@respx.mock
@pytest.mark.parametrize("language", SAMPLES)
def test_each_language(language):
    valid, broken = SAMPLES[language]
    route = respx.post(app.settings.model_url).mock(return_value=httpx.Response(200, json=model_response('{"findings": []}')))
    assert client.post("/review", json={"code": valid, "language": language.upper()}).status_code == 200
    prompt = json.loads(route.calls.last.request.content)["messages"][1]["content"]
    assert f"Review this {app.LANGUAGES[language]} source file" in prompt
    response = client.post("/review", json={"code": broken, "language": language})
    assert (response.status_code, response.json()["detail"]) == (400, "syntax_error")


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


def test_response_has_generated_request_id(client):
    res = client.get("/health")
    assert res.headers["X-Request-ID"]


def test_incoming_request_id_is_echoed(client):
    res = client.get("/health", headers={"X-Request-ID": "abc-123"})
    assert res.headers["X-Request-ID"] == "abc-123"


def test_cors_allows_configured_origin_with_credentials(client):
    res = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert res.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert res.headers["access-control-allow-credentials"] == "true"


def test_cors_rejects_unknown_origin(client):
    res = client.options(
        "/health",
        headers={
            "Origin": "http://evil.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert "access-control-allow-origin" not in res.headers

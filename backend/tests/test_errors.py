def error_of(res):
    return res.json()["error"]


def test_domain_not_found_maps_to_404(client):
    res = client.get("/_t/notfound")
    assert res.status_code == 404
    err = error_of(res)
    assert err["code"] == "not_found"
    assert err["message"] == "Product not found"


def test_out_of_stock_maps_to_409_with_details(client):
    res = client.get("/_t/stock")
    assert res.status_code == 409
    err = error_of(res)
    assert err["code"] == "out_of_stock"
    assert err["details"] == {"size": "M"}


def test_conflict_maps_to_409(client):
    res = client.get("/_t/conflict")
    assert res.status_code == 409
    assert error_of(res)["code"] == "conflict"


def test_unique_violation_is_a_409_and_leaks_no_constraint_details(client):
    res = client.get("/_t/unique")
    assert res.status_code == 409
    assert error_of(res)["code"] == "conflict"
    assert "products.name" not in res.text


def test_other_integrity_errors_are_still_server_errors(client):
    # A CHECK failure means our validation missed something: that is a bug, not a user conflict.
    res = client.get("/_t/check")
    assert res.status_code == 500
    assert error_of(res)["code"] == "internal_error"
    assert "ck_price" not in res.text


def test_unknown_route_uses_the_same_shape(client):
    res = client.get("/does-not-exist")
    assert res.status_code == 404
    assert error_of(res)["code"] == "not_found"


def test_validation_error_is_422_with_field_details(client):
    res = client.get("/_t/int/abc")
    assert res.status_code == 422
    err = error_of(res)
    assert err["code"] == "validation_error"
    assert isinstance(err["details"], list) and err["details"]


def test_unhandled_error_is_generic_500_and_leaks_nothing(client):
    res = client.get("/_t/boom")
    assert res.status_code == 500
    err = error_of(res)
    assert err["code"] == "internal_error"
    assert "hunter2" not in res.text
    assert "RuntimeError" not in res.text


def test_every_error_carries_a_request_id(client):
    for path in ["/_t/notfound", "/_t/int/abc", "/_t/boom", "/does-not-exist"]:
        res = client.get(path)
        rid = error_of(res)["request_id"]
        assert rid
        assert res.headers["X-Request-ID"] == rid

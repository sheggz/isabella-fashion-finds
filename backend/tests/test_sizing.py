import pytest

from app.domain.sizing import (
    MEASUREMENT_PARTS,
    SIZES,
    normalize_size,
    sizing_options,
    validate_measurements,
)


def test_the_fixed_size_list_is_what_the_store_agreed_on():
    assert SIZES == ("XS", "S", "M", "L", "XL", "XXL", "ONE_SIZE")


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("M", "M"),
        ("  m ", "M"),
        ("xl", "XL"),
        ("one size", "ONE_SIZE"),
        ("One-Size", "ONE_SIZE"),
        ("ONE_SIZE", "ONE_SIZE"),
    ],
)
def test_normalize_size_accepts_sensible_spellings(raw, expected):
    assert normalize_size(raw) == expected


@pytest.mark.parametrize("raw", ["", "   ", "XXXL", "medium", "42", None])
def test_normalize_size_rejects_anything_outside_the_list(raw):
    with pytest.raises(ValueError):
        normalize_size(raw)


def test_valid_measurements_pass_through_rounded_to_one_decimal():
    result = validate_measurements({"bust": 92, "waist": 74.26, "hips": "100"})
    assert result == {"bust": 92.0, "waist": 74.3, "hips": 100.0}


def test_no_measurements_is_fine_because_they_are_optional():
    assert validate_measurements({}) == {}
    assert validate_measurements(None) == {}


def test_unknown_body_part_is_rejected_and_named():
    with pytest.raises(ValueError, match="earlobe"):
        validate_measurements({"earlobe": 3})


@pytest.mark.parametrize("bad", [0, -5, 301, "wide", None, True, float("nan"), float("inf")])
def test_unreasonable_values_are_rejected(bad):
    with pytest.raises(ValueError):
        validate_measurements({"bust": bad})


def test_validate_measurements_does_not_mutate_its_input():
    raw = {"bust": 92.04}
    validate_measurements(raw)
    assert raw == {"bust": 92.04}


def test_options_expose_every_size_and_body_part_with_labels():
    options = sizing_options()
    assert [s["value"] for s in options["sizes"]] == list(SIZES)
    assert {"value": "ONE_SIZE", "label": "One size"} in options["sizes"]
    assert [p["value"] for p in options["measurement_parts"]] == list(MEASUREMENT_PARTS)
    assert options["unit"] == "cm"

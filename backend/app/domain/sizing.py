"""The store's fixed size list and garment measurements. Pure: no database, no HTTP.

Errors are `ValueError` on purpose (even for wrong types, hence the TRY004 waivers below):
Pydantic only converts ValueError into a clean 422 response; a TypeError raised inside a
validator would surface as a 500.

Single source of truth: the schemas validate against these constants, the database check
constraint is built from them, and the frontend reads them from `GET /catalogue/options`
instead of keeping its own copy.
"""
import math
import re

SIZES = ("XS", "S", "M", "L", "XL", "XXL", "ONE_SIZE")
_SIZE_LABELS = {"ONE_SIZE": "One size"}

# Body parts the owner may describe for each size of a piece (values are in centimetres).
MEASUREMENT_PARTS = {
    "bust": "Bust",
    "waist": "Waist",
    "hips": "Hips",
    "shoulder": "Shoulder width",
    "sleeve": "Sleeve length",
    "length": "Garment length",
    "inseam": "Inseam",
}
MAX_MEASUREMENT_CM = 300


def normalize_size(raw) -> str:
    """Return the canonical size code for a sensible spelling, or raise ValueError.

    Accepts any case and stray spaces or hyphens ("one size", "One-Size" -> "ONE_SIZE").
    Anything outside the fixed list is refused, so "XXXL" or "medium" never reach the database.
    """
    if not isinstance(raw, str):
        raise ValueError("size must be text")  # noqa: TRY004
    key = re.sub(r"[\s\-]+", "_", raw.strip().upper())
    if key not in SIZES:
        raise ValueError(f"size must be one of: {', '.join(SIZES)}")
    return key


def validate_measurements(raw) -> dict[str, float]:
    """Validate a {body_part: centimetres} mapping and return a clean copy.

    Measurements are optional, so None or {} is fine. Unknown body parts are refused (and
    named in the error), values must be real positive numbers up to 300 cm, and results are
    rounded to one decimal place. A new dict is returned; the input is never modified.
    """
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise ValueError("measurements must be an object of body part to centimetres")  # noqa: TRY004

    clean: dict[str, float] = {}
    for part, value in raw.items():
        if part not in MEASUREMENT_PARTS:
            raise ValueError(
                f"unknown body part '{part}'; use one of: {', '.join(MEASUREMENT_PARTS)}"
            )
        # bool is a subclass of int in Python, so True would otherwise slip through as 1.0.
        if isinstance(value, bool):
            raise ValueError(f"{part} must be a number")  # noqa: TRY004
        try:
            number = float(value)
        except (TypeError, ValueError):
            raise ValueError(f"{part} must be a number") from None
        if not math.isfinite(number) or number <= 0 or number > MAX_MEASUREMENT_CM:
            raise ValueError(f"{part} must be between 0 and {MAX_MEASUREMENT_CM} cm")
        clean[part] = round(number, 1)
    return clean


def sizing_options() -> dict:
    """Everything the frontend needs to build the size and measurement inputs."""
    return {
        "sizes": [{"value": s, "label": _SIZE_LABELS.get(s, s)} for s in SIZES],
        "measurement_parts": [{"value": k, "label": v} for k, v in MEASUREMENT_PARTS.items()],
        "unit": "cm",
    }

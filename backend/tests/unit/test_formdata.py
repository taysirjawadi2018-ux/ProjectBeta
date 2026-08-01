"""form_data boundary validation (Security.md §8.2).

`requests.form_data` is unbounded JSONB — the one input in Watiq with no CHECK
constraint behind it. These tests are the only thing standing between a
citizen-supplied object and the database, so they run without a database, on
every commit.

The depth tests are not theoretical. An earlier draft of `validate_form_data`
ran the cheap-looking size check first; `json.dumps` recurses once per nesting
level, so a 10 000-deep object raised RecursionError *inside the size check* —
a 500 and a worker-level DoS from one small request. `test_deep_nesting_*`
pins the ordering that fixes it.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from app.core.errors import UnprocessableEntity
from app.modules.requests.formdata import (
    MAX_ARRAY_LEN,
    MAX_DEPTH,
    MAX_KEY_LEN,
    MAX_KEYS,
    MAX_SERIALIZED_BYTES,
    MAX_STRING_LEN,
    _validator_for,
    validate_form_data,
)

BIRTH = "civil.birth_certificate"
CIN = "identity.cin_renewal"
UNKNOWN = "no.such.service"


def nest(levels: int) -> dict[str, Any]:
    obj: Any = {"leaf": 1}
    for _ in range(levels):
        obj = {"a": obj}
    return obj


# --------------------------------------------------------------------------
# Structural limits — apply to EVERY submission, schema or not.
# --------------------------------------------------------------------------


def test_deep_nesting_is_rejected_not_crashed() -> None:
    """The regression that matters: 10k deep must be a 422, never RecursionError."""
    with pytest.raises(UnprocessableEntity, match="nested too deeply"):
        validate_form_data(UNKNOWN, nest(10_000))


def test_deep_nesting_rejected_even_with_a_real_schema() -> None:
    with pytest.raises(UnprocessableEntity, match="nested too deeply"):
        validate_form_data(BIRTH, nest(10_000))


def test_depth_just_over_the_limit_is_rejected() -> None:
    with pytest.raises(UnprocessableEntity, match="nested too deeply"):
        validate_form_data(UNKNOWN, nest(MAX_DEPTH + 2))


def test_depth_within_the_limit_is_accepted() -> None:
    assert validate_form_data(UNKNOWN, nest(MAX_DEPTH - 2))


def test_too_many_keys_is_rejected() -> None:
    with pytest.raises(UnprocessableEntity, match="too many fields"):
        validate_form_data(UNKNOWN, {f"k{i}": 1 for i in range(MAX_KEYS + 1)})


def test_key_budget_is_global_not_per_level() -> None:
    """Two sibling objects of 150 keys each must not both pass a 200 budget."""
    half = MAX_KEYS // 2 + 20
    payload = {
        "a": {f"k{i}": 1 for i in range(half)},
        "b": {f"k{i}": 1 for i in range(half)},
    }
    with pytest.raises(UnprocessableEntity, match="too many fields"):
        validate_form_data(UNKNOWN, payload)


def test_over_long_string_is_rejected() -> None:
    with pytest.raises(UnprocessableEntity, match="over-long value"):
        validate_form_data(UNKNOWN, {"x": "A" * (MAX_STRING_LEN + 1)})


def test_over_long_array_is_rejected() -> None:
    with pytest.raises(UnprocessableEntity, match="over-long list"):
        validate_form_data(UNKNOWN, {"x": list(range(MAX_ARRAY_LEN + 1))})


def test_over_long_key_name_is_rejected() -> None:
    with pytest.raises(UnprocessableEntity, match="over-long field name"):
        validate_form_data(UNKNOWN, {"K" * (MAX_KEY_LEN + 1): 1})


def test_oversize_payload_is_rejected() -> None:
    """Passes the structural walk (few keys, shallow) but exceeds the byte cap."""
    payload = {f"k{i}": "B" * 900 for i in range(MAX_SERIALIZED_BYTES // 900 + 5)}
    assert len(json.dumps(payload).encode()) > MAX_SERIALIZED_BYTES
    with pytest.raises(UnprocessableEntity, match="too large"):
        validate_form_data(UNKNOWN, payload)


@pytest.mark.parametrize("bad", [["a"], "a", 1, None, 3.5, True])
def test_non_object_is_rejected(bad: Any) -> None:
    with pytest.raises(UnprocessableEntity, match="must be a JSON object"):
        validate_form_data(UNKNOWN, bad)


# --------------------------------------------------------------------------
# Schema resolution. The code reaches a filesystem path, so it is guarded even
# though it comes from service_catalog.code and never from the client.
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "bad_code",
    ["../../../../etc/passwd", "../formschemas/civil.birth_certificate",
     "a/b", "a\\b", "..", ""],
)
def test_traversing_service_code_loads_no_schema(bad_code: str) -> None:
    assert _validator_for(bad_code) is None


def test_legitimate_code_still_resolves() -> None:
    """Guards against the traversal check being so broad it disables validation."""
    assert _validator_for(BIRTH) is not None
    assert _validator_for(CIN) is not None


def test_unknown_service_passes_but_caps_still_applied() -> None:
    """Confirmed policy: missing schema is allowed; the DoS caps are not."""
    assert validate_form_data(UNKNOWN, {"anything": "goes"})
    with pytest.raises(UnprocessableEntity):
        validate_form_data(UNKNOWN, nest(10_000))


def test_unresolved_service_code_passes_but_caps_still_applied() -> None:
    assert validate_form_data(None, {"anything": "goes"})
    with pytest.raises(UnprocessableEntity):
        validate_form_data(None, {"x": "A" * (MAX_STRING_LEN + 1)})


# --------------------------------------------------------------------------
# civil.birth_certificate
# --------------------------------------------------------------------------

VALID_BIRTH = {"subject_national_id": "12345678", "copies": 2, "language": "ar"}


def test_valid_birth_certificate_is_accepted() -> None:
    assert validate_form_data(BIRTH, VALID_BIRTH) == VALID_BIRTH


@pytest.mark.parametrize(
    "payload",
    [
        {"subject_national_id": "1234567", "copies": 1},          # 7-digit CIN
        {"subject_national_id": "123456789", "copies": 1},        # 9-digit CIN
        {"subject_national_id": "1234567A", "copies": 1},         # non-numeric
        {"subject_national_id": "12345678", "copies": 0},         # below minimum
        {"subject_national_id": "12345678", "copies": 99},        # above maximum
        {"subject_national_id": "12345678"},                      # missing required
        {"copies": 1},                                            # missing required
        {**VALID_BIRTH, "language": "en"},                        # not in enum
    ],
)
def test_invalid_birth_certificate_is_rejected(payload: dict[str, Any]) -> None:
    with pytest.raises(UnprocessableEntity, match="does not match the required schema"):
        validate_form_data(BIRTH, payload)


def test_unknown_field_is_rejected_mass_assignment() -> None:
    """additionalProperties:false is the mass-assignment control at this layer.

    status_id is trigger-owned and column-GRANT-denied to citizens; this stops
    it before either of those has to.
    """
    with pytest.raises(UnprocessableEntity, match="does not match the required schema"):
        validate_form_data(BIRTH, {**VALID_BIRTH, "status_id": 5})


# --------------------------------------------------------------------------
# identity.cin_renewal — conditional requirement
# --------------------------------------------------------------------------


def test_expired_needs_no_police_report() -> None:
    assert validate_form_data(CIN, {"current_national_id": "87654321", "reason": "expired"})


@pytest.mark.parametrize("reason", ["lost", "stolen"])
def test_lost_or_stolen_requires_police_report(reason: str) -> None:
    with pytest.raises(UnprocessableEntity):
        validate_form_data(CIN, {"current_national_id": "87654321", "reason": reason})
    assert validate_form_data(
        CIN,
        {"current_national_id": "87654321", "reason": reason,
         "police_report_number": "PV-2026-114"},
    )


def test_nested_address_is_validated() -> None:
    good = {"current_national_id": "87654321", "reason": "data_change",
            "current_address": {"governorate": "Tunis", "line1": "12 Rue de Rome",
                                "postal_code": "1001"}}
    assert validate_form_data(CIN, good)

    bad = {**good, "current_address": {**good["current_address"], "postal_code": "ABCD"}}
    with pytest.raises(UnprocessableEntity):
        validate_form_data(CIN, bad)


# --------------------------------------------------------------------------
# The error message is returned to the client. It must not carry the value.
# --------------------------------------------------------------------------


def test_validation_error_does_not_echo_the_offending_value() -> None:
    sentinel = "SECRETCIN99"
    with pytest.raises(UnprocessableEntity) as exc:
        validate_form_data(BIRTH, {"subject_national_id": sentinel, "copies": 1})
    assert sentinel not in str(exc.value)


def test_validation_error_names_the_path() -> None:
    """Useful enough to debug against, without quoting citizen data."""
    with pytest.raises(UnprocessableEntity) as exc:
        validate_form_data(BIRTH, {"subject_national_id": "1", "copies": 1})
    assert "subject_national_id" in str(exc.value)


def test_arabic_and_french_content_is_accepted() -> None:
    """The WAF exclusion exists because CRS trips on these; validation must not."""
    assert validate_form_data(
        BIRTH,
        {"subject_national_id": "12345678", "copies": 1,
         "subject_full_name": "محمد بن علي",
         "birth_municipality": "L'Ariana", "purpose": "Dossier d'inscription"},
    )

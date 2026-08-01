"""Boundary validation for ``requests.form_data`` (Security.md §8.2).

``requests.form_data`` is ``JSONB NOT NULL DEFAULT '{}'``. Postgres will
happily accept a 40 MB, 10 000-deep nested object: JSONB has no shape, no size
limit and no depth limit. It is therefore the one attack surface in Watiq that
the schema cannot police, and the only input that reaches storage without a
CHECK constraint standing behind it.

Three separate problems live here:

* **Storage abuse** — unbounded writes against a national portal.
* **Parser DoS** — deep nesting is expensive in several JSON consumers, and a
  validator that recurses into a hostile object is itself the victim.
* **Stored XSS / content smuggling** — form_data is rendered in staff-facing
  UIs, so an allow-list of expected fields is worth more than any output
  filter applied later.

This module is also the documented compensating control for the ModSecurity
CRS exclusion on the ``form_data`` parameter (Security.md §3.5, rule 1002).
The WAF is deliberately told to stop pattern-matching this field because
legitimate Arabic and French payloads trip CRS constantly; an allow-list JSON
Schema is strictly stronger than CRS regexes over arbitrary JSON, but only
while this module actually runs. If validation here is skipped, two layers
open at once.

Policy (confirmed with the project owner):

* the size cap and the structural limits apply to **every** submission — they
  are the DoS control and need no schema to be meaningful;
* full JSON Schema validation applies where ``formschemas/{code}.json`` exists;
* a service with no schema file yet is logged and allowed through, so adding a
  service to the catalogue does not require a schema file on the same day.

Adding a schema is therefore a pure tightening: drop a file into
``formschemas/`` named after ``service_catalog.code`` and it takes effect on
the next process start.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import structlog
from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError, ValidationError

from app.core.errors import UnprocessableEntity

log = structlog.get_logger("watiq.requests.formdata")

# Deliberately small. A civil-status form is a few dozen short fields; anything
# approaching these bounds is either a bug or an attack, and in both cases the
# right answer is 422 rather than a 40 MB row.
MAX_SERIALIZED_BYTES = 64 * 1024
MAX_DEPTH = 8
MAX_KEYS = 200
MAX_STRING_LEN = 4096
MAX_ARRAY_LEN = 100
MAX_KEY_LEN = 128

_SCHEMA_DIR = Path(__file__).parent / "formschemas"


@lru_cache(maxsize=256)
def _validator_for(service_code: str) -> Draft202012Validator | None:
    """Compile and cache the validator for a service code.

    Returns ``None`` when the service has no schema file. The cache is keyed on
    the code, so a missing schema costs one stat() per process, not per request.

    ``check_schema`` runs here rather than per request: a malformed schema is an
    operator error that must surface loudly at first use, not silently degrade
    into "no validation" for every citizen who submits that form.
    """
    # The code comes from service_catalog.code, not from the client, but it ends
    # up in a filesystem path — so it is checked anyway. A code containing '/'
    # or '..' would otherwise read outside formschemas/.
    if not service_code or "/" in service_code or "\\" in service_code or ".." in service_code:
        log.warning("form_schema_code_rejected", service_code=service_code)
        return None

    path = _SCHEMA_DIR / f"{service_code}.json"
    if not path.is_file():
        return None

    schema = json.loads(path.read_text(encoding="utf-8"))
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as exc:
        raise RuntimeError(f"invalid form schema {path.name}: {exc.message}") from exc
    return Draft202012Validator(schema)


def _structural_limits(obj: Any, depth: int = 0) -> int:
    """Bound depth, key count, array length and string length.

    Order matters, and this runs BEFORE schema validation: a hostile 10 000-deep
    object must be rejected by these cheap checks, not by a validator that would
    recurse into it and exhaust the stack first.

    Returns the running key count so nested objects contribute to one global
    budget rather than each getting its own MAX_KEYS allowance.
    """
    if depth > MAX_DEPTH:
        raise UnprocessableEntity("form_data is nested too deeply.")

    count = 0
    if isinstance(obj, dict):
        # Bail on the width BEFORE walking it. A dict of a million keys must
        # cost one len() to reject, not a million recursive calls.
        if len(obj) > MAX_KEYS:
            raise UnprocessableEntity("form_data has too many fields.")
        count += len(obj)
        for key, value in obj.items():
            if len(key) > MAX_KEY_LEN:
                raise UnprocessableEntity("form_data contains an over-long field name.")
            count += _structural_limits(value, depth + 1)
            if count > MAX_KEYS:
                raise UnprocessableEntity("form_data has too many fields.")
    elif isinstance(obj, list):
        if len(obj) > MAX_ARRAY_LEN:
            raise UnprocessableEntity("form_data contains an over-long list.")
        for value in obj:
            count += _structural_limits(value, depth + 1)
            if count > MAX_KEYS:
                raise UnprocessableEntity("form_data has too many fields.")
    elif isinstance(obj, str) and len(obj) > MAX_STRING_LEN:
        raise UnprocessableEntity("form_data contains an over-long value.")

    if count > MAX_KEYS:
        raise UnprocessableEntity("form_data has too many fields.")
    return count


def validate_form_data(service_code: str | None, data: Any) -> dict[str, Any]:
    """Validate citizen-supplied form data. Returns it unchanged, or raises 422.

    ``service_code`` is ``service_catalog.code`` (e.g. ``civil.birth_certificate``)
    resolved server-side from ``office_service_id``. It is never taken from the
    request body — a client that could name its own schema could name the
    loosest one.
    """
    if not isinstance(data, dict):
        raise UnprocessableEntity("form_data must be a JSON object.")

    # ORDER IS LOAD-BEARING. The structural walk runs first because it is the
    # only check here that is safe on hostile input: it stops at MAX_DEPTH, so
    # it can never recurse more than a few frames deep.
    #
    # The obvious "cheap size check first" ordering is a trap. json.dumps()
    # recurses once per nesting level, so a 10 000-deep object raises
    # RecursionError *inside the size check* — a 500, and a worker-level DoS
    # from a single small request. The depth guard has to come first for the
    # size guard to be safe to run at all.
    _structural_limits(data)

    # Now bounded in depth and width, so serializing it is safe. Still needed:
    # 200 keys x 4096-char values passes the structural walk but is ~800 KB.
    # separators= measures what will actually be stored, not json.dumps'
    # default whitespace.
    if len(json.dumps(data, separators=(",", ":")).encode("utf-8")) > MAX_SERIALIZED_BYTES:
        raise UnprocessableEntity("form_data is too large.")

    if service_code is None:
        # The caller could not resolve the service. Structural caps have already
        # applied, so the DoS surface is closed either way.
        log.warning("form_schema_unresolved_service")
        return data

    validator = _validator_for(service_code)
    if validator is None:
        log.warning("form_schema_missing", service_code=service_code)
        return data

    try:
        validator.validate(data)
    except ValidationError as exc:
        # exc.message can quote the offending value. That value is citizen input
        # and may be PII, so only the JSON path is echoed back.
        raise UnprocessableEntity(
            f"form_data does not match the required schema for this service "
            f"(at {exc.json_path})."
        ) from None
    return data

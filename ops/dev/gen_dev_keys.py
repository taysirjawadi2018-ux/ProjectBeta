"""Generate DEV-ONLY crypto material and write it into .env.

    uv run --project backend python ops/dev/gen_dev_keys.py

Writes three values:
  JWT_PRIVATE_KEY / JWT_PUBLIC_KEY  — Ed25519 PEM pair for access tokens (EdDSA)
  MFA_ENCRYPTION_KEY                — 32 random bytes, base64: the AES-256-GCM
                                      KEK that wraps staff.mfa_secret

NEVER use the output in production. Production keys come from Docker secrets or
Vault and are rotated on the schedule in docs/runbooks/secret-rotation.md; the
values written here land in a plaintext file on a developer's laptop.

This lives in a script rather than inline in the Makefile because a heredoc
inside a `.ONESHELL` recipe depends on how make strips leading tabs, which is
exactly the kind of thing that breaks silently on someone else's machine.
"""

from __future__ import annotations

import base64
import secrets
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = REPO_ROOT / ".env"


def set_var(lines: list[str], name: str, value: str) -> list[str]:
    """Replace NAME=... in place, or append it. Newlines are escaped so a PEM
    survives as a single dotenv value."""
    encoded = value.replace("\n", "\\n")
    out, replaced = [], False
    for line in lines:
        if line.startswith(f"{name}="):
            out.append(f'{name}="{encoded}"')
            replaced = True
        else:
            out.append(line)
    if not replaced:
        out.append(f'{name}="{encoded}"')
    return out


def main() -> int:
    if not ENV_PATH.exists():
        print(f"missing {ENV_PATH} — run: cp .env.example .env", file=sys.stderr)
        return 1

    key = Ed25519PrivateKey.generate()
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode().strip()
    public_pem = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode().strip()
    kek = base64.b64encode(secrets.token_bytes(32)).decode()

    lines = ENV_PATH.read_text(encoding="utf-8").splitlines()
    for name, value in (
        ("JWT_PRIVATE_KEY", private_pem),
        ("JWT_PUBLIC_KEY", public_pem),
        ("MFA_ENCRYPTION_KEY", kek),
    ):
        lines = set_var(lines, name, value)
    ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"dev keys written to {ENV_PATH}")
    print("these are DEV keys — never deploy them")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

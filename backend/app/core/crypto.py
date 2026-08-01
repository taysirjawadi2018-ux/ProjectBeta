"""AES-256-GCM envelope encryption for staff.mfa_secret.

Backend.md §6.4, Security.md §7.1/A02. `staff.mfa_secret` carries an explicit
schema instruction: MUST be encrypted application-side before insert. The AAD
binds ciphertext to its purpose, so a ciphertext replayed to a different field
fails loudly instead of decrypting.
"""

from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import get_settings

_AAD = b"watiq:staff.mfa_secret:v1"   # binds ciphertext to its purpose


def _kek() -> bytes:
    return base64.b64decode(get_settings().mfa_encryption_key.get_secret_value())


def encrypt_mfa_secret(plaintext: str) -> str:
    nonce = os.urandom(12)
    ct = AESGCM(_kek()).encrypt(nonce, plaintext.encode(), _AAD)
    return base64.b64encode(nonce + ct).decode()


def decrypt_mfa_secret(stored: str) -> str:
    raw = base64.b64decode(stored)
    return AESGCM(_kek()).decrypt(raw[:12], raw[12:], _AAD).decode()

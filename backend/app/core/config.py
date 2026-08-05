"""Application settings — fail-fast, typed, no defaults for secrets.

Backend.md §3. If a secret is missing the process refuses to start rather than
falling back to ``None`` and failing mysteriously at request time.
"""

from __future__ import annotations

import base64
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, PostgresDsn, RedisDsn, SecretStr, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parents[3]

# Docker secrets mount (/run/secrets) exists in prod containers only.
_SECRETS_DIR = "/run/secrets" if Path("/run/secrets").is_dir() else None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_REPO_ROOT / ".env",   # repo root, regardless of CWD
        env_nested_delimiter="__",
        secrets_dir=_SECRETS_DIR,       # Docker secrets take precedence over env
        extra="ignore",                 # allow extra env vars (e.g. WATIQ_MIGRATE_DSN)
    )

    env: Literal["dev", "staging", "prod"] = "dev"
    debug: bool = False

    # --- One DSN per database role. See Architecture.md ADR-001. -----------
    dsn_citizen: PostgresDsn
    dsn_staff: PostgresDsn
    dsn_auth: PostgresDsn
    dsn_auditor: PostgresDsn
    dsn_admin: PostgresDsn

    db_pool_size: int = 10
    db_max_overflow: int = 5
    db_statement_timeout_ms: int = 5_000

    redis_dsn: RedisDsn
    redis_max_connections: int = 50

    # --- Crypto ------------------------------------------------------------
    jwt_private_key: SecretStr          # Ed25519 PEM
    jwt_public_key: SecretStr
    jwt_public_key_previous: SecretStr | None = None   # rotation overlap (runbooks)
    access_token_ttl_seconds: int = 900          # 15 min
    refresh_token_ttl_seconds: int = 60 * 60 * 24 * 14   # 14 days
    mfa_encryption_key: SecretStr       # 32 bytes, base64 — AES-256-GCM KEK

    # --- Object storage ----------------------------------------------------
    s3_endpoint: str
    s3_bucket_documents: str = "watiq-documents"
    s3_access_key: SecretStr
    s3_secret_key: SecretStr
    presigned_get_ttl_seconds: int = 300
    max_upload_bytes: int = 10 * 1024 * 1024

    # --- Document scanning (scan_document worker, Backend.md §9) -----------
    clamd_host: str | None = None        # e.g. "clamav:3310"; None = skip AV scan

    cors_origins: list[str] = Field(default_factory=list)

    # --- Notification channels (optional; workers queue regardless) --------
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: SecretStr | None = None
    smtp_from: str = "Watiq <no-reply@watiq.tn>"
    sms_provider_key: SecretStr | None = None
    sms_from: str = "WATIQ"
    sms_gateway_endpoint: str | None = None    # send_notification SMS dispatch

    # --- Payment gateway (optional; reconcile_payments settles later) ------
    payment_gateway_endpoint: str | None = None
    payment_gateway_secret: SecretStr | None = None
    payment_gateway_timeout_seconds: int = 8

    # --- Observability ------------------------------------------------------
    otel_endpoint: str | None = None      # OTLP/gRPC, e.g. otel-collector:4317

    @field_validator("debug")
    @classmethod
    def no_debug_in_prod(cls, v: bool, info: ValidationInfo) -> bool:
        if v and info.data.get("env") == "prod":
            raise ValueError("debug must be False in prod")
        return v

    @field_validator("mfa_encryption_key")
    @classmethod
    def key_is_32_bytes(cls, v: SecretStr) -> SecretStr:
        if len(base64.b64decode(v.get_secret_value())) != 32:
            raise ValueError("mfa_encryption_key must decode to exactly 32 bytes")
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()   # raises at import time if anything is missing

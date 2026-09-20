"""PIN hashing and opaque token helpers."""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets

_PIN_RE = re.compile(r"^\d{6}$")
_SCRYPT_PREFIX = "scrypt$16384$8$1$"


def _validate_pin(pin: str) -> None:
    if not _PIN_RE.fullmatch(pin):
        raise ValueError("PIN must be exactly six ASCII digits")


def _b64_encode_no_pad(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64_decode_no_pad(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def hash_pin(pin: str) -> str:
    _validate_pin(pin)
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        pin.encode("ascii"),
        salt=salt,
        n=16384,
        r=8,
        p=1,
        dklen=32,
    )
    return (
        f"{_SCRYPT_PREFIX}{_b64_encode_no_pad(salt)}${_b64_encode_no_pad(digest)}"
    )


def verify_pin(pin: str, encoded: str) -> bool:
    if not _PIN_RE.fullmatch(pin):
        return False
    if not encoded.startswith(_SCRYPT_PREFIX):
        return False
    try:
        salt_part, digest_part = encoded[len(_SCRYPT_PREFIX) :].split("$", 1)
        salt = _b64_decode_no_pad(salt_part)
        expected = _b64_decode_no_pad(digest_part)
        actual = hashlib.scrypt(
            pin.encode("ascii"),
            salt=salt,
            n=16384,
            r=8,
            p=1,
            dklen=32,
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    if not token:
        raise ValueError("token must not be empty")
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

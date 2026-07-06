"""
Gaung Crypto Utilities — encrypt/decrypt sensitive config fields.

Uses Fernet symmetric encryption with a key from the GAUNG_ENCRYPTION_KEY
environment variable.  If no key is set a hard-coded fallback is used with a
warning so that local dev still works, but production MUST set a proper key.

To generate a key: python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""

from __future__ import annotations

import base64
import os

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


# ---------------------------------------------------------------------------
# Key management
# ---------------------------------------------------------------------------

def _derive_key(raw: str) -> bytes:
    """Derive a 32-byte Fernet key from an arbitrary string using PBKDF2."""
    salt = b"gaung_salt_2025"
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480_000,
    )
    return base64.urlsafe_b64encode(kdf.derive(raw.encode("utf-8")))


def _get_fernet() -> Fernet:
    key = os.environ.get("GAUNG_ENCRYPTION_KEY", "")
    if not key:
        print(
            "[CRYPTO] WARNING: GAUNG_ENCRYPTION_KEY not set — "
            "using fallback key.  Sensitive data is NOT truly protected.  "
            "Generate a real key with: "
            "python3 -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
        key = "gaung-dev-fallback-key-do-not-use-in-production-!!"
    # Fernet requires a 32-byte url-safe-base64 key; derive if needed
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception:
        return Fernet(_derive_key(key))


_fernet = None


def _fernet_instance() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = _get_fernet()
    return _fernet


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def encrypt(plaintext: str) -> str:
    """Encrypt a string, returning a base64 token."""
    return _fernet_instance().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(token: str) -> str:
    """Decrypt a base64 token back to the original string."""
    return _fernet_instance().decrypt(token.encode("utf-8")).decode("utf-8")

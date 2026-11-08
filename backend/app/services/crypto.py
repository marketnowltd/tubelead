"""Symmetric encryption for stored third-party credentials (AI provider keys). The ciphertext lives in the
database; the plaintext key is decrypted only inside the backend at call time and never returned by any API."""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from ..config import get_settings


def _fernet() -> Fernet:
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(get_settings().secret_key.encode()).digest()))


def encrypt(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Stored credential cannot be decrypted (SECRET_KEY changed?)") from exc


def mask(plain: str) -> str:
    return (plain[:3] + "…" + plain[-4:]) if len(plain) > 10 else "••••"

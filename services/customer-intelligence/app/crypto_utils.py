import hashlib
import hmac
import re
from cryptography.fernet import Fernet


def normalize_email(value: str) -> str:
    return value.strip().lower()


def normalize_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if not digits:
        raise ValueError("Phone number is empty after normalization.")
    return f"+{digits}"


def sha256_identifier(value: str, kind: str = "email") -> str:
    normalized = normalize_email(value) if kind == "email" else normalize_phone(value)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def constant_time_matches(raw_value: str, expected_hash: str, kind: str = "email") -> bool:
    return hmac.compare_digest(sha256_identifier(raw_value, kind), expected_hash)


class PiiCipher:
    def __init__(self, key: str):
        self._fernet = Fernet(key.encode("ascii"))

    def encrypt(self, value: str) -> str:
        return self._fernet.encrypt(value.encode("utf-8")).decode("ascii")

    def decrypt(self, value: str) -> str:
        return self._fernet.decrypt(value.encode("ascii")).decode("utf-8")

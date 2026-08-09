import secrets
from fastapi import Header, HTTPException
from .config import get_settings


async def require_service_key(x_aaiq_service_key: str = Header(default="")) -> None:
    configured = get_settings().service_api_key
    if configured == "replace-before-production" or not secrets.compare_digest(x_aaiq_service_key, configured):
        raise HTTPException(status_code=401, detail="Valid AAIQ service credentials are required.")

"""Authentication. dev mode = single local owner; supabase mode = Supabase JWT or API key."""
import hashlib
from datetime import datetime, timezone

import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import ApiKey

DEV_OWNER = "00000000-0000-0000-0000-000000000001"


def hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


_jwks_clients: dict[str, jwt.PyJWKClient] = {}


def _jwks_client(supabase_url: str) -> jwt.PyJWKClient:
    url = supabase_url.rstrip("/") + "/auth/v1/.well-known/jwks.json"
    if url not in _jwks_clients:
        _jwks_clients[url] = jwt.PyJWKClient(url, cache_keys=True, lifespan=3600)
    return _jwks_clients[url]


def get_owner(
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> str:
    s = get_settings()
    if x_api_key:
        row = db.scalar(select(ApiKey).where(ApiKey.key_hash == hash_key(x_api_key), ApiKey.revoked_at.is_(None)))
        if not row:
            raise HTTPException(401, "Invalid API key")
        row.last_used_at = datetime.now(timezone.utc)
        db.commit()
        return row.owner_id
    if s.auth_mode == "dev":
        return DEV_OWNER
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization[7:]
    try:
        alg = jwt.get_unverified_header(token).get("alg", "")
        if alg in ("RS256", "ES256"):
            # Newer Supabase projects sign tokens with asymmetric keys; verify against the project's public keys.
            if not s.supabase_url:
                raise HTTPException(500, "SUPABASE_URL is not configured")
            key = _jwks_client(s.supabase_url).get_signing_key_from_jwt(token).key
            claims = jwt.decode(token, key, algorithms=[alg], audience="authenticated")
        else:
            if not s.supabase_jwt_secret:
                raise HTTPException(500, "SUPABASE_JWT_SECRET is not configured")
            claims = jwt.decode(token, s.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated")
    except HTTPException:
        raise
    except jwt.PyJWTError as exc:
        raise HTTPException(401, f"Invalid token: {exc}") from exc
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(401, "Token has no subject")
    return sub

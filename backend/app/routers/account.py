"""Integrations, API keys and settings."""
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_owner, hash_key
from ..config import get_settings
from ..db import engine, get_db
from ..models import ApiKey
from ..schemas import ApiKeyIn, SettingsIn, WebhookIn
from ..serializers import key_out
from ..services import entitlements as ent
from .system import get_user_settings

router = APIRouter(prefix="/api", tags=["account"])


@router.get("/integrations")
def integrations(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    s = get_settings()
    us = get_user_settings(db, owner)
    host = ""
    try:
        host = engine.url.host or ""
    except Exception:  # noqa: BLE001
        pass
    from ..models import AIProvider
    ai_count = len(db.scalars(select(AIProvider).where(AIProvider.owner_id == owner, AIProvider.status != "disabled")).all())
    ai_connected = bool(ai_count)
    return [
        {"id": "youtube", "name": "YouTube Data API v3", "category": "Discovery", "connected": bool(s.youtube_api_key),
         "detail": "Official API key configured on the server" if s.youtube_api_key else "Set YOUTUBE_API_KEY in backend/.env", "configurable": False},
        {"id": "supabase", "name": "Supabase (PostgreSQL + Auth)", "category": "Data", "connected": engine.dialect.name == "postgresql",
         "detail": f"Postgres connected ({host})" if engine.dialect.name == "postgresql" else "Using local SQLite. Set DATABASE_URL to your Supabase Postgres to enable.", "configurable": False},
        {"id": "auth", "name": "Supabase Auth (JWT)", "category": "Data", "connected": s.auth_mode == "supabase" and bool(s.supabase_jwt_secret),
         "detail": "JWT verification active" if s.auth_mode == "supabase" else "AUTH_MODE=dev: single local user, no login", "configurable": False},
        {"id": "redis", "name": "Redis (shared rate limiting)", "category": "Infrastructure", "connected": bool(s.redis_url),
         "detail": "Rate limits shared across workers" if s.redis_url else "Set REDIS_URL; falls back to in-process limiter", "configurable": False},
        {"id": "payments", "name": "Plans and billing", "category": "Billing", "connected": bool(s.stripe_secret_key and s.stripe_webhook_secret),
         "detail": "Upgrades are available" if (s.stripe_secret_key and s.stripe_webhook_secret) else "Upgrades are coming soon", "configurable": False},
        {"id": "ai", "name": "AI providers (bring your own key)", "category": "Intelligence", "connected": ai_connected,
         "detail": f"{ai_count} provider(s) connected — manage in AI Connect" if ai_count else "None connected yet. Add one in AI Connect (optional).", "configurable": False},
        {"id": "n8n", "name": "n8n Webhook", "category": "Automation", "connected": bool(us.n8n_webhook_url or s.n8n_webhook_url),
         "detail": (us.n8n_webhook_url or s.n8n_webhook_url or "POST job events to an n8n Webhook node"), "configurable": True},
    ]


@router.put("/integrations/n8n")
def set_n8n(body: WebhookIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    ent.require_feature(db, owner, "automation")
    url = body.url.strip()
    if url and not url.startswith(("http://", "https://")):
        raise HTTPException(422, "Webhook URL must start with http:// or https://")
    us = get_user_settings(db, owner)
    us.n8n_webhook_url = url
    db.commit()
    return {"ok": True}


@router.post("/integrations/n8n/test")
async def test_n8n(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    import httpx
    us = get_user_settings(db, owner)
    url = us.n8n_webhook_url or get_settings().n8n_webhook_url
    if not url:
        raise HTTPException(422, "No webhook URL configured")
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.post(url, json={"event": "test.ping", "source": "tubelead"})
        return {"ok": r.status_code < 400, "status_code": r.status_code}
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Webhook request failed: {exc}") from exc


@router.get("/api-keys")
def list_keys(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    return [key_out(k) for k in db.scalars(select(ApiKey).where(ApiKey.owner_id == owner).order_by(ApiKey.created_at.desc()))]


@router.post("/api-keys", status_code=201)
def create_key(body: ApiKeyIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    ent.require_feature(db, owner, "api_access")
    active = db.scalars(select(ApiKey).where(ApiKey.owner_id == owner, ApiKey.revoked_at.is_(None))).all()
    if len(active) >= 10:
        raise HTTPException(409, "Maximum of 10 active API keys")
    raw = "clk_" + secrets.token_urlsafe(32)
    k = ApiKey(owner_id=owner, name=body.name, prefix=raw[:8], key_hash=hash_key(raw))
    db.add(k)
    db.commit()
    return {**key_out(k), "secret": raw}  # shown exactly once


@router.delete("/api-keys/{kid}", status_code=204)
def revoke_key(kid: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    k = db.get(ApiKey, kid)
    if not k or k.owner_id != owner:
        raise HTTPException(404, "Key not found")
    k.revoked_at = datetime.now(timezone.utc)
    db.commit()


@router.get("/settings")
def get_settings_ep(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    us = get_user_settings(db, owner)
    return {"display_name": us.display_name, "email": us.email, "plan": ent.current_plan_id(db, owner), "default_filters": us.default_filters or {}, "preferences": us.preferences or {}}


@router.put("/settings")
def put_settings(body: SettingsIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    us = get_user_settings(db, owner)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(us, k, v)
    db.commit()
    return get_settings_ep(owner, db)

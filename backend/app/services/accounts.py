"""Customer accounts: created on first authenticated request, carry status (active/suspended) and staff role.
Roles, lowest to highest: customer < support < admin < operator. Operators are set by OPERATOR_USER_IDS and
cannot be suspended or demoted from the admin panel."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from ..models import UserAccount
from . import email as mail
from .audit import record
from .entitlements import is_operator

LEVEL = {"customer": 0, "support": 1, "admin": 2, "operator": 3}


def _aware(dt: datetime | None) -> datetime | None:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def touch(db: Session, owner: str, claims: dict | None = None) -> UserAccount:
    """Load or create the account. New accounts get a welcome email and an admin notification (each sent once)."""
    claims = claims or {}
    acc = db.get(UserAccount, owner)
    now = datetime.now(timezone.utc)
    email = (claims.get("email") or "").strip()
    name = ((claims.get("user_metadata") or {}).get("full_name") or "").strip()
    if acc is None:
        acc = UserAccount(owner_id=owner, email=email, full_name=name)
        db.add(acc)
        db.commit()
        record(db, "account.created", actor_type="customer", actor_id=owner, target_type="account", target_id=owner)
        mail.queue(db, to=email, template="welcome", ctx={"name": name}, dedupe_key=f"welcome:{owner}")
        mail.alert_admin(db, "New registration", [f"Email: {email or 'not provided'}", f"User ID: {owner}"], f"registration:{owner}")
        return acc
    changed = False
    if email and acc.email != email:
        acc.email, changed = email, True
    if name and not acc.full_name:
        acc.full_name, changed = name, True
    if not acc.last_login_at or _aware(acc.last_login_at) < now - timedelta(minutes=10):
        acc.last_login_at, changed = now, True
    if changed:
        db.commit()
    return acc


def role_of(db: Session, owner: str) -> str:
    if is_operator(owner):
        return "operator"
    acc = db.get(UserAccount, owner)
    return acc.role if acc and acc.role in LEVEL else "customer"


def require_role(minimum: str):
    """FastAPI dependency: the caller must have at least this staff role."""
    from ..auth import get_owner
    from ..db import get_db

    def dep(owner: str = Depends(get_owner), db: Session = Depends(get_db)) -> str:
        if LEVEL[role_of(db, owner)] < LEVEL[minimum]:
            raise HTTPException(403, {"code": "forbidden", "message": "You do not have access to this area."})
        return owner
    return dep

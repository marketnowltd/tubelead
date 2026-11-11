"""The signed-in customer's own account: profile, role (to show staff areas) and self-service deletion."""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, update
from sqlalchemy.orm import Session

from ..auth import get_owner
from ..config import get_settings
from ..db import Base, get_db
from ..models import ChatConversation, Payment, RefundRequest, Subscription, SupportTicket, UserAccount
from ..services.accounts import role_of
from ..services.audit import log_error, record

router = APIRouter(prefix="/api/me", tags=["me"])

# Kept after deletion, detached from the user: support history, payments and refund decisions are business records.
_DETACH = (SupportTicket, RefundRequest, Payment, ChatConversation)
_ORDER_FIRST = ("contact_routes", "ai_task_assignments", "creators")


class DeleteIn(BaseModel):
    confirm: str = Field(description='Must be the word "DELETE"')


@router.get("")
def me(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    acc = db.get(UserAccount, owner)
    return {"id": owner, "email": acc.email if acc else "", "full_name": acc.full_name if acc else "",
            "status": acc.status if acc else "active", "role": role_of(db, owner),
            "created_at": acc.created_at.isoformat() if acc and acc.created_at else None}


@router.delete("")
async def delete_account(body: DeleteIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    if body.confirm != "DELETE":
        raise HTTPException(422, {"code": "confirm_required", "message": 'Type DELETE to confirm.'})
    if role_of(db, owner) == "operator":
        raise HTTPException(409, {"code": "operator", "message": "The site owner account cannot be deleted here."})
    sub = db.get(Subscription, owner)
    if sub and sub.status in ("active", "trialing", "past_due") and not sub.cancel_at_period_end:
        raise HTTPException(409, {"code": "active_subscription", "message": "Cancel your subscription in Billing & Subscription first, then delete your account."})
    for model in _DETACH:
        db.execute(update(model).where(model.owner_id == owner).values(owner_id=None))
    detached = {m.__tablename__ for m in _DETACH}
    tables = [t for t in Base.metadata.sorted_tables if "owner_id" in t.c and t.name not in detached]
    tables.sort(key=lambda t: (t.name not in _ORDER_FIRST, _ORDER_FIRST.index(t.name) if t.name in _ORDER_FIRST else 0))
    removed = {}
    for t in tables:
        removed[t.name] = db.execute(delete(t).where(t.c.owner_id == owner)).rowcount
    db.commit()
    record(db, "account.deleted", actor_type="customer", actor_id=owner, target_type="account", target_id=owner,
           detail={"rows_removed": sum(v for v in removed.values() if v and v > 0)})
    s = get_settings()
    sign_in_removed = False
    if s.supabase_url and s.supabase_service_role_key and s.auth_mode != "dev":
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.delete(f"{s.supabase_url.rstrip('/')}/auth/v1/admin/users/{owner}",
                                   headers={"apikey": s.supabase_service_role_key, "Authorization": f"Bearer {s.supabase_service_role_key}"})
            sign_in_removed = r.status_code < 300
            if not sign_in_removed:
                log_error("api", f"Supabase user delete returned {r.status_code} for {owner}", "/api/me")
        except httpx.HTTPError as exc:
            log_error("api", f"Supabase user delete failed: {type(exc).__name__}", "/api/me")
    return {"deleted": True, "sign_in_removed": sign_in_removed}

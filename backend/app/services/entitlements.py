"""Plan enforcement. A paywall is shown only when a REAL limit is hit; the structured 402 body drives the UI."""
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Creator, Subscription, UserSettings
from .plans import FEATURE_LABELS, FEATURE_MIN_PLAN, all_plans, plan_for, plan_id, purchasable_plans


def is_operator(owner: str) -> bool:
    from ..auth import DEV_OWNER
    s = get_settings()
    if s.auth_mode == "dev" and owner == DEV_OWNER and s.dev_owner_is_operator:
        return True  # local single-user mode: the one user is the operator
    from .plans import operator_ids
    return owner in operator_ids()


def current_plan_id(db: Session, owner: str) -> str:
    s = get_settings()
    if is_operator(owner):
        return "operator"
    if s.auth_mode == "dev" and s.plan_override:
        return plan_id(s.plan_override)
    sub = db.get(Subscription, owner)
    if sub and sub.plan != "free" and sub.status in ("active", "trialing", "past_due"):
        return plan_id(sub.plan)
    us = db.get(UserSettings, owner)
    # UserSettings.plan is only trusted when no Stripe subscription row exists (dev/admin assignment).
    if sub is None and us:
        return plan_id(us.plan)
    return "free"


def paywall(reason: str, message: str, *, feature: str | None = None, plan: str = "free") -> HTTPException:
    return HTTPException(402, {"code": "paywall", "reason": reason, "message": message, "feature": feature,
                               "current_plan": plan, "required_plan": FEATURE_MIN_PLAN.get(feature or "", None), "upgrade_url": "/billing"})


def require_feature(db: Session, owner: str, feature: str) -> None:
    pid = current_plan_id(db, owner)
    if not plan_for(pid)["features"].get(feature):
        need = FEATURE_MIN_PLAN.get(feature, "a paid")
        raise paywall("premium_feature", f"{FEATURE_LABELS.get(feature, feature)} is available on the {need} plan and above.", feature=feature, plan=pid)


def leads_used(db: Session, owner: str, period: str) -> int:
    q = select(func.count()).select_from(Creator).where(Creator.owner_id == owner, Creator.is_demo.is_(False))
    if period == "month":
        q = q.where(Creator.discovered_at >= datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0))
    return db.scalar(q) or 0


def usage(db: Session, owner: str) -> dict:
    pid = current_plan_id(db, owner)
    p = plan_for(pid)
    used = leads_used(db, owner, p["lead_period"])
    return {"plan": pid, "leads_allowance": p["leads"], "leads_used": used, "leads_remaining": max(p["leads"] - used, 0),
            "period": p["lead_period"], "at_limit": used >= p["leads"]}


def next_plan(pid: str) -> str | None:
    order = list(purchasable_plans())
    i = order.index(pid)
    return order[i + 1] if i + 1 < len(order) else None

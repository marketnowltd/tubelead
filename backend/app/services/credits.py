"""Monthly credits for the Growth Assistant. Checked before work starts, recorded after it succeeds.
Provider costs are recorded per event (from configured per-unit prices) so Admin can show estimated margins."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import UsageEvent
from .entitlements import current_plan_id
from .plans import FEATURE_MIN_PLAN, plan_for

LABEL = {"discovery": "discovery searches", "enrichment": "contact enrichments", "verification": "email verifications",
         "campaign_recipients": "campaign recipients"}


def month_start() -> datetime:
    n = datetime.now(timezone.utc)
    return n.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def used(db: Session, owner: str, kind: str) -> int:
    return int(db.scalar(select(func.coalesce(func.sum(UsageEvent.units), 0)).where(
        UsageEvent.owner_id == owner, UsageEvent.kind == kind, UsageEvent.created_at >= month_start())) or 0)


def allowance(db: Session, owner: str, kind: str) -> int:
    return int((plan_for(current_plan_id(db, owner)).get("credits") or {}).get(kind, 0))


def summary(db: Session, owner: str) -> dict:
    out = {}
    for k in LABEL:
        a, u = allowance(db, owner, k), used(db, owner, k)
        out[k] = {"label": LABEL[k], "used": u, "allowance": a, "remaining": max(0, a - u)}
    return out


def require(db: Session, owner: str, kind: str, units: int = 1) -> None:
    a, u = allowance(db, owner, kind), used(db, owner, kind)
    if u + units > a:
        pid = current_plan_id(db, owner)
        raise HTTPException(402, {"code": "paywall", "reason": "credits", "feature": kind, "current_plan": pid,
                                  "required_plan": FEATURE_MIN_PLAN.get(kind), "upgrade_url": "/billing",
                                  "message": f"You've used {u:,} of {a:,} {LABEL[kind]} this month. Upgrade for more, or wait until next month."})


def unit_cost_pence(provider: str, kind: str) -> float:
    s = get_settings()
    return {("snov", "enrichment"): s.snov_cost_per_credit_pence, ("snov", "verification"): s.snov_cost_per_credit_pence,
            ("brave", "discovery"): s.brave_cost_per_query_pence}.get((provider, kind), 0.0)


def record(db: Session, owner: str, kind: str, units: int, provider: str = "", commit: bool = True) -> None:
    if units <= 0:
        return
    db.add(UsageEvent(owner_id=owner, kind=kind, units=units, provider=provider, provider_cost_pence=unit_cost_pence(provider, kind) * units))
    if commit:
        db.commit()

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import get_owner
from ..config import get_settings
from ..db import engine, get_db
from ..models import ActivityEvent, Creator, UserAccount, UserSettings
from ..services import demo as demo_svc
from ..services import quota
from ..services import entitlements as ent
from ..services.plans import all_plans, plan_for

router = APIRouter(prefix="/api", tags=["system"])


def get_user_settings(db: Session, owner: str) -> UserSettings:
    us = db.get(UserSettings, owner)
    if not us:
        us = UserSettings(owner_id=owner)
        db.add(us)
        try:
            db.commit()
        except IntegrityError:  # another request created it at the same moment (first page load fires several)
            db.rollback()
            us = db.get(UserSettings, owner)
    return us


@router.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(select(1))
    return {"ok": True, "time": datetime.now(timezone.utc).isoformat()}


def _profile(db: Session, owner: str, us: UserSettings, pid: str) -> dict:
    """The name shown in the app. "Operator" is only the settings default, so a customer who hasn't chosen a name sees
    their own name, or the start of their email address."""
    name, email = us.display_name, us.email
    if name == "Operator" and pid != "operator":
        acc = db.get(UserAccount, owner)
        email = email or (acc.email if acc else "")
        name = (acc.full_name if acc and acc.full_name else "") or (email.split("@")[0] if email else "") or "Your account"
    return {"display_name": name, "email": email}


@router.get("/status")
def status(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    s = get_settings()
    us = get_user_settings(db, owner)
    demo_count = db.scalar(select(func.count()).select_from(Creator).where(Creator.owner_id == owner, Creator.is_demo.is_(True))) or 0
    real_count = db.scalar(select(func.count()).select_from(Creator).where(Creator.owner_id == owner, Creator.is_demo.is_(False))) or 0
    pid = ent.current_plan_id(db, owner)
    plan = plan_for(pid)
    usage = ent.usage(db, owner)
    return {
        "youtube_configured": bool(s.youtube_api_key),
        "quota": {"used": quota.used_today(db, owner), "daily_limit": s.youtube_daily_quota, "reserve": s.youtube_quota_reserve},
        "database": engine.dialect.name, "auth_mode": s.auth_mode, "redis_configured": bool(s.redis_url),
        "n8n_configured": bool(us.n8n_webhook_url or s.n8n_webhook_url), "environment": s.environment,
        "scheduler_enabled": s.scheduler_enabled,
        "plan": {"id": pid, "label": plan["label"], "leads": plan["leads"], "lead_period": plan["lead_period"], "max_jobs_per_day": plan["max_jobs_per_day"],
                 "features": plan["features"], "leads_used": usage["leads_used"], "at_limit": usage["at_limit"]},
        "profile": _profile(db, owner, us, pid),
        "demo_count": demo_count, "real_count": real_count,
    }


@router.get("/activity")
def activity(limit: int = 25, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    rows = db.scalars(select(ActivityEvent).where(ActivityEvent.owner_id == owner).order_by(ActivityEvent.created_at.desc()).limit(min(limit, 100))).all()
    return [{"id": r.id, "kind": r.kind, "message": r.message, "is_demo": r.is_demo, "created_at": r.created_at.isoformat()} for r in rows]


@router.get("/plans")
def plans():
    from ..services.plans import purchasable_plans
    return purchasable_plans()


@router.post("/demo/seed")
def seed_demo(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    return demo_svc.seed(db, owner)


@router.delete("/demo")
def clear_demo(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    return demo_svc.clear(db, owner)

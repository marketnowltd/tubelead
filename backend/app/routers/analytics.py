from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import get_owner
from ..config import get_settings
from ..db import get_db
from ..models import Campaign, ContactRoute, Creator, DiscoveryJob, QuotaUsage
from ..services import quota
from .workspace import _campaign_stats

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _demo_filter(model, demo: str):
    return [model.is_demo.is_(False)] if demo == "hide" else []


@router.get("/overview")
def overview(days: int = 30, demo: str = "all", owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    days = max(7, min(days, 90))
    s = get_settings()
    now = datetime.now(timezone.utc)
    cf = [Creator.owner_id == owner, *_demo_filter(Creator, demo)]
    total = db.scalar(select(func.count()).select_from(Creator).where(*cf)) or 0
    qualified = db.scalar(select(func.count()).select_from(Creator).where(*cf, Creator.qualification_score >= 70)) or 0
    email_exists = select(ContactRoute.id).where(ContactRoute.creator_id == Creator.id, ContactRoute.kind == "email").exists()
    with_email = db.scalar(select(func.count()).select_from(Creator).where(*cf, email_exists)) or 0
    with_route = db.scalar(select(func.count()).select_from(Creator).where(*cf, Creator.verification_status != "none")) or 0
    active_camps = db.scalar(select(func.count()).select_from(Campaign).where(Campaign.owner_id == owner, Campaign.status == "active", *_demo_filter(Campaign, demo))) or 0
    since = now - timedelta(days=days)
    by_day = {}
    for (d,) in db.execute(select(Creator.discovered_at).where(*cf, Creator.discovered_at >= since)).all():
        key = d.date().isoformat()
        by_day[key] = by_day.get(key, 0) + 1
    q_by_day = {}
    for (d,) in db.execute(select(Creator.discovered_at).where(*cf, Creator.discovered_at >= since, Creator.qualification_score >= 70)).all():
        key = d.date().isoformat()
        q_by_day[key] = q_by_day.get(key, 0) + 1
    trend = []
    for i in range(days - 1, -1, -1):
        k = (now - timedelta(days=i)).date().isoformat()
        trend.append({"date": k, "discovered": by_day.get(k, 0), "qualified": q_by_day.get(k, 0)})
    countries = db.execute(select(Creator.country, func.count(), func.avg(Creator.qualification_score)).where(*cf, Creator.country.is_not(None))
                           .group_by(Creator.country).order_by(func.count().desc())).all()
    niches = db.execute(select(Creator.niche, func.count()).where(*cf).group_by(Creator.niche).order_by(func.count().desc()).limit(12)).all()
    jobs = db.scalars(select(DiscoveryJob).where(DiscoveryJob.owner_id == owner, *_demo_filter(DiscoveryJob, demo)).order_by(DiscoveryJob.created_at.desc()).limit(10)).all()
    q_rows = db.scalars(select(QuotaUsage).where(QuotaUsage.owner_id == owner, QuotaUsage.day >= (now - timedelta(days=6)).date(), *_demo_filter(QuotaUsage, demo))).all()
    q_map = {r.day.isoformat(): r.units for r in q_rows}
    quota_week = [{"date": (now - timedelta(days=i)).date().isoformat(), "units": q_map.get((now - timedelta(days=i)).date().isoformat(), 0)} for i in range(6, -1, -1)]
    camps = db.scalars(select(Campaign).where(Campaign.owner_id == owner, *_demo_filter(Campaign, demo))).all()
    cstats = _campaign_stats(db, owner)
    route_status = dict(db.execute(select(ContactRoute.status, func.count()).where(ContactRoute.owner_id == owner, ContactRoute.kind == "email", *_demo_filter(ContactRoute, demo)).group_by(ContactRoute.status)).all())
    avg_conv = [round(j.qualified / j.unique_found * 100, 1) for j in jobs if j.unique_found]
    return {
        "kpis": {"total": total, "qualified": qualified, "with_email": with_email, "with_route": with_route, "active_campaigns": active_camps,
                 "avg_score": round(float(db.scalar(select(func.avg(Creator.qualification_score)).where(*cf)) or 0))},
        "trend": trend,
        "countries": [{"country": c, "count": n, "avg_score": round(float(a or 0))} for c, n, a in countries],
        "niches": [{"niche": n, "count": c} for n, c in niches],
        "search_performance": [{"id": j.id, "label": j.created_at.strftime("%d %b %H:%M"), "mode": j.mode, "found": j.channels_found, "unique": j.unique_found,
                                "qualified": j.qualified, "quota": j.quota_used, "conversion": round(j.qualified / j.unique_found * 100, 1) if j.unique_found else 0,
                                "status": j.status} for j in reversed(jobs)],
        "avg_conversion": round(sum(avg_conv) / len(avg_conv), 1) if avg_conv else 0,
        "quota": {"today": quota.used_today(db, owner), "daily_limit": s.youtube_daily_quota, "week": quota_week},
        "campaigns": [{"id": c.id, "name": c.name, "status": c.status, **{k: cstats.get(c.id, {}).get(k, 0) for k in ("leads", "contacted", "replied", "converted", "reply_rate")}} for c in camps],
        "email_status": {"published": route_status.get("published", 0), "unverified": route_status.get("unverified", 0), "verified": route_status.get("verified", 0)},
    }

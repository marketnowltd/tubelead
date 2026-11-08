from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import get_owner
from ..config import get_settings
from ..db import get_db
from ..models import ActivityEvent, Creator, DiscoveryJob, SavedSearch
from ..schemas import JobCreate, JobParams
from ..serializers import job_out
from ..services import jobs as job_svc
from ..services import quota
from ..services.discovery import estimate_cost, expand_queries
from ..services import entitlements as ent
from ..services.plans import plan_for

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def start_job(db: Session, owner: str, params: JobParams, saved_search_id: str | None = None) -> DiscoveryJob:
    s = get_settings()
    if not s.youtube_api_key:
        raise HTTPException(503, {"code": "youtube_not_configured",
                                  "message": "YOUTUBE_API_KEY is not set on the backend. Add it to backend/.env and restart — see README."})
    pid = ent.current_plan_id(db, owner)
    plan = plan_for(pid)
    now = datetime.now(timezone.utc)
    used = ent.leads_used(db, owner, plan["lead_period"])
    if used >= plan["leads"]:
        raise ent.paywall("allowance_reached", f"You have used all {plan['leads']:,} leads included in the {plan['label']} plan"
                          + (" trial." if plan["lead_period"] == "lifetime" else " this month."), plan=pid)
    jobs_today = db.scalar(select(func.count()).select_from(DiscoveryJob).where(
        DiscoveryJob.owner_id == owner, DiscoveryJob.is_demo.is_(False), DiscoveryJob.created_at >= now - timedelta(days=1))) or 0
    if jobs_today >= plan["max_jobs_per_day"]:
        raise ent.paywall("daily_jobs", f"Daily discovery-run limit of {plan['max_jobs_per_day']} reached on the {plan['label']} plan.", plan=pid)
    remaining = plan["leads"] - used
    if params.limit > remaining:  # never create more leads than the plan allows
        params = params.model_copy(update={"limit": remaining})
    running = db.scalar(select(func.count()).select_from(DiscoveryJob).where(DiscoveryJob.owner_id == owner, DiscoveryJob.status.in_(["queued", "running"]))) or 0
    if running >= 3:
        raise HTTPException(429, {"code": "too_many_jobs", "message": "You already have 3 active jobs. Wait for one to finish or cancel it."})
    if quota.used_today(db, owner) >= s.youtube_daily_quota - s.youtube_quota_reserve:
        raise HTTPException(429, {"code": "quota_exceeded", "message": "The daily YouTube API quota budget is used up. It resets at 00:00 UTC (Pacific midnight for Google)."})
    job = job_svc.create_job(db, owner, params.model_dump(), saved_search_id)
    job_svc.submit(job.id)
    return job


@router.post("", status_code=201)
def create(body: JobCreate, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    ss_id = None
    if body.schedule != "none":
        ent.require_feature(db, owner, "scheduled_discovery")
    if body.save_as or body.schedule != "none":
        delta = job_svc.SCHEDULE_DELTA.get(body.schedule)
        ss = SavedSearch(owner_id=owner, name=body.save_as or "Scheduled discovery", params=body.params.model_dump(), schedule=body.schedule,
                         next_run_at=(datetime.now(timezone.utc) + delta) if delta else None)
        db.add(ss)
        db.commit()
        ss_id = ss.id
    job = start_job(db, owner, body.params, ss_id)
    db.add(ActivityEvent(owner_id=owner, kind="job_started", message=f"Discovery started ({job.mode}): {', '.join((body.params.keywords + body.params.niches)[:3])}"))
    db.commit()
    return job_out(job)


@router.post("/estimate")
def estimate(params: JobParams, owner: str = Depends(get_owner)):
    qs = expand_queries(params)
    return {"search_operations": len(qs), "max_quota_units": estimate_cost(params), "capped_at": params.max_quota_units,
            "queries": [{"q": q.q, "region": q.region, "order": q.order} for q in qs[:12]]}


@router.get("")
def list_jobs(limit: int = 30, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    rows = db.scalars(select(DiscoveryJob).where(DiscoveryJob.owner_id == owner).order_by(DiscoveryJob.created_at.desc()).limit(min(limit, 100))).all()
    return [job_out(j) for j in rows]


@router.get("/{job_id}")
def get_job(job_id: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    j = db.get(DiscoveryJob, job_id)
    if not j or j.owner_id != owner:
        raise HTTPException(404, "Job not found")
    return job_out(j)


@router.post("/{job_id}/cancel")
def cancel(job_id: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    j = db.get(DiscoveryJob, job_id)
    if not j or j.owner_id != owner:
        raise HTTPException(404, "Job not found")
    if j.status == "queued":
        j.status, j.finished_at, j.current_operation = "cancelled", datetime.now(timezone.utc), "Cancelled before start"
    elif j.status in ("running", "paused"):
        j.status, j.current_operation = "cancelling", "Cancelling…"
    db.commit()
    return job_out(j)


@router.post("/{job_id}/pause")
def pause(job_id: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    j = db.get(DiscoveryJob, job_id)
    if not j or j.owner_id != owner:
        raise HTTPException(404, "Job not found")
    if j.status != "running":
        raise HTTPException(409, "Only a running job can be paused")
    j.status, j.current_operation = "paused", "Paused — resume to continue from where it stopped"
    db.commit()
    return job_out(j)


@router.post("/{job_id}/resume")
def resume(job_id: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    j = db.get(DiscoveryJob, job_id)
    if not j or j.owner_id != owner:
        raise HTTPException(404, "Job not found")
    if j.status != "paused":
        raise HTTPException(409, "Only a paused job can be resumed")
    j.status, j.current_operation = "running", "Resuming…"
    db.commit()
    return job_out(j)

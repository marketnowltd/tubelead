"""Campaigns, saved searches, saved views."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import get_owner
from ..db import get_db
from ..models import ActivityEvent, Campaign, Creator, SavedSearch, SavedView
from ..schemas import CampaignIn, SavedSearchIn, SavedViewIn
from ..serializers import campaign_out, job_out, saved_out, view_out
from ..services import entitlements as ent
from ..services import jobs as job_svc
from .jobs import start_job

router = APIRouter(prefix="/api", tags=["workspace"])


def _campaign_stats(db: Session, owner: str) -> dict[str, dict]:
    rows = db.execute(select(Creator.campaign_id, Creator.outreach_status, func.count(), func.avg(Creator.qualification_score))
                      .where(Creator.owner_id == owner, Creator.campaign_id.is_not(None)).group_by(Creator.campaign_id, Creator.outreach_status)).all()
    stats: dict[str, dict] = {}
    for cid, st, n, avg in rows:
        s = stats.setdefault(cid, {"leads": 0, "new": 0, "contacted": 0, "replied": 0, "converted": 0, "_sum": 0.0})
        s["leads"] += n
        s[st] += n
        s["_sum"] += float(avg or 0) * n
    for s in stats.values():
        s["avg_score"] = round(s.pop("_sum") / s["leads"]) if s["leads"] else 0
        s["reply_rate"] = round((s["replied"] + s["converted"]) / max(s["contacted"] + s["replied"] + s["converted"], 1) * 100, 1)
    return stats


def _own(db, model, id_, owner, label):
    o = db.get(model, id_)
    if not o or o.owner_id != owner:
        raise HTTPException(404, f"{label} not found")
    return o


@router.get("/campaigns")
def list_campaigns(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    stats = _campaign_stats(db, owner)
    empty = {"leads": 0, "new": 0, "contacted": 0, "replied": 0, "converted": 0, "avg_score": 0, "reply_rate": 0}
    rows = db.scalars(select(Campaign).where(Campaign.owner_id == owner).order_by(Campaign.created_at.desc())).all()
    return [campaign_out(c, stats.get(c.id, empty)) for c in rows]


@router.post("/campaigns", status_code=201)
def create_campaign(body: CampaignIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    c = Campaign(owner_id=owner, **body.model_dump())
    db.add(c)
    db.add(ActivityEvent(owner_id=owner, kind="campaign", message=f"Campaign created: {body.name}"))
    db.commit()
    return campaign_out(c, {"leads": 0})


@router.put("/campaigns/{cid}")
def update_campaign(cid: str, body: CampaignIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    c = _own(db, Campaign, cid, owner, "Campaign")
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    db.commit()
    return campaign_out(c, _campaign_stats(db, owner).get(c.id))


@router.delete("/campaigns/{cid}", status_code=204)
def delete_campaign(cid: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    c = _own(db, Campaign, cid, owner, "Campaign")
    for cr in db.scalars(select(Creator).where(Creator.campaign_id == cid)).unique():
        cr.campaign_id = None
    db.delete(c)
    db.commit()


@router.get("/saved-searches")
def list_saved(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    return [saved_out(s) for s in db.scalars(select(SavedSearch).where(SavedSearch.owner_id == owner).order_by(SavedSearch.created_at.desc()))]


@router.post("/saved-searches", status_code=201)
def create_saved(body: SavedSearchIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    if body.schedule != "none":
        ent.require_feature(db, owner, "scheduled_discovery")
    delta = job_svc.SCHEDULE_DELTA.get(body.schedule)
    s = SavedSearch(owner_id=owner, name=body.name, params=body.params.model_dump(), schedule=body.schedule,
                    next_run_at=(datetime.now(timezone.utc) + delta) if delta else None)
    db.add(s)
    db.commit()
    return saved_out(s)


@router.patch("/saved-searches/{sid}")
def update_saved(sid: str, body: dict, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    s = _own(db, SavedSearch, sid, owner, "Saved search")
    if "schedule" in body and body["schedule"] in ("none", "hourly", "daily", "weekly"):
        if body["schedule"] != "none":
            ent.require_feature(db, owner, "scheduled_discovery")
        s.schedule = body["schedule"]
        delta = job_svc.SCHEDULE_DELTA.get(s.schedule)
        s.next_run_at = (datetime.now(timezone.utc) + delta) if delta else None
    if isinstance(body.get("name"), str) and body["name"].strip():
        s.name = body["name"].strip()[:160]
    db.commit()
    return saved_out(s)


@router.delete("/saved-searches/{sid}", status_code=204)
def delete_saved(sid: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    db.delete(_own(db, SavedSearch, sid, owner, "Saved search"))
    db.commit()


@router.post("/saved-searches/{sid}/run", status_code=201)
def run_saved(sid: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    from ..schemas import JobParams
    s = _own(db, SavedSearch, sid, owner, "Saved search")
    job = start_job(db, owner, JobParams.model_validate(s.params), s.id)
    s.last_run_at, s.last_job_id, s.run_count = datetime.now(timezone.utc), job.id, s.run_count + 1
    db.commit()
    return job_out(job)


@router.get("/views")
def list_views(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    return [view_out(v) for v in db.scalars(select(SavedView).where(SavedView.owner_id == owner).order_by(SavedView.created_at))]


@router.post("/views", status_code=201)
def create_view(body: SavedViewIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    v = SavedView(owner_id=owner, name=body.name, filters=body.filters)
    db.add(v)
    db.commit()
    return view_out(v)


@router.delete("/views/{vid}", status_code=204)
def delete_view(vid: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    db.delete(_own(db, SavedView, vid, owner, "View"))
    db.commit()

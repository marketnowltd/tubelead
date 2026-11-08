import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.orm import Session

from ..auth import get_owner
from ..db import get_db
from ..models import Campaign, ContactRoute, Creator
from ..schemas import BulkAction, CreatorPatch
from ..serializers import creator_out
from ..services import entitlements as ent

router = APIRouter(prefix="/api/creators", tags=["creators"])

SORTS = {
    "discovered_at": Creator.discovered_at, "subscribers": Creator.subscriber_count, "score": Creator.qualification_score,
    "engagement": Creator.engagement_rate, "title": Creator.title, "videos": Creator.video_count, "last_upload": Creator.last_upload_at,
}


def build_query(owner: str, q, niche, country, verification, activity, campaign_id, min_subs, max_subs, min_score,
                has_email, has_website, outreach, demo, job_id=None):
    conds = [Creator.owner_id == owner]
    if job_id:
        conds.append(Creator.job_id == job_id)
    if q:
        like = f"%{q.lower()}%"
        conds.append(or_(func.lower(Creator.title).like(like), func.lower(func.coalesce(Creator.handle, "")).like(like),
                         func.lower(Creator.niche).like(like)))
    if niche:
        conds.append(Creator.niche.in_(niche))
    if country:
        conds.append(Creator.country.in_([c.upper() for c in country]))
    if verification:
        conds.append(Creator.verification_status.in_(verification))
    if activity:
        conds.append(Creator.activity.in_(activity))
    if outreach:
        conds.append(Creator.outreach_status.in_(outreach))
    if campaign_id == "none":
        conds.append(Creator.campaign_id.is_(None))
    elif campaign_id:
        conds.append(Creator.campaign_id == campaign_id)
    if min_subs is not None:
        conds.append(Creator.subscriber_count >= min_subs)
    if max_subs is not None:
        conds.append(Creator.subscriber_count <= max_subs)
    if min_score is not None:
        conds.append(Creator.qualification_score >= min_score)
    email_exists = select(ContactRoute.id).where(ContactRoute.creator_id == Creator.id, ContactRoute.kind == "email").exists()
    if has_email is True:
        conds.append(email_exists)
    elif has_email is False:
        conds.append(~email_exists)
    if has_website is True:
        conds.append(Creator.website.is_not(None))
    elif has_website is False:
        conds.append(Creator.website.is_(None))
    if demo == "only":
        conds.append(Creator.is_demo.is_(True))
    elif demo == "hide":
        conds.append(Creator.is_demo.is_(False))
    return and_(*conds)


def filters(q: str | None = None, niche: list[str] = Query(default=[]), country: list[str] = Query(default=[]),
            verification: list[str] = Query(default=[]), activity: list[str] = Query(default=[]),
            outreach: list[str] = Query(default=[]), campaign_id: str | None = None,
            min_subs: int | None = None, max_subs: int | None = None, min_score: int | None = None,
            has_email: bool | None = None, has_website: bool | None = None, demo: str = "all", job_id: str | None = None):
    return dict(q=q, niche=niche, country=country, verification=verification, activity=activity, outreach=outreach,
                campaign_id=campaign_id, min_subs=min_subs, max_subs=max_subs, min_score=min_score,
                has_email=has_email, has_website=has_website, demo=demo, job_id=job_id)


@router.get("")
def list_creators(f: dict = Depends(filters), sort: str = "discovered_at", order: str = "desc", page: int = 1,
                  page_size: int = 25, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    where = build_query(owner, **f)
    col = SORTS.get(sort, Creator.discovered_at)
    ordering = col.desc().nulls_last() if order == "desc" else col.asc().nulls_last()
    page_size = max(1, min(page_size, 200))
    total = db.scalar(select(func.count()).select_from(Creator).where(where)) or 0
    rows = db.scalars(select(Creator).where(where).order_by(ordering, Creator.id).offset((max(page, 1) - 1) * page_size).limit(page_size)).unique().all()
    return {"items": [creator_out(c) for c in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/facets")
def facets(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    niches = db.execute(select(Creator.niche, func.count()).where(Creator.owner_id == owner).group_by(Creator.niche).order_by(func.count().desc())).all()
    countries = db.execute(select(Creator.country, func.count()).where(Creator.owner_id == owner, Creator.country.is_not(None)).group_by(Creator.country).order_by(func.count().desc())).all()
    return {"niches": [{"value": n, "count": c} for n, c in niches], "countries": [{"value": n, "count": c} for n, c in countries]}


def _safe(v):
    """Neutralise spreadsheet formula injection in exported text."""
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


@router.get("/export.csv")
def export_csv(f: dict = Depends(filters), ids: list[str] = Query(default=[]), owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    ent.require_feature(db, owner, "csv_export")
    where = build_query(owner, **f)
    stmt = select(Creator).where(where).order_by(Creator.qualification_score.desc())
    if ids:
        stmt = stmt.where(Creator.id.in_(ids))
    rows = db.scalars(stmt.limit(50_000)).unique().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["channel", "channel_url", "subscribers", "videos", "country", "niche", "engagement_pct", "activity", "public_email",
                "email_status", "website", "contact_page", "score", "verification", "campaign", "outreach", "discovered_at", "is_demo"])
    for c in rows:
        em = next((r for r in c.contacts if r.kind == "email"), None)
        w.writerow([_safe(x) for x in [c.title, c.channel_url, c.subscriber_count if c.subscriber_count is not None else "hidden", c.video_count,
                                        c.country, c.niche, c.engagement_rate, c.activity, em.value if em else "", em.status if em else "",
                                        c.website, c.contact_page, c.qualification_score, c.verification_status,
                                        c.campaign.name if c.campaign else "", c.outreach_status, c.discovered_at.isoformat(), c.is_demo]])
    buf.seek(0)
    name = f"tubelead-export-{datetime.now(timezone.utc):%Y%m%d-%H%M}.csv"
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.post("/bulk")
def bulk(body: BulkAction, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    rows = db.scalars(select(Creator).where(Creator.owner_id == owner, Creator.id.in_(body.ids))).unique().all()
    if body.action == "assign_campaign":
        camp = db.get(Campaign, body.campaign_id) if body.campaign_id else None
        if not camp or camp.owner_id != owner:
            raise HTTPException(404, "Campaign not found")
        for c in rows:
            c.campaign_id = camp.id
    elif body.action == "unassign_campaign":
        for c in rows:
            c.campaign_id = None
    elif body.action == "set_outreach":
        if not body.outreach_status:
            raise HTTPException(422, "outreach_status required")
        for c in rows:
            c.outreach_status = body.outreach_status
    elif body.action == "delete":
        for c in rows:
            db.delete(c)
    db.commit()
    return {"affected": len(rows)}


@router.get("/{creator_id}")
def get_creator(creator_id: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    c = db.get(Creator, creator_id)
    if not c or c.owner_id != owner:
        raise HTTPException(404, "Creator not found")
    return creator_out(c, detail=True)


@router.patch("/{creator_id}")
def patch_creator(creator_id: str, body: CreatorPatch, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    c = db.get(Creator, creator_id)
    if not c or c.owner_id != owner:
        raise HTTPException(404, "Creator not found")
    data = body.model_dump(exclude_unset=True)
    if "campaign_id" in data and data["campaign_id"]:
        camp = db.get(Campaign, data["campaign_id"])
        if not camp or camp.owner_id != owner:
            raise HTTPException(404, "Campaign not found")
    for k, v in data.items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return creator_out(c, detail=True)


@router.delete("/{creator_id}", status_code=204)
def delete_creator(creator_id: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    c = db.get(Creator, creator_id)
    if not c or c.owner_id != owner:
        raise HTTPException(404, "Creator not found")
    db.delete(c)
    db.commit()

import asyncio
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..auth import get_owner
from ..config import get_settings
from ..db import get_db
from ..models import ActivityEvent, ContactRoute, Creator
from ..schemas import ManualContact
from ..serializers import creator_out, route_out
from ..services import contacts as ct
from ..services import scoring

router = APIRouter(prefix="/api", tags=["contacts"])


@router.get("/contacts")
def list_contacts(kind: list[str] = Query(default=[]), status: list[str] = Query(default=[]), source: list[str] = Query(default=[]),
                  q: str | None = None, page: int = 1, page_size: int = 25, demo: str = "all",
                  owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    conds = [ContactRoute.owner_id == owner]
    if kind:
        conds.append(ContactRoute.kind.in_(kind))
    if status:
        conds.append(ContactRoute.status.in_(status))
    if source:
        conds.append(ContactRoute.source.in_(source))
    if demo == "hide":
        conds.append(ContactRoute.is_demo.is_(False))
    if q:
        like = f"%{q.lower()}%"
        conds.append(or_(func.lower(ContactRoute.value).like(like), ContactRoute.creator_id.in_(select(Creator.id).where(func.lower(Creator.title).like(like)))))
    page_size = max(1, min(page_size, 200))
    total = db.scalar(select(func.count()).select_from(ContactRoute).where(*conds)) or 0
    rows = db.scalars(select(ContactRoute).where(*conds).order_by(ContactRoute.discovered_at.desc()).offset((max(page, 1) - 1) * page_size).limit(page_size)).all()
    creators = {c.id: c for c in db.scalars(select(Creator).where(Creator.id.in_({r.creator_id for r in rows}))).unique()}
    summary = dict(db.execute(select(ContactRoute.status, func.count()).where(ContactRoute.owner_id == owner, ContactRoute.kind == "email").group_by(ContactRoute.status)).all())
    return {"items": [route_out(r, creators.get(r.creator_id)) for r in rows], "total": total, "page": page, "page_size": page_size,
            "email_summary": {"published": summary.get("published", 0), "unverified": summary.get("unverified", 0), "verified": summary.get("verified", 0)}}


@router.get("/contacts/status-summary")
def status_summary(demo: str = "all", owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    """How many creators sit in each (separate, honest) contact status. Each creator is counted once, under its strongest status."""
    from ..serializers import contact_state
    q = select(Creator).where(Creator.owner_id == owner)
    if demo == "hide":
        q = q.where(Creator.is_demo.is_(False))
    out = {k: 0 for k in ("deliverability_checked", "publicly_published", "unverified", "website", "contact_form", "none")}
    flags = {k: 0 for k in ("deliverability_checked", "publicly_published", "unverified", "website", "contact_form")}
    total = 0
    for c in db.scalars(q.limit(50_000)).unique():
        primary, fl = contact_state(c)
        out[primary] += 1
        total += 1
        for k, v in fl.items():
            flags[k] += 1 if v else 0
    return {"total": total, "primary": out, "any": flags}


def _owned_creator(db: Session, owner: str, cid: str) -> Creator:
    c = db.get(Creator, cid)
    if not c or c.owner_id != owner:
        raise HTTPException(404, "Creator not found")
    return c


@router.post("/creators/{creator_id}/contacts/scan")
def rescan(creator_id: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    """Re-scan the channel description and the creator's own public website for business contact routes."""
    c = _owned_creator(db, owner, creator_id)
    if c.is_demo:
        raise HTTPException(422, "Demonstration records are not scanned (their websites are fictional).")

    async def go():
        cands = ct.from_description(c.description or "")
        site = c.website or ct.pick_primary_site(cands)
        status, contact_page = "none", c.contact_page
        if site and get_settings().fetch_websites:
            f = ct.PageFetcher()
            try:
                status, cp, extra = await ct.scan_website(f, site)
            finally:
                await f.aclose()
            cands += extra
            contact_page = cp or contact_page
        return site, status, contact_page, ct.dedupe(cands)

    site, status, contact_page, cands = asyncio.run(go())
    have = {(r.kind, r.value.lower()) for r in c.contacts}
    added = 0
    for x in cands:
        if (x.kind, x.value.lower()) in have:
            continue
        c.contacts.append(ContactRoute(owner_id=owner, kind=x.kind, value=x.value, platform=x.platform, source=x.source, source_url=x.source_url,
                                       status="published" if x.kind == "email" else "unverified", confidence=round(x.confidence, 2), website_status=x.website_status))
        added += 1
    c.website, c.contact_page, c.website_status = site, contact_page, status
    c.verification_status = scoring.verification_from([{"kind": r.kind, "status": r.status} for r in c.contacts])
    db.add(ActivityEvent(owner_id=owner, kind="contacts", message=f"Contact scan for {c.title}: {added} new route(s), website {status}"))
    db.commit()
    return {"added": added, "website_status": status, "creator": creator_out(c, detail=True)}


EMAIL_OK = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[A-Za-z]{2,24}$")


@router.post("/creators/{creator_id}/contacts", status_code=201)
def add_manual(creator_id: str, body: ManualContact, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    c = _owned_creator(db, owner, creator_id)
    value = body.value.strip()
    if body.kind == "email" and not EMAIL_OK.match(value):
        raise HTTPException(422, "Invalid email address")
    if body.kind != "email" and not value.lower().startswith(("http://", "https://")):
        raise HTTPException(422, "URL must start with http:// or https://")
    if any(r.kind == body.kind and r.value.lower() == value.lower() for r in c.contacts):
        raise HTTPException(409, "This contact route already exists")
    r = ContactRoute(owner_id=owner, creator_id=c.id, kind=body.kind, value=value, source="manual", status="unverified", confidence=0.5, is_demo=c.is_demo)
    db.add(r)
    db.flush()
    db.refresh(c)
    c.verification_status = scoring.verification_from([{"kind": x.kind, "status": x.status} for x in c.contacts])
    db.commit()
    return route_out(r)


@router.post("/contacts/{route_id}/check")
def check_route(route_id: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    """DNS MX check on the email's domain. A passing result does NOT mark the address verified:
    deliverability needs a mailbox-level verification provider (not integrated)."""
    r = db.get(ContactRoute, route_id)
    if not r or r.owner_id != owner:
        raise HTTPException(404, "Route not found")
    if r.kind != "email":
        raise HTTPException(422, "Only email routes can be checked")
    r.mx_valid = ct.check_mx(r.value)
    r.checked_at = datetime.now(timezone.utc)
    db.commit()
    return route_out(r)


@router.delete("/contacts/{route_id}", status_code=204)
def delete_route(route_id: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    r = db.get(ContactRoute, route_id)
    if not r or r.owner_id != owner:
        raise HTTPException(404, "Route not found")
    c = db.get(Creator, r.creator_id)
    db.delete(r)
    db.flush()
    db.refresh(c)
    c.verification_status = scoring.verification_from([{"kind": x.kind, "status": x.status} for x in c.contacts])
    db.commit()

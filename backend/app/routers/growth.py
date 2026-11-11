"""Growth Assistant API. Sessions are resumable; discovery and enrichment run in the background and report real
progress, which the wizard polls."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_owner
from ..db import get_db
from ..models import GrowthSession, Prospect, ProspectContact, is_uuid
from ..services import credits, growth

router = APIRouter(prefix="/api/growth", tags=["growth"])
INLINE = False  # tests run background work inline


class DescribeIn(BaseModel):
    description: str = Field(min_length=10, max_length=1000)
    session_id: str | None = None


class BusinessIn(BaseModel):
    campaign_name: str = Field(default="", max_length=120)
    product: str = Field(default="", max_length=200)
    audience: str = Field(default="", max_length=200)
    industry: str = Field(default="", max_length=120)
    location: str = Field(default="", max_length=120)
    customer_type: str = Field(default="B2B", max_length=20)
    objective: str = Field(default="", max_length=200)
    opportunity: str = Field(default="", max_length=300)


class StepIn(BaseModel):
    step: int = Field(ge=1, le=5)


class ProspectPatch(BaseModel):
    selected: bool | None = None
    saved: bool | None = None
    removed: bool | None = None


class BulkSelect(BaseModel):
    ids: list[str] = Field(max_length=500)
    selected: bool


def _session(db: Session, sid: str, owner: str) -> GrowthSession:
    s = db.get(GrowthSession, sid) if is_uuid(sid) else None
    if not s or s.owner_id != owner:
        raise HTTPException(404, {"code": "not_found", "message": "Growth session not found."})
    return s


def session_out(s: GrowthSession, db: Session) -> dict:
    counts = {"total": 0, "selected": 0, "saved": 0}
    for p in db.scalars(select(Prospect).where(Prospect.session_id == s.id, Prospect.removed.is_(False))).all():
        counts["total"] += 1
        counts["selected"] += p.selected
        counts["saved"] += p.saved
    return {"id": s.id, "step": s.step, "description": s.description, "business": s.business, "discovery": s.discovery, "enrichment": s.enrichment,
            "document_id": s.document_id, "campaign_id": s.campaign_id, "prospects": counts, "updated_at": s.updated_at.isoformat() if s.updated_at else None}


@router.get("/sessions")
def sessions(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    rows = db.scalars(select(GrowthSession).where(GrowthSession.owner_id == owner).order_by(GrowthSession.updated_at.desc()).limit(20)).all()
    return [session_out(s, db) for s in rows]


@router.get("/sessions/current")
def current(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    s = db.scalar(select(GrowthSession).where(GrowthSession.owner_id == owner).order_by(GrowthSession.updated_at.desc()))
    return session_out(s, db) if s else None


@router.post("/describe")
async def describe(body: DescribeIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    """Step 1 (also used by the dashboard widget): save the description and propose an editable campaign summary."""
    text = body.description.strip()
    if len(text.split()) < 3:
        raise HTTPException(422, {"code": "too_short", "message": "Tell us a little more: what you sell and who you'd like to reach."})
    s = _session(db, body.session_id, owner) if body.session_id else GrowthSession(owner_id=owner)
    if not body.session_id:
        db.add(s)
    s.description = text
    s.business = await growth.interpret(db, owner, text)
    s.step = 1
    db.commit()
    return session_out(s, db)


@router.get("/sessions/{sid}")
def get_session(sid: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    return session_out(_session(db, sid, owner), db)


@router.put("/sessions/{sid}/business")
def update_business(sid: str, body: BusinessIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    s = _session(db, sid, owner)
    s.business = {**(s.business or {}), **{k: v.strip() for k, v in body.model_dump().items()}}
    db.commit()
    return session_out(s, db)


@router.put("/sessions/{sid}/step")
def set_step(sid: str, body: StepIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    s = _session(db, sid, owner)
    s.step = body.step
    db.commit()
    return session_out(s, db)


@router.post("/sessions/{sid}/discover", status_code=202)
def discover(sid: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    s = _session(db, sid, owner)
    if (s.discovery or {}).get("status") == "running":
        raise HTTPException(409, {"code": "running", "message": "Discovery is already running."})
    if not growth.search_query(s.business or {}):
        raise HTTPException(422, {"code": "no_audience", "message": "Add who you'd like to reach before searching."})
    credits.require(db, owner, "discovery")
    s.discovery = {"status": "queued", "stage": 0, "stages": growth.STAGES}
    s.step = max(s.step, 2)
    db.commit()
    growth.start_discovery(s.id, inline=INLINE)
    db.refresh(s)
    return session_out(s, db)


def prospect_out(p: Prospect, contacts: list[ProspectContact]) -> dict:
    br = {k: v for k, v in (p.score_breakdown or {}).items() if not k.startswith("_")}
    return {"id": p.id, "name": p.name, "website": p.website, "domain": p.domain, "platform": p.platform, "sources": p.sources, "source_url": p.source_url,
            "description": p.description, "industry": p.industry, "location": p.location, "image_url": p.image_url, "audience_size": p.audience_size,
            "score": p.score, "classification": p.classification, "breakdown": br, "contact_page": (p.score_breakdown or {}).get("_contact_page"),
            "selected": p.selected, "saved": p.saved, "enrichment_status": p.enrichment_status,
            "contacts": [{"email": c.email, "first_name": c.first_name, "last_name": c.last_name, "position": c.position, "status": c.status,
                          "personal": c.personal, "source": c.source, "source_url": c.source_url, "checked_at": c.checked_at.isoformat()} for c in contacts],
            "contact_status": min((c.status for c in contacts), key=lambda x: ["verified", "risky", "unverified"].index(x) if x in ("verified", "risky", "unverified") else 9) if contacts else ("not_found" if p.enrichment_status == "done" else None)}


@router.get("/sessions/{sid}/prospects")
def prospects(sid: str, filter: str = "all", sort: str = "score", owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    _session(db, sid, owner)
    stmt = select(Prospect).where(Prospect.session_id == sid, Prospect.owner_id == owner, Prospect.removed.is_(False))
    if filter in ("excellent", "good", "low"):
        stmt = stmt.where(Prospect.classification == filter)
    elif filter == "selected":
        stmt = stmt.where(Prospect.selected.is_(True))
    elif filter == "saved":
        stmt = stmt.where(Prospect.saved.is_(True))
    stmt = stmt.order_by(Prospect.name if sort == "name" else Prospect.score.desc()).limit(500)
    rows = db.scalars(stmt).all()
    contacts: dict[str, list] = {}
    if rows:
        for c in db.scalars(select(ProspectContact).where(ProspectContact.prospect_id.in_([p.id for p in rows]))).all():
            contacts.setdefault(c.prospect_id, []).append(c)
    return [prospect_out(p, contacts.get(p.id, [])) for p in rows]


def _prospect(db: Session, pid: str, owner: str) -> Prospect:
    p = db.get(Prospect, pid) if is_uuid(pid) else None
    if not p or p.owner_id != owner:
        raise HTTPException(404, {"code": "not_found", "message": "Prospect not found."})
    return p


@router.patch("/prospects/{pid}")
def update_prospect(pid: str, body: ProspectPatch, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    p = _prospect(db, pid, owner)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    if body.removed:
        p.selected = False
    db.commit()
    return prospect_out(p, db.scalars(select(ProspectContact).where(ProspectContact.prospect_id == p.id)).all())


@router.post("/sessions/{sid}/select")
def bulk_select(sid: str, body: BulkSelect, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    _session(db, sid, owner)
    ids = [i for i in body.ids if is_uuid(i)]
    if ids:
        for p in db.scalars(select(Prospect).where(Prospect.session_id == sid, Prospect.owner_id == owner, Prospect.id.in_(ids))).all():
            p.selected = body.selected and not p.removed
        db.commit()
    return {"ok": True}


@router.post("/sessions/{sid}/enrich", status_code=202)
def enrich(sid: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    s = _session(db, sid, owner)
    n = len(db.scalars(select(Prospect.id).where(Prospect.session_id == sid, Prospect.selected.is_(True), Prospect.removed.is_(False))).all())
    if not n:
        raise HTTPException(422, {"code": "nothing_selected", "message": "Select at least one prospect to enrich."})
    if n > 100:
        raise HTTPException(422, {"code": "too_many", "message": "Enrich up to 100 prospects at a time."})
    if (s.enrichment or {}).get("status") == "running":
        raise HTTPException(409, {"code": "running", "message": "Enrichment is already running."})
    s.enrichment = {"status": "queued", "done": 0, "total": n}
    s.step = max(s.step, 3)
    db.commit()
    growth.start_enrichment(s.id, inline=INLINE)
    db.refresh(s)
    return session_out(s, db)


@router.get("/credits")
def my_credits(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    return credits.summary(db, owner)

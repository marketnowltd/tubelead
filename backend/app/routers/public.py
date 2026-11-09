"""Public homepage data: approved reviews, a review form (moderated), and statistics computed from real records.
A number is only returned when the data behind it exists; otherwise the value is null and the page shows capabilities."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from ..auth import get_owner
from ..db import get_db
from ..models import ContactRoute, Creator, DiscoveryJob, Review
from ..services.entitlements import is_operator

router = APIRouter(prefix="/api", tags=["public"])
MIN_FOR_STATS = 20  # below this, a statistic would be too small to be meaningful, so it is not shown


class ReviewIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    company: str | None = Field(None, max_length=160)
    role: str | None = Field(None, max_length=120)
    rating: int = Field(ge=1, le=5)
    body: str = Field(min_length=20, max_length=1500)
    email: str | None = Field(None, max_length=255)

    @field_validator("name", "body")
    @classmethod
    def _no_html(cls, v: str) -> str:
        if "<" in v or ">" in v:
            raise ValueError("Please remove HTML characters")
        return v.strip()


def review_out(r: Review) -> dict:
    return {"id": r.id, "name": r.name, "company": r.company, "role": r.role, "rating": r.rating, "body": r.body,
            "verified": r.verified, "photo_url": r.photo_url, "date": (r.approved_at or r.created_at).date().isoformat()}


@router.get("/public/reviews")
def approved_reviews(db: Session = Depends(get_db)):
    rows = db.scalars(select(Review).where(Review.status == "approved").order_by(Review.approved_at.desc()).limit(50)).all()
    avg = db.scalar(select(func.avg(Review.rating)).where(Review.status == "approved"))
    return {"reviews": [review_out(r) for r in rows], "count": len(rows), "average_rating": round(float(avg), 1) if avg and len(rows) >= 3 else None}


@router.post("/public/reviews", status_code=201)
def submit_review(body: ReviewIn, db: Session = Depends(get_db)):
    """Anyone can suggest a review. It stays private until an operator approves it."""
    r = Review(name=body.name, company=body.company, role=body.role, rating=body.rating, body=body.body, email=body.email)
    db.add(r)
    db.commit()
    return {"ok": True, "message": "Thank you. Your review will appear once it has been checked."}


@router.get("/public/stats")
def public_stats(db: Session = Depends(get_db)):
    """Every figure is counted from stored records (demo data excluded). Null means not enough data yet."""
    creators = db.scalar(select(func.count()).select_from(Creator).where(Creator.is_demo.is_(False))) or 0
    countries = db.scalar(select(func.count(distinct(Creator.country))).where(Creator.is_demo.is_(False), Creator.country.is_not(None))) or 0
    with_email = db.scalar(select(func.count(distinct(ContactRoute.creator_id))).join(Creator, Creator.id == ContactRoute.creator_id)
                           .where(ContactRoute.kind == "email", Creator.is_demo.is_(False))) or 0
    enriched = db.scalar(select(func.coalesce(func.sum(DiscoveryJob.enriched), 0)).where(DiscoveryJob.is_demo.is_(False))) or 0
    finished = db.execute(select(DiscoveryJob.status, func.count()).where(DiscoveryJob.is_demo.is_(False),
                          DiscoveryJob.status.in_(["completed", "failed"])).group_by(DiscoveryJob.status)).all()
    done = dict(finished)
    total_finished = sum(done.values())
    success = round(100 * done.get("completed", 0) / total_finished, 1) if total_finished >= MIN_FOR_STATS else None

    def gate(n: int):
        return n if n >= MIN_FOR_STATS else None

    return {
        "businesses_discovered": gate(creators),
        "countries_covered": countries if countries > 0 else None,  # a count of distinct countries is shown as soon as there is one
        "creators_with_public_email": gate(with_email),
        "leads_enriched": gate(int(enriched)),
        "search_success_rate": success,
        "search_sources": 1,  # YouTube Data API v3 is the only source today
        "as_of": datetime.now(timezone.utc).isoformat(),
    }


# ---------------- operator moderation ----------------
def _operator(owner: str = Depends(get_owner)) -> str:
    if not is_operator(owner):
        raise HTTPException(403, "Operator access only")
    return owner


@router.get("/admin/reviews")
def list_for_moderation(status: str = "pending", _: str = Depends(_operator), db: Session = Depends(get_db)):
    rows = db.scalars(select(Review).where(Review.status == status).order_by(Review.created_at.desc()).limit(200)).all()
    return [{**review_out(r), "status": r.status, "email": r.email, "created_at": r.created_at.isoformat()} for r in rows]


class ModerationIn(BaseModel):
    status: str = Field(pattern="^(approved|rejected|pending)$")
    verified: bool = False


@router.patch("/admin/reviews/{rid}")
def moderate(rid: str, body: ModerationIn, _: str = Depends(_operator), db: Session = Depends(get_db)):
    r = db.get(Review, rid)
    if not r:
        raise HTTPException(404, "Review not found")
    r.status = body.status
    r.verified = body.verified if body.status == "approved" else False
    r.approved_at = datetime.now(timezone.utc) if body.status == "approved" else None
    db.commit()
    return review_out(r)

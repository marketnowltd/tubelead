"""YouTube Data API quota ledger (units per UTC day, per owner)."""
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import QuotaUsage


def today() -> date:
    return datetime.now(timezone.utc).date()


def used_today(db: Session, owner_id: str) -> int:
    row = db.scalar(select(QuotaUsage).where(QuotaUsage.owner_id == owner_id, QuotaUsage.day == today()))
    return row.units if row else 0


def add_usage(db: Session, owner_id: str, units: int) -> int:
    row = db.scalar(select(QuotaUsage).where(QuotaUsage.owner_id == owner_id, QuotaUsage.day == today()))
    if not row:
        row = QuotaUsage(owner_id=owner_id, day=today(), units=0)
        db.add(row)
    row.units += units
    db.commit()
    return row.units

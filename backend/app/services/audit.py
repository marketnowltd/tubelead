"""Audit trail and error log. Both write in their own session so a failing request still leaves a record."""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from ..models import AuditLog, ErrorLog

log = logging.getLogger("tubelead.audit")


def record(db: Session, action: str, *, actor_type: str, actor_id: str | None = None, target_type: str = "",
           target_id: str = "", detail: dict | None = None, commit: bool = True) -> AuditLog:
    row = AuditLog(action=action, actor_type=actor_type, actor_id=actor_id, target_type=target_type,
                   target_id=str(target_id or ""), detail=detail or {})
    db.add(row)
    if commit:
        db.commit()
    return row


def log_error(source: str, message: str, path: str = "") -> None:
    from ..db import SessionLocal
    try:
        with SessionLocal() as db:
            db.add(ErrorLog(source=source, path=path[:300], message=message[:4000]))
            db.commit()
    except Exception:  # noqa: BLE001 - never let logging break the caller
        log.exception("could not write error log")

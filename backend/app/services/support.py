"""Support tickets and refund requests. Creating a ticket never changes billing or account state."""
from __future__ import annotations

import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import ChatConversation, Payment, RefundRequest, SupportTicket, TicketMessage, UserAccount
from . import email as mail
from .audit import record

CATEGORIES = ("general", "technical", "billing", "refund", "cancellation", "account")
FINANCIAL = {"billing", "refund", "cancellation", "account"}
STATUSES = ("open", "in_progress", "waiting_customer", "resolved", "closed")
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I


def new_ref(db: Session) -> str:
    while True:
        ref = "TL-" + "".join(secrets.choice(_ALPHABET) for _ in range(6))
        if not db.scalar(select(SupportTicket.id).where(SupportTicket.ref == ref)):
            return ref


def create_ticket(db: Session, *, owner: str | None, category: str, subject: str, description: str, source: str,
                  email: str = "", name: str = "", conversation_id: str | None = None) -> SupportTicket:
    if category not in CATEGORIES:
        category = "general"
    if owner and (not email or not name):
        acc = db.get(UserAccount, owner)
        if acc:
            email = email or acc.email
            name = name or acc.full_name
    t = SupportTicket(ref=new_ref(db), owner_id=owner, email=email.strip(), name=name.strip()[:160], category=category,
                      subject=subject.strip()[:200] or "Support request", description=description.strip()[:5000], source=source,
                      conversation_id=conversation_id)
    db.add(t)
    db.flush()
    db.add(TicketMessage(ticket_id=t.id, author_type="customer", author_id=owner, body=t.description))
    if category == "refund":
        latest = db.scalar(select(Payment).where(Payment.owner_id == owner).order_by(Payment.created_at.desc())) if owner else None
        db.add(RefundRequest(ticket_id=t.id, owner_id=owner, reason=t.description, payment_id=latest.id if latest else None))
    if conversation_id:
        conv = db.get(ChatConversation, conversation_id)
        if conv:
            conv.escalated, conv.status = True, "escalated"
    db.commit()
    record(db, "ticket.created", actor_type="chatbot" if source == "chatbot" else ("staff" if source == "admin" else "customer"),
           actor_id=owner, target_type="ticket", target_id=t.ref, detail={"category": category, "source": source})
    mail.queue(db, to=t.email, template="ticket_confirmation", ctx={"name": t.name, "ref": t.ref, "subject": t.subject, "financial": category in FINANCIAL},
               dedupe_key=f"ticket_confirmation:{t.id}")
    mail.alert_admin(db, f"New {category} request {t.ref}", [f"Subject: {t.subject}", f"From: {t.email or 'signed-in user'}", f"Source: {source}"], f"ticket:{t.id}")
    return t

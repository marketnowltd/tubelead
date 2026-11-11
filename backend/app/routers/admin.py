"""Private administration API. Every route requires a staff role (see services/accounts.py):
support  -> tickets, conversations, help articles (read), overview
admin    -> everything above + customers, subscriptions, refund decisions and execution, help-article editing, system
operator -> everything + changing staff roles
Every change is written to the audit log. The support assistant has no route into this module."""
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import (AuditLog, ChatConversation, ChatMessage, DiscoveryJob, EmailOutbox, ErrorLog, KnowledgeArticle, Payment,
                      RefundRequest, Subscription, SupportTicket, TicketMessage, UserAccount)
from ..services import email as mail
from ..services import support
from ..services.accounts import LEVEL, require_role, role_of
from ..services.audit import record
from ..services.plans import all_plans

router = APIRouter(prefix="/api/admin", tags=["admin"])
SUPPORT = require_role("support")
ADMIN = require_role("admin")
OPERATOR = require_role("operator")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(d: datetime | None) -> str | None:
    return d.isoformat() if d else None


def _integrations() -> list[dict]:
    s = get_settings()
    return [
        {"name": "Database", "configured": True, "detail": "Connected"},
        {"name": "Supabase sign-in", "configured": s.auth_mode != "dev" and bool(s.supabase_url), "detail": "SUPABASE_URL"},
        {"name": "Stripe payments", "configured": bool(s.stripe_secret_key), "detail": "STRIPE_SECRET_KEY"},
        {"name": "Stripe webhooks", "configured": bool(s.stripe_webhook_secret), "detail": "STRIPE_WEBHOOK_SECRET"},
        {"name": "Support assistant (OpenAI)", "configured": bool(s.openai_api_key), "detail": "OPENAI_API_KEY (without it the assistant answers from help articles only)"},
        {"name": "Email (Resend)", "configured": bool(s.resend_api_key), "detail": "RESEND_API_KEY and EMAIL_FROM"},
        {"name": "Admin alerts", "configured": bool(s.admin_alert_email), "detail": "ADMIN_ALERT_EMAIL"},
        {"name": "Account deletion (sign-in record)", "configured": bool(s.supabase_service_role_key), "detail": "SUPABASE_SERVICE_ROLE_KEY"},
        {"name": "YouTube Data API", "configured": bool(s.youtube_api_key), "detail": "YOUTUBE_API_KEY"},
    ]


# ---------------- overview ----------------
@router.get("/overview")
def overview(me: str = Depends(SUPPORT), db: Session = Depends(get_db)):
    now = _now()
    count = lambda q: db.scalar(q) or 0  # noqa: E731
    plans = all_plans()
    mrr = 0.0
    for sub in db.scalars(select(Subscription).where(Subscription.status.in_(["active", "trialing", "past_due"]))).all():
        p = plans.get(sub.plan) or {}
        mrr += (p.get("price_annual_gbp", 0) / 12) if sub.interval == "annual" else p.get("price_monthly_gbp", 0)
    revenue = count(select(func.coalesce(func.sum(Payment.amount - Payment.refunded_amount), 0)))
    recent = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(15)).all()
    alerts = []
    errors = count(select(func.count()).select_from(ErrorLog).where(ErrorLog.created_at >= now - timedelta(hours=24)))
    if errors:
        alerts.append({"level": "error", "message": f"{errors} server error(s) in the last 24 hours"})
    failed = count(select(func.count()).select_from(EmailOutbox).where(EmailOutbox.status == "failed"))
    if failed:
        alerts.append({"level": "warning", "message": f"{failed} email(s) failed to send"})
    for i in _integrations():
        if not i["configured"] and i["name"] in ("Stripe payments", "Stripe webhooks", "Email (Resend)", "Support assistant (OpenAI)"):
            alerts.append({"level": "info", "message": f"{i['name']} is not configured ({i['detail']})"})
    return {
        "role": role_of(db, me),
        "users_total": count(select(func.count()).select_from(UserAccount)),
        "users_active_30d": count(select(func.count()).select_from(UserAccount).where(UserAccount.last_login_at >= now - timedelta(days=30))),
        "users_new_7d": count(select(func.count()).select_from(UserAccount).where(UserAccount.created_at >= now - timedelta(days=7))),
        "subscriptions_active": count(select(func.count()).select_from(Subscription).where(Subscription.status.in_(["active", "trialing"]))),
        "mrr_gbp": round(mrr, 2), "revenue_total_gbp": round(revenue / 100, 2),
        "tickets_open": count(select(func.count()).select_from(SupportTicket).where(SupportTicket.status.in_(["open", "in_progress", "waiting_customer"]))),
        "refunds_pending": count(select(func.count()).select_from(RefundRequest).where(RefundRequest.status == "pending")),
        "alerts": alerts,
        "recent_activity": [_audit_out(a) for a in recent],
    }


def _audit_out(a: AuditLog) -> dict:
    return {"id": a.id, "action": a.action, "actor_type": a.actor_type, "actor_id": a.actor_id, "target_type": a.target_type,
            "target_id": a.target_id, "detail": a.detail, "created_at": _iso(a.created_at)}


# ---------------- customers ----------------
class StatusIn(BaseModel):
    status: str = Field(pattern="^(active|suspended)$")
    reason: str = Field(default="", max_length=500)


class RoleIn(BaseModel):
    role: str = Field(pattern="^(customer|support|admin)$")


def _customer_row(db: Session, a: UserAccount) -> dict:
    sub = db.get(Subscription, a.owner_id)
    return {"id": a.owner_id, "email": a.email, "full_name": a.full_name, "status": a.status, "role": role_of(db, a.owner_id),
            "plan": sub.plan if sub else "free", "subscription_status": sub.status if sub else "none",
            "created_at": _iso(a.created_at), "last_login_at": _iso(a.last_login_at)}


@router.get("/customers")
def customers(q: str = "", status: str = "", me: str = Depends(ADMIN), db: Session = Depends(get_db)):
    stmt = select(UserAccount).order_by(UserAccount.created_at.desc()).limit(200)
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(UserAccount.email.ilike(like), UserAccount.full_name.ilike(like), UserAccount.owner_id == q.strip()))
    if status in ("active", "suspended"):
        stmt = stmt.where(UserAccount.status == status)
    return [_customer_row(db, a) for a in db.scalars(stmt).all()]


def _account(db: Session, cid: str) -> UserAccount:
    a = db.get(UserAccount, cid)
    if not a:
        raise HTTPException(404, {"code": "not_found", "message": "Customer not found."})
    return a


@router.get("/customers/{cid}")
def customer(cid: str, me: str = Depends(ADMIN), db: Session = Depends(get_db)):
    a = _account(db, cid)
    sub = db.get(Subscription, cid)
    pays = db.scalars(select(Payment).where(Payment.owner_id == cid).order_by(Payment.created_at.desc()).limit(24)).all()
    tickets = db.scalars(select(SupportTicket).where(SupportTicket.owner_id == cid).order_by(SupportTicket.created_at.desc()).limit(50)).all()
    activity = db.scalars(select(AuditLog).where(or_(AuditLog.actor_id == cid, AuditLog.target_id == cid)).order_by(AuditLog.created_at.desc()).limit(40)).all()
    return {**_customer_row(db, a), "status_reason": a.status_reason,
            "subscription": _sub_out(db, sub) if sub else None,
            "payments": [_pay_out(p) for p in pays],
            "tickets": [{"ref": t.ref, "subject": t.subject, "category": t.category, "status": t.status, "created_at": _iso(t.created_at)} for t in tickets],
            "activity": [_audit_out(x) for x in activity]}


@router.post("/customers/{cid}/status")
def set_status(cid: str, body: StatusIn, background: BackgroundTasks, me: str = Depends(ADMIN), db: Session = Depends(get_db)):
    a = _account(db, cid)
    if role_of(db, cid) == "operator":
        raise HTTPException(409, {"code": "operator", "message": "The site owner cannot be suspended."})
    if cid == me:
        raise HTTPException(409, {"code": "self", "message": "You cannot change your own status."})
    if a.status == body.status:
        return _customer_row(db, a)
    a.status, a.status_reason = body.status, body.reason.strip()
    db.commit()
    record(db, f"account.{'suspended' if body.status == 'suspended' else 'reactivated'}", actor_type="staff", actor_id=me,
           target_type="account", target_id=cid, detail={"reason": body.reason.strip()})
    msg = ("Your TubeLead account has been suspended." + (f" Reason: {body.reason.strip()}" if body.reason.strip() else "") + " Reply to this email if you think this is a mistake."
           if body.status == "suspended" else "Your TubeLead account has been reactivated. You can sign in again.")
    mail.queue(db, to=a.email, template="account_status", ctx={"name": a.full_name, "message": msg}, dedupe_key=f"account_status:{cid}:{body.status}:{int(_now().timestamp())}")
    background.add_task(mail.deliver_pending)
    return _customer_row(db, a)


@router.patch("/customers/{cid}/role")
def set_role(cid: str, body: RoleIn, me: str = Depends(OPERATOR), db: Session = Depends(get_db)):
    a = _account(db, cid)
    if role_of(db, cid) == "operator":
        raise HTTPException(409, {"code": "operator", "message": "Operator access is set on the server (OPERATOR_USER_IDS)."})
    old = a.role
    a.role = body.role
    db.commit()
    record(db, "account.role_changed", actor_type="staff", actor_id=me, target_type="account", target_id=cid, detail={"from": old, "to": body.role})
    return _customer_row(db, a)


# ---------------- subscriptions & payments ----------------
def _stripe_link(kind: str, sid: str | None) -> str | None:
    if not sid:
        return None
    test = get_settings().stripe_secret_key.startswith("sk_test")
    return f"https://dashboard.stripe.com/{'test/' if test else ''}{kind}/{sid}"


def _sub_out(db: Session, s: Subscription) -> dict:
    a = db.get(UserAccount, s.owner_id)
    return {"owner_id": s.owner_id, "email": a.email if a else "", "plan": s.plan, "interval": s.interval, "status": s.status,
            "cancel_at_period_end": s.cancel_at_period_end, "renewal_date": _iso(s.current_period_end), "last_payment_status": s.last_payment_status,
            "stripe_customer_id": s.stripe_customer_id, "stripe_subscription_id": s.stripe_subscription_id,
            "stripe_customer_url": _stripe_link("customers", s.stripe_customer_id)}


def _pay_out(p: Payment) -> dict:
    return {"id": p.id, "amount": p.amount, "currency": p.currency, "refunded_amount": p.refunded_amount, "created_at": _iso(p.created_at),
            "payment_intent_id": p.payment_intent_id, "charge_id": p.charge_id, "stripe_url": _stripe_link("invoices", p.id)}


@router.get("/subscriptions")
def subscriptions(status: str = "", me: str = Depends(ADMIN), db: Session = Depends(get_db)):
    stmt = select(Subscription).where(Subscription.status != "none").order_by(Subscription.updated_at.desc()).limit(300)
    if status:
        stmt = stmt.where(Subscription.status == status)
    return [_sub_out(db, s) for s in db.scalars(stmt).all()]


# ---------------- tickets ----------------
class TicketCreate(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    name: str = Field(default="", max_length=160)
    owner_id: str | None = None
    category: str = "general"
    subject: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=3, max_length=5000)


class TicketPatch(BaseModel):
    status: str | None = None
    assigned_to: str | None = None
    resolution: str | None = Field(default=None, max_length=5000)


class StaffReply(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    status: str | None = None


def _ticket(db: Session, ref: str) -> SupportTicket:
    t = db.scalar(select(SupportTicket).where(SupportTicket.ref == ref.upper()))
    if not t:
        raise HTTPException(404, {"code": "not_found", "message": "Ticket not found."})
    return t


def _ticket_out(db: Session, t: SupportTicket, full: bool = False) -> dict:
    d = {"ref": t.ref, "category": t.category, "subject": t.subject, "status": t.status, "email": t.email, "name": t.name,
         "owner_id": t.owner_id, "assigned_to": t.assigned_to, "source": t.source, "created_at": _iso(t.created_at),
         "updated_at": _iso(t.updated_at), "resolved_at": _iso(t.resolved_at), "resolution": t.resolution}
    if full:
        d["description"] = t.description
        d["conversation_id"] = t.conversation_id
        d["messages"] = [{"author": m.author_type, "author_id": m.author_id, "body": m.body, "created_at": _iso(m.created_at)}
                         for m in db.scalars(select(TicketMessage).where(TicketMessage.ticket_id == t.id).order_by(TicketMessage.created_at)).all()]
        rr = db.scalar(select(RefundRequest).where(RefundRequest.ticket_id == t.id))
        d["refund_request"] = _refund_out(db, rr) if rr else None
    return d


@router.get("/tickets")
def tickets(status: str = "", category: str = "", mine: bool = False, q: str = "", me: str = Depends(SUPPORT), db: Session = Depends(get_db)):
    stmt = select(SupportTicket).order_by(SupportTicket.created_at.desc()).limit(300)
    if status == "active":
        stmt = stmt.where(SupportTicket.status.in_(["open", "in_progress", "waiting_customer"]))
    elif status:
        stmt = stmt.where(SupportTicket.status == status)
    if category:
        stmt = stmt.where(SupportTicket.category == category)
    if mine:
        stmt = stmt.where(SupportTicket.assigned_to == me)
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(SupportTicket.ref.ilike(like), SupportTicket.email.ilike(like), SupportTicket.subject.ilike(like)))
    return [_ticket_out(db, t) for t in db.scalars(stmt).all()]


@router.get("/tickets/{ref}")
def ticket(ref: str, me: str = Depends(SUPPORT), db: Session = Depends(get_db)):
    return _ticket_out(db, _ticket(db, ref), full=True)


@router.post("/tickets", status_code=201)
def create_ticket(body: TicketCreate, background: BackgroundTasks, me: str = Depends(SUPPORT), db: Session = Depends(get_db)):
    t = support.create_ticket(db, owner=body.owner_id, email=body.email, name=body.name, category=body.category,
                              subject=body.subject, description=body.description, source="admin")
    background.add_task(mail.deliver_pending)
    return _ticket_out(db, t, full=True)


@router.patch("/tickets/{ref}")
def update_ticket(ref: str, body: TicketPatch, me: str = Depends(SUPPORT), db: Session = Depends(get_db)):
    t = _ticket(db, ref)
    changes = {}
    if body.status is not None:
        if body.status not in support.STATUSES:
            raise HTTPException(422, {"code": "bad_status", "message": "Unknown status."})
        changes["status"] = [t.status, body.status]
        t.status = body.status
        t.resolved_at = _now() if body.status in ("resolved", "closed") else None
    if body.assigned_to is not None:
        if body.assigned_to and LEVEL[role_of(db, body.assigned_to)] < LEVEL["support"]:
            raise HTTPException(422, {"code": "not_staff", "message": "Tickets can only be assigned to support staff."})
        changes["assigned_to"] = [t.assigned_to, body.assigned_to or None]
        t.assigned_to = body.assigned_to or None
    if body.resolution is not None:
        t.resolution = body.resolution.strip()
        changes["resolution"] = True
    db.commit()
    record(db, "ticket.updated", actor_type="staff", actor_id=me, target_type="ticket", target_id=t.ref, detail=changes)
    return _ticket_out(db, t, full=True)


@router.post("/tickets/{ref}/reply")
def staff_reply(ref: str, body: StaffReply, background: BackgroundTasks, me: str = Depends(SUPPORT), db: Session = Depends(get_db)):
    t = _ticket(db, ref)
    m = TicketMessage(ticket_id=t.id, author_type="staff", author_id=me, body=body.body.strip())
    db.add(m)
    t.status = body.status if body.status in support.STATUSES else "waiting_customer"
    if t.status in ("resolved", "closed"):
        t.resolved_at = _now()
    db.commit()
    record(db, "ticket.replied", actor_type="staff", actor_id=me, target_type="ticket", target_id=t.ref, detail={"status": t.status})
    mail.queue(db, to=t.email, template="ticket_update", ctx={"name": t.name, "ref": t.ref, "message": m.body, "status": t.status}, dedupe_key=f"ticket_update:{m.id}")
    background.add_task(mail.deliver_pending)
    return _ticket_out(db, t, full=True)


@router.get("/staff")
def staff(me: str = Depends(SUPPORT), db: Session = Depends(get_db)):
    rows = db.scalars(select(UserAccount).where(UserAccount.role.in_(["support", "admin"]))).all()
    out = [{"id": a.owner_id, "email": a.email, "role": a.role} for a in rows]
    if not any(x["id"] == me for x in out):
        a = db.get(UserAccount, me)
        out.insert(0, {"id": me, "email": a.email if a else "", "role": role_of(db, me)})
    return out


# ---------------- refund requests ----------------
class DecisionIn(BaseModel):
    decision: str = Field(pattern="^(approved|rejected)$")
    note: str = Field(default="", max_length=2000)


class ExecuteIn(BaseModel):
    confirm: str = Field(description="Must equal 'REFUND <ticket reference>'")
    amount: int | None = Field(default=None, gt=0, description="Minor units (pence). Omit for a full refund of the payment.")


def _refund_out(db: Session, r: RefundRequest) -> dict:
    t = db.get(SupportTicket, r.ticket_id)
    pay = db.get(Payment, r.payment_id) if r.payment_id else None
    return {"id": r.id, "ticket_ref": t.ref if t else None, "email": t.email if t else "", "owner_id": r.owner_id, "reason": r.reason,
            "status": r.status, "decided_by": r.decided_by, "decided_at": _iso(r.decided_at), "decision_note": r.decision_note,
            "payment": _pay_out(pay) if pay else None, "refund_id": r.refund_id, "refund_amount": r.refund_amount, "created_at": _iso(r.created_at)}


def _refund(db: Session, rid: str) -> RefundRequest:
    r = db.get(RefundRequest, rid)
    if not r:
        raise HTTPException(404, {"code": "not_found", "message": "Refund request not found."})
    return r


@router.get("/refunds")
def refunds(status: str = "", me: str = Depends(ADMIN), db: Session = Depends(get_db)):
    stmt = select(RefundRequest).order_by(RefundRequest.created_at.desc()).limit(300)
    if status:
        stmt = stmt.where(RefundRequest.status == status)
    out = []
    for r in db.scalars(stmt).all():
        d = _refund_out(db, r)
        if r.owner_id:
            d["payments"] = [_pay_out(p) for p in db.scalars(select(Payment).where(Payment.owner_id == r.owner_id).order_by(Payment.created_at.desc()).limit(12)).all()]
        out.append(d)
    return out


@router.post("/refunds/{rid}/decision")
def decide(rid: str, body: DecisionIn, background: BackgroundTasks, me: str = Depends(ADMIN), db: Session = Depends(get_db)):
    r = _refund(db, rid)
    if r.status not in ("pending",):
        raise HTTPException(409, {"code": "already_decided", "message": f"This request is already {r.status}."})
    r.status, r.decided_by, r.decided_at, r.decision_note = body.decision, me, _now(), body.note.strip()
    t = db.get(SupportTicket, r.ticket_id)
    if t:
        db.add(TicketMessage(ticket_id=t.id, author_type="staff", author_id=me, body=f"Refund request {body.decision}." + (f" {body.note.strip()}" if body.note.strip() else "")))
        t.status = "in_progress" if body.decision == "approved" else "resolved"
    db.commit()
    record(db, f"refund.{body.decision}", actor_type="staff", actor_id=me, target_type="refund_request", target_id=r.id, detail={"note": body.note.strip(), "ticket": t.ref if t else None})
    if t:
        mail.queue(db, to=t.email, template="refund_decision", ctx={"name": t.name, "ref": t.ref, "decision": body.decision, "note": body.note.strip()}, dedupe_key=f"refund_decision:{r.id}")
        background.add_task(mail.deliver_pending)
    return _refund_out(db, r)


@router.post("/refunds/{rid}/execute")
async def execute_refund(rid: str, body: ExecuteIn, background: BackgroundTasks, me: str = Depends(ADMIN), db: Session = Depends(get_db)):
    """Issue the refund in Stripe. Requires: admin role, an approved request, a linked payment and a typed confirmation."""
    r = _refund(db, rid)
    t = db.get(SupportTicket, r.ticket_id)
    if r.status != "approved":
        raise HTTPException(409, {"code": "not_approved", "message": "Approve the request before issuing a refund."})
    if not t or body.confirm.strip().upper() != f"REFUND {t.ref}":
        raise HTTPException(422, {"code": "confirm_required", "message": f"Type REFUND {t.ref if t else ''} to confirm."})
    pay = db.get(Payment, r.payment_id) if r.payment_id else None
    if not pay or not (pay.payment_intent_id or pay.charge_id):
        raise HTTPException(409, {"code": "no_payment", "message": "No Stripe payment is linked to this request. Refund it in the Stripe dashboard instead."})
    remaining = pay.amount - pay.refunded_amount
    amount = body.amount or remaining
    if amount > remaining or amount <= 0:
        raise HTTPException(422, {"code": "bad_amount", "message": f"The most you can refund is {remaining / 100:.2f} {pay.currency.upper()}."})
    s = get_settings()
    if not s.stripe_secret_key:
        raise HTTPException(503, {"code": "stripe_not_configured", "message": "Stripe is not configured."})
    data = {"amount": str(amount), "metadata[refund_request_id]": r.id, "metadata[ticket]": t.ref, "metadata[approved_by]": me}
    data["payment_intent" if pay.payment_intent_id else "charge"] = pay.payment_intent_id or pay.charge_id
    record(db, "refund.execute_attempt", actor_type="staff", actor_id=me, target_type="refund_request", target_id=r.id, detail={"amount": amount, "payment": pay.id})
    try:
        async with httpx.AsyncClient(timeout=20, base_url=s.stripe_api_base) as c:
            resp = await c.post("/v1/refunds", data=data, headers={"Authorization": f"Bearer {s.stripe_secret_key}", "Idempotency-Key": f"tubelead-refund-{r.id}"})
    except httpx.HTTPError as exc:
        raise HTTPException(502, {"code": "stripe_unreachable", "message": f"Could not reach Stripe: {type(exc).__name__}"}) from exc
    if resp.status_code >= 400:
        msg = (resp.json().get("error") or {}).get("message", "") if resp.headers.get("content-type", "").startswith("application/json") else resp.text[:200]
        record(db, "refund.execute_failed", actor_type="staff", actor_id=me, target_type="refund_request", target_id=r.id, detail={"stripe": msg[:300]})
        raise HTTPException(502, {"code": "stripe_error", "message": f"Stripe: {msg}"})
    refund = resp.json()
    r.status, r.refund_id, r.refund_amount = "refunded", refund.get("id"), amount
    pay.refunded_amount += amount
    t.status, t.resolved_at = "resolved", _now()
    db.add(TicketMessage(ticket_id=t.id, author_type="staff", author_id=me, body=f"Refund of {amount / 100:.2f} {pay.currency.upper()} issued."))
    db.commit()
    record(db, "refund.executed", actor_type="staff", actor_id=me, target_type="refund_request", target_id=r.id, detail={"amount": amount, "stripe_refund": refund.get("id")})
    mail.queue(db, to=t.email, template="refund_issued", ctx={"name": t.name, "ref": t.ref, "amount": f"{amount / 100:.2f} {pay.currency.upper()}"}, dedupe_key=f"refund_issued:{r.id}")
    background.add_task(mail.deliver_pending)
    return _refund_out(db, r)


# ---------------- knowledge base ----------------
class ArticleIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    category: str = Field(default="faq", pattern="^(company|product|pricing|faq|policy|tutorial|support)$")
    body: str = Field(min_length=10, max_length=20000)
    published: bool = True


def _art_out(a: KnowledgeArticle) -> dict:
    return {"id": a.id, "title": a.title, "category": a.category, "body": a.body, "published": a.published, "updated_at": _iso(a.updated_at)}


@router.get("/knowledge")
def knowledge(me: str = Depends(SUPPORT), db: Session = Depends(get_db)):
    return [_art_out(a) for a in db.scalars(select(KnowledgeArticle).order_by(KnowledgeArticle.category, KnowledgeArticle.title)).all()]


@router.post("/knowledge", status_code=201)
def create_article(body: ArticleIn, me: str = Depends(ADMIN), db: Session = Depends(get_db)):
    a = KnowledgeArticle(**body.model_dump())
    db.add(a)
    db.commit()
    record(db, "knowledge.created", actor_type="staff", actor_id=me, target_type="article", target_id=a.id, detail={"title": a.title})
    return _art_out(a)


@router.put("/knowledge/{aid}")
def update_article(aid: str, body: ArticleIn, me: str = Depends(ADMIN), db: Session = Depends(get_db)):
    a = db.get(KnowledgeArticle, aid)
    if not a:
        raise HTTPException(404, {"code": "not_found", "message": "Article not found."})
    for k, v in body.model_dump().items():
        setattr(a, k, v)
    db.commit()
    record(db, "knowledge.updated", actor_type="staff", actor_id=me, target_type="article", target_id=a.id, detail={"title": a.title})
    return _art_out(a)


@router.delete("/knowledge/{aid}", status_code=204)
def delete_article(aid: str, me: str = Depends(ADMIN), db: Session = Depends(get_db)):
    a = db.get(KnowledgeArticle, aid)
    if a:
        db.delete(a)
        db.commit()
        record(db, "knowledge.deleted", actor_type="staff", actor_id=me, target_type="article", target_id=aid, detail={"title": a.title})


# ---------------- assistant ----------------
@router.get("/conversations")
def conversations(filter: str = "", me: str = Depends(SUPPORT), db: Session = Depends(get_db)):
    stmt = select(ChatConversation).order_by(ChatConversation.updated_at.desc()).limit(200)
    if filter == "escalated":
        stmt = stmt.where(ChatConversation.escalated.is_(True))
    rows = db.scalars(stmt).all()
    out = []
    for c in rows:
        msgs = db.scalars(select(ChatMessage).where(ChatMessage.conversation_id == c.id).order_by(ChatMessage.created_at)).all()
        unanswered = any(m.role == "assistant" and (m.meta or {}).get("answered") is False for m in msgs)
        if filter == "unanswered" and not unanswered:
            continue
        first = next((m.content for m in msgs if m.role == "user"), "")
        acc = db.get(UserAccount, c.owner_id) if c.owner_id else None
        out.append({"id": c.id, "who": acc.email if acc else "Visitor", "status": c.status, "escalated": c.escalated, "unanswered": unanswered,
                    "messages": len(msgs), "first_message": first[:160], "updated_at": _iso(c.updated_at)})
    return out


@router.get("/conversations/{cid}")
def conversation(cid: str, me: str = Depends(SUPPORT), db: Session = Depends(get_db)):
    c = db.get(ChatConversation, cid)
    if not c:
        raise HTTPException(404, {"code": "not_found", "message": "Conversation not found."})
    msgs = db.scalars(select(ChatMessage).where(ChatMessage.conversation_id == c.id).order_by(ChatMessage.created_at)).all()
    return {"id": c.id, "status": c.status, "escalated": c.escalated,
            "messages": [{"role": m.role, "content": m.content, "meta": m.meta, "created_at": _iso(m.created_at)} for m in msgs]}


@router.get("/assistant/usage")
def assistant_usage(days: int = 30, me: str = Depends(SUPPORT), db: Session = Depends(get_db)):
    since = _now() - timedelta(days=max(1, min(days, 365)))
    msgs = db.scalars(select(ChatMessage).where(ChatMessage.created_at >= since, ChatMessage.role == "assistant")).all()
    return {"days": days, "conversations": db.scalar(select(func.count()).select_from(ChatConversation).where(ChatConversation.created_at >= since)) or 0,
            "replies": len(msgs), "unanswered": sum(1 for m in msgs if (m.meta or {}).get("answered") is False),
            "tokens": sum(int((m.meta or {}).get("tokens") or 0) for m in msgs),
            "tickets_from_assistant": db.scalar(select(func.count()).select_from(SupportTicket).where(SupportTicket.source == "chatbot", SupportTicket.created_at >= since)) or 0,
            "financial_requests_redirected": db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.action == "chatbot.financial_request_redirected", AuditLog.created_at >= since)) or 0,
            "blocked_actions": db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.action.in_(["chatbot.tool_blocked", "chatbot.reply_blocked"]), AuditLog.created_at >= since)) or 0,
            "mode": "ai" if get_settings().openai_api_key else "help_articles"}


# ---------------- system ----------------
@router.get("/system")
def system(me: str = Depends(ADMIN), db: Session = Depends(get_db)):
    errors = db.scalars(select(ErrorLog).order_by(ErrorLog.created_at.desc()).limit(100)).all()
    jobs = db.scalars(select(DiscoveryJob).where(DiscoveryJob.status == "failed").order_by(DiscoveryJob.created_at.desc()).limit(25)).all()
    emails = db.scalars(select(EmailOutbox).order_by(EmailOutbox.created_at.desc()).limit(60)).all()
    return {"integrations": _integrations(),
            "errors": [{"source": e.source, "path": e.path, "message": e.message, "created_at": _iso(e.created_at)} for e in errors],
            "failed_jobs": [{"id": j.id, "error": j.error, "created_at": _iso(j.created_at)} for j in jobs],
            "emails": [{"template": e.template, "to": e.to_email, "status": e.status, "attempts": e.attempts, "error": e.error, "created_at": _iso(e.created_at)} for e in emails]}


@router.post("/system/emails/retry")
def retry_emails(me: str = Depends(ADMIN)):
    return {"sent": mail.deliver_pending()}


@router.get("/audit")
def audit(action: str = "", me: str = Depends(ADMIN), db: Session = Depends(get_db)):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(300)
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"{action}%"))
    return [_audit_out(a) for a in db.scalars(stmt).all()]

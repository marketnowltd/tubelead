"""Transactional email through Resend. Every message goes through the outbox first:
- dedupe_key is unique, so the same notification can never be sent twice;
- without RESEND_API_KEY a message is stored with status 'not_configured' (visible in Admin), never faked as sent;
- failed sends are retried by the scheduler, up to 3 attempts."""
from __future__ import annotations

import html as _html
import logging
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import EmailOutbox
from .audit import log_error

log = logging.getLogger("tubelead.email")
MAX_ATTEMPTS = 3


def _layout(title: str, body_html: str, cta: tuple[str, str] | None = None) -> str:
    s = get_settings()
    base = s.app_base_url.rstrip("/")
    button = (f'<p style="margin:28px 0 8px"><a href="{_html.escape(cta[1])}" style="display:inline-block;padding:13px 26px;border-radius:999px;'
              f'background:linear-gradient(105deg,#d32de5,#9a27f2 48%,#ff982e);color:#fff;font-weight:700;text-decoration:none">{_html.escape(cta[0])}</a></p>') if cta else ""
    return f"""<!doctype html><html><body style="margin:0;background:#f8f4ff;font-family:Helvetica,Arial,sans-serif;color:#1B1433">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:20px;padding:36px;border:1px solid #ece4fb">
<tr><td><p style="margin:0 0 24px;font-size:20px;font-weight:800">Tube<span style="color:#FF7A3D">Lead</span></p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">{_html.escape(title)}</h1>
<div style="font-size:15px;line-height:1.6;color:#3e3a59">{body_html}</div>{button}
<p style="margin:32px 0 0;font-size:12px;color:#8a85a3">TubeLead · <a href="{base}" style="color:#7B3FF2">{_html.escape(base)}</a></p>
</td></tr></table></td></tr></table></body></html>"""


def _p(*lines: str) -> str:
    return "".join(f"<p style='margin:0 0 12px'>{_html.escape(x)}</p>" for x in lines)


def render(template: str, ctx: dict) -> tuple[str, str]:
    base = get_settings().app_base_url.rstrip("/")
    name = ctx.get("name") or "there"
    if template == "welcome":
        return "Welcome to TubeLead", _layout("Welcome to TubeLead", _p(f"Hi {name},", "Your account is ready. Start with 25 free leads: describe the creators you want and TubeLead finds them through the official YouTube Data API.", "If you need a hand, use the chat button on any page."), ("Find your first leads", f"{base}/lead-generator"))
    if template == "ticket_confirmation":
        return f"We received your request ({ctx['ref']})", _layout("We received your request", _p(f"Hi {name},", f"Your reference is {ctx['ref']}.", f"Subject: {ctx['subject']}", "A member of the TubeLead team will review it and reply by email.") + (_p("Requests about refunds, cancellations or billing changes are decided by a person on our team. Nothing has been approved or changed yet.") if ctx.get("financial") else ""))
    if template == "ticket_update":
        return f"Update on your request ({ctx['ref']})", _layout(f"Update on {ctx['ref']}", _p(f"Hi {name},") + f"<div style='white-space:pre-wrap;margin:0 0 12px'>{_html.escape(ctx['message'])}</div>" + _p(f"Status: {ctx['status'].replace('_', ' ')}"), ("View your requests", f"{base}/support"))
    if template == "refund_decision":
        approved = ctx["decision"] == "approved"
        lines = [f"Hi {name},", f"Your refund request ({ctx['ref']}) has been {'approved' if approved else 'declined'} by our team."]
        if ctx.get("note"):
            lines.append(f"Note from the team: {ctx['note']}")
        if approved:
            lines.append("The refund will be sent to your original payment method. Banks usually show it within 5–10 working days of it being issued.")
        return f"Your refund request {ctx['ref']}", _layout("Your refund request", _p(*lines))
    if template == "refund_issued":
        return f"Refund issued ({ctx['ref']})", _layout("Your refund has been issued", _p(f"Hi {name},", f"We have issued a refund of {ctx['amount']} for request {ctx['ref']}.", "Banks usually show it within 5–10 working days."))
    if template == "subscription_confirmed":
        return "Your TubeLead subscription is active", _layout("Subscription confirmed", _p(f"Hi {name},", f"Your {ctx['plan']} plan is active. Thank you for subscribing."), ("Open TubeLead", f"{base}/dashboard"))
    if template == "payment_confirmed":
        return "Payment received", _layout("Payment received", _p(f"Hi {name},", f"We received your payment of {ctx['amount']}. Thank you."), ("Billing & invoices", f"{base}/billing"))
    if template == "payment_failed":
        return "Your payment did not go through", _layout("Payment failed", _p(f"Hi {name},", "Your latest TubeLead payment failed. Please update your payment method so your plan continues without interruption."), ("Update payment method", f"{base}/billing"))
    if template == "cancellation_confirmed":
        return "Your subscription has been cancelled", _layout("Subscription cancelled", _p(f"Hi {name},", "Your subscription is cancelled. You keep your plan until the end of the period you paid for."))
    if template == "account_status":
        return "Your TubeLead account", _layout("An update about your account", _p(f"Hi {name},", ctx["message"]))
    if template == "admin_alert":
        return f"[TubeLead admin] {ctx['title']}", _layout(ctx["title"], _p(*ctx.get("lines", [])), ("Open admin", f"{base}/admin"))
    raise ValueError(f"unknown email template {template}")


def queue(db: Session, *, to: str, template: str, ctx: dict, dedupe_key: str) -> EmailOutbox | None:
    """Store the email once. Returns None if this dedupe_key was already queued (duplicate suppressed) or no address."""
    if not to or "@" not in to:
        return None
    if db.scalar(select(EmailOutbox.id).where(EmailOutbox.dedupe_key == dedupe_key)):
        return None
    subject, body = render(template, ctx)
    key = dedupe_key[:160]
    values = dict(id=str(uuid.uuid4()), dedupe_key=key, to_email=to, template=template, subject=subject, html=body,
                  status="queued" if get_settings().resend_api_key else "not_configured", attempts=0, error="",
                  created_at=datetime.now(timezone.utc))
    # INSERT ... ON CONFLICT DO NOTHING: a duplicate (e.g. two webhook deliveries at once) is skipped without an
    # exception, so the caller's own pending changes are never rolled back.
    ins = (pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert)(EmailOutbox).values(**values)
    res = db.execute(ins.on_conflict_do_nothing(index_elements=["dedupe_key"]))
    db.commit()
    if not res.rowcount:
        return None
    return db.get(EmailOutbox, values["id"])


def alert_admin(db: Session, title: str, lines: list[str], dedupe_key: str) -> None:
    to = get_settings().admin_alert_email
    if to:
        queue(db, to=to, template="admin_alert", ctx={"title": title, "lines": lines}, dedupe_key=f"admin:{dedupe_key}")


def deliver_pending(transport: httpx.BaseTransport | None = None) -> int:
    """Send queued emails. Called after requests and by the scheduler. Returns how many were sent."""
    from ..db import SessionLocal
    s = get_settings()
    if not s.resend_api_key:
        return 0
    sent = 0
    with SessionLocal() as db:
        # Emails stored while email was not configured are sent only if recent (24h), so adding RESEND_API_KEY later
        # does not deliver a backlog of stale welcome or payment emails.
        recent = datetime.now(timezone.utc) - timedelta(hours=24)
        rows = db.scalars(select(EmailOutbox).where(
            or_(EmailOutbox.status.in_(["queued", "failed"]), (EmailOutbox.status == "not_configured") & (EmailOutbox.created_at >= recent)),
            EmailOutbox.attempts < MAX_ATTEMPTS).order_by(EmailOutbox.created_at).limit(50)).all()
        if not rows:
            return 0
        with httpx.Client(base_url=s.resend_api_base, timeout=15, transport=transport) as c:
            for row in rows:
                row.attempts += 1
                try:
                    r = c.post("/emails", json={"from": s.email_from, "to": [row.to_email], "subject": row.subject, "html": row.html},
                               headers={"Authorization": f"Bearer {s.resend_api_key}", "Idempotency-Key": row.dedupe_key})
                    if r.status_code < 300:
                        row.status, row.provider_id, row.sent_at, row.error = "sent", (r.json() or {}).get("id"), datetime.now(timezone.utc), ""
                        sent += 1
                    else:
                        row.status, row.error = "failed", f"Resend returned {r.status_code}: {r.text[:300]}"
                except httpx.HTTPError as exc:
                    row.status, row.error = "failed", f"Resend unreachable: {type(exc).__name__}"
                if row.status == "failed" and row.attempts >= MAX_ATTEMPTS:
                    log_error("email", f"Email {row.template} to {row.to_email} failed after {row.attempts} attempts: {row.error}")
                db.commit()
    return sent


def deliver_pending_soon() -> None:
    """Send queued email in the background so the calling request (e.g. a Stripe webhook) returns immediately."""
    import threading
    if get_settings().resend_api_key:
        threading.Thread(target=deliver_pending, daemon=True, name="email").start()

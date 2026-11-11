"""Campaign delivery through the customer's own email service (see services/mailer.py).

Sends in the background at the account's per-minute pace and stops for the day at its daily limit (queued recipients
continue the next day via the scheduler). Suppression is re-checked immediately before each email. An authentication
failure pauses the campaign with a readable error instead of retrying blindly."""
from __future__ import annotations

import asyncio
import logging
import threading
from datetime import datetime, timezone

from sqlalchemy import func, select

from ..db import SessionLocal
from ..models import CampaignRecipient, EmailDocument, OutreachCampaign, SendingAccount, Suppression
from . import credits, email_doc as E, mailer
from .audit import log_error, record

log = logging.getLogger("tubelead.delivery")
PAUSE_SECONDS = 60.0  # between batches; tests set 0
INLINE = False  # tests run delivery synchronously
_running: set[str] = set()
_lock = threading.Lock()


def _today() -> datetime:
    return datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def sent_today(db, account_id: str) -> int:
    return db.scalar(select(func.count()).select_from(CampaignRecipient).where(
        CampaignRecipient.sending_account_id == account_id, CampaignRecipient.sent_at >= _today())) or 0


def _message(doc: EmailDocument, r: CampaignRecipient, base_url: str) -> mailer.Outgoing:
    fb = E.normalise(doc.doc)["settings"]["fallbacks"]
    url = mailer.unsubscribe_url(r.id)
    html, text = E.render(doc.doc, values=r.variables, base_url=base_url, subject=doc.subject, preheader=doc.preheader, unsubscribe_url=url)
    return mailer.Outgoing(to=r.email, subject=E.fill(doc.subject, r.variables, fb, escape=False), html=html, text=text,
                           headers={"List-Unsubscribe": f"<{url}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"})


def summary(db, camp: OutreachCampaign) -> dict:
    rows = db.execute(select(CampaignRecipient.provider_status, func.count()).where(CampaignRecipient.campaign_id == camp.id,
                                                                                   CampaignRecipient.eligibility == "eligible").group_by(CampaignRecipient.provider_status)).all()
    by = {k or "": v for k, v in rows}
    return {"sent": by.get("sent", 0), "failed": by.get("failed", 0), "queued": by.get("queued", 0)}


async def _run(campaign_id: str, base_url: str) -> None:
    while True:
        with SessionLocal() as db:
            camp = db.get(OutreachCampaign, campaign_id)
            if not camp or camp.status != "sending":
                return
            acc = db.get(SendingAccount, (camp.provider_ref or {}).get("sending_account_id"))
            if not acc or acc.owner_id != camp.owner_id:
                camp.status, camp.error = "paused", "The sending account was removed. Connect your email service and resume."
                db.commit()
                return
            doc = db.get(EmailDocument, camp.document_id)
            room = acc.daily_limit - sent_today(db, acc.id)
            queued = db.scalars(select(CampaignRecipient).where(CampaignRecipient.campaign_id == camp.id, CampaignRecipient.eligibility == "eligible",
                                                               CampaignRecipient.provider_status == "queued").limit(max(0, min(acc.per_minute, room)))).all()
            if not queued:
                s = summary(db, camp)
                if s["queued"] and room <= 0:
                    camp.metrics = {**s, "source": "Your email service", "note": f"Daily limit of {acc.daily_limit} reached for {acc.from_email}. Sending continues tomorrow.",
                                    "fetched_at": datetime.now(timezone.utc).isoformat()}
                else:
                    camp.status = "launched"
                    camp.metrics = {**s, "source": "Your email service", "fetched_at": datetime.now(timezone.utc).isoformat()}
                db.commit()
                return
            supp = {x.email for x in db.scalars(select(Suppression).where(Suppression.owner_id == camp.owner_id)).all()}
            batch = []
            for r in queued:
                if r.email in supp:
                    r.eligibility, r.provider_status, r.reason = "suppressed", "", "Opted out before sending"
                else:
                    batch.append(r)
            db.commit()
            try:
                results = await mailer.send(acc, [_message(doc, r, base_url) for r in batch]) if batch else []
            except mailer.MailError as exc:
                acc.status, acc.last_error = "error", str(exc)
                camp.status, camp.error = "paused", str(exc)
                db.commit()
                record(db, "campaign.paused", actor_type="system", target_type="campaign", target_id=camp.id, detail={"error": str(exc)[:300]})
                log_error("job", f"Campaign {camp.id} paused: {exc}", "delivery")
                return
            now = datetime.now(timezone.utc)
            sent = 0
            for r, (mid, err) in zip(batch, results):
                r.sending_account_id = acc.id
                if err:
                    r.provider_status, r.send_error = "failed", err
                else:
                    r.provider_status, r.sent_at, r.message_id, r.send_error = "sent", now, mid[:255], ""
                    sent += 1
            credits.record(db, camp.owner_id, "campaign_recipients", sent, provider=f"own:{acc.provider}", commit=False)
            camp.metrics = {**summary(db, camp), "source": "Your email service", "fetched_at": now.isoformat()}
            db.commit()
        await asyncio.sleep(PAUSE_SECONDS)


def run(campaign_id: str, base_url: str) -> None:
    with _lock:
        if campaign_id in _running:
            return
        _running.add(campaign_id)
    try:
        asyncio.run(_run(campaign_id, base_url))
    except Exception as exc:  # noqa: BLE001
        log.exception("delivery failed")
        log_error("job", f"Campaign delivery failed: {type(exc).__name__}: {exc}", campaign_id)
    finally:
        with _lock:
            _running.discard(campaign_id)


def start(campaign_id: str, base_url: str, inline: bool = False) -> None:
    t = threading.Thread(target=run, args=(campaign_id, base_url), daemon=True, name=f"send-{campaign_id[:8]}")
    t.start()
    if inline:  # tests: wait for the sender to finish
        t.join()


def resume_all(base_url: str) -> int:
    """Called by the scheduler: continue campaigns that still have queued recipients (e.g. after a daily limit)."""
    with SessionLocal() as db:
        ids = db.scalars(select(OutreachCampaign.id).where(OutreachCampaign.status == "sending")).all()
    for cid in ids:
        start(cid, base_url, inline=INLINE)
    return len(ids)

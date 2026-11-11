"""Campaign approval, recipient eligibility, launch through the customer's own Snov.io account, and reply handling.

Compliance rules applied in code (UK GDPR / PECR):
- Only corporate addresses ("corporate subscribers") are eligible by default under legitimate interests. Free-mail
  addresses (gmail.com, outlook.com, ...) are treated as individuals, who need prior consent: they are excluded
  ("needs_consent") unless the customer records consent for that address.
- Suppressed addresses (unsubscribed, bounced, complained, manual) are always excluded.
- Only verified or published-and-unchecked business addresses are eligible; risky addresses need explicit inclusion.
- Every email carries an opt-out line, and an "unsubscribe" reply suppresses the sender automatically.
- Nothing is added to a provider list until the customer explicitly approves the final campaign."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import CampaignRecipient, EmailDocument, OutreachCampaign, OutreachReply, Prospect, ProspectContact, Suppression
from . import ai, email_doc as E
from .email_check import FREE_MAIL

CHECKLIST = ("design", "content", "links", "personalisation", "mobile", "technical", "recipients", "permissions")
CHECKLIST_LABEL = {"design": "Design approved", "content": "Content approved", "links": "Links checked", "personalisation": "Personalisation checked",
                   "mobile": "Mobile preview checked", "technical": "Technical checks completed", "recipients": "Recipient eligibility checked",
                   "permissions": "I confirm I may contact these recipients and will honour opt-outs"}
CLASSES = ("interested", "wants_information", "meeting_requested", "not_interested", "out_of_office", "unsubscribe", "other")


def recipient_values(p: Prospect, c: ProspectContact, campaign_name: str) -> dict:
    return {"first_name": c.first_name, "last_name": c.last_name, "company_name": p.name, "website": p.website or "",
            "industry": p.industry, "business_location": p.location, "campaign_name": campaign_name}


def build_recipients(db: Session, camp: OutreachCampaign, include_risky: bool = False, consent: set[str] | None = None) -> dict:
    """(Re)build the recipient list from the session's selected prospects and their best contact. Returns counts."""
    db.query(CampaignRecipient).filter(CampaignRecipient.campaign_id == camp.id).delete()
    supp = {s.email for s in db.scalars(select(Suppression).where(Suppression.owner_id == camp.owner_id)).all()}
    prospects = db.scalars(select(Prospect).where(Prospect.session_id == camp.session_id, Prospect.selected.is_(True), Prospect.removed.is_(False))).all()
    counts = {"eligible": 0, "suppressed": 0, "needs_consent": 0, "unverified": 0, "no_contact": 0}
    rank = {"verified": 0, "unverified": 1, "risky": 2}
    for p in prospects:
        contacts = sorted(db.scalars(select(ProspectContact).where(ProspectContact.prospect_id == p.id)).all(), key=lambda c: (rank.get(c.status, 9), c.personal))
        if not contacts:
            counts["no_contact"] += 1
            continue
        c = contacts[0]
        elig, reason = "eligible", ""
        if c.email in supp:
            elig, reason = "suppressed", "On your suppression list"
        elif c.personal and c.email not in (consent or set()):
            elig, reason = "needs_consent", "Personal address: needs the person's prior consent under PECR"
        elif c.status == "risky" and not include_risky:
            elig, reason = "unverified", "Address could not be fully verified"
        counts[elig] = counts.get(elig, 0) + 1
        db.add(CampaignRecipient(campaign_id=camp.id, prospect_id=p.id, email=c.email, eligibility=elig, reason=reason,
                                 variables=recipient_values(p, c, camp.name)))
    db.commit()
    return counts


def classify_rules(text: str) -> str:
    t = (text or "").lower()
    if re.search(r"\b(unsubscribe|remove me|stop emailing|do not contact|don't contact|opt out|take me off)\b", t):
        return "unsubscribe"
    if re.search(r"\b(out of (the )?office|on (annual )?leave|away until|auto-?reply|automatic reply)\b", t):
        return "out_of_office"
    if re.search(r"\b(not interested|no thanks|no thank you|not for us|not right now|we'?re all set|not a fit)\b", t):
        return "not_interested"
    if re.search(r"\b(call|meeting|meet|book|calendar|schedule|zoom|teams|available (on|at)|free (on|at))\b", t):
        return "meeting_requested"
    if re.search(r"\b(price|pricing|cost|how much|more (info|information|details)|send (me|over)|brochure|case stud)", t):
        return "wants_information"
    if re.search(r"\b(interested|sounds (good|great)|tell me more|keen|love to|let'?s (talk|chat))\b", t):
        return "interested"
    return "other"


async def classify_reply(db: Session, owner: str, reply: OutreachReply, context: str) -> None:
    reply.classification, reply.classified_by = classify_rules(f"{reply.subject}\n{reply.body}"), "rules"
    try:
        res = await ai.run_task(db, owner, "reply_assistant",
                                f"Our outreach was about: {context[:600]}\n\nReply received:\nSubject: {reply.subject}\n{reply.body[:3000]}\n\n"
                                f"Return JSON: {{\"classification\": one of {list(CLASSES)}, \"suggested_response\": a short reply for the sender to approve, or empty for unsubscribe/out_of_office}}",
                                max_tokens=400, timeout=25)
        data = ai.extract_json(res.text)
        if isinstance(data, dict):
            if data.get("classification") in CLASSES and reply.classification != "unsubscribe":  # an unsubscribe found by rules is never overridden
                reply.classification, reply.classified_by = data["classification"], "ai"
            if isinstance(data.get("suggested_response"), str) and reply.classification not in ("unsubscribe", "out_of_office"):
                reply.suggested_response = data["suggested_response"].strip()[:3000]
                reply.response_status = "draft"
    except ai.AIError:
        pass
    if reply.classification == "unsubscribe":
        suppress(db, owner, reply.from_email, "unsubscribe")


def suppress(db: Session, owner: str, email: str, reason: str) -> None:
    email = email.strip().lower()
    if email and not db.scalar(select(Suppression).where(Suppression.owner_id == owner, Suppression.email == email)):
        db.add(Suppression(owner_id=owner, email=email, reason=reason))
        db.commit()


def personalised(doc: EmailDocument, values: dict, base_url: str) -> tuple[str, str, str]:
    """(subject, html, text) for one recipient."""
    fb = E.normalise(doc.doc)["settings"]["fallbacks"]
    subject = E.fill(doc.subject, values, fb, escape=False)
    html, text = E.render(doc.doc, values=values, base_url=base_url, subject=doc.subject, preheader=doc.preheader)
    return subject, html, text


def month_recipients(db: Session, owner: str) -> int:
    from .credits import used
    return used(db, owner, "campaign_recipients")


def dates_for_analytics(camp: OutreachCampaign) -> tuple[str, str]:
    start = (camp.launched_at or camp.created_at or datetime.now(timezone.utc)).date()
    end = datetime.now(timezone.utc).date() + timedelta(days=1)
    return start.isoformat(), end.isoformat()

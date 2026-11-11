"""Campaigns: approval, launch through the customer's own Snov.io account, provider metrics, AI reply inbox,
suppression list and My Business Results."""
import hashlib
import secrets
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import get_owner
from ..db import get_db
from ..models import (BusinessResult, CampaignRecipient, EmailDocument, GrowthSession, OutreachCampaign, OutreachReply, Prospect, ProspectContact,
                      ProviderConnection, Suppression, is_uuid)
from ..services import credits, crypto, email_doc as E, outreach as O
from ..services.audit import log_error, record
from ..services.snov import SnovClient, SnovError
from .studio import _base_url

router = APIRouter(prefix="/api/outreach", tags=["outreach"])
hooks = APIRouter(prefix="/api/hooks", tags=["outreach-hooks"])


class CampaignIn(BaseModel):
    session_id: str
    document_id: str | None = None
    name: str = Field(default="", max_length=200)


class RecipientsIn(BaseModel):
    include_risky: bool = False
    consent_emails: list[str] = Field(default_factory=list, max_length=500)


class ApproveIn(BaseModel):
    checklist: dict[str, bool]


class ConnectIn(BaseModel):
    client_id: str = Field(min_length=4, max_length=200)
    client_secret: str = Field(min_length=4, max_length=300)
    list_id: str = Field(default="", max_length=60)
    campaign_id: str = Field(default="", max_length=60)
    sender_domain: str = Field(default="", max_length=200)


class ReplyIn(BaseModel):
    campaign_id: str | None = None
    from_email: str = Field(min_length=3, max_length=255)
    subject: str = Field(default="", max_length=300)
    body: str = Field(min_length=1, max_length=20000)


class ReplyPatch(BaseModel):
    classification: str | None = None
    suggested_response: str | None = Field(default=None, max_length=5000)
    response_status: str | None = Field(default=None, pattern="^(none|draft|approved)$")


class ResultIn(BaseModel):
    kind: str = Field(pattern="^(meeting|enquiry|sale)$")
    amount_pence: int = Field(default=0, ge=0, le=10**10)
    note: str = Field(default="", max_length=1000)
    campaign_id: str | None = None
    occurred_on: date | None = None


class SuppressIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)


# ---------------- provider connection (customer's own Snov.io account)
def _conn(db: Session, owner: str) -> ProviderConnection | None:
    return db.scalar(select(ProviderConnection).where(ProviderConnection.owner_id == owner, ProviderConnection.provider == "snov"))


def _client(conn: ProviderConnection) -> SnovClient:
    from ..config import get_settings
    return SnovClient(crypto.decrypt(conn.client_id_enc), crypto.decrypt(conn.client_secret_enc), get_settings().snov_api_base)


def conn_out(c: ProviderConnection | None, request: Request | None = None) -> dict:
    if not c:
        return {"connected": False}
    st = c.settings or {}
    return {"connected": c.status == "connected", "status": c.status, "last_error": c.last_error, "list_id": st.get("list_id", ""),
            "campaign_id": st.get("campaign_id", ""), "sender_domain": st.get("sender_domain", ""), "lists": st.get("lists", []),
            "webhook_url": (f"{_base_url(request)}/api/hooks/snov/{st['webhook_token']}" if request and st.get("webhook_token") else None)}


@router.get("/connection")
def get_connection(request: Request, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    return conn_out(_conn(db, owner), request)


@router.put("/connection")
async def connect(body: ConnectIn, request: Request, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    c = _conn(db, owner) or ProviderConnection(owner_id=owner, provider="snov")
    c.client_id_enc, c.client_secret_enc = crypto.encrypt(body.client_id.strip()), crypto.encrypt(body.client_secret.strip())
    st = dict(c.settings or {})
    st.update(list_id=body.list_id.strip(), campaign_id=body.campaign_id.strip(), sender_domain=body.sender_domain.strip().lower().removeprefix("www."))
    st.setdefault("webhook_token", secrets.token_urlsafe(24))
    try:
        st["lists"] = (await _client(c).lists())[:100]
        c.status, c.last_error = "connected", ""
    except SnovError as exc:
        c.status, c.last_error = "error", str(exc)
    c.settings = st
    db.merge(c) if c.id else db.add(c)
    db.commit()
    return conn_out(_conn(db, owner), request)


@router.delete("/connection", status_code=204)
def disconnect(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    c = _conn(db, owner)
    if c:
        db.delete(c)
        db.commit()


# ---------------- campaigns
def _camp(db: Session, cid: str, owner: str) -> OutreachCampaign:
    c = db.get(OutreachCampaign, cid) if is_uuid(cid) else None
    if not c or c.owner_id != owner:
        raise HTTPException(404, {"code": "not_found", "message": "Campaign not found."})
    return c


def camp_out(db: Session, c: OutreachCampaign) -> dict:
    rows = db.scalars(select(CampaignRecipient).where(CampaignRecipient.campaign_id == c.id)).all()
    return {"id": c.id, "name": c.name, "status": c.status, "document_id": c.document_id, "session_id": c.session_id, "approval": c.approval,
            "provider": c.provider, "metrics": c.metrics, "error": c.error, "launched_at": c.launched_at.isoformat() if c.launched_at else None,
            "recipients": {k: sum(1 for r in rows if r.eligibility == k) for k in ("eligible", "suppressed", "needs_consent", "unverified")},
            "recipient_list": [{"email": r.email, "eligibility": r.eligibility, "reason": r.reason, "provider_status": r.provider_status,
                                "company": (r.variables or {}).get("company_name", "")} for r in rows[:500]]}


@router.get("/campaigns")
def campaigns(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    return [camp_out(db, c) for c in db.scalars(select(OutreachCampaign).where(OutreachCampaign.owner_id == owner).order_by(OutreachCampaign.created_at.desc()).limit(50)).all()]


@router.post("/campaigns", status_code=201)
def create_campaign(body: CampaignIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    s = db.get(GrowthSession, body.session_id) if is_uuid(body.session_id) else None
    if not s or s.owner_id != owner:
        raise HTTPException(404, {"code": "not_found", "message": "Growth session not found."})
    did = body.document_id or s.document_id
    d = db.get(EmailDocument, did) if did and is_uuid(did) else None
    if not d or d.owner_id != owner:
        raise HTTPException(422, {"code": "no_email", "message": "Create the email in Creative Studio first."})
    c = db.get(OutreachCampaign, s.campaign_id) if s.campaign_id else None
    if not c or c.status not in ("draft",):
        c = OutreachCampaign(owner_id=owner, session_id=s.id, document_id=d.id, name=body.name or (s.business or {}).get("campaign_name") or d.name)
        db.add(c)
        db.flush()
        s.campaign_id = c.id
    c.document_id = d.id
    s.step = 5
    db.commit()
    O.build_recipients(db, c)
    return camp_out(db, c)


@router.get("/campaigns/{cid}")
def get_campaign(cid: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    return camp_out(db, _camp(db, cid, owner))


@router.post("/campaigns/{cid}/recipients")
def rebuild_recipients(cid: str, body: RecipientsIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    c = _camp(db, cid, owner)
    if c.status not in ("draft", "approved"):
        raise HTTPException(409, {"code": "launched", "message": "Recipients can't change after launch."})
    O.build_recipients(db, c, include_risky=body.include_risky, consent={e.strip().lower() for e in body.consent_emails})
    if c.status == "approved":
        c.status, c.approval = "draft", {}
        db.commit()
    if body.consent_emails:
        record(db, "campaign.consent_recorded", actor_type="customer", actor_id=owner, target_type="campaign", target_id=c.id, detail={"count": len(body.consent_emails)})
    return camp_out(db, c)


@router.post("/campaigns/{cid}/approve")
def approve(cid: str, body: ApproveIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    c = _camp(db, cid, owner)
    if c.status != "draft":
        raise HTTPException(409, {"code": "not_draft", "message": f"This campaign is already {c.status}."})
    d = db.get(EmailDocument, c.document_id)
    chk = d.last_check or {}
    if not chk or chk.get("version") != d.version:
        raise HTTPException(409, {"code": "check_required", "message": "Run TubeLead Email Check on the latest version of the email first."})
    if not chk.get("can_launch"):
        raise HTTPException(409, {"code": "critical_issues", "message": "Fix the critical issues found by Email Check before approving."})
    missing = [O.CHECKLIST_LABEL[k] for k in O.CHECKLIST if not body.checklist.get(k)]
    if missing:
        raise HTTPException(422, {"code": "checklist", "message": "Confirm every item on the checklist: " + "; ".join(missing)})
    eligible = db.scalar(select(func.count()).select_from(CampaignRecipient).where(CampaignRecipient.campaign_id == c.id, CampaignRecipient.eligibility == "eligible")) or 0
    if not eligible:
        raise HTTPException(409, {"code": "no_recipients", "message": "No recipients are eligible."})
    c.status = "approved"
    c.document_version = d.version
    c.approval = {"checklist": {k: True for k in O.CHECKLIST}, "approved_at": datetime.now(timezone.utc).isoformat(), "approved_by": owner,
                  "scores": chk.get("scores"), "readiness": chk.get("readiness"), "warnings": [f["message"] for f in chk.get("findings", []) if f["severity"] == "warning"]}
    db.commit()
    record(db, "campaign.approved", actor_type="customer", actor_id=owner, target_type="campaign", target_id=c.id, detail={"recipients": eligible, "version": d.version})
    return camp_out(db, c)


@router.post("/campaigns/{cid}/launch")
async def launch(cid: str, request: Request, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    """Adds each eligible recipient, with their personalised subject and HTML in custom fields, to the Snov.io list
    linked to the customer's drip campaign. Requires the approved version to be unchanged."""
    c = _camp(db, cid, owner)
    if c.status != "approved":
        raise HTTPException(409, {"code": "not_approved", "message": "Approve the campaign before launching."})
    d = db.get(EmailDocument, c.document_id)
    if d.version != c.document_version:
        c.status, c.approval = "draft", {}
        db.commit()
        raise HTTPException(409, {"code": "changed", "message": "The email changed after approval. Check and approve it again."})
    conn = _conn(db, owner)
    if not conn or conn.status != "connected" or not (conn.settings or {}).get("list_id"):
        raise HTTPException(409, {"code": "no_provider", "message": "Connect your Snov.io account and choose the list linked to your campaign first."})
    rows = db.scalars(select(CampaignRecipient).where(CampaignRecipient.campaign_id == c.id, CampaignRecipient.eligibility == "eligible")).all()
    credits.require(db, owner, "campaign_recipients", len(rows))
    suppressed = {s.email for s in db.scalars(select(Suppression).where(Suppression.owner_id == owner)).all()}
    client = _client(conn)
    list_id = conn.settings["list_id"]
    c.status = "launching"
    db.commit()
    added = failed = 0
    base = _base_url(request)
    for r in rows:
        if r.email in suppressed:  # suppressed since the list was built
            r.eligibility, r.reason = "suppressed", "Suppressed before launch"
            continue
        subject, html, text = O.personalised(d, r.variables, base)
        try:
            await client.add_prospect(list_id, {"email": r.email, **r.variables}, {"tl_subject": subject, "tl_html": html, "tl_text": text})
            r.provider_status, added = "queued", added + 1
        except SnovError as exc:
            r.provider_status, failed = "failed", failed + 1
            c.error = str(exc)
            if exc.status in (401, 402):
                break
    credits.record(db, owner, "campaign_recipients", added, provider="snov", commit=False)
    c.status = "launched" if added else "failed"
    c.launched_at = datetime.now(timezone.utc) if added else None
    c.provider_ref = {"list_id": list_id, "campaign_id": (conn.settings or {}).get("campaign_id", ""), "added": added, "failed": failed}
    db.commit()
    record(db, "campaign.launched" if added else "campaign.launch_failed", actor_type="customer", actor_id=owner, target_type="campaign", target_id=c.id,
           detail={"added": added, "failed": failed})
    if failed and not added:
        log_error("job", f"Campaign {c.id} launch failed: {c.error}", "/api/outreach/launch")
    return camp_out(db, c)


@router.post("/campaigns/{cid}/refresh")
async def refresh_metrics(cid: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    c = _camp(db, cid, owner)
    conn = _conn(db, owner)
    snov_campaign = (c.provider_ref or {}).get("campaign_id")
    if not conn or not snov_campaign:
        raise HTTPException(409, {"code": "no_provider_campaign", "message": "Add the Snov.io campaign ID in your connection to fetch delivery figures."})
    a, b = O.dates_for_analytics(c)
    try:
        data = await _client(conn).campaign_analytics(snov_campaign, a, b)
    except SnovError as exc:
        raise HTTPException(502, {"code": "provider_error", "message": str(exc)}) from exc
    src = data.get("data") if isinstance(data.get("data"), dict) else data
    pick = lambda *ks: next((int(src[k]) for k in ks if isinstance(src.get(k), (int, float, str)) and str(src.get(k)).isdigit()), None)  # noqa: E731
    c.metrics = {"sent": pick("sent", "emails_sent", "sentCount"), "delivered": pick("delivered", "delivered_count"), "bounced": pick("bounced", "bounces", "bouncedCount"),
                 "opened": pick("opened", "opens", "openedCount"), "replied": pick("replied", "replies", "repliedCount"), "unsubscribed": pick("unsubscribed", "unsubscribes"),
                 "source": "Snov.io", "fetched_at": datetime.now(timezone.utc).isoformat()}
    db.commit()
    return camp_out(db, c)


# ---------------- replies
def reply_out(r: OutreachReply) -> dict:
    return {"id": r.id, "campaign_id": r.campaign_id, "from_email": r.from_email, "subject": r.subject, "body": r.body, "classification": r.classification,
            "classified_by": r.classified_by, "suggested_response": r.suggested_response, "response_status": r.response_status, "received_at": r.received_at.isoformat()}


async def _ingest(db: Session, owner: str, body: ReplyIn, external_id: str | None = None) -> OutreachReply:
    if external_id and db.scalar(select(OutreachReply).where(OutreachReply.owner_id == owner, OutreachReply.external_id == external_id)):
        return db.scalar(select(OutreachReply).where(OutreachReply.owner_id == owner, OutreachReply.external_id == external_id))
    camp = db.get(OutreachCampaign, body.campaign_id) if body.campaign_id and is_uuid(body.campaign_id) else None
    if camp and camp.owner_id != owner:
        camp = None
    r = OutreachReply(owner_id=owner, campaign_id=camp.id if camp else None, external_id=external_id, from_email=body.from_email.strip().lower(),
                      subject=body.subject, body=body.body)
    db.add(r)
    ctx = ""
    if camp:
        d = db.get(EmailDocument, camp.document_id)
        ctx = f"{d.subject}. " + " ".join(E.rich_to_text(e["content"]) for _, _, e, _ in E.iter_elements(d.doc) if e["type"] in ("heading", "text"))[:600]
    await O.classify_reply(db, owner, r, ctx)
    db.commit()
    return r


@router.get("/replies")
def replies(classification: str = "", owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    stmt = select(OutreachReply).where(OutreachReply.owner_id == owner).order_by(OutreachReply.received_at.desc()).limit(200)
    if classification:
        stmt = stmt.where(OutreachReply.classification == classification)
    return [reply_out(r) for r in db.scalars(stmt).all()]


@router.post("/replies", status_code=201)
async def add_reply(body: ReplyIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    """Add a reply by hand (pasted from your mailbox) when the provider doesn't forward replies."""
    return reply_out(await _ingest(db, owner, body))


@router.patch("/replies/{rid}")
def update_reply(rid: str, body: ReplyPatch, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    r = db.get(OutreachReply, rid) if is_uuid(rid) else None
    if not r or r.owner_id != owner:
        raise HTTPException(404, {"code": "not_found", "message": "Reply not found."})
    if body.classification is not None:
        if body.classification not in O.CLASSES:
            raise HTTPException(422, {"code": "bad_class", "message": "Unknown classification."})
        r.classification, r.classified_by = body.classification, "customer"
        if body.classification == "unsubscribe":
            O.suppress(db, owner, r.from_email, "unsubscribe")
    if body.suggested_response is not None:
        r.suggested_response = body.suggested_response
    if body.response_status is not None:
        r.response_status = body.response_status
    db.commit()
    return reply_out(r)


@hooks.post("/snov/{token}")
async def snov_webhook(token: str, request: Request, db: Session = Depends(get_db)):
    """Inbound replies forwarded by Snov.io (or any automation) for the connection that owns this secret URL."""
    conn = next((c for c in db.scalars(select(ProviderConnection).where(ProviderConnection.provider == "snov")).all()
                 if secrets.compare_digest((c.settings or {}).get("webhook_token", ""), token)), None)
    if not conn:
        raise HTTPException(404, "Not found")
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(400, "Expected JSON") from exc
    items = payload if isinstance(payload, list) else [payload]
    n = 0
    for it in items[:50]:
        if not isinstance(it, dict):
            continue
        data = it.get("data") if isinstance(it.get("data"), dict) else it
        frm = str(data.get("from_email") or data.get("email") or data.get("from") or "").strip()
        body = str(data.get("text") or data.get("body") or data.get("message") or "")
        if "@" not in frm or not body:
            continue
        ext = str(data.get("id") or data.get("message_id") or hashlib.sha256(f"{frm}{body}".encode()).hexdigest())[:120]
        camp = db.scalar(select(OutreachCampaign).join(CampaignRecipient, CampaignRecipient.campaign_id == OutreachCampaign.id)
                         .where(OutreachCampaign.owner_id == conn.owner_id, CampaignRecipient.email == frm.lower()).order_by(OutreachCampaign.created_at.desc()))
        await _ingest(db, conn.owner_id, ReplyIn(campaign_id=camp.id if camp else None, from_email=frm, subject=str(data.get("subject") or "")[:300], body=body[:20000]), ext)
        n += 1
    return {"received": n}


# ---------------- suppression
@router.get("/suppressions")
def suppressions(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    return [{"email": s.email, "reason": s.reason, "created_at": s.created_at.isoformat()}
            for s in db.scalars(select(Suppression).where(Suppression.owner_id == owner).order_by(Suppression.created_at.desc()).limit(1000)).all()]


@router.post("/suppressions", status_code=201)
def add_suppression(body: SuppressIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    if "@" not in body.email:
        raise HTTPException(422, {"code": "bad_email", "message": "Enter an email address."})
    O.suppress(db, owner, body.email, "manual")
    return {"ok": True}


# ---------------- results
@router.get("/results")
def results(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    def n(stmt):
        return db.scalar(stmt) or 0
    camps = db.scalars(select(OutreachCampaign).where(OutreachCampaign.owner_id == owner)).all()
    prov = {k: 0 for k in ("sent", "delivered", "bounced", "replied", "unsubscribed")}
    have_provider = False
    for c in camps:
        for k in prov:
            v = (c.metrics or {}).get(k)
            if isinstance(v, int):
                prov[k] += v
                have_provider = True
    reps = db.scalars(select(OutreachReply).where(OutreachReply.owner_id == owner)).all()
    manual = db.scalars(select(BusinessResult).where(BusinessResult.owner_id == owner).order_by(BusinessResult.occurred_on.desc())).all()
    return {
        "discovered": {"value": n(select(func.count()).select_from(Prospect).where(Prospect.owner_id == owner, Prospect.removed.is_(False))), "source": "tubelead"},
        "contacts_found": {"value": n(select(func.count()).select_from(ProspectContact).where(ProspectContact.owner_id == owner)), "source": "tubelead"},
        "provider": {**{k: (v if have_provider else None) for k, v in prov.items()}, "source": "provider",
                     "note": None if have_provider else "Connect Snov.io and refresh a launched campaign to see delivery figures."},
        "replies": {"value": len(reps), "source": "tubelead"},
        "positive": {"value": sum(1 for r in reps if r.classification in ("interested", "wants_information", "meeting_requested")), "source": "classified",
                     "note": "Classified from reply text; a positive reply is not a sale."},
        "meetings": {"value": sum(1 for m in manual if m.kind == "meeting"), "source": "customer"},
        "enquiries": {"value": sum(1 for m in manual if m.kind == "enquiry"), "source": "customer"},
        "sales": {"value": sum(1 for m in manual if m.kind == "sale"), "source": "customer"},
        "revenue_pence": {"value": sum(m.amount_pence for m in manual if m.kind == "sale"), "source": "customer"},
        "entries": [{"id": m.id, "kind": m.kind, "amount_pence": m.amount_pence, "note": m.note, "occurred_on": m.occurred_on.isoformat(), "campaign_id": m.campaign_id} for m in manual[:200]],
    }


@router.post("/results", status_code=201)
def add_result(body: ResultIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    camp = body.campaign_id if body.campaign_id and is_uuid(body.campaign_id) and getattr(db.get(OutreachCampaign, body.campaign_id), "owner_id", None) == owner else None
    r = BusinessResult(owner_id=owner, kind=body.kind, amount_pence=body.amount_pence if body.kind == "sale" else 0, note=body.note, campaign_id=camp,
                       occurred_on=body.occurred_on or datetime.now(timezone.utc).date())
    db.add(r)
    db.commit()
    return {"id": r.id}


@router.delete("/results/{rid}", status_code=204)
def delete_result(rid: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    r = db.get(BusinessResult, rid) if is_uuid(rid) else None
    if not r or r.owner_id != owner:
        raise HTTPException(404, {"code": "not_found", "message": "Entry not found."})
    db.delete(r)
    db.commit()

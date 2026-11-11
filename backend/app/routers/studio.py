"""Creative Studio API: email documents (autosave + versions), rendering, TubeLead Email Check, safe fixes, test
emails, templates, brand kit, image hosting and the design assistant."""
import asyncio
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import get_owner
from ..config import get_settings
from ..db import get_db
from ..models import (BrandKit, CampaignRecipient, EmailAsset, EmailDocument, EmailDocumentVersion, EmailTemplate, GrowthSession, OutreachCampaign,
                      Prospect, ProspectContact, ProviderConnection, UserAccount, is_uuid)
from ..services import ai, dns_check, mailer, email_check as C, email_doc as E, email_templates, limits, media, studio_ai
from ..services.contacts import is_public_url
from ..services.credits import allowance
from ..services.outreach import recipient_values

router = APIRouter(prefix="/api/studio", tags=["studio"])
public = APIRouter(prefix="/api", tags=["studio-public"])
MAX_VERSIONS = 30
LINK_TRANSPORT = None  # tests inject a mock transport
SKIP_NETWORK = False   # tests switch off DNS/link checks


class DocIn(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    subject: str | None = Field(default=None, max_length=300)
    preheader: str | None = Field(default=None, max_length=300)
    doc: dict | None = None
    editor_mode: str | None = Field(default=None, pattern="^(easy|pro)$")
    checkpoint: str | None = Field(default=None, max_length=200, description="Save a named version as well")


class CreateIn(BaseModel):
    template_id: str | None = None
    session_id: str | None = None
    name: str = Field(default="Untitled email", max_length=200)


class RenderIn(BaseModel):
    doc: dict
    subject: str = Field(default="", max_length=300)
    preheader: str = Field(default="", max_length=300)
    prospect_id: str | None = None


class FixIn(BaseModel):
    finding_id: str | None = None  # None = fix all safe issues


class AssistIn(BaseModel):
    doc: dict
    action: str = Field(max_length=20)
    element_id: str | None = None
    instruction: str = Field(default="", max_length=500)


class TemplateIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    category: str = Field(default="custom", max_length=40)


class BrandIn(BaseModel):
    company: str = Field(default="", max_length=160)
    logo: str = Field(default="", max_length=300)
    primary: str = Field(default="", max_length=30)
    secondary: str = Field(default="", max_length=30)
    font: str = Field(default="", max_length=30)
    website: str = Field(default="", max_length=300)
    email: str = Field(default="", max_length=200)
    phone: str = Field(default="", max_length=60)
    address: str = Field(default="", max_length=300)
    socials: dict = Field(default_factory=dict)
    images: list[str] = Field(default_factory=list, max_length=20)


class AssetIn(BaseModel):
    filename: str = Field(default="image", max_length=200)
    data_url: str = Field(max_length=3_000_000)


def _base_url(request: Request | None = None) -> str:
    s = get_settings()
    return (s.public_api_url or (str(request.base_url) if request else s.app_base_url)).rstrip("/")


def _doc(db: Session, did: str, owner: str) -> EmailDocument:
    d = db.get(EmailDocument, did) if is_uuid(did) else None
    if not d or d.owner_id != owner:
        raise HTTPException(404, {"code": "not_found", "message": "Email not found."})
    return d


def doc_out(d: EmailDocument, full: bool = True) -> dict:
    out = {"id": d.id, "name": d.name, "subject": d.subject, "preheader": d.preheader, "editor_mode": d.editor_mode, "version": d.version,
           "updated_at": d.updated_at.isoformat() if d.updated_at else None, "last_check": d.last_check or None}
    if full:
        out["doc"] = d.doc
    return out


def _rerender(d: EmailDocument, base: str) -> None:
    d.html, d.text = E.render(d.doc, base_url=base, subject=d.subject, preheader=d.preheader)


# ---------------- documents
@router.get("/documents")
def documents(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    return [doc_out(d, full=False) for d in db.scalars(select(EmailDocument).where(EmailDocument.owner_id == owner).order_by(EmailDocument.updated_at.desc()).limit(100)).all()]


@router.post("/documents", status_code=201)
def create_document(body: CreateIn, request: Request, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    subject, doc, name = "", E.blank(), body.name
    if body.template_id:
        if body.template_id.startswith("builtin:"):
            t = next((t for t in email_templates.build() if t["category"] == body.template_id[8:]), None)
            if not t:
                raise HTTPException(404, {"code": "not_found", "message": "Template not found."})
            subject, doc, name = t["subject"], t["doc"], t["name"]
        else:
            t = db.get(EmailTemplate, body.template_id) if is_uuid(body.template_id) else None
            if not t or (t.owner_id not in (None, owner)):
                raise HTTPException(404, {"code": "not_found", "message": "Template not found."})
            subject, doc, name = t.subject, t.doc, t.name
    d = EmailDocument(owner_id=owner, name=name[:200], subject=subject, doc=E.normalise(doc))
    db.add(d)
    db.flush()
    if body.session_id:
        s = db.get(GrowthSession, body.session_id) if is_uuid(body.session_id) else None
        if not s or s.owner_id != owner:
            raise HTTPException(404, {"code": "not_found", "message": "Growth session not found."})
        bname = (s.business or {}).get("campaign_name")
        if bname:
            d.doc = {**d.doc, "settings": {**d.doc["settings"], "fallbacks": {**d.doc["settings"]["fallbacks"], "campaign_name": bname[:80]}}}
        s.document_id = d.id
        s.step = max(s.step, 4)
    _rerender(d, _base_url(request))
    db.add(EmailDocumentVersion(document_id=d.id, version=1, subject=d.subject, doc=d.doc, note="Created"))
    db.commit()
    return doc_out(d)


@router.get("/documents/{did}")
def get_document(did: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    return doc_out(_doc(db, did, owner))


@router.put("/documents/{did}")
def save_document(did: str, body: DocIn, request: Request, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    """Autosave target. A named checkpoint (or every 10th save) also stores a version for restore."""
    d = _doc(db, did, owner)
    if body.doc is not None:
        d.doc = E.normalise(body.doc)
    for k in ("name", "subject", "preheader", "editor_mode"):
        v = getattr(body, k)
        if v is not None:
            setattr(d, k, v)
    d.version += 1
    _rerender(d, _base_url(request))
    if body.checkpoint or d.version % 10 == 0:
        db.add(EmailDocumentVersion(document_id=d.id, version=d.version, subject=d.subject, doc=d.doc, note=(body.checkpoint or "Autosave")[:200]))
        old = db.scalars(select(EmailDocumentVersion).where(EmailDocumentVersion.document_id == d.id).order_by(EmailDocumentVersion.version.desc()).offset(MAX_VERSIONS)).all()
        for o in old:
            db.delete(o)
    db.commit()
    return doc_out(d, full=False)


@router.delete("/documents/{did}", status_code=204)
def delete_document(did: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    d = _doc(db, did, owner)
    if db.scalar(select(OutreachCampaign.id).where(OutreachCampaign.document_id == d.id)):
        raise HTTPException(409, {"code": "in_use", "message": "This email is used by a campaign, so it can't be deleted."})
    db.delete(d)
    db.commit()


@router.get("/documents/{did}/versions")
def versions(did: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    _doc(db, did, owner)
    rows = db.scalars(select(EmailDocumentVersion).where(EmailDocumentVersion.document_id == did).order_by(EmailDocumentVersion.version.desc())).all()
    return [{"id": v.id, "version": v.version, "note": v.note, "created_at": v.created_at.isoformat()} for v in rows]


@router.post("/documents/{did}/versions/{vid}/restore")
def restore(did: str, vid: str, request: Request, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    d = _doc(db, did, owner)
    v = db.get(EmailDocumentVersion, vid) if is_uuid(vid) else None
    if not v or v.document_id != d.id:
        raise HTTPException(404, {"code": "not_found", "message": "Version not found."})
    db.add(EmailDocumentVersion(document_id=d.id, version=d.version, subject=d.subject, doc=d.doc, note="Before restore"))
    d.doc, d.subject, d.version = v.doc, v.subject, d.version + 1
    _rerender(d, _base_url(request))
    db.commit()
    return doc_out(d)


# ---------------- rendering & preview
def _values_for(db: Session, owner: str, prospect_id: str | None, campaign_name: str = "") -> dict | None:
    if not prospect_id or not is_uuid(prospect_id):
        return None
    p = db.get(Prospect, prospect_id)
    if not p or p.owner_id != owner:
        return None
    c = db.scalar(select(ProspectContact).where(ProspectContact.prospect_id == p.id).order_by(ProspectContact.status))
    return recipient_values(p, c, campaign_name) if c else {"company_name": p.name, "website": p.website or "", "industry": p.industry,
                                                             "business_location": p.location, "campaign_name": campaign_name}


@router.post("/render")
def render(body: RenderIn, request: Request, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    doc = E.normalise(body.doc)
    values = _values_for(db, owner, body.prospect_id, doc["settings"]["fallbacks"].get("campaign_name", ""))
    html, text = E.render(doc, values=values, base_url=_base_url(request), subject=body.subject, preheader=body.preheader)
    return {"html": html, "text": text, "subject": E.fill(body.subject, values, doc["settings"]["fallbacks"], escape=False), "bytes": len(html.encode())}


@public.post("/public/email/render")
def public_render(body: RenderIn, request: Request):
    """Stateless render for the public interactive demo (sample data only, rate limited, nothing stored)."""
    limits.check(f"demo-render:{limits.client_ip(request)}", 60, 600, "Too many previews. Please wait a moment.")
    html, text = E.render(body.doc, base_url=_base_url(request), subject=body.subject, preheader=body.preheader)
    return {"html": html, "text": text}


@public.post("/public/email/check")
def public_check(body: RenderIn, request: Request):
    limits.check(f"demo-check:{limits.client_ip(request)}", 30, 600, "Too many checks. Please wait a moment.")
    html, text = E.render(body.doc, subject=body.subject)
    res = C.inspect(body.doc, subject=body.subject, preheader=body.preheader, html=html, text=text, sender_domain="example.com", dns_results={"spf": "present", "dmarc": "present", "dkim": "present (sample)"})
    res["sample"] = True
    return res


# ---------------- email check
async def _check_links(doc: dict) -> dict:
    urls = sorted({h for _, h, _ in C._links(E.normalise(doc)) if h.startswith(("http://", "https://")) and not E.VAR_RE.search(h)})[:15]

    async def one(c: httpx.AsyncClient, u: str) -> tuple[str, str]:
        if not await asyncio.to_thread(is_public_url, u):
            return u, "unreachable"
        try:
            r = await c.head(u, follow_redirects=True)
            if r.status_code in (405, 403):
                r = await c.get(u, follow_redirects=True)
            return u, "broken" if r.status_code in (404, 410) or r.status_code >= 500 else "ok"
        except httpx.HTTPError:
            return u, "unreachable"
    async with httpx.AsyncClient(timeout=6, transport=LINK_TRANSPORT, headers={"User-Agent": "TubeLead link checker"}) as c:
        return dict(await asyncio.gather(*[one(c, u) for u in urls]))


def _sender_domain(db: Session, owner: str) -> str | None:
    """The domain the customer sends from: their default sending account, else their Snov.io sender domain."""
    from .sending import default_account
    acc = default_account(db, owner)
    if acc and "@" in acc.from_email:
        return acc.from_email.rsplit("@", 1)[1]
    conn = db.scalar(select(ProviderConnection).where(ProviderConnection.owner_id == owner, ProviderConnection.provider == "snov"))
    return (conn.settings or {}).get("sender_domain") if conn and conn.status == "connected" else None


@router.post("/documents/{did}/check")
async def run_check(did: str, request: Request, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    d = _doc(db, did, owner)
    _rerender(d, _base_url(request))
    sender = _sender_domain(db, owner)
    dns = links = None
    if not SKIP_NETWORK:
        links = await _check_links(d.doc)
        dns = await asyncio.to_thread(dns_check.check, sender) if sender else None
    recipients = None
    camp = db.scalar(select(OutreachCampaign).where(OutreachCampaign.document_id == d.id).order_by(OutreachCampaign.created_at.desc()))
    if camp:
        rows = db.scalars(select(CampaignRecipient).where(CampaignRecipient.campaign_id == camp.id)).all()
        recipients = {k: sum(1 for r in rows if r.eligibility == k) for k in ("eligible", "suppressed", "needs_consent", "unverified")}
        from ..services.outreach import month_recipients
        over = month_recipients(db, owner) + recipients["eligible"] - allowance(db, owner, "campaign_recipients")
        if over > 0:
            recipients["over_limit"] = over
    res = C.inspect(d.doc, subject=d.subject, preheader=d.preheader, html=d.html, text=d.text, sender_domain=sender, dns_results=dns,
                    link_results=links, recipients=recipients)
    res["checked_at"] = datetime.now(timezone.utc).isoformat()
    res["version"] = d.version
    d.last_check = res
    db.commit()
    return res


@router.post("/documents/{did}/fix")
async def fix(did: str, body: FixIn, request: Request, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    """Apply one safe fix, or all safe fixes. Returns the before and after documents for comparison; the new
    document is saved, and the previous one is kept as a version so it can be restored."""
    d = _doc(db, did, owner)
    findings = (d.last_check or {}).get("findings") or []
    if not findings:
        raise HTTPException(409, {"code": "no_check", "message": "Run TubeLead Email Check first."})
    before = d.doc
    if body.finding_id:
        f = next((x for x in findings if x["id"] == body.finding_id), None)
        if not f or not f.get("fix"):
            raise HTTPException(422, {"code": "no_fix", "message": "That issue has no automatic fix; edit it in the editor."})
        new, subject = C.apply_fix(d.doc, f, d.subject)
        n = 1
    else:
        new, subject, n = C.apply_all_safe(d.doc, findings, d.subject)
    db.add(EmailDocumentVersion(document_id=d.id, version=d.version, subject=d.subject, doc=before, note="Before Email Check fixes"))
    d.doc, d.subject, d.version = new, subject, d.version + 1
    _rerender(d, _base_url(request))
    db.commit()
    return {"applied": n, "before": before, "after": new, "document": doc_out(d)}


@router.post("/documents/{did}/test")
async def send_test(did: str, request: Request, prospect_id: str | None = None, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    """Send a test to the signed-in customer's own account address only."""
    d = _doc(db, did, owner)
    limits.check(f"test-email:{owner}", 10, 3600, "You've sent 10 test emails this hour. Please wait a little.")
    acc = db.get(UserAccount, owner)
    to = acc.email if acc else ""
    if not to:
        raise HTTPException(409, {"code": "no_email", "message": "Your account has no email address to send the test to."})
    from .sending import default_account
    sender = default_account(db, owner)
    if not sender:
        raise HTTPException(409, {"code": "no_sending_account", "message": "Connect your own email service (SMTP, SendGrid, Mailgun, Postmark or Resend) to send test emails."})
    values = _values_for(db, owner, prospect_id, E.normalise(d.doc)["settings"]["fallbacks"].get("campaign_name", ""))
    html, text = E.render(d.doc, values=values, base_url=_base_url(request), subject=d.subject, preheader=d.preheader)
    subject = "[Test] " + (E.fill(d.subject, values, E.normalise(d.doc)["settings"]["fallbacks"], escape=False) or d.name)
    try:
        (_, err), = await mailer.send(sender, [mailer.Outgoing(to=to, subject=subject[:300], html=html, text=text)])
    except mailer.MailError as exc:
        sender.status, sender.last_error = "error", str(exc)
        db.commit()
        raise HTTPException(502, {"code": "send_failed", "message": f"Your email service refused the test: {exc}"}) from exc
    if err:
        raise HTTPException(502, {"code": "send_failed", "message": f"Your email service refused the test: {err}"})
    return {"sent_to": to, "subject": subject, "sent_from": sender.from_email, "via": sender.provider}


# ---------------- templates & brand
@router.get("/templates")
def templates(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    out = [{"id": f"builtin:{t['category']}", "name": t["name"], "category": t["category"], "category_label": email_templates.CATEGORIES[t["category"]],
            "subject": t["subject"], "doc": t["doc"], "mine": False} for t in email_templates.build()]
    for t in db.scalars(select(EmailTemplate).where(EmailTemplate.owner_id == owner).order_by(EmailTemplate.created_at.desc())).all():
        out.append({"id": t.id, "name": t.name, "category": t.category, "category_label": "My templates", "subject": t.subject, "doc": t.doc, "mine": True})
    return out


@router.post("/documents/{did}/save-template", status_code=201)
def save_template(did: str, body: TemplateIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    d = _doc(db, did, owner)
    t = EmailTemplate(owner_id=owner, category=body.category, name=body.name, subject=d.subject, doc=d.doc)
    db.add(t)
    db.commit()
    return {"id": t.id, "name": t.name}


@router.delete("/templates/{tid}", status_code=204)
def delete_template(tid: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    t = db.get(EmailTemplate, tid) if is_uuid(tid) else None
    if not t or t.owner_id != owner:
        raise HTTPException(404, {"code": "not_found", "message": "Template not found."})
    db.delete(t)
    db.commit()


@router.get("/brand")
def get_brand(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    b = db.get(BrandKit, owner)
    return b.data if b else {}


@router.put("/brand")
def put_brand(body: BrandIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    data = body.model_dump()
    data["primary"] = E._color(data["primary"], "")
    data["secondary"] = E._color(data["secondary"], "")
    data["font"] = data["font"] if data["font"] in E.FONTS else ""
    data["website"] = E.safe_url(data["website"])
    data["logo"] = data["logo"] if data["logo"].startswith("/api/assets/") else E.safe_url(data["logo"])
    data["socials"] = {k: E.safe_url(v) for k, v in list(data["socials"].items())[:8] if E.safe_url(v)}
    b = db.get(BrandKit, owner) or BrandKit(owner_id=owner)
    b.data = data
    db.merge(b)
    db.commit()
    return data


@router.get("/fonts")
def fonts():
    return {"fonts": list(E.FONTS), "presets": list(E.PRESETS), "variables": list(E.VARIABLES)}


# ---------------- assets
@router.post("/assets", status_code=201)
def upload(body: AssetIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    try:
        raw, ctype = media.decode_data_url(body.data_url)
    except ValueError as exc:
        raise HTTPException(422, {"code": "bad_image", "message": str(exc)}) from exc
    used = db.scalar(select(func.coalesce(func.sum(EmailAsset.size), 0)).where(EmailAsset.owner_id == owner)) or 0
    if used + len(raw) > allowance(db, owner, "storage_mb") * 1024 * 1024:
        raise HTTPException(402, {"code": "paywall", "reason": "storage", "message": "Your image storage is full. Delete unused images or upgrade your plan.", "upgrade_url": "/billing"})
    w, h = media.dimensions(raw, ctype)
    a = EmailAsset(owner_id=owner, filename=body.filename[:200], content_type=ctype, size=len(raw), width=w, height=h, data=raw)
    db.add(a)
    db.commit()
    return {"id": a.id, "url": f"/api/assets/{a.id}", "width": w, "height": h, "size": a.size, "content_type": ctype}


@router.get("/assets")
def my_assets(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    rows = db.execute(select(EmailAsset.id, EmailAsset.filename, EmailAsset.width, EmailAsset.height, EmailAsset.size, EmailAsset.created_at)
                      .where(EmailAsset.owner_id == owner).order_by(EmailAsset.created_at.desc()).limit(200)).all()
    return [{"id": r.id, "url": f"/api/assets/{r.id}", "filename": r.filename, "width": r.width, "height": r.height, "size": r.size} for r in rows]


@router.delete("/assets/{aid}", status_code=204)
def delete_asset(aid: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    a = db.get(EmailAsset, aid) if is_uuid(aid) else None
    if not a or a.owner_id != owner:
        raise HTTPException(404, {"code": "not_found", "message": "Image not found."})
    db.delete(a)
    db.commit()


@public.get("/assets/{aid}")
def serve_asset(aid: str, db: Session = Depends(get_db)):
    """Public so email clients can load images. IDs are random UUIDs; files are validated images only."""
    a = db.get(EmailAsset, aid) if is_uuid(aid) else None
    if not a:
        raise HTTPException(404, "Not found")
    return Response(a.data, media_type=a.content_type, headers={"Cache-Control": "public, max-age=31536000, immutable",
                                                                 "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'"})


# ---------------- design assistant
@router.post("/assist")
async def assist(body: AssistIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    brand = (db.get(BrandKit, owner).data if db.get(BrandKit, owner) else {})
    try:
        return await studio_ai.assist(db, owner, body.doc, body.action, element_id=body.element_id, instruction=body.instruction, brand=brand)
    except ValueError as exc:
        raise HTTPException(422, {"code": "bad_action", "message": str(exc)}) from exc
    except ai.AIError as exc:
        raise HTTPException(exc.status if exc.status in (409, 429) else 502, {"code": exc.code, "message": str(exc)}) from exc


@public.get("/public/email/templates")
def public_templates():
    """Built-in templates for the public demo (no customer data)."""
    return [{"id": f"builtin:{t['category']}", "name": t["name"], "category": t["category"], "category_label": email_templates.CATEGORIES[t["category"]],
             "subject": t["subject"], "doc": t["doc"], "mine": False} for t in email_templates.build()]

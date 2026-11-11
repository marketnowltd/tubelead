"""The customer's own email services, and the public unsubscribe endpoint."""
from email.utils import parseaddr

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_owner
from ..db import get_db
from ..models import CampaignRecipient, OutreachCampaign, SendingAccount, is_uuid
from ..services import crypto, mailer, outreach as O
from ..services.audit import record

router = APIRouter(prefix="/api/sending", tags=["sending"])
public = APIRouter(prefix="/api", tags=["unsubscribe"])


class AccountIn(BaseModel):
    provider: str = Field(pattern="^(smtp|sendgrid|mailgun|postmark|resend)$")
    label: str = Field(default="", max_length=120)
    from_name: str = Field(default="", max_length=120)
    from_email: str = Field(min_length=3, max_length=255)
    reply_to: str = Field(default="", max_length=255)
    secret: str | None = Field(default=None, max_length=500, description="SMTP password or API key; omit to keep the saved one")
    host: str = Field(default="", max_length=200)
    port: int = Field(default=587)
    security: str = Field(default="starttls", pattern="^(starttls|ssl|none)$")
    username: str = Field(default="", max_length=255)
    domain: str = Field(default="", max_length=200)
    region: str = Field(default="us", pattern="^(us|eu)$")
    daily_limit: int = Field(default=100, ge=1, le=10000)
    per_minute: int = Field(default=20, ge=1, le=120)
    is_default: bool = False


def _valid_email(e: str) -> bool:
    addr = parseaddr(e)[1]
    return bool(addr) and addr == e.strip() and "@" in addr and "." in addr.rsplit("@", 1)[-1]


def account_out(a: SendingAccount) -> dict:
    st = a.settings or {}
    return {"id": a.id, "provider": a.provider, "label": a.label or a.from_email, "from_name": a.from_name, "from_email": a.from_email, "reply_to": a.reply_to,
            "host": st.get("host", ""), "port": st.get("port"), "security": st.get("security", ""), "username": st.get("username", ""), "domain": st.get("domain", ""),
            "region": st.get("region", ""), "daily_limit": a.daily_limit, "per_minute": a.per_minute, "is_default": a.is_default, "status": a.status,
            "last_error": a.last_error, "has_secret": bool(a.secret_enc)}


def _account(db: Session, aid: str, owner: str) -> SendingAccount:
    a = db.get(SendingAccount, aid) if is_uuid(aid) else None
    if not a or a.owner_id != owner:
        raise HTTPException(404, {"code": "not_found", "message": "Sending account not found."})
    return a


@router.get("/accounts")
def accounts(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    rows = db.scalars(select(SendingAccount).where(SendingAccount.owner_id == owner).order_by(SendingAccount.created_at)).all()
    return {"accounts": [account_out(a) for a in rows], "presets": mailer.PRESETS}


async def _save(db: Session, a: SendingAccount, body: AccountIn, owner: str) -> dict:
    if not _valid_email(body.from_email) or (body.reply_to and not _valid_email(body.reply_to)):
        raise HTTPException(422, {"code": "bad_email", "message": "Enter a valid sending (and reply-to) address."})
    if body.provider == "smtp":
        if not body.host or body.port not in mailer.SMTP_PORTS:
            raise HTTPException(422, {"code": "bad_smtp", "message": "Enter the SMTP server and a port of 465, 587, 2525 or 25."})
        a.settings = {"host": body.host.strip().lower(), "port": body.port, "security": body.security, "username": body.username.strip()}
    elif body.provider == "mailgun":
        if not body.domain:
            raise HTTPException(422, {"code": "bad_domain", "message": "Enter your Mailgun sending domain."})
        a.settings = {"domain": body.domain.strip().lower(), "region": body.region}
    else:
        a.settings = {}
    if body.secret:
        a.secret_enc = crypto.encrypt(body.secret)
    if not a.secret_enc:
        raise HTTPException(422, {"code": "secret_required", "message": "Enter the password or API key."})
    a.provider, a.label, a.from_name, a.from_email, a.reply_to = body.provider, body.label.strip(), body.from_name.strip(), body.from_email.strip().lower(), body.reply_to.strip().lower()
    a.daily_limit, a.per_minute = body.daily_limit, body.per_minute
    try:
        await mailer.verify(a)
        a.status, a.last_error = "connected", ""
    except mailer.MailError as exc:
        a.status, a.last_error = "error", str(exc)
    has_default = db.scalar(select(SendingAccount.id).where(SendingAccount.owner_id == owner, SendingAccount.is_default.is_(True), SendingAccount.id != a.id))
    if body.is_default or not has_default:
        for other in db.scalars(select(SendingAccount).where(SendingAccount.owner_id == owner, SendingAccount.id != a.id)).all():
            other.is_default = False
        a.is_default = True
    db.add(a)
    db.commit()
    record(db, "sending_account.saved", actor_type="customer", actor_id=owner, target_type="sending_account", target_id=a.id, detail={"provider": a.provider, "status": a.status})
    return account_out(a)


@router.post("/accounts", status_code=201)
async def add_account(body: AccountIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    if len(db.scalars(select(SendingAccount.id).where(SendingAccount.owner_id == owner)).all()) >= 10:
        raise HTTPException(422, {"code": "too_many", "message": "You can connect up to 10 sending accounts."})
    return await _save(db, SendingAccount(owner_id=owner, provider=body.provider, from_email=body.from_email, secret_enc=""), body, owner)


@router.put("/accounts/{aid}")
async def update_account(aid: str, body: AccountIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    return await _save(db, _account(db, aid, owner), body, owner)


@router.post("/accounts/{aid}/verify")
async def verify_account(aid: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    a = _account(db, aid, owner)
    try:
        await mailer.verify(a)
        a.status, a.last_error = "connected", ""
    except mailer.MailError as exc:
        a.status, a.last_error = "error", str(exc)
    db.commit()
    return account_out(a)


@router.delete("/accounts/{aid}", status_code=204)
def delete_account(aid: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    a = _account(db, aid, owner)
    if db.scalar(select(OutreachCampaign.id).where(OutreachCampaign.owner_id == owner, OutreachCampaign.status == "sending")) and \
            any((c.provider_ref or {}).get("sending_account_id") == a.id for c in db.scalars(select(OutreachCampaign).where(OutreachCampaign.owner_id == owner, OutreachCampaign.status == "sending")).all()):
        raise HTTPException(409, {"code": "in_use", "message": "A campaign is sending from this account. Wait for it to finish first."})
    was_default = a.is_default
    db.delete(a)
    db.commit()
    if was_default:
        nxt = db.scalar(select(SendingAccount).where(SendingAccount.owner_id == owner).order_by(SendingAccount.created_at))
        if nxt:
            nxt.is_default = True
            db.commit()


def default_account(db: Session, owner: str) -> SendingAccount | None:
    return db.scalar(select(SendingAccount).where(SendingAccount.owner_id == owner).order_by(SendingAccount.is_default.desc(), SendingAccount.created_at))


# ---------------- unsubscribe (public, used by the link and one-click header in every campaign email)
def _unsubscribe(db: Session, rid: str, token: str) -> bool:
    import hmac as _h
    r = db.get(CampaignRecipient, rid) if is_uuid(rid) else None
    if not r or not _h.compare_digest(mailer.unsubscribe_token(r.id), token):
        return False
    camp = db.get(OutreachCampaign, r.campaign_id)
    O.suppress(db, camp.owner_id, r.email, "unsubscribe")
    return True


PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title>
<style>body{{margin:0;font-family:Helvetica,Arial,sans-serif;background:#f4f1fb;color:#1b1433;display:grid;place-items:center;min-height:100vh}}
main{{background:#fff;border-radius:16px;padding:32px;max-width:420px;margin:16px;text-align:center;box-shadow:0 12px 40px -20px rgba(60,30,120,.4)}}h1{{font-size:20px}}</style></head>
<body><main><h1>{title}</h1><p>{body}</p></main></body></html>"""


@public.get("/u/{rid}/{token}", response_class=HTMLResponse)
def unsubscribe_page(rid: str, token: str, db: Session = Depends(get_db)):
    ok = _unsubscribe(db, rid, token)
    return HTMLResponse(PAGE.format(title="You've been unsubscribed" if ok else "Link not recognised",
                                    body="You won't receive more emails from this sender through TubeLead." if ok else "This unsubscribe link isn't valid. Reply to the email and ask to be removed."),
                        status_code=200 if ok else 404)


@public.post("/u/{rid}/{token}")
def unsubscribe_one_click(rid: str, token: str, db: Session = Depends(get_db)):
    if not _unsubscribe(db, rid, token):
        raise HTTPException(404, "Not found")
    return {"unsubscribed": True}

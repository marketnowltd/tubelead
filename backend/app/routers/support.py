"""Public support: the chat assistant and support tickets. Visitors can chat without an account; their conversation
is tied to a random token only their browser holds. Signed-in customers' conversations are tied to their account."""
import hashlib
import secrets

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_optional_owner, get_owner
from ..db import get_db
from ..models import ChatConversation, ChatMessage, SupportTicket, TicketMessage
from ..services import email as mail
from ..services import support, support_bot

router = APIRouter(prefix="/api/support", tags=["support"])
MAX_MESSAGES = 60
BOT_TRANSPORT = None  # tests inject a fake OpenAI transport


def _h(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: str | None = None
    token: str | None = Field(default=None, max_length=100)


class TicketIn(BaseModel):
    category: str = "general"
    subject: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10, max_length=5000)
    email: EmailStr | None = None
    name: str = Field(default="", max_length=160)
    conversation_id: str | None = None
    token: str | None = Field(default=None, max_length=100)


class ReplyIn(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


def _conversation(db: Session, cid: str, owner: str | None, token: str | None) -> ChatConversation:
    conv = db.get(ChatConversation, cid)
    ok = conv is not None and ((owner and conv.owner_id == owner) or (conv.visitor_token_hash and token and secrets.compare_digest(conv.visitor_token_hash, _h(token))))
    if not ok:
        raise HTTPException(404, {"code": "not_found", "message": "Conversation not found."})
    return conv


def _msg_out(m: ChatMessage) -> dict:
    return {"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at.isoformat(),
            "action": (m.meta or {}).get("action"), "category": (m.meta or {}).get("category"), "mode": (m.meta or {}).get("mode")}


@router.post("/chat")
async def chat(body: ChatIn, background: BackgroundTasks, owner: str | None = Depends(get_optional_owner), db: Session = Depends(get_db)):
    token = None
    if body.conversation_id:
        conv = _conversation(db, body.conversation_id, owner, body.token)
    else:
        token = None if owner else secrets.token_urlsafe(24)
        conv = ChatConversation(owner_id=owner, visitor_token_hash=_h(token) if token else None)
        db.add(conv)
        db.commit()
    count = len(db.scalars(select(ChatMessage.id).where(ChatMessage.conversation_id == conv.id)).all())
    if count >= MAX_MESSAGES:
        raise HTTPException(429, {"code": "conversation_full", "message": "This conversation is full. Start a new one, or send your question to the team."})
    text = body.message.strip()
    db.add(ChatMessage(conversation_id=conv.id, role="user", content=text))
    db.commit()
    out = await support_bot.answer(db, conversation_id=conv.id, owner=owner, text=text, transport=BOT_TRANSPORT)
    meta = {**out.get("meta", {}), "action": out.get("action"), "category": out.get("category"), "mode": out.get("mode")}
    reply = ChatMessage(conversation_id=conv.id, role="assistant", content=out["reply"], meta=meta)
    db.add(reply)
    db.commit()
    background.add_task(mail.deliver_pending)
    return {"conversation_id": conv.id, "token": token, "message": _msg_out(reply), "ticket_ref": out.get("ticket_ref")}


@router.get("/chat/{cid}")
def history(cid: str, token: str | None = None, owner: str | None = Depends(get_optional_owner), db: Session = Depends(get_db)):
    conv = _conversation(db, cid, owner, token)
    rows = db.scalars(select(ChatMessage).where(ChatMessage.conversation_id == conv.id).order_by(ChatMessage.created_at)).all()
    return {"conversation_id": conv.id, "status": conv.status, "messages": [_msg_out(m) for m in rows]}


@router.post("/tickets", status_code=201)
def open_ticket(body: TicketIn, background: BackgroundTasks, owner: str | None = Depends(get_optional_owner), db: Session = Depends(get_db)):
    if not owner and not body.email:
        raise HTTPException(422, {"code": "email_required", "message": "Add your email so the team can reply."})
    conv_id = None
    if body.conversation_id:
        conv_id = _conversation(db, body.conversation_id, owner, body.token).id
    t = support.create_ticket(db, owner=owner, category=body.category, subject=body.subject, description=body.description,
                              email=str(body.email or ""), name=body.name, source="chatbot" if conv_id else "web", conversation_id=conv_id)
    if conv_id:
        db.add(ChatMessage(conversation_id=conv_id, role="assistant",
                           content=f"Thanks. Your request has been sent to the team. Your reference is {t.ref}. "
                                   + ("A person will review it and reply by email. Nothing has been approved or changed yet." if t.category in support.FINANCIAL
                                      else "They'll reply by email."),
                           meta={"action": "ticket_created", "ticket_ref": t.ref}))
        db.commit()
    background.add_task(mail.deliver_pending)
    return {"ref": t.ref, "status": t.status, "category": t.category}


def _ticket_out(t: SupportTicket, messages: list[TicketMessage] | None = None) -> dict:
    d = {"ref": t.ref, "category": t.category, "subject": t.subject, "status": t.status, "created_at": t.created_at.isoformat(),
         "updated_at": t.updated_at.isoformat() if t.updated_at else None, "resolution": t.resolution}
    if messages is not None:
        d["messages"] = [{"author": m.author_type, "body": m.body, "created_at": m.created_at.isoformat()} for m in messages]
    return d


def _my_ticket(db: Session, ref: str, owner: str) -> SupportTicket:
    t = db.scalar(select(SupportTicket).where(SupportTicket.ref == ref.upper(), SupportTicket.owner_id == owner))
    if not t:
        raise HTTPException(404, {"code": "not_found", "message": "Request not found."})
    return t


@router.get("/tickets")
def my_tickets(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    rows = db.scalars(select(SupportTicket).where(SupportTicket.owner_id == owner).order_by(SupportTicket.created_at.desc()).limit(100)).all()
    return [_ticket_out(t) for t in rows]


@router.get("/tickets/{ref}")
def my_ticket(ref: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    t = _my_ticket(db, ref, owner)
    msgs = db.scalars(select(TicketMessage).where(TicketMessage.ticket_id == t.id).order_by(TicketMessage.created_at)).all()
    return _ticket_out(t, msgs)


@router.post("/tickets/{ref}/reply")
def reply_to_ticket(ref: str, body: ReplyIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    t = _my_ticket(db, ref, owner)
    if t.status == "closed":
        raise HTTPException(409, {"code": "closed", "message": "This request is closed. Open a new one if you still need help."})
    db.add(TicketMessage(ticket_id=t.id, author_type="customer", author_id=owner, body=body.body.strip()))
    if t.status in ("waiting_customer", "resolved"):
        t.status = "open"
    db.commit()
    return my_ticket(ref, owner, db)

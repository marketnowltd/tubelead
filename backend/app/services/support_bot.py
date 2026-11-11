"""TubeLead support assistant.

Safety is enforced here, in code, not by the prompt:
1. The assistant can call exactly three functions (TOOLS): search help articles, read the signed-in customer's own
   billing status (read-only, from our database), and open a support ticket. Any other function the model asks for
   is refused and written to the audit log. This module has no access to Stripe or to any billing write path.
2. Messages asking for refunds, cancellations, plan or payment changes, or account deletion are recognised BEFORE
   the model is called. The reply is fixed: the assistant cannot do this, and it offers a ticket for a person.
3. Every model reply is checked; one that claims a refund/cancellation/change was approved or completed is replaced.
Without OPENAI_API_KEY the assistant answers from the help articles only, and says so."""
from __future__ import annotations

import json
import re
from typing import Callable

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import ChatMessage, KnowledgeArticle, Payment, Subscription
from . import support
from .audit import log_error, record

MAX_TOOL_ROUNDS = 3
HISTORY = 12

FINANCIAL_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("refund", re.compile(r"\b(refund|money back|reimburse|charge ?back|dispute (a|the|my) (charge|payment)|revers(e|al) (of )?(the |a |my )?(payment|charge|transaction))", re.I)),
    ("cancellation", re.compile(r"\b(cancel|unsubscribe|stop (my )?(subscription|plan|billing|payments?))\b", re.I)),
    ("billing", re.compile(r"\b(downgrade|upgrade|change (my )?(plan|card|payment|billing|renewal)|update (my )?(card|payment( method)?|billing)|renewal date)\b", re.I)),
    ("account", re.compile(r"\b(delete|remove|close) (my )?account\b", re.I)),
]
HUMAN = re.compile(r"\b(human|real person|a person|someone|agent|staff|speak to|talk to) ?(support|team)?\b", re.I)
APPROVAL_CLAIM = re.compile(
    r"(\b(refund|cancellation|subscription|plan|payment|downgrade|upgrade|account)\b[^.!?]{0,60}\b(has|have|was|were|is now|will be)\b[^.!?]{0,20}\b"
    r"(approved|processed|issued|completed|cancell?ed|refunded|reversed|changed|upgraded|downgraded|deleted)\b)"
    r"|(\bI\s*(have|'ve|will|can)\s*(now\s*)?(refund|cancel|issue|process|approve|reverse|upgrade|downgrade|delete|change)(ed|led)?\b)", re.I)

FINANCIAL_REPLY = {
    "refund": "I can't issue, approve or promise refunds. Only a person on the TubeLead team can review a refund request.",
    "cancellation": "I can't cancel subscriptions or payments. You can cancel yourself any time in Billing & Subscription, or a person on our team can help.",
    "billing": "I can't change plans, renewal dates or payment details. You can manage these in Billing & Subscription, or a person on our team can help.",
    "account": "I can't delete or change accounts. You can delete your account in Settings, or a person on our team can help.",
}


def financial_intent(text: str) -> str | None:
    for cat, pat in FINANCIAL_PATTERNS:
        if pat.search(text):
            return cat
    return None


# ---------- knowledge ----------
_WORD = re.compile(r"[a-z0-9]+")
_STOP = {"the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "is", "it", "i", "my", "me", "do", "does", "how", "what", "can", "you",
         "with", "are", "be", "this", "that", "your", "we", "our", "about", "tubelead", "please", "hi", "hello"}


def _tokens(text: str) -> set[str]:
    return {w.rstrip("s") for w in _WORD.findall(text.lower()) if w not in _STOP and len(w) > 1}


def search_knowledge(db: Session, query: str, limit: int = 3) -> list[tuple[float, KnowledgeArticle]]:
    q = _tokens(query)
    if not q:
        return []
    scored = []
    for a in db.scalars(select(KnowledgeArticle).where(KnowledgeArticle.published.is_(True))).all():
        title, body = _tokens(a.title), _tokens(a.body)
        score = 3 * len(q & title) + len(q & body)
        if score:
            scored.append((score / (len(q) + 1), a))
    scored.sort(key=lambda x: -x[0])
    return scored[:limit]


# ---------- the only functions the assistant can call ----------
def _tool_search(db: Session, ctx: dict, args: dict) -> dict:
    hits = search_knowledge(db, str(args.get("query", ""))[:300])
    return {"articles": [{"title": a.title, "category": a.category, "text": a.body[:1500]} for _, a in hits]}


def _tool_billing_status(db: Session, ctx: dict, args: dict) -> dict:
    owner = ctx.get("owner")
    if not owner:
        return {"signed_in": False, "note": "The visitor is not signed in, so no billing information is available."}
    sub = db.get(Subscription, owner)
    pay = db.scalar(select(Payment).where(Payment.owner_id == owner).order_by(Payment.created_at.desc()))
    return {"signed_in": True, "plan": sub.plan if sub else "free", "status": sub.status if sub else "none",
            "renews_or_ends_on": sub.current_period_end.date().isoformat() if sub and sub.current_period_end else None,
            "cancel_at_period_end": bool(sub and sub.cancel_at_period_end), "last_payment_status": sub.last_payment_status if sub else None,
            "last_payment": {"amount": f"{pay.amount / 100:.2f} {pay.currency.upper()}", "date": pay.created_at.date().isoformat()} if pay else None,
            "read_only": True}


def _tool_create_ticket(db: Session, ctx: dict, args: dict) -> dict:
    owner = ctx.get("owner")
    email = str(args.get("email") or "").strip()
    if not owner and "@" not in email:
        return {"created": False, "error": "Ask the visitor for an email address so the team can reply."}
    desc = str(args.get("description") or "").strip()
    if len(desc) < 10:
        return {"created": False, "error": "Ask the visitor to describe the problem first."}
    t = support.create_ticket(db, owner=owner, email=email, category=str(args.get("category") or "general"),
                              subject=str(args.get("subject") or "Support request"), description=desc, source="chatbot",
                              conversation_id=ctx.get("conversation_id"))
    ctx["ticket_ref"] = t.ref
    return {"created": True, "reference": t.ref}


TOOLS: dict[str, Callable[[Session, dict, dict], dict]] = {
    "search_knowledge": _tool_search,
    "get_my_billing_status": _tool_billing_status,
    "create_support_ticket": _tool_create_ticket,
}

TOOL_SCHEMAS = [
    {"type": "function", "function": {"name": "search_knowledge", "description": "Search TubeLead help articles.",
     "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
    {"type": "function", "function": {"name": "get_my_billing_status", "description": "Read-only: the signed-in customer's plan, subscription status, renewal date and last payment.",
     "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "create_support_ticket", "description": "Open a ticket for the human support team once the visitor has described the problem.",
     "parameters": {"type": "object", "properties": {
         "category": {"type": "string", "enum": list(support.CATEGORIES)}, "subject": {"type": "string"},
         "description": {"type": "string"}, "email": {"type": "string", "description": "Required if the visitor is not signed in."}},
         "required": ["category", "subject", "description"]}}},
]


def run_tool(db: Session, ctx: dict, name: str, raw_args: str) -> dict:
    fn = TOOLS.get(name)
    if fn is None:
        record(db, "chatbot.tool_blocked", actor_type="chatbot", actor_id=ctx.get("owner"), target_type="conversation",
               target_id=ctx.get("conversation_id") or "", detail={"tool": name[:80]})
        ctx.setdefault("blocked_tools", []).append(name[:80])
        return {"error": "This action is not available to the assistant."}
    try:
        args = json.loads(raw_args or "{}")
        if not isinstance(args, dict):
            args = {}
    except ValueError:
        args = {}
    return fn(db, ctx, args)


SYSTEM = """You are the TubeLead support assistant. TubeLead helps businesses find YouTube creators through the official YouTube Data API and organise their publicly published contact details.
Answer only questions about TubeLead, using the help articles provided or found with search_knowledge. If the articles do not cover it, say you are not sure and offer to open a ticket for the team. Never invent prices, features or policies.
You cannot issue refunds, cancel or change subscriptions or payments, change billing details, delete accounts or change permissions, and you must never say that any of these has been or will be approved or done. For such requests, explain that a person on the team decides them and offer to open a ticket.
Be brief and friendly. Use British English."""


def guard_reply(text: str) -> tuple[str, bool]:
    if APPROVAL_CLAIM.search(text):
        return ("I can't approve or carry out refunds, cancellations or account changes, and nothing has been changed. "
                "A person on the TubeLead team can review this. Would you like me to open a support request?"), True
    return text, False


async def _openai(messages: list[dict], transport: httpx.AsyncBaseTransport | None) -> dict:
    s = get_settings()
    async with httpx.AsyncClient(base_url=s.openai_api_base, timeout=40, transport=transport) as c:
        r = await c.post("/chat/completions", json={"model": s.openai_model, "messages": messages, "tools": TOOL_SCHEMAS, "temperature": 0.2},
                         headers={"Authorization": f"Bearer {s.openai_api_key}"})
    if r.status_code >= 400:
        raise RuntimeError(f"OpenAI returned {r.status_code}")
    return r.json()


async def answer(db: Session, *, conversation_id: str, owner: str | None, text: str,
                 transport: httpx.AsyncBaseTransport | None = None) -> dict:
    """Produce the assistant's reply. Returns {reply, action, category, mode, meta}."""
    ctx: dict = {"owner": owner, "conversation_id": conversation_id}

    cat = financial_intent(text)
    if cat:  # decided before any model call
        record(db, "chatbot.financial_request_redirected", actor_type="chatbot", actor_id=owner, target_type="conversation",
               target_id=conversation_id, detail={"category": cat})
        return {"reply": FINANCIAL_REPLY[cat] + " Would you like me to pass your request to the team? You'll get a reference number.",
                "action": "offer_ticket", "category": cat, "mode": "rules", "meta": {"answered": True, "financial": cat}}
    if HUMAN.search(text) and len(text) < 120:
        return {"reply": "Of course. Tell us what you need and a person on the TubeLead team will reply by email.",
                "action": "offer_ticket", "category": "general", "mode": "rules", "meta": {"answered": True, "human": True}}

    if not get_settings().openai_api_key:
        hits = search_knowledge(db, text)
        if hits and hits[0][0] >= 0.5:
            a = hits[0][1]
            excerpt = a.body if len(a.body) <= 700 else a.body[:700].rsplit(" ", 1)[0] + "…"
            return {"reply": f"{a.title}\n\n{excerpt}", "action": None, "category": None, "mode": "help_articles",
                    "meta": {"answered": True, "article": a.id}}
        return {"reply": "I couldn't find an answer to that in our help articles. I can pass your question to the team, who will reply by email.",
                "action": "offer_ticket", "category": "general", "mode": "help_articles", "meta": {"answered": False}}

    hits = search_knowledge(db, text)
    kb = "\n\n".join(f"## {a.title}\n{a.body[:1500]}" for _, a in hits) or "(no matching articles)"
    history = db.scalars(select(ChatMessage).where(ChatMessage.conversation_id == conversation_id)
                         .order_by(ChatMessage.created_at.desc()).limit(HISTORY)).all()[::-1]
    messages: list[dict] = [{"role": "system", "content": SYSTEM + f"\nThe visitor is {'signed in' if owner else 'not signed in'}.\n\nRelevant help articles:\n{kb}"}]
    messages += [{"role": m.role, "content": m.content} for m in history if m.role in ("user", "assistant")]
    if not history or history[-1].content != text:
        messages.append({"role": "user", "content": text})
    tokens = 0
    try:
        for _ in range(MAX_TOOL_ROUNDS + 1):
            data = await _openai(messages, transport)
            tokens += int((data.get("usage") or {}).get("total_tokens") or 0)
            msg = data["choices"][0]["message"]
            calls = msg.get("tool_calls") or []
            if not calls:
                break
            messages.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": calls})
            for call in calls:
                fn = call.get("function") or {}
                result = run_tool(db, ctx, str(fn.get("name", "")), fn.get("arguments") or "{}")
                messages.append({"role": "tool", "tool_call_id": call.get("id", ""), "content": json.dumps(result)})
        else:
            msg = {"content": "Sorry, I couldn't finish that. Would you like me to pass it to the team?"}
    except Exception as exc:  # noqa: BLE001
        log_error("chatbot", f"Assistant failed: {type(exc).__name__}: {exc}")
        return {"reply": "Sorry, the assistant is unavailable right now. You can still send your question to the team.",
                "action": "offer_ticket", "category": "general", "mode": "ai", "meta": {"answered": False, "error": True}}
    reply, blocked = guard_reply((msg.get("content") or "").strip() or "Sorry, I don't have an answer for that.")
    if blocked:
        record(db, "chatbot.reply_blocked", actor_type="chatbot", actor_id=owner, target_type="conversation", target_id=conversation_id)
    action = "offer_ticket" if blocked else None
    if ctx.get("ticket_ref"):
        action = "ticket_created"
    return {"reply": reply, "action": action, "category": "general" if blocked else None, "mode": "ai", "ticket_ref": ctx.get("ticket_ref"),
            "meta": {"answered": True, "tokens": tokens, "blocked_tools": ctx.get("blocked_tools", []), "reply_blocked": blocked}}

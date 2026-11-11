"""Business infrastructure: support assistant restrictions, tickets, refunds, admin roles, accounts, email, webhooks."""
import inspect
import json
import time
import hashlib
import hmac

import httpx
import pytest

from app.auth import hash_key
from app.config import get_settings
from app.db import SessionLocal
from app.models import (ApiKey, AuditLog, ChatConversation, ChatMessage, Creator, EmailOutbox, KnowledgeArticle, Payment, RefundRequest,
                        Subscription, SupportTicket, UserAccount)
from app.routers import support as support_router
from app.services import email as mail
from app.services import support_bot
from app.services.knowledge_seed import seed


# ---------- helpers ----------
def user(role: str = "customer", email: str | None = None, uid: str | None = None) -> dict:
    """Create a user with an API key; returns headers that authenticate as them."""
    import uuid
    uid = uid or str(uuid.uuid4())
    raw = "tl_" + uuid.uuid4().hex
    with SessionLocal() as db:
        db.add(ApiKey(owner_id=uid, name="t", key_hash=hash_key(raw), prefix=raw[:8]))
        db.add(UserAccount(owner_id=uid, email=email or f"{uid[:8]}@example.com", full_name="Test User", role=role))
        db.commit()
    return {"X-API-Key": raw, "_id": uid}


def H(u: dict) -> dict:
    return {"X-API-Key": u["X-API-Key"]}


@pytest.fixture(autouse=True)
def no_external(monkeypatch):
    s = get_settings()
    for k in ("openai_api_key", "resend_api_key", "admin_alert_email", "stripe_secret_key"):
        monkeypatch.setattr(s, k, "")
    with SessionLocal() as db:
        seed(db)
    support_router.BOT_TRANSPORT = None
    yield
    support_router.BOT_TRANSPORT = None


def fake_openai(replies: list[dict], calls: list):
    """Each reply is the 'message' object the fake model returns, in order."""
    it = iter(replies)

    def handler(req: httpx.Request):
        calls.append(json.loads(req.content))
        return httpx.Response(200, json={"choices": [{"message": next(it)}], "usage": {"total_tokens": 42}})
    return httpx.MockTransport(handler)


# ---------- assistant: restrictions enforced in code ----------
def test_assistant_tool_registry_is_exactly_three_safe_functions():
    assert set(support_bot.TOOLS) == {"search_knowledge", "get_my_billing_status", "create_support_ticket"}
    assert {t["function"]["name"] for t in support_bot.TOOL_SCHEMAS} == set(support_bot.TOOLS)


def test_assistant_module_has_no_route_to_stripe_or_billing_writes():
    src = inspect.getsource(support_bot)
    imports = [l for l in src.splitlines() if l.startswith(("import ", "from "))]
    assert not [l for l in imports if "billing" in l or "stripe" in l or "admin" in l or "accounts" in l], imports
    assert "api.stripe.com" not in src and "/v1/refunds" not in src and "stripe_secret_key" not in src
    # The billing tool only reads: no adds, deletes, commits or attribute writes.
    tool_src = inspect.getsource(support_bot._tool_billing_status)
    for w in ("db.add", "db.delete", "commit", ".status =", ".plan ="):
        assert w not in tool_src, w


@pytest.mark.parametrize("text,cat", [
    ("I want a refund please", "refund"),
    ("Can you give me my money back?", "refund"),
    ("please reverse the payment", "refund"),
    ("cancel my subscription", "cancellation"),
    ("downgrade me to starter", "billing"),
    ("change my card", "billing"),
    ("delete my account", "account"),
])
def test_financial_requests_never_reach_the_model(client, monkeypatch, text, cat):
    monkeypatch.setattr(get_settings(), "openai_api_key", "sk-test")
    calls = []
    support_router.BOT_TRANSPORT = fake_openai([{"content": "Your refund has been approved!"}], calls)
    r = client.post("/api/support/chat", json={"message": text})
    assert r.status_code == 200
    m = r.json()["message"]
    assert calls == [], "the model must not be called for financial requests"
    assert m["action"] == "offer_ticket" and m["category"] == cat
    assert "can't" in m["content"]
    assert "approved" not in m["content"].lower()


def test_model_asking_for_a_refund_tool_is_refused_and_audited(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "openai_api_key", "sk-test")
    stripe_hits = []
    monkeypatch.setattr(httpx.AsyncClient, "post", _guard_post(httpx.AsyncClient.post, stripe_hits))
    calls = []
    support_router.BOT_TRANSPORT = fake_openai([
        {"content": None, "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "issue_refund", "arguments": '{"amount": 4900}'}},
                                         {"id": "c2", "type": "function", "function": {"name": "cancel_subscription", "arguments": "{}"}}]},
        {"content": "I'm not able to do that, but I can pass it to the team."},
    ], calls)
    r = client.post("/api/support/chat", json={"message": "what plans do you have"})
    assert r.status_code == 200
    tool_results = [m for m in calls[1]["messages"] if m["role"] == "tool"]
    assert all("not available" in m["content"] for m in tool_results)
    assert stripe_hits == []
    with SessionLocal() as db:
        blocked = db.query(AuditLog).filter(AuditLog.action == "chatbot.tool_blocked").all()
        assert {b.detail["tool"] for b in blocked} == {"issue_refund", "cancel_subscription"}


def _guard_post(orig, hits):
    async def post(self, url, *a, **kw):
        if "stripe" in str(self.base_url) + str(url) or "/v1/refunds" in str(url):
            hits.append(url)
        return await orig(self, url, *a, **kw)
    return post


@pytest.mark.parametrize("claim", [
    "Good news, your refund has been approved and processed.",
    "I have cancelled your subscription.",
    "Your plan was downgraded to Starter.",
    "I've refunded the last payment.",
])
def test_reply_claiming_an_approval_is_replaced(client, monkeypatch, claim):
    monkeypatch.setattr(get_settings(), "openai_api_key", "sk-test")
    support_router.BOT_TRANSPORT = fake_openai([{"content": claim}], [])
    r = client.post("/api/support/chat", json={"message": "tell me about my account"})
    m = r.json()["message"]
    assert claim not in m["content"]
    assert "nothing has been changed" in m["content"]
    assert m["action"] == "offer_ticket"


def test_billing_status_tool_is_read_only_and_own_account_only(client, monkeypatch):
    a, b = user(), user()
    with SessionLocal() as db:
        db.add(Subscription(owner_id=a["_id"], plan="pro", status="active"))
        db.add(Subscription(owner_id=b["_id"], plan="elite", status="active"))
        db.commit()
    monkeypatch.setattr(get_settings(), "openai_api_key", "sk-test")
    calls = []
    support_router.BOT_TRANSPORT = fake_openai([
        {"content": None, "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "get_my_billing_status", "arguments": json.dumps({"owner": b["_id"]})}}]},
        {"content": "You're on Pro."},
    ], calls)
    r = client.post("/api/support/chat", json={"message": "what plan am I on"}, headers=H(a))
    assert r.status_code == 200
    result = json.loads([m for m in calls[1]["messages"] if m["role"] == "tool"][0]["content"])
    assert result["plan"] == "pro" and result["read_only"] is True  # ignores the requested other owner
    with SessionLocal() as db:
        assert db.get(Subscription, a["_id"]).plan == "pro"


def test_without_openai_key_answers_from_help_articles(client):
    r = client.post("/api/support/chat", json={"message": "where do the contact details come from"})
    m = r.json()["message"]
    assert m["mode"] == "help_articles"
    assert "Where do the contact details come from?" in m["content"]
    r = client.post("/api/support/chat", json={"message": "zxqv blorp"})
    assert r.json()["message"]["action"] == "offer_ticket"


def test_visitor_conversation_needs_its_token(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "auth_mode", "supabase")
    r = client.post("/api/support/chat", json={"message": "hello what is tubelead"})
    cid, tok = r.json()["conversation_id"], r.json()["token"]
    assert tok
    assert client.get(f"/api/support/chat/{cid}?token={tok}").status_code == 200
    assert client.get(f"/api/support/chat/{cid}?token=wrong").status_code == 404
    assert client.post("/api/support/chat", json={"message": "hi", "conversation_id": cid, "token": "nope"}).status_code == 404


def test_customer_cannot_read_another_customers_conversation_or_ticket(client):
    a, b = user(), user()
    cid = client.post("/api/support/chat", json={"message": "hello"}, headers=H(a)).json()["conversation_id"]
    assert client.get(f"/api/support/chat/{cid}", headers=H(b)).status_code == 404
    ref = client.post("/api/support/tickets", json={"subject": "Help", "description": "Something is broken here"}, headers=H(a)).json()["ref"]
    assert client.get(f"/api/support/tickets/{ref}", headers=H(b)).status_code == 404
    assert client.get(f"/api/support/tickets/{ref}", headers=H(a)).status_code == 200


# ---------- tickets & refund workflow ----------
def test_refund_request_from_chat_creates_ticket_refund_request_and_one_email(client):
    a = user(email="cust@example.com")
    with SessionLocal() as db:
        db.add(Payment(id="in_1", owner_id=a["_id"], amount=4900, currency="gbp", payment_intent_id="pi_1"))
        db.commit()
    r = client.post("/api/support/chat", json={"message": "I'd like a refund"}, headers=H(a))
    cid = r.json()["conversation_id"]
    t = client.post("/api/support/tickets", json={"category": "refund", "subject": "Refund request", "description": "Charged twice this month by mistake",
                                                  "conversation_id": cid}, headers=H(a))
    assert t.status_code == 201
    ref = t.json()["ref"]
    assert ref.startswith("TL-")
    hist = client.get(f"/api/support/chat/{cid}", headers=H(a)).json()["messages"]
    assert ref in hist[-1]["content"] and "Nothing has been approved" in hist[-1]["content"]
    with SessionLocal() as db:
        rr = db.query(RefundRequest).one()
        assert rr.status == "pending" and rr.payment_id == "in_1"
        emails = db.query(EmailOutbox).filter(EmailOutbox.template == "ticket_confirmation").all()
        assert len(emails) == 1 and emails[0].status == "not_configured"
        assert db.get(ChatConversation, cid).escalated is True


def test_visitor_ticket_requires_email(client):
    s = get_settings()
    old = s.auth_mode
    try:
        s.auth_mode = "supabase"
        r = client.post("/api/support/tickets", json={"subject": "Help", "description": "I cannot sign in at all"})
        assert r.status_code == 422
        r = client.post("/api/support/tickets", json={"subject": "Help", "description": "I cannot sign in at all", "email": "v@example.com"})
        assert r.status_code == 201
    finally:
        s.auth_mode = old


def test_refund_execution_rules(client, monkeypatch):
    cust, sup, adm = user(email="c@example.com"), user("support"), user("admin")
    with SessionLocal() as db:
        db.add(Payment(id="in_9", owner_id=cust["_id"], amount=4900, currency="gbp", payment_intent_id="pi_9"))
        db.commit()
    ref = client.post("/api/support/tickets", json={"category": "refund", "subject": "Refund", "description": "Please refund my last month"}, headers=H(cust)).json()["ref"]
    rid = client.get("/api/admin/refunds", headers=H(adm)).json()[0]["id"]

    # customers and support staff cannot see or decide refunds
    assert client.get("/api/admin/refunds", headers=H(cust)).status_code == 403
    assert client.post(f"/api/admin/refunds/{rid}/decision", json={"decision": "approved"}, headers=H(sup)).status_code == 403
    # cannot execute before approval
    assert client.post(f"/api/admin/refunds/{rid}/execute", json={"confirm": f"REFUND {ref}"}, headers=H(adm)).status_code == 409
    assert client.post(f"/api/admin/refunds/{rid}/decision", json={"decision": "approved", "note": "Duplicate charge"}, headers=H(adm)).json()["status"] == "approved"
    assert client.post(f"/api/admin/refunds/{rid}/decision", json={"decision": "rejected"}, headers=H(adm)).status_code == 409
    # wrong confirmation
    assert client.post(f"/api/admin/refunds/{rid}/execute", json={"confirm": "REFUND"}, headers=H(adm)).status_code == 422

    sent = []
    monkeypatch.setattr(get_settings(), "stripe_secret_key", "sk_test_x")

    async def fake_post(self, url, data=None, headers=None, **kw):
        sent.append({"url": url, "data": data, "headers": headers})
        return httpx.Response(200, json={"id": "re_1", "status": "succeeded"}, request=httpx.Request("POST", "https://api.stripe.com" + url))
    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    r = client.post(f"/api/admin/refunds/{rid}/execute", json={"confirm": f"refund {ref}"}, headers=H(adm))
    assert r.status_code == 200 and r.json()["status"] == "refunded" and r.json()["refund_amount"] == 4900
    assert sent[0]["url"] == "/v1/refunds" and sent[0]["data"]["payment_intent"] == "pi_9"
    assert sent[0]["headers"]["Idempotency-Key"] == f"tubelead-refund-{rid}"
    # cannot refund twice
    assert client.post(f"/api/admin/refunds/{rid}/execute", json={"confirm": f"REFUND {ref}"}, headers=H(adm)).status_code == 409
    with SessionLocal() as db:
        actions = [a.action for a in db.query(AuditLog).filter(AuditLog.target_id == rid).all()]
        assert {"refund.approved", "refund.execute_attempt", "refund.executed"} <= set(actions)
        assert db.get(Payment, "in_9").refunded_amount == 4900
        templates = {e.template for e in db.query(EmailOutbox).all()}
        assert {"refund_decision", "refund_issued"} <= templates


def test_staff_ticket_reply_emails_customer_once_and_customer_sees_it(client):
    cust, sup = user(email="c2@example.com"), user("support")
    ref = client.post("/api/support/tickets", json={"subject": "CSV problem", "description": "My CSV export is empty"}, headers=H(cust)).json()["ref"]
    me = client.get("/api/admin/staff", headers=H(sup)).json()[0]["id"]
    assert client.patch(f"/api/admin/tickets/{ref}", json={"assigned_to": cust["_id"]}, headers=H(sup)).status_code == 422  # not staff
    assert client.patch(f"/api/admin/tickets/{ref}", json={"assigned_to": me, "status": "in_progress"}, headers=H(sup)).json()["assigned_to"] == me
    client.post(f"/api/admin/tickets/{ref}/reply", json={"body": "Fixed it, please try again."}, headers=H(sup))
    mine = client.get(f"/api/support/tickets/{ref}", headers=H(cust)).json()
    assert mine["status"] == "waiting_customer" and mine["messages"][-1]["body"] == "Fixed it, please try again."
    client.post(f"/api/support/tickets/{ref}/reply", json={"body": "Works now, thanks"}, headers=H(cust))
    assert client.get(f"/api/support/tickets/{ref}", headers=H(cust)).json()["status"] == "open"
    with SessionLocal() as db:
        assert db.query(EmailOutbox).filter(EmailOutbox.template == "ticket_update").count() == 1


# ---------- admin roles, suspension, deletion ----------
def test_admin_routes_require_roles(client):
    cust, sup, adm = user(), user("support"), user("admin")
    for path in ("/api/admin/overview", "/api/admin/tickets", "/api/admin/conversations", "/api/admin/knowledge"):
        assert client.get(path, headers=H(cust)).status_code == 403, path
        assert client.get(path, headers=H(sup)).status_code == 200, path
    for path in ("/api/admin/customers", "/api/admin/subscriptions", "/api/admin/refunds", "/api/admin/system", "/api/admin/audit"):
        assert client.get(path, headers=H(sup)).status_code == 403, path
        assert client.get(path, headers=H(adm)).status_code == 200, path
    assert client.post("/api/admin/knowledge", json={"title": "New", "body": "Some useful text here"}, headers=H(sup)).status_code == 403
    assert client.patch(f"/api/admin/customers/{cust['_id']}/role", json={"role": "admin"}, headers=H(adm)).status_code == 403  # operator only


def test_suspended_customer_is_blocked_and_reactivated(client):
    cust, adm = user(email="s@example.com"), user("admin")
    assert client.get("/api/me", headers=H(cust)).status_code == 200
    assert client.post(f"/api/admin/customers/{cust['_id']}/status", json={"status": "suspended", "reason": "Abuse"}, headers=H(adm)).json()["status"] == "suspended"
    r = client.get("/api/me", headers=H(cust))
    assert r.status_code == 403 and r.json()["detail"]["code"] == "account_suspended"
    assert client.post(f"/api/admin/customers/{adm['_id']}/status", json={"status": "suspended"}, headers=H(adm)).status_code == 409  # not yourself
    client.post(f"/api/admin/customers/{cust['_id']}/status", json={"status": "active"}, headers=H(adm))
    assert client.get("/api/me", headers=H(cust)).status_code == 200


def test_account_deletion_removes_data_and_keeps_detached_support_records(client):
    cust = user(email="d@example.com")
    with SessionLocal() as db:
        db.add(Creator(owner_id=cust["_id"], youtube_channel_id="UCx", title="X", channel_url="https://youtube.com/channel/UCx"))
        db.commit()
    ref = client.post("/api/support/tickets", json={"subject": "Bye", "description": "Please help before I go"}, headers=H(cust)).json()["ref"]
    assert client.request("DELETE", "/api/me", json={"confirm": "nope"}, headers=H(cust)).status_code == 422
    with SessionLocal() as db:
        db.add(Subscription(owner_id=cust["_id"], plan="pro", status="active"))
        db.commit()
    assert client.request("DELETE", "/api/me", json={"confirm": "DELETE"}, headers=H(cust)).status_code == 409  # cancel first
    with SessionLocal() as db:
        db.get(Subscription, cust["_id"]).cancel_at_period_end = True
        db.commit()
    assert client.request("DELETE", "/api/me", json={"confirm": "DELETE"}, headers=H(cust)).json()["deleted"] is True
    with SessionLocal() as db:
        assert db.query(Creator).filter(Creator.owner_id == cust["_id"]).count() == 0
        t = db.query(SupportTicket).filter(SupportTicket.ref == ref).one()
        assert t.owner_id is None
        assert db.query(AuditLog).filter(AuditLog.action == "account.deleted").count() == 1


def test_new_account_gets_one_welcome_email_and_admin_alert(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "admin_alert_email", "owner@example.com")
    from app.services.accounts import touch
    with SessionLocal() as db:
        touch(db, "11111111-1111-1111-1111-111111111111", {"email": "new@example.com"})
        touch(db, "11111111-1111-1111-1111-111111111111", {"email": "new@example.com"})
        assert db.query(EmailOutbox).filter(EmailOutbox.template == "welcome").count() == 1
        assert db.query(EmailOutbox).filter(EmailOutbox.template == "admin_alert").count() == 1


# ---------- email delivery ----------
def test_email_dedupe_and_resend_delivery(monkeypatch):
    with SessionLocal() as db:
        assert mail.queue(db, to="x@example.com", template="payment_failed", ctx={"name": "X"}, dedupe_key="k1") is not None
        assert mail.queue(db, to="x@example.com", template="payment_failed", ctx={"name": "X"}, dedupe_key="k1") is None
    monkeypatch.setattr(get_settings(), "resend_api_key", "re_test")
    got = []

    def handler(req):
        got.append(json.loads(req.content))
        assert req.headers["Authorization"] == "Bearer re_test" and req.headers["Idempotency-Key"] == "k1"
        return httpx.Response(200, json={"id": "em_1"})
    assert mail.deliver_pending(httpx.MockTransport(handler)) == 1
    assert mail.deliver_pending(httpx.MockTransport(handler)) == 0  # already sent
    assert got[0]["to"] == ["x@example.com"] and "did not go through" in got[0]["subject"]


def test_email_failure_retries_then_logs(monkeypatch):
    monkeypatch.setattr(get_settings(), "resend_api_key", "re_test")
    with SessionLocal() as db:
        mail.queue(db, to="y@example.com", template="welcome", ctx={}, dedupe_key="k2")
    for _ in range(4):
        mail.deliver_pending(httpx.MockTransport(lambda req: httpx.Response(500, text="down")))
    from app.models import ErrorLog
    with SessionLocal() as db:
        row = db.query(EmailOutbox).filter(EmailOutbox.dedupe_key == "k2").one()
        assert row.status == "failed" and row.attempts == mail.MAX_ATTEMPTS
        assert db.query(ErrorLog).filter(ErrorLog.source == "email").count() == 1


# ---------- stripe webhook additions ----------
def _signed(client, ev: dict, secret="whsec_t"):
    payload = json.dumps(ev).encode()
    ts = str(int(time.time()))
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    return client.post("/api/billing/webhook", content=payload, headers={"stripe-signature": f"t={ts},v1={sig}", "content-type": "application/json"})


def test_webhook_records_payment_and_emails_once(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "stripe_webhook_secret", "whsec_t")
    cust = user(email="pay@example.com")
    with SessionLocal() as db:
        db.add(Subscription(owner_id=cust["_id"], plan="pro", status="active", stripe_customer_id="cus_1"))
        db.commit()
    ev = {"id": "evt_1", "type": "invoice.paid", "data": {"object": {"id": "in_77", "customer": "cus_1", "amount_paid": 4900, "currency": "gbp", "payment_intent": "pi_77", "created": 1700000000}}}
    assert _signed(client, ev).json()["result"] == "applied"
    assert _signed(client, ev).json()["duplicate"] is True
    fail = {"id": "evt_2", "type": "invoice.payment_failed", "data": {"object": {"id": "in_78", "customer": "cus_1"}}}
    _signed(client, fail)
    with SessionLocal() as db:
        assert db.get(Payment, "in_77").amount == 4900
        assert db.query(EmailOutbox).filter(EmailOutbox.template == "payment_confirmed").count() == 1
        assert db.query(EmailOutbox).filter(EmailOutbox.template == "payment_failed").count() == 1


def test_webhook_failure_is_logged_and_can_be_retried(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "stripe_webhook_secret", "whsec_t")
    from app.routers import billing
    from app.models import ErrorLog, StripeEvent
    cust = user()
    with SessionLocal() as db:
        db.add(Subscription(owner_id=cust["_id"], stripe_customer_id="cus_2"))
        db.commit()
    real = billing.apply_event
    monkeypatch.setattr(billing, "apply_event", lambda db, ev: (_ for _ in ()).throw(RuntimeError("db down")))
    ev = {"id": "evt_9", "type": "invoice.paid", "data": {"object": {"id": "in_9x", "customer": "cus_2", "amount_paid": 100, "currency": "gbp"}}}
    from fastapi.testclient import TestClient
    from app.main import app
    assert _signed(TestClient(app, raise_server_exceptions=False), ev).status_code == 500
    with SessionLocal() as db:
        assert db.get(StripeEvent, "evt_9") is None
        assert db.query(ErrorLog).filter(ErrorLog.source == "webhook").count() == 1
    monkeypatch.setattr(billing, "apply_event", real)
    assert _signed(client, ev).json()["result"] == "applied"


# ---------- knowledge & retention ----------
def test_knowledge_seeded_and_editable_by_admin(client):
    adm = user("admin")
    arts = client.get("/api/admin/knowledge", headers=H(adm)).json()
    assert any(a["title"] == "Plans and prices" and "£49" in a["body"] for a in arts)
    new = client.post("/api/admin/knowledge", json={"title": "Opening hours", "category": "support", "body": "Support replies Monday to Friday, 9am to 5pm UK time."}, headers=H(adm)).json()
    r = client.post("/api/support/chat", json={"message": "what are your opening hours"})
    assert "Monday to Friday" in r.json()["message"]["content"]
    assert client.delete(f"/api/admin/knowledge/{new['id']}", headers=H(adm)).status_code == 204


def test_old_conversations_are_purged_unless_linked_to_a_ticket():
    from datetime import datetime, timedelta, timezone
    from app.services.jobs import purge_old_chats
    old = datetime.now(timezone.utc) - timedelta(days=400)
    with SessionLocal() as db:
        a = ChatConversation(updated_at=old)
        b = ChatConversation(updated_at=old)
        db.add_all([a, b])
        db.flush()
        db.add(ChatMessage(conversation_id=a.id, role="user", content="x"))
        db.add(SupportTicket(ref="TL-KEEP01", subject="s", description="d", conversation_id=b.id))
        db.commit()
        aid, bid = a.id, b.id
    assert purge_old_chats() == 1
    with SessionLocal() as db:
        assert db.get(ChatConversation, aid) is None and db.get(ChatConversation, bid) is not None


# ---------- the payment provider is never named to customers ----------
def test_customer_facing_responses_never_name_the_payment_provider(client, monkeypatch):
    """Stripe is a backend detail for the owner. Customers' API responses, errors, help articles and emails must not name it."""
    cust = user(email="n@example.com")
    bodies = [client.get(p, headers=H(cust)).text for p in ("/api/billing", "/api/integrations", "/api/me", "/api/support/tickets")]
    monkeypatch.setattr(get_settings(), "plan_override", "")
    bodies.append(client.post("/api/billing/checkout", json={"plan": "pro", "interval": "monthly"}, headers=H(cust)).text)  # not configured
    bodies.append(client.post("/api/billing/checkout", json={"plan": "pro", "interval": "monthly"}, headers=H(cust)).text)
    for q in ("how do I cancel", "billing renewals", "refunds"):
        bodies.append(client.post("/api/support/chat", json={"message": q}).text)
    with SessionLocal() as db:
        bodies += [a.body + a.title for a in db.query(KnowledgeArticle).all()]
        from app.services import email as m
        for tpl, ctx in [("welcome", {}), ("payment_failed", {}), ("payment_confirmed", {"amount": "£49"}), ("cancellation_confirmed", {}),
                         ("subscription_confirmed", {"plan": "Pro"}), ("refund_decision", {"ref": "TL-X", "decision": "approved"}),
                         ("refund_issued", {"ref": "TL-X", "amount": "£49"})]:
            bodies.append("".join(m.render(tpl, ctx)))
    leaks = [b[:120] for b in bodies if "stripe" in b.lower()]
    assert leaks == [], leaks


def test_payment_provider_errors_are_generic_for_customers_and_logged_for_the_owner(client, monkeypatch):
    from app.models import ErrorLog
    from app.routers import billing
    monkeypatch.setattr(get_settings(), "stripe_secret_key", "sk_test_x")

    class R:
        status_code = 402
        headers = {"content-type": "application/json"}
        text = ""
        def json(self):
            return {"error": {"message": "Your card was declined (Stripe internal detail)"}}

    async def fake_request(self, method, path, **kw):
        return R()
    monkeypatch.setattr(httpx.AsyncClient, "request", fake_request)
    import asyncio
    with pytest.raises(Exception) as e:
        asyncio.run(billing._stripe("POST", "/v1/checkout/sessions", {}))
    assert "stripe" not in str(e.value.detail).lower()
    with SessionLocal() as db:
        assert db.query(ErrorLog).filter(ErrorLog.source == "payments").count() == 1

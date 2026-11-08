"""TubeLead additions: AI Connect, billing/webhooks, entitlements, pause/resume, video & topic discovery."""
import hashlib
import hmac
import json
import threading
import time

import httpx
import pytest
from sqlalchemy import select

from app.auth import DEV_OWNER
from app.config import get_settings
from app.db import SessionLocal
from app.models import AIProvider, AIRequestLog, Creator, DiscoveryJob, StripeEvent, Subscription
from app.schemas import JobParams
from app.services import ai, assistant, crypto
from app.services.discovery import expand_queries
from tests.fakes import youtube_handler
from tests.test_discovery import run_job


# ------------------------------------------------------------------ AI Connect
def openai_ok(req: httpx.Request) -> httpx.Response:
    if req.url.path.endswith("/chat/completions"):
        body = json.loads(req.content)
        user = body["messages"][-1]["content"]
        if "Request:" in user:
            txt = '```json\n{"keywords": ["fitness"], "countries": ["GB"], "min_subscribers": 10000, "max_subscribers": 100000, "require_email": true, "bogus": 1, "activity": "nonsense"}\n```'
        elif "keywords" in user:
            txt = '["home workouts", "calisthenics", "gym tips"]'
        else:
            txt = "OK"
        return httpx.Response(200, json={"model": body["model"], "choices": [{"message": {"content": txt}}], "usage": {"prompt_tokens": 20, "completion_tokens": 5}})
    if req.url.path.endswith("/models"):
        return httpx.Response(200, json={"data": [{"id": "gpt-4o-mini"}, {"id": "gpt-4o"}]})
    return httpx.Response(404)


@pytest.fixture
def mock_ai():
    state = {"handler": openai_ok, "calls": 0}

    def h(req):
        state["calls"] += 1
        return state["handler"](req)
    ai.TEST_TRANSPORT = httpx.MockTransport(h)
    yield state
    ai.TEST_TRANSPORT = None


def add_provider(client, **kw):
    body = {"provider": "openai", "label": "main", "api_key": "sk-test-1234567890abcdef", "model": "gpt-4o-mini", **kw}
    r = client.post("/api/ai/providers", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_key_is_encrypted_and_never_returned(client):
    p = add_provider(client)
    assert "api_key" not in p and "key_encrypted" not in p and p["has_key"] and "sk-test-1234567890abcdef" not in json.dumps(p)
    assert "sk-test-1234567890abcdef" not in client.get("/api/ai/providers").text
    with SessionLocal() as db:
        row = db.get(AIProvider, p["id"])
        assert "sk-test" not in row.key_encrypted and crypto.decrypt(row.key_encrypted) == "sk-test-1234567890abcdef"


def test_provider_validation_and_isolation(client):
    assert client.post("/api/ai/providers", json={"provider": "openai", "label": "x"}).status_code == 422  # key required
    assert client.post("/api/ai/providers", json={"provider": "custom", "label": "x"}).status_code == 422  # base url required
    assert client.post("/api/ai/providers", json={"provider": "custom", "label": "x", "base_url": "ftp://x"}).status_code == 422
    assert client.post("/api/ai/providers", json={"provider": "ollama", "label": "local", "base_url": "http://localhost:11434/v1"}).status_code == 201
    st = get_settings()
    st.ai_allow_private_hosts = False
    try:
        assert client.post("/api/ai/providers", json={"provider": "ollama", "label": "l2", "base_url": "http://127.0.0.1:11434/v1"}).status_code == 422
    finally:
        st.ai_allow_private_hosts = True
    p = add_provider(client, label="other")
    with SessionLocal() as db:  # a different owner cannot see or touch it
        db.get(AIProvider, p["id"]).owner_id = "00000000-0000-0000-0000-000000000002"
        db.commit()
    assert client.get("/api/ai/providers").json() == [x for x in client.get("/api/ai/providers").json() if x["id"] != p["id"]]
    assert client.delete(f"/api/ai/providers/{p['id']}").status_code == 404


def test_test_connection_ok_and_invalid_key(client, mock_ai):
    p = add_provider(client)
    r = client.post(f"/api/ai/providers/{p['id']}/test").json()
    assert r["ok"] and r["reply"] == "OK"
    assert client.get("/api/ai/providers").json()[0]["status"] == "connected"
    mock_ai["handler"] = lambda req: httpx.Response(401, json={"error": {"message": "Incorrect API key provided"}})
    r = client.post(f"/api/ai/providers/{p['id']}/test").json()
    assert not r["ok"] and r["code"] == "invalid_key" and "sk-test" not in json.dumps(r)
    assert client.get("/api/ai/providers").json()[0]["status"] == "error"


def test_models_and_rotation_and_delete(client, mock_ai):
    p = add_provider(client)
    assert client.get(f"/api/ai/providers/{p['id']}/models").json()["models"] == ["gpt-4o", "gpt-4o-mini"]
    r = client.patch(f"/api/ai/providers/{p['id']}", json={"api_key": "sk-rotated-9999999999"})
    assert r.json()["key_hint"].endswith("9999") and r.json()["status"] == "untested"
    assert client.delete(f"/api/ai/providers/{p['id']}").status_code == 204
    assert client.get("/api/ai/providers").json() == []


def test_anthropic_and_gemini_adapters(client):
    seen = {}

    def h(req: httpx.Request):
        seen[req.url.host] = dict(req.headers)
        if "anthropic" in req.url.host:
            return httpx.Response(200, json={"model": "claude-haiku-4-5", "content": [{"type": "text", "text": "OK"}], "usage": {"input_tokens": 9, "output_tokens": 2}})
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "OK"}]}}], "usageMetadata": {"promptTokenCount": 7, "candidatesTokenCount": 1}})
    ai.TEST_TRANSPORT = httpx.MockTransport(h)
    try:
        for prov in ("anthropic", "gemini"):
            pid = add_provider(client, provider=prov, label=prov, model="")["id"]
            r = client.post(f"/api/ai/providers/{pid}/test").json()
            assert r["ok"], r
        assert seen["api.anthropic.com"]["x-api-key"].startswith("sk-test") and "anthropic-version" in seen["api.anthropic.com"]
        assert seen["generativelanguage.googleapis.com"]["x-goog-api-key"].startswith("sk-test")
    finally:
        ai.TEST_TRANSPORT = None


def test_task_routing_fallback_disable_and_usage(client, mock_ai):
    a = add_provider(client, label="primary")
    b = add_provider(client, provider="openrouter", label="backup", model="openai/gpt-4o-mini")
    assert a["is_default"] and not b["is_default"]
    client.put("/api/ai/tasks/keyword_research", json={"provider_id": a["id"], "fallback_provider_id": b["id"], "enabled": True})
    # primary fails permanently -> fallback answers
    calls = []

    def h(req):
        calls.append(req.url.host)
        if req.url.host == "api.openai.com":
            return httpx.Response(500, json={"error": {"message": "boom"}})
        return openai_ok(req)
    ai.TEST_TRANSPORT = httpx.MockTransport(h)
    r = client.post("/api/ai/keywords", json={"topic": "fitness"}).json()
    assert r["source"] == "ai:openrouter" and "calisthenics" in r["keywords"]
    assert calls.count("api.openai.com") == 3 and calls[-1] == "openrouter.ai"  # 1 try + 2 retries, then fallback
    usage = client.get("/api/ai/usage").json()
    assert usage["requests"] == 2 and usage["errors"] == 1 and usage["by_provider"]["openrouter"]["requests"] == 1
    assert usage["recent"][0]["tokens"] in (25, 0)
    # disabled task never calls a provider
    client.put("/api/ai/tasks/keyword_research", json={"provider_id": a["id"], "enabled": False})
    n = len(calls)
    r = client.post("/api/ai/keywords", json={"topic": "fitness"}).json()
    assert r["source"] == "rules" and len(calls) == n


def test_no_provider_falls_back_to_rules_and_never_invents(client):
    r = client.post("/api/ai/keywords", json={"topic": "knitting"}).json()
    assert r["source"] == "rules" and r["keywords"][0] == "knitting"
    r = client.post("/api/ai/assistant/parse", json={"text": "UK fitness creators with 10k-100k subscribers and a public email"}).json()
    c = r["criteria"]
    assert r["source"] == "rules" and r["requires_confirmation"] and c["countries"] == ["GB"] and c["min_subscribers"] == 10000
    assert c["max_subscribers"] == 100000 and c["require_email"] is True and c["keywords"] == ["fitness"]
    assert client.post("/api/ai/creators/00000000-0000-0000-0000-0000000000aa/analyse").status_code == 404


def test_assistant_validates_model_output(client, mock_ai):
    add_provider(client)
    r = client.post("/api/ai/assistant/parse", json={"text": "fitness UK"}).json()
    assert r["source"] == "ai:openai"
    assert "bogus" in r["dropped"] and "activity" in r["dropped"]  # invalid fields never reach the form
    assert r["criteria"]["countries"] == ["GB"]


def test_ai_feature_is_paywalled_on_free(client):
    get_settings().plan_override = ""
    r = client.post("/api/ai/providers", json={"provider": "ollama", "label": "x"})
    assert r.status_code == 402 and r.json()["detail"]["code"] == "paywall" and r.json()["detail"]["required_plan"] == "Starter"


# ------------------------------------------------------------------ billing
SECRET = "whsec_test_secret"


def signed(event: dict, secret=SECRET, ts=None):
    payload = json.dumps(event).encode()
    ts = ts or int(time.time())
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    return payload, {"Stripe-Signature": f"t={ts},v1={sig}", "Content-Type": "application/json"}


@pytest.fixture
def stripe_cfg():
    st = get_settings()
    old = (st.stripe_webhook_secret, st.stripe_secret_key, st.stripe_price_pro_monthly, st.stripe_price_starter_monthly)
    st.stripe_webhook_secret, st.stripe_secret_key = SECRET, "sk_test_x"
    st.stripe_price_pro_monthly, st.stripe_price_starter_monthly = "price_pro_m", "price_starter_m"
    st.plan_override = ""
    yield
    st.stripe_webhook_secret, st.stripe_secret_key, st.stripe_price_pro_monthly, st.stripe_price_starter_monthly = old


def post_event(client, event, **kw):
    payload, headers = signed(event, **kw)
    return client.post("/api/billing/webhook", content=payload, headers=headers)


def sub_event(eid, typ="customer.subscription.updated", status="active", price="price_pro_m", **extra):
    return {"id": eid, "type": typ, "data": {"object": {"id": "sub_1", "customer": "cus_1", "status": status, "metadata": {"owner_id": DEV_OWNER},
                                                          "items": {"data": [{"price": {"id": price}}]}, "current_period_end": int(time.time()) + 86400 * 30,
                                                          "cancel_at_period_end": False, **extra}}}


def test_webhook_rejects_bad_signature_replay_and_missing_secret(client, stripe_cfg):
    ev = sub_event("evt_bad")
    payload, h = signed(ev, secret="wrong")
    assert client.post("/api/billing/webhook", content=payload, headers=h).status_code == 400
    payload, h = signed(ev, ts=int(time.time()) - 4000)
    assert client.post("/api/billing/webhook", content=payload, headers=h).status_code == 400  # outside tolerance
    assert client.post("/api/billing/webhook", content=payload).status_code == 400
    assert client.get("/api/billing").json()["current_plan"] == "free"  # nothing unlocked
    get_settings().stripe_webhook_secret = ""
    assert post_event(client, ev).status_code == 503


def test_verified_webhook_unlocks_then_downgrades(client, stripe_cfg):
    assert post_event(client, sub_event("evt_1")).json()["result"] == "applied"
    b = client.get("/api/billing").json()
    assert b["current_plan"] == "pro" and b["subscription"]["status"] == "active" and b["usage"]["leads_allowance"] == 25000
    assert post_event(client, sub_event("evt_1")).json().get("duplicate")  # idempotent
    # payment failure keeps access (grace) but is surfaced
    post_event(client, {"id": "evt_2", "type": "invoice.payment_failed", "data": {"object": {"customer": "cus_1", "subscription": "sub_1"}}})
    b = client.get("/api/billing").json()
    assert b["subscription"]["status"] == "past_due" and b["subscription"]["last_payment_status"] == "failed" and b["current_plan"] == "pro"
    post_event(client, {"id": "evt_3", "type": "invoice.paid", "data": {"object": {"customer": "cus_1", "subscription": "sub_1"}}})
    assert client.get("/api/billing").json()["subscription"]["status"] == "active"
    post_event(client, {"id": "evt_4", "type": "charge.refunded", "data": {"object": {"customer": "cus_1"}}})
    assert client.get("/api/billing").json()["subscription"]["last_payment_status"] == "refunded"
    post_event(client, sub_event("evt_5", "customer.subscription.updated", cancel_at_period_end=True))
    assert client.get("/api/billing").json()["subscription"]["cancel_at_period_end"] is True
    post_event(client, sub_event("evt_6", "customer.subscription.deleted", status="canceled"))
    b = client.get("/api/billing").json()
    assert b["current_plan"] == "free" and b["subscription"]["status"] == "canceled"
    with SessionLocal() as db:
        assert db.scalar(select(StripeEvent).where(StripeEvent.id == "evt_6"))


def test_checkout_uses_stripe_and_never_unlocks(client, stripe_cfg):
    captured = {}

    def stripe_handler(req: httpx.Request):
        captured["body"] = dict(x.split("=", 1) for x in req.content.decode().split("&"))
        captured["auth"] = req.headers["authorization"]
        return httpx.Response(200, json={"id": "cs_test_1", "url": "https://checkout.stripe.test/pay/cs_test_1"})
    real = httpx.AsyncClient

    class Patched(real):
        def __init__(self, *a, **k):
            k["transport"] = httpx.MockTransport(stripe_handler)
            super().__init__(*a, **k)
    import app.routers.billing as bill
    bill.httpx.AsyncClient = Patched
    try:
        r = client.post("/api/billing/checkout", json={"plan": "pro", "interval": "monthly"})
    finally:
        bill.httpx.AsyncClient = real
    assert r.status_code == 200 and r.json()["url"].startswith("https://checkout.stripe.test/")
    assert captured["body"]["line_items%5B0%5D%5Bprice%5D"] == "price_pro_m" and captured["auth"] == "Bearer sk_test_x"
    assert client.get("/api/billing").json()["current_plan"] == "free"  # only a verified webhook changes the plan
    assert client.post("/api/billing/checkout", json={"plan": "elite", "interval": "monthly"}).status_code == 503  # price not configured
    assert client.post("/api/billing/checkout", json={"plan": "free"}).status_code == 422
    assert client.post("/api/billing/portal").status_code == 409


def test_billing_not_configured_is_explicit(client):
    get_settings().plan_override = ""
    assert client.get("/api/billing").json()["stripe_configured"] is False or get_settings().stripe_secret_key
    st = get_settings()
    old = st.stripe_secret_key
    st.stripe_secret_key = ""
    try:
        r = client.post("/api/billing/checkout", json={"plan": "starter", "interval": "annual"})
        assert r.status_code == 503
    finally:
        st.stripe_secret_key = old


# ------------------------------------------------------------------ entitlements
def test_free_trial_allowance_caps_jobs_and_paywalls(client):
    get_settings().plan_override = ""
    r = client.post("/api/jobs", json={"params": {"keywords": ["tech"], "min_subscribers": 1000, "limit": 100}})
    assert r.status_code == 201
    assert r.json()["params"]["limit"] == 25  # clamped to the 25-lead free trial
    assert client.get("/api/creators/export.csv").status_code == 402
    d = client.get("/api/creators/export.csv").json()["detail"]
    assert d["code"] == "paywall" and d["feature"] == "csv_export" and d["required_plan"] == "Starter"
    assert client.post("/api/jobs", json={"params": {"keywords": ["tech"]}, "schedule": "daily"}).json()["detail"]["feature"] == "scheduled_discovery"
    assert client.post("/api/api-keys", json={"name": "k"}).status_code == 402
    # exhaust the trial
    with SessionLocal() as db:
        for i in range(25):
            db.add(Creator(owner_id=DEV_OWNER, youtube_channel_id=f"UCx{i}", title=f"c{i}", channel_url="https://x"))
        db.commit()
    r = client.post("/api/jobs", json={"params": {"keywords": ["tech"]}})
    assert r.status_code == 402 and r.json()["detail"]["reason"] == "allowance_reached"
    u = client.get("/api/billing").json()["usage"]
    assert u["at_limit"] and u["leads_used"] == 25 and u["period"] == "lifetime"


def test_settings_cannot_self_upgrade(client):
    get_settings().plan_override = ""
    client.put("/api/settings", json={"plan": "elite", "display_name": "x"})
    assert client.get("/api/billing").json()["current_plan"] == "free"


# ------------------------------------------------------------------ discovery modes
def test_video_and_topic_sources():
    vq = expand_queries(JobParams(keywords=["chess"], source="videos"))
    assert vq and all(q.kind == "video" for q in vq)
    tq = expand_queries(JobParams(keywords=["chess"], source="topics"))
    assert len(tq) == 1 + 5 and any(q.q == "chess how to" for q in tq)
    p = JobParams(seed_videos=["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/aaaaaaaaaaa", "junk"])
    assert p.seed_videos == ["dQw4w9WgXcQ", "aaaaaaaaaaa"]


def test_video_discovery_runs_and_counts_failures():
    calls = []
    job, _ = run_job({"keywords": ["tech"], "source": "videos", "min_subscribers": 1000, "limit": 5}, calls)
    assert job.status == "completed" and job.qualified >= 1 and job.keywords_done == 1 and job.contact_routes_found >= 1
    # a non-fatal failure is counted, not fatal
    base = youtube_handler([])

    def flaky(req):
        if req.url.path.endswith("/search") and dict(req.url.params).get("q") == "flaky":
            return httpx.Response(500, json={"error": {"message": "backend error"}})
        return base(req)
    import asyncio
    from app.services import jobs as job_svc
    with SessionLocal() as db:
        jid = job_svc.create_job(db, DEV_OWNER, JobParams(keywords=["flaky", "tech"], min_subscribers=1000, limit=5).model_dump()).id
    asyncio.run(job_svc._run_job_async(jid, yt_transport=httpx.MockTransport(flaky), fetcher=None))
    with SessionLocal() as db:
        j = db.get(DiscoveryJob, jid)
        assert j.status == "completed" and j.failed_requests == 1 and j.channels_found >= 1  # (channels already saved above are deduped)


def test_pause_blocks_progress_then_resume_and_cancel(client):
    import asyncio
    from app.services import jobs as job_svc
    base = youtube_handler([])
    gate = threading.Event()

    def slow(req):
        gate.wait(5)
        return base(req)
    with SessionLocal() as db:
        jid = job_svc.create_job(db, DEV_OWNER, JobParams(keywords=["a", "b", "c"], min_subscribers=1000, limit=50).model_dump()).id
    t = threading.Thread(target=lambda: asyncio.run(job_svc._run_job_async(jid, yt_transport=httpx.MockTransport(slow), fetcher=None)))
    t.start()
    for _ in range(50):
        if client.get(f"/api/jobs/{jid}").json()["status"] == "running":
            break
        time.sleep(0.1)
    assert client.post(f"/api/jobs/{jid}/pause").json()["status"] == "paused"
    gate.set()
    time.sleep(1.2)
    done_paused = client.get(f"/api/jobs/{jid}").json()["queries_done"]
    time.sleep(1.2)
    j = client.get(f"/api/jobs/{jid}").json()
    assert j["status"] == "paused" and j["queries_done"] == done_paused < 3  # no progress while paused
    assert client.post(f"/api/jobs/{jid}/pause").status_code == 409
    assert client.post(f"/api/jobs/{jid}/resume").json()["status"] == "running"
    t.join(15)
    assert client.get(f"/api/jobs/{jid}").json()["status"] == "completed"
    assert client.post(f"/api/jobs/{jid}/resume").status_code == 409


def test_contact_status_summary_separates_statuses(client):
    from app.models import ContactRoute
    with SessionLocal() as db:
        mk = lambda i, **kw: Creator(owner_id=DEV_OWNER, youtube_channel_id=f"UCs{i}", title=f"c{i}", channel_url="https://x", **kw)
        a, b, c, d, e = mk(1), mk(2, website="https://b.test"), mk(3, contact_page="https://c.test/contact"), mk(4), mk(5)
        db.add_all([a, b, c, d, e]); db.flush()
        db.add(ContactRoute(owner_id=DEV_OWNER, creator_id=a.id, kind="email", value="a@a.test", source="channel_description", status="published"))
        db.add(ContactRoute(owner_id=DEV_OWNER, creator_id=d.id, kind="email", value="d@d.test", source="channel_description", status="published", mx_valid=True))
        db.add(ContactRoute(owner_id=DEV_OWNER, creator_id=e.id, kind="email", value="e@e.test", source="manual", status="unverified"))
        db.commit()
    s = client.get("/api/contacts/status-summary").json()
    assert s["total"] == 5 and s["primary"] == {"deliverability_checked": 1, "publicly_published": 1, "unverified": 1, "website": 1, "contact_form": 1, "none": 0}
    row = [c for c in client.get("/api/creators?page_size=50").json()["items"] if c["title"] == "c4"][0]
    assert row["contact_status"] == "deliverability_checked"


def test_provider_error_bodies_never_leak_the_key(client):
    p = add_provider(client, api_key="sk-leaky-secret-0123456789abcd")
    ai.TEST_TRANSPORT = httpx.MockTransport(lambda req: httpx.Response(401, json={"error": {"message": "Incorrect API key provided: sk-leaky-secret-0123456789abcd"}}))
    try:
        r = client.post(f"/api/ai/providers/{p['id']}/test").json()
        assert not r["ok"] and "sk-leaky" not in json.dumps(r)
        assert "sk-leaky" not in client.get("/api/ai/providers").text
        client.post("/api/ai/keywords", json={"topic": "x"})
        assert "sk-leaky" not in client.get("/api/ai/usage").text
    finally:
        ai.TEST_TRANSPORT = None


def test_tenant_isolation_under_supabase_auth():
    """Two real users (JWTs): neither can read or change the other's providers, creators, jobs or billing."""
    import jwt
    from fastapi.testclient import TestClient
    from app.main import app
    st = get_settings()
    old = (st.auth_mode, st.supabase_jwt_secret, st.plan_override)
    st.auth_mode, st.supabase_jwt_secret, st.plan_override = "supabase", "x" * 40, "elite"  # override must be IGNORED outside dev mode
    UA, UB = "aaaaaaaa-0000-0000-0000-000000000001", "bbbbbbbb-0000-0000-0000-000000000002"
    tok = lambda sub: {"Authorization": "Bearer " + jwt.encode({"sub": sub, "aud": "authenticated"}, "x" * 40, algorithm="HS256")}
    A, B = tok(UA), tok(UB)
    from app.services import jobs as job_svc
    real_submit, job_svc.submit = job_svc.submit, lambda _id: None  # don't launch a real worker
    try:
        with TestClient(app) as c:
            assert c.get("/api/ai/providers").status_code == 401
            assert c.get("/api/ai/providers", headers={"Authorization": "Bearer garbage"}).status_code == 401
            r = c.post("/api/ai/providers", headers=A, json={"provider": "openai", "label": "a", "api_key": "sk-aaaaaaaaaaaa1111"})
            assert r.status_code == 402 and r.json()["detail"]["current_plan"] == "free"  # dev override ignored: no free ride in production
            with SessionLocal() as db:
                for u in (UA, UB):
                    db.add(Subscription(owner_id=u, plan="starter", status="active"))
                db.add(Creator(owner_id=UA, youtube_channel_id="UCiso1", title="A's creator", channel_url="https://x"))
                db.commit()
            pa = c.post("/api/ai/providers", headers=A, json={"provider": "openai", "label": "a", "api_key": "sk-aaaaaaaaaaaa1111"}).json()
            assert c.get("/api/ai/providers", headers=B).json() == []
            for method, path in (("get", f"/api/ai/providers/{pa['id']}/models"), ("post", f"/api/ai/providers/{pa['id']}/test"), ("delete", f"/api/ai/providers/{pa['id']}")):
                assert getattr(c, method)(path, headers=B).status_code == 404, path
            assert c.patch(f"/api/ai/providers/{pa['id']}", headers=B, json={"label": "pwn"}).status_code == 404
            assert c.put("/api/ai/tasks/keyword_research", headers=B, json={"provider_id": pa["id"]}).status_code == 404  # cannot route to someone else's provider
            ca = c.get("/api/creators", headers=A).json()
            assert ca["total"] == 1 and c.get("/api/creators", headers=B).json()["total"] == 0
            assert c.get(f"/api/creators/{ca['items'][0]['id']}", headers=B).status_code == 404
            assert "A's creator" not in c.get("/api/creators/export.csv", headers=B).text
            ja = c.post("/api/jobs", headers=A, json={"params": {"keywords": ["x"]}}).json()
            for method, path in (("get", ""), ("post", "/cancel"), ("post", "/pause"), ("post", "/resume")):
                assert getattr(c, method)(f"/api/jobs/{ja['id']}{path}", headers=B).status_code == 404, path
            assert ja["id"] not in c.get("/api/jobs", headers=B).text
            assert c.get("/api/billing", headers=B).json()["usage"]["leads_used"] == 0 and c.get("/api/billing", headers=A).json()["usage"]["leads_used"] == 1
            kb = c.get("/api/api-keys", headers=B).json(); assert kb == []
    finally:
        job_svc.submit = real_submit
        st.auth_mode, st.supabase_jwt_secret, st.plan_override = old


def test_asymmetric_supabase_token_verified_with_public_key(client):
    """Newer Supabase projects sign with ES256; the backend must verify against the project's public key."""
    import jwt as pyjwt
    from cryptography.hazmat.primitives.asymmetric import ec
    from unittest import mock
    from app import auth as auth_mod
    priv = ec.generate_private_key(ec.SECP256R1())
    now = int(time.time())
    token = pyjwt.encode({"sub": "cccccccc-0000-0000-0000-000000000003", "aud": "authenticated", "exp": now + 300}, priv, algorithm="ES256")
    st = get_settings()
    old = (st.auth_mode, st.supabase_url)
    st.auth_mode, st.supabase_url = "supabase", "https://example.supabase.co"
    fake_client = mock.Mock()
    fake_client.get_signing_key_from_jwt.return_value = mock.Mock(key=priv.public_key())
    auth_mod._jwks_clients["https://example.supabase.co/auth/v1/.well-known/jwks.json"] = fake_client
    try:
        assert client.get("/api/status", headers={"Authorization": f"Bearer {token}"}).status_code == 200
        bad = pyjwt.encode({"sub": "x", "aud": "authenticated"}, ec.generate_private_key(ec.SECP256R1()), algorithm="ES256")
        fake_client.get_signing_key_from_jwt.return_value = mock.Mock(key=priv.public_key())
        assert client.get("/api/status", headers={"Authorization": f"Bearer {bad}"}).status_code == 401
    finally:
        st.auth_mode, st.supabase_url = old
        auth_mod._jwks_clients.pop("https://example.supabase.co/auth/v1/.well-known/jwks.json", None)


def test_database_url_with_stray_newline_is_cleaned(monkeypatch):
    from app.config import Settings
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./x.db\n")
    assert Settings().database_url == "sqlite:///./x.db"

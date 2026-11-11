"""Growth Assistant, Creative Studio and outreach."""
import base64
import json
import struct
import zlib

import httpx
import pytest

from app.config import get_settings
from app.db import SessionLocal
from app.models import (AuditLog, CampaignRecipient, EmailDocument, GrowthSession, OutreachReply, Prospect, ProspectContact, Suppression, UsageEvent,
                        UserAccount)
from app.providers.base import OK, Lead, ProviderResult
from app.routers import growth as growth_router, studio as studio_router
from app.services import email_check as C, email_doc as E, growth as G, search_everywhere as se
from app.services.snov import SnovClient
from tests.test_business import H, user


class FakeProvider:
    def __init__(self, name, leads):
        self.name, self.label, self.required_settings, self._leads = name, name.title(), (), leads

    def configured(self):
        return True

    async def search(self, query, limit):
        self.query = query
        return ProviderResult(self.name, OK, f"{len(self._leads)} results", self._leads)


class FakeFetcher:
    def __init__(self, pages):
        self.pages = pages

    async def get(self, url):
        html = self.pages.get(url)
        return ("ok", html, url) if html else ("unreachable", None, url)

    async def aclose(self):
        pass


@pytest.fixture(autouse=True)
def setup(monkeypatch):
    s = get_settings()
    for k in ("openai_api_key", "resend_api_key", "snov_client_id", "snov_client_secret", "brave_api_key"):
        monkeypatch.setattr(s, k, "")
    monkeypatch.setattr(growth_router, "INLINE", True)
    monkeypatch.setattr(studio_router, "SKIP_NETWORK", True)
    monkeypatch.setattr(SnovClient, "poll_interval", 0)
    leads = [
        Lead(provider="brave", creator_name="Luigi's Trattoria", source_url="https://luigis.example/", snippet="Independent Italian restaurant in London. Book now for dinner."),
        Lead(provider="brave", creator_name="Luigi's Trattoria (menu)", source_url="https://luigis.example/menu", snippet="Menu"),
        Lead(provider="google", creator_name="The Corner Cafe", source_url="https://cornercafe.example/", snippet="Family cafe in Leeds"),
        Lead(provider="youtube", creator_name="London Food Vlog", source_url="https://www.youtube.com/channel/UC1", youtube_url="https://www.youtube.com/channel/UC1",
             youtube_channel_id="UC1", verification_status="verified", snippet="Restaurant reviews across London"),
    ]
    monkeypatch.setattr(se, "PROVIDERS", [FakeProvider("brave", leads[:2]), FakeProvider("google", leads[2:3]), FakeProvider("youtube", leads[3:])])
    yield


def start(client, h, text="I sell website design services to independent restaurants in London."):
    r = client.post("/api/growth/describe", json={"description": text}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------- step 1 + 2
def test_describe_interprets_and_is_editable(client):
    u = user()
    s = start(client, H(u))
    assert s["business"]["product"] == "Website design services" and s["business"]["location"] == "London" and s["business"]["interpreted_by"] == "rules"
    assert client.post("/api/growth/describe", json={"description": "web design"}, headers=H(u)).status_code == 422
    r = client.put(f"/api/growth/sessions/{s['id']}/business", json={**s["business"], "location": "Camden"}, headers=H(u)).json()
    assert r["business"]["location"] == "Camden"
    assert client.get("/api/growth/sessions/current", headers=H(u)).json()["id"] == s["id"]
    other = user()
    assert client.get(f"/api/growth/sessions/{s['id']}", headers=H(other)).status_code == 404


def test_discovery_dedupes_scores_with_evidence_and_records_credit(client):
    u = user()
    s = start(client, H(u))
    r = client.post(f"/api/growth/sessions/{s['id']}/discover", headers=H(u))
    assert r.status_code == 202
    sess = client.get(f"/api/growth/sessions/{s['id']}", headers=H(u)).json()
    d = sess["discovery"]
    assert d["status"] == "done" and d["stage"] == 6 and len(d["stages"]) == 6
    assert d["totals"]["found"] == 3 and d["totals"]["duplicates_removed"] >= 1  # luigis.example appears twice
    assert {x["name"] for x in d["sources"]} == {"Brave", "Google", "Youtube"}
    ps = client.get(f"/api/growth/sessions/{s['id']}/prospects", headers=H(u)).json()
    luigi = next(p for p in ps if p["domain"] == "luigis.example")
    assert luigi["breakdown"]["relevance"]["points"] > 0 and luigi["breakdown"]["relevance"]["basis"] == "fact"
    assert any("restaurant" in e.lower() for e in luigi["breakdown"]["relevance"]["evidence"])
    assert any("bookings" in e for e in luigi["breakdown"]["signals"]["evidence"])
    assert luigi["breakdown"]["contact"]["basis"] == "estimate"  # not checked yet
    vlog = next(p for p in ps if p["platform"] == "youtube")
    assert any("confirmed by the Youtube API" in e for e in vlog["breakdown"]["activity"]["evidence"])
    assert sum(v["max"] for v in luigi["breakdown"].values()) == 100
    with SessionLocal() as db:
        assert db.query(UsageEvent).filter(UsageEvent.owner_id == u["_id"], UsageEvent.kind == "discovery").count() == 1


def test_discovery_without_sources_fails_honestly(client, monkeypatch):
    monkeypatch.setattr(se, "PROVIDERS", [])
    u = user()
    s = start(client, H(u))
    client.post(f"/api/growth/sessions/{s['id']}/discover", headers=H(u))
    d = client.get(f"/api/growth/sessions/{s['id']}", headers=H(u)).json()["discovery"]
    assert d["status"] == "failed" and "No discovery source" in d["error"]
    assert client.get(f"/api/growth/sessions/{s['id']}/prospects", headers=H(u)).json() == []


def test_discovery_credit_limit(client, monkeypatch):
    u = user()
    st = get_settings()
    monkeypatch.setattr(st, "plan_override", "free")
    s = start(client, H(u))
    with SessionLocal() as db:
        db.add(UsageEvent(owner_id=u["_id"], kind="discovery", units=5))
        db.commit()
    r = client.post(f"/api/growth/sessions/{s['id']}/discover", headers=H(u))
    assert r.status_code == 402 and "5 of 5" in r.json()["detail"]["message"]


# ---------------- step 3: enrichment
def snov_transport(domain_rows, verify):
    def handler(req: httpx.Request):
        p = req.url.path
        if p.endswith("/oauth/access_token"):
            return httpx.Response(200, json={"access_token": "tok", "expires_in": 3600})
        if p.endswith("/domain-emails/start"):
            return httpx.Response(200, json={"meta": {"task_hash": "t1"}})
        if "/domain-emails/result/" in p:
            return httpx.Response(200, json={"status": "completed", "data": domain_rows})
        if p.endswith("/email-verification/start"):
            return httpx.Response(200, json={"meta": {"task_hash": "v1"}})
        if p.endswith("/email-verification/result"):
            return httpx.Response(200, json={"status": "completed", "data": [{"email": e, "result": {"smtp_status": st}} for e, st in verify.items()]})
        if p.endswith("/add-prospect-to-list"):
            return httpx.Response(200, json={"success": True})
        if p.endswith("/get-user-lists"):
            return httpx.Response(200, json=[{"id": 77, "name": "TubeLead"}])
        return httpx.Response(404)
    return httpx.MockTransport(handler)


def discovered(client, u):
    s = start(client, H(u))
    client.post(f"/api/growth/sessions/{s['id']}/discover", headers=H(u))
    ps = client.get(f"/api/growth/sessions/{s['id']}/prospects", headers=H(u)).json()
    return s, ps


def test_enrichment_from_website_and_snov_with_statuses(client, monkeypatch):
    u = user()
    s, ps = discovered(client, u)
    web = [p for p in ps if p["platform"] == "web"]
    client.post(f"/api/growth/sessions/{s['id']}/select", json={"ids": [p["id"] for p in web], "selected": True}, headers=H(u))
    monkeypatch.setattr(get_settings(), "snov_client_id", "id")
    monkeypatch.setattr(get_settings(), "snov_client_secret", "sec")
    monkeypatch.setattr(SnovClient, "transport", snov_transport(
        [{"email": "maria@luigis.example", "first_name": "Maria", "last_name": "Rossi", "position": "Owner"}],
        {"maria@luigis.example": "valid", "hello@luigis.example": "unknown", "bad@luigis.example": "invalid"}))
    fetcher = FakeFetcher({"https://luigis.example/": '<a href="mailto:hello@luigis.example">Email</a> <a href="mailto:bad@luigis.example">x</a> <a href="/contact">Contact</a>',
                           "https://luigis.example/contact": "Write to luigisbookings@gmail.com"})
    monkeypatch.setattr(G, "start_enrichment", lambda sid, inline=False, fetcher=None: G.run_enrichment(sid, fetcher=fetcher_obj))
    fetcher_obj = fetcher
    r = client.post(f"/api/growth/sessions/{s['id']}/enrich", headers=H(u))
    assert r.status_code == 202
    e = client.get(f"/api/growth/sessions/{s['id']}", headers=H(u)).json()["enrichment"]
    assert e["status"] == "done" and e["done"] == 2 and e["credits_used"]["enrichment"] >= 1
    ps = {p["domain"]: p for p in client.get(f"/api/growth/sessions/{s['id']}/prospects", headers=H(u)).json()}
    luigi = ps["luigis.example"]
    by = {c["email"]: c for c in luigi["contacts"]}
    assert by["maria@luigis.example"]["status"] == "verified" and by["maria@luigis.example"]["source"] == "snov" and by["maria@luigis.example"]["first_name"] == "Maria"
    assert by["hello@luigis.example"]["status"] == "risky" and by["hello@luigis.example"]["source_url"] == "https://luigis.example/"
    assert "bad@luigis.example" not in by  # invalid addresses are dropped
    assert by["luigisbookings@gmail.com"]["personal"] is True and by["luigisbookings@gmail.com"]["status"] == "unverified"
    assert luigi["contact_status"] == "verified" and luigi["breakdown"]["contact"]["points"] == 15
    assert ps["cornercafe.example"]["contact_status"] == "not_found"  # Snov returned an address on another domain: rejected


def test_enrichment_requires_selection_and_never_invents(client, monkeypatch):
    u = user()
    s, ps = discovered(client, u)
    assert client.post(f"/api/growth/sessions/{s['id']}/enrich", headers=H(u)).status_code == 422
    client.patch(f"/api/growth/prospects/{ps[0]['id']}", json={"selected": True}, headers=H(u))
    monkeypatch.setattr(G, "start_enrichment", lambda sid, inline=False, fetcher=None: G.run_enrichment(sid, fetcher=FakeFetcher({})))
    client.post(f"/api/growth/sessions/{s['id']}/enrich", headers=H(u))
    p = next(x for x in client.get(f"/api/growth/sessions/{s['id']}/prospects", headers=H(u)).json() if x["id"] == ps[0]["id"])
    assert p["contacts"] == [] and p["contact_status"] == "not_found"


# ---------------- Creative Studio
def png(w=1200, h=600):
    raw = b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0) + b"\0\0\0\0"
    return "data:image/png;base64," + base64.b64encode(raw + b"\0" * 64).decode()


def test_templates_documents_versions_and_render(client):
    u = user()
    ts = client.get("/api/studio/templates", headers=H(u)).json()
    assert len([t for t in ts if not t["mine"]]) == 11
    d = client.post("/api/studio/documents", json={"template_id": "builtin:sales_outreach"}, headers=H(u)).json()
    assert d["subject"] and d["doc"]["sections"]
    doc = d["doc"]
    doc["sections"][1]["columns"][0]["elements"][0]["content"] = "Hello {{first_name}} at {{company_name}}"
    for i in range(10):
        r = client.put(f"/api/studio/documents/{d['id']}", json={"doc": doc, "editor_mode": "pro"}, headers=H(u))
    assert r.json()["version"] == 11 and r.json()["editor_mode"] == "pro"
    vs = client.get(f"/api/studio/documents/{d['id']}/versions", headers=H(u)).json()
    assert {v["note"] for v in vs} >= {"Created", "Autosave"}
    client.put(f"/api/studio/documents/{d['id']}", json={"checkpoint": "Before redesign"}, headers=H(u))
    created = next(v for v in vs if v["note"] == "Created")
    restored = client.post(f"/api/studio/documents/{d['id']}/versions/{created['id']}/restore", headers=H(u)).json()
    assert "Hello {{first_name}}" not in json.dumps(restored["doc"])
    out = client.post("/api/studio/render", json={"doc": doc, "subject": "Hi {{first_name}}"}, headers=H(u)).json()
    assert "Hello there at your business" in out["html"] and out["subject"] == "Hi there" and "<script" not in out["html"]
    assert client.get(f"/api/studio/documents/{d['id']}", headers=H(user())).status_code == 404


def test_render_uses_real_prospect_values(client):
    u = user()
    s, ps = discovered(client, u)
    with SessionLocal() as db:
        db.add(ProspectContact(prospect_id=ps[0]["id"], owner_id=u["_id"], email="ana@x.example", first_name="Ana", source="website"))
        db.commit()
    doc = E.normalise({"sections": [{"columns": [{"elements": [{"type": "text", "content": "Hi {{first_name}} from {{company_name}}"}]}]}]})
    out = client.post("/api/studio/render", json={"doc": doc, "prospect_id": ps[0]["id"]}, headers=H(u)).json()
    assert f"Hi Ana from {E.H.escape(ps[0]['name'])}" in out["html"]


def test_email_check_fix_all_and_before_after(client):
    u = user()
    d = client.post("/api/studio/documents", json={}, headers=H(u)).json()
    bad = E.normalise({"sections": [{"columns": [{"elements": [
        {"type": "heading", "content": "Big news", "style": {"fontSize": 44}},
        {"type": "text", "content": "We recieve requests daily {{first_name}}", "style": {"fontSize": 12}},
        {"type": "image", "src": "http://img.example/a.png", "name": "hero"},
        {"type": "button", "label": "Go", "href": "https://example.com", "style": {"paddingY": 6}}]}]}]})
    client.put(f"/api/studio/documents/{d['id']}", json={"doc": bad, "subject": "hi"}, headers=H(u))
    chk = client.post(f"/api/studio/documents/{d['id']}/check", headers=H(u)).json()
    assert chk["can_launch"] is False and chk["readiness"] <= 49  # no sender connected = critical
    ids = {f["id"].split("-")[0] for f in chk["findings"]}
    assert {"spell", "alt", "img", "small", "big", "tap", "subject", "sender"} <= ids
    assert set(chk["scores"]) == {"design", "content", "technical", "deliverability"}
    fix = client.post(f"/api/studio/documents/{d['id']}/fix", json={}, headers=H(u)).json()
    assert fix["applied"] >= 5 and fix["before"] != fix["after"]
    after = client.post(f"/api/studio/documents/{d['id']}/check", headers=H(u)).json()
    remaining = {f["id"].split("-")[0] for f in after["findings"]}
    assert not ({"spell", "alt", "small", "big", "tap", "fallback"} & remaining)
    assert "subject" in remaining  # wording changes are never automatic
    vs = client.get(f"/api/studio/documents/{d['id']}/versions", headers=H(u)).json()
    assert any(v["note"] == "Before Email Check fixes" for v in vs)


def test_critical_issue_caps_readiness():
    d = E.normalise({"sections": [{"columns": [{"elements": [{"type": "text", "content": "Hello there, a clear message."},
                                                             {"type": "button", "label": "Visit", "href": "https://ok.example"}]}]}]})
    h, t = E.render(d, subject="A clear subject line for you")
    good = C.inspect(d, subject="A clear subject line for you", html=h, text=t, sender_domain="ok.example", dns_results={"spf": "present", "dmarc": "present", "dkim": "present (s1)"})
    assert good["can_launch"] and good["readiness"] >= 90
    bad = C.inspect(d, subject="A clear subject line for you", html=h, text=t, sender_domain="ok.example", dns_results={"spf": "missing", "dmarc": "present", "dkim": "present (s1)"})
    assert not bad["can_launch"] and bad["readiness"] <= 49


def test_test_email_only_to_own_address(client, monkeypatch):
    u = user(email="owner@biz.example")
    d = client.post("/api/studio/documents", json={}, headers=H(u)).json()
    assert client.post(f"/api/studio/documents/{d['id']}/test", headers=H(u)).status_code == 503
    monkeypatch.setattr(get_settings(), "resend_api_key", "re_x")
    sent = []
    monkeypatch.setattr(studio_router, "LINK_TRANSPORT", httpx.MockTransport(lambda req: (sent.append(json.loads(req.content)), httpx.Response(200, json={"id": "e1"}))[1]))
    r = client.post(f"/api/studio/documents/{d['id']}/test", headers=H(u)).json()
    assert r["sent_to"] == "owner@biz.example" and sent[0]["to"] == ["owner@biz.example"] and sent[0]["subject"].startswith("[Test]") and sent[0]["text"]


def test_assets_upload_validate_serve_and_storage_limit(client, monkeypatch):
    u = user()
    r = client.post("/api/studio/assets", json={"filename": "logo.png", "data_url": png(400, 120)}, headers=H(u))
    assert r.status_code == 201 and r.json()["width"] == 400 and r.json()["height"] == 120
    served = client.get(r.json()["url"])
    assert served.status_code == 200 and served.headers["content-type"] == "image/png" and "immutable" in served.headers["cache-control"]
    assert client.post("/api/studio/assets", json={"data_url": "data:image/png;base64," + base64.b64encode(b"<svg onload=x>").decode()}, headers=H(u)).status_code == 422
    monkeypatch.setattr(get_settings(), "plan_override", "free")
    from app.services import plans
    monkeypatch.setitem(plans.all_plans()["free"]["credits"], "storage_mb", 0)
    assert client.post("/api/studio/assets", json={"data_url": png()}, headers=H(u)).status_code == 402


def test_brand_kit_and_rule_assist(client):
    u = user()
    b = client.put("/api/studio/brand", json={"company": "Acme", "primary": "#FF0000", "secondary": "#00AA00", "font": "Georgia", "website": "acme.example",
                                              "logo": "javascript:alert(1)"}, headers=H(u)).json()
    assert b["website"] == "https://acme.example" and b["logo"] == ""
    d = client.post("/api/studio/documents", json={"template_id": "builtin:sales_outreach"}, headers=H(u)).json()
    res = client.post("/api/studio/assist", json={"doc": d["doc"], "action": "brand"}, headers=H(u)).json()
    btns = [e for _, _, e, _ in E.iter_elements(res["doc"]) if e["type"] == "button"]
    assert all(e["style"]["background"] == "#FF0000" for e in btns) and res["doc"]["settings"]["fontFamily"] == "Georgia"
    mob = client.post("/api/studio/assist", json={"doc": d["doc"], "action": "mobile"}, headers=H(u)).json()
    assert all(s["style"]["stackOnMobile"] for s in mob["doc"]["sections"])
    r = client.post("/api/studio/assist", json={"doc": d["doc"], "action": "shorten"}, headers=H(u))
    assert r.status_code == 409 and "AI Connect" in r.json()["detail"]["message"]  # wording needs the customer's AI provider


def test_ai_rewording_keeps_variables_and_numbers(client, monkeypatch):
    from app.services import studio_ai, ai as AI
    doc = E.normalise({"sections": [{"columns": [{"elements": [
        {"id": "a", "type": "text", "content": "Hi {{first_name}}, save 20% today for £49."},
        {"id": "b", "type": "text", "content": "We help {{company_name}} grow."}]}]}]})

    async def fake_run(db, owner, task, prompt, **kw):
        return AI.AIResult(text=json.dumps({"items": [{"id": "a", "text": "Hello, save big today!"}, {"id": "b", "text": "We help {{company_name}} thrive."}], "note": "Tighter."}),
                           model="m", prompt_tokens=1, completion_tokens=1)
    monkeypatch.setattr(AI, "run_task", fake_run)
    import asyncio
    with SessionLocal() as db:
        out = asyncio.run(studio_ai.assist(db, "x", doc, "wording"))
    els = {e["id"]: e for _, _, e, _ in E.iter_elements(out["doc"])}
    assert els["a"]["content"] == "Hi {{first_name}}, save 20% today for £49."  # rejected: dropped variable and numbers
    assert els["b"]["content"] == "We help {{company_name}} thrive."


# ---------------- outreach
def ready_campaign(client, u, monkeypatch, contacts):
    s, ps = discovered(client, u)
    web = [p for p in ps if p["platform"] == "web"]
    client.post(f"/api/growth/sessions/{s['id']}/select", json={"ids": [p["id"] for p in web], "selected": True}, headers=H(u))
    with SessionLocal() as db:
        for p, (email, status) in zip(web, contacts):
            db.add(ProspectContact(prospect_id=p["id"], owner_id=u["_id"], email=email, first_name="Sam", status=status, source="website",
                                   personal=email.endswith("@gmail.com")))
        db.commit()
    d = client.post("/api/studio/documents", json={"template_id": "builtin:business_introduction", "session_id": s["id"]}, headers=H(u)).json()
    camp = client.post("/api/outreach/campaigns", json={"session_id": s["id"]}, headers=H(u)).json()
    return s, d, camp


def test_recipient_eligibility_pecr_and_suppression(client, monkeypatch):
    u = user()
    client.post("/api/outreach/suppressions", json={"email": "gone@cornercafe.example"}, headers=H(u))
    _, _, camp = ready_campaign(client, u, monkeypatch, [("owner@gmail.com", "unverified"), ("gone@cornercafe.example", "verified")])
    assert camp["recipients"] == {"eligible": 0, "suppressed": 1, "needs_consent": 1, "unverified": 0}
    r = client.post(f"/api/outreach/campaigns/{camp['id']}/recipients", json={"consent_emails": ["owner@gmail.com"]}, headers=H(u)).json()
    assert r["recipients"]["eligible"] == 1


def test_approval_gate_launch_and_change_after_approval(client, monkeypatch):
    u = user(email="me@agency.example")
    s, d, camp = ready_campaign(client, u, monkeypatch, [("maria@luigis.example", "verified"), ("info@cornercafe.example", "risky")])
    assert camp["recipients"]["eligible"] == 1 and camp["recipients"]["unverified"] == 1
    full = {k: True for k in ("design", "content", "links", "personalisation", "mobile", "technical", "recipients", "permissions")}
    assert client.post(f"/api/outreach/campaigns/{camp['id']}/approve", json={"checklist": full}, headers=H(u)).json()["detail"]["code"] == "check_required"
    client.post(f"/api/studio/documents/{d['id']}/check", headers=H(u))
    r = client.post(f"/api/outreach/campaigns/{camp['id']}/approve", json={"checklist": full}, headers=H(u))
    assert r.status_code == 409 and r.json()["detail"]["code"] == "critical_issues"  # no sender connected yet
    # connect Snov.io (customer's own account)
    monkeypatch.setattr(SnovClient, "transport", snov_transport([], {}))
    conn = client.put("/api/outreach/connection", json={"client_id": "cid1", "client_secret": "sec1", "list_id": "77", "sender_domain": "agency.example"}, headers=H(u)).json()
    assert conn["connected"] and conn["lists"] == [{"id": "77", "name": "TubeLead"}] and "/api/hooks/snov/" in conn["webhook_url"]
    with SessionLocal() as db:
        from app.models import ProviderConnection
        pc = db.query(ProviderConnection).one()
        assert "sec1" not in pc.client_secret_enc  # encrypted at rest
    # make the email launchable: fill placeholders and links, then re-check
    doc = client.get(f"/api/studio/documents/{d['id']}", headers=H(u)).json()["doc"]
    for _, _, e, _ in E.iter_elements(doc):
        if e["type"] == "button":
            e["href"] = "https://agency.example/work"
    client.put(f"/api/studio/documents/{d['id']}", json={"doc": doc, "subject": "An idea for {{company_name}}'s website"}, headers=H(u))
    chk = client.post(f"/api/studio/documents/{d['id']}/check", headers=H(u)).json()
    assert chk["can_launch"], [f for f in chk["findings"] if f["severity"] == "critical"]
    partial = {**full, "permissions": False}
    assert client.post(f"/api/outreach/campaigns/{camp['id']}/approve", json={"checklist": partial}, headers=H(u)).json()["detail"]["code"] == "checklist"
    assert client.post(f"/api/outreach/campaigns/{camp['id']}/approve", json={"checklist": full}, headers=H(u)).json()["status"] == "approved"
    # editing after approval invalidates it
    client.put(f"/api/studio/documents/{d['id']}", json={"subject": "Changed"}, headers=H(u))
    r = client.post(f"/api/outreach/campaigns/{camp['id']}/launch", headers=H(u))
    assert r.status_code == 409 and r.json()["detail"]["code"] == "changed"
    client.put(f"/api/studio/documents/{d['id']}", json={"subject": "An idea for {{company_name}}'s website"}, headers=H(u))
    client.post(f"/api/studio/documents/{d['id']}/check", headers=H(u))
    client.post(f"/api/outreach/campaigns/{camp['id']}/approve", json={"checklist": full}, headers=H(u))
    sent = []

    def handler(req):
        if req.url.path.endswith("/add-prospect-to-list"):
            sent.append(dict(httpx.QueryParams(req.content.decode())))
            return httpx.Response(200, json={"success": True})
        return snov_transport([], {}).handle_request(req)
    monkeypatch.setattr(SnovClient, "transport", httpx.MockTransport(handler))
    out = client.post(f"/api/outreach/campaigns/{camp['id']}/launch", headers=H(u)).json()
    assert out["status"] == "launched" and len(sent) == 1
    assert sent[0]["email"] == "maria@luigis.example" and sent[0]["listId"] == "77"
    assert "Luigi" in sent[0]["customFields[tl_subject]"] and "<table" in sent[0]["customFields[tl_html]"] and sent[0]["customFields[tl_text]"]
    with SessionLocal() as db:
        assert db.query(UsageEvent).filter(UsageEvent.owner_id == u["_id"], UsageEvent.kind == "campaign_recipients").one().units == 1
        assert db.query(AuditLog).filter(AuditLog.action == "campaign.launched").count() == 1


def test_replies_classified_unsubscribe_suppresses_and_webhook(client, monkeypatch):
    u = user()
    r = client.post("/api/outreach/replies", json={"from_email": "a@x.example", "body": "Sounds great, can we book a call on Tuesday?"}, headers=H(u)).json()
    assert r["classification"] == "meeting_requested" and r["classified_by"] == "rules"
    r2 = client.post("/api/outreach/replies", json={"from_email": "B@y.example", "body": "Please remove me from your list"}, headers=H(u)).json()
    assert r2["classification"] == "unsubscribe"
    with SessionLocal() as db:
        assert db.query(Suppression).filter(Suppression.owner_id == u["_id"], Suppression.email == "b@y.example").count() == 1
    monkeypatch.setattr(SnovClient, "transport", snov_transport([], {}))
    conn = client.put("/api/outreach/connection", json={"client_id": "cid-test", "client_secret": "secret-test"}, headers=H(u)).json()
    token = conn["webhook_url"].rsplit("/", 1)[1]
    assert client.post("/api/hooks/snov/wrong", json={}).status_code == 404
    w = client.post(f"/api/hooks/snov/{token}", json={"data": {"id": "m1", "from_email": "c@z.example", "subject": "Re: idea", "text": "How much does it cost?"}}).json()
    assert w["received"] == 1
    client.post(f"/api/hooks/snov/{token}", json={"data": {"id": "m1", "from_email": "c@z.example", "text": "How much does it cost?"}})  # duplicate delivery
    rs = client.get("/api/outreach/replies", headers=H(u)).json()
    assert sum(1 for x in rs if x["from_email"] == "c@z.example") == 1 and next(x for x in rs if x["from_email"] == "c@z.example")["classification"] == "wants_information"


def test_results_separate_sources_and_never_count_replies_as_sales(client):
    u = user()
    client.post("/api/outreach/replies", json={"from_email": "a@x.example", "body": "I'm interested, tell me more"}, headers=H(u))
    client.post("/api/outreach/results", json={"kind": "sale", "amount_pence": 125000, "note": "Website rebuild"}, headers=H(u))
    client.post("/api/outreach/results", json={"kind": "meeting", "amount_pence": 999}, headers=H(u))
    r = client.get("/api/outreach/results", headers=H(u)).json()
    assert r["positive"]["value"] == 1 and r["sales"]["value"] == 1 and r["revenue_pence"]["value"] == 125000
    assert r["revenue_pence"]["source"] == "customer" and r["provider"]["sent"] is None and r["provider"]["note"]


# ---------------- admin, deletion
def test_admin_growth_overview_and_plan_edit(client):
    adm, cust = user("admin"), user()
    o = client.get("/api/admin/growth", headers=H(adm)).json()
    assert any(p["name"].startswith("Snov.io") for p in o["providers"]) and "estimated_margin_gbp" in o["month"]
    assert client.get("/api/admin/growth", headers=H(cust)).status_code == 403
    r = client.put("/api/admin/plans/starter", json={"label": "Starter", "price_monthly_gbp": 19.99, "credits": {"discovery": 123, "bogus": 5}}, headers=H(adm)).json()
    assert r["price_monthly_gbp"] == 19.99 and r["credits"]["discovery"] == 123 and "bogus" not in r["credits"]
    s = get_settings()
    old = s.plan_override
    s.plan_override = "starter"
    try:
        assert client.get("/api/growth/credits", headers=H(cust)).json()["discovery"]["allowance"] == 123
    finally:
        s.plan_override = old


def test_account_deletion_removes_growth_data(client):
    u = user()
    s, ps = discovered(client, u)
    d = client.post("/api/studio/documents", json={"session_id": s["id"]}, headers=H(u)).json()
    client.post("/api/outreach/campaigns", json={"session_id": s["id"]}, headers=H(u))
    assert client.request("DELETE", "/api/me", json={"confirm": "DELETE"}, headers=H(u)).json()["deleted"]
    with SessionLocal() as db:
        assert db.query(Prospect).filter(Prospect.owner_id == u["_id"]).count() == 0
        assert db.query(EmailDocument).filter(EmailDocument.owner_id == u["_id"]).count() == 0
        assert db.query(GrowthSession).filter(GrowthSession.owner_id == u["_id"]).count() == 0


def test_every_template_passes_contrast_and_only_needs_its_placeholders_filled():
    from app.services import email_templates
    for t in email_templates.build():
        h, x = E.render(t["doc"], subject=t["subject"])
        r = C.inspect(t["doc"], subject=t["subject"], html=h, text=x, sender_domain="a.example", dns_results={"spf": "present", "dmarc": "present", "dkim": "present (s1)"})
        assert not [f for f in r["findings"] if "contrast" in f["id"]], t["name"]
        assert {f["id"].split("-")[0] for f in r["findings"] if f["severity"] == "critical"} <= {"link"}, t["name"]  # only "[your link]" placeholders

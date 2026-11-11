"""Customers send test emails and campaigns through their OWN email service, never TubeLead's."""
import json
import smtplib

import httpx
import pytest

from app.config import get_settings
from app.db import SessionLocal
from app.models import CampaignRecipient, OutreachCampaign, SendingAccount, Suppression, UsageEvent
from app.services import delivery, mailer
from tests.test_business import H, user
from tests.test_growth import E, ready_campaign, setup  # noqa: F401  (setup is the growth autouse fixture)

FULL = {k: True for k in ("design", "content", "links", "personalisation", "mobile", "technical", "recipients", "permissions")}


class FakeSMTP:
    instances: list = []
    fail_login = False

    def __init__(self, host, port, timeout=None, context=None):
        self.host, self.port, self.sent, self.tls, self.user = host, port, [], False, None
        FakeSMTP.instances.append(self)

    def ehlo(self):
        pass

    def starttls(self, context=None):
        self.tls = True

    def login(self, u, p):
        if FakeSMTP.fail_login:
            raise smtplib.SMTPAuthenticationError(535, b"bad")
        self.user = (u, p)

    def send_message(self, m):
        self.sent.append(m)

    def quit(self):
        pass


@pytest.fixture(autouse=True)
def fakes(monkeypatch):
    FakeSMTP.instances, FakeSMTP.fail_login = [], False
    monkeypatch.setattr(mailer, "SMTP_CLASS", FakeSMTP)
    monkeypatch.setattr(mailer, "SMTP_SSL_CLASS", FakeSMTP)
    monkeypatch.setattr(mailer, "public_host_ok", lambda h: h != "localhost")
    monkeypatch.setattr(delivery, "INLINE", True)
    monkeypatch.setattr(delivery, "PAUSE_SECONDS", 0)


SMTP = {"provider": "smtp", "from_name": "Sam at Agency", "from_email": "sam@agency.example", "reply_to": "replies@agency.example", "secret": "app-pass",
        "host": "smtp.gmail.com", "port": 587, "security": "starttls", "username": "sam@agency.example"}


def test_smtp_account_saved_encrypted_verified_and_never_returns_secret(client):
    u = user()
    r = client.post("/api/sending/accounts", json=SMTP, headers=H(u))
    assert r.status_code == 201
    a = r.json()
    assert a["status"] == "connected" and a["is_default"] and a["has_secret"] and "app-pass" not in json.dumps(a)
    assert FakeSMTP.instances[-1].tls and FakeSMTP.instances[-1].user == ("sam@agency.example", "app-pass")
    with SessionLocal() as db:
        assert "app-pass" not in db.query(SendingAccount).one().secret_enc
    # update without secret keeps it; wrong password reported readably
    FakeSMTP.fail_login = True
    a2 = client.put(f"/api/sending/accounts/{a['id']}", json={**SMTP, "secret": None, "label": "Gmail"}, headers=H(u)).json()
    assert a2["status"] == "error" and "app password" in a2["last_error"] and a2["label"] == "Gmail"
    # other customers can't see or touch it
    other = user()
    assert client.get("/api/sending/accounts", headers=H(other)).json()["accounts"] == []
    assert client.delete(f"/api/sending/accounts/{a['id']}", headers=H(other)).status_code == 404
    assert client.delete(f"/api/sending/accounts/{a['id']}", headers=H(u)).status_code == 204


@pytest.mark.parametrize("body,code", [
    ({**SMTP, "port": 22}, "bad_smtp"),
    ({**SMTP, "host": ""}, "bad_smtp"),
    ({**SMTP, "from_email": "not-an-email"}, "bad_email"),
    ({**SMTP, "secret": None}, "secret_required"),
    ({"provider": "mailgun", "from_email": "a@b.example", "secret": "key-1"}, "bad_domain"),
])
def test_account_validation(client, body, code):
    r = client.post("/api/sending/accounts", json=body, headers=H(user()))
    assert r.status_code == 422 and r.json()["detail"]["code"] == code


def test_ssrf_guard_on_smtp_host(client, monkeypatch):
    monkeypatch.setattr(mailer, "public_host_ok", lambda h: False)
    a = client.post("/api/sending/accounts", json={**SMTP, "host": "localhost"}, headers=H(user())).json()
    assert a["status"] == "error" and "public mail server" in a["last_error"] and not FakeSMTP.instances
    assert mailer.public_host_ok.__name__ == "<lambda>"


def test_real_public_host_guard_rejects_private_addresses():
    import importlib
    real = importlib.reload(mailer).public_host_ok
    assert not real("localhost") and not real("127.0.0.1") and not real("10.0.0.5") and not real("169.254.169.254")


@pytest.mark.parametrize("provider,extra,host,path", [
    ("resend", {}, "api.resend.com", "/emails"),
    ("sendgrid", {}, "api.sendgrid.com", "/v3/mail/send"),
    ("postmark", {}, "api.postmarkapp.com", "/email"),
    ("mailgun", {"domain": "mg.agency.example", "region": "eu"}, "api.eu.mailgun.net", "/v3/mg.agency.example/messages"),
])
def test_api_providers_request_format(provider, extra, host, path):
    import asyncio
    from app.services import crypto
    seen = []

    def handler(req):
        seen.append(req)
        return httpx.Response(200, json={"id": "m-1", "MessageID": "m-1"})
    mailer.TRANSPORT = httpx.MockTransport(handler)
    try:
        acc = SendingAccount(provider=provider, from_email="sam@agency.example", from_name="Sam", reply_to="r@agency.example",
                             settings={k: v for k, v in extra.items()}, secret_enc=crypto.encrypt("KEY-123"))
        out = asyncio.run(mailer.send(acc, [mailer.Outgoing(to="x@y.example", subject="Hi", html="<p>Hi</p>", text="Hi",
                                                            headers={"List-Unsubscribe": "<https://u>"})]))
    finally:
        mailer.TRANSPORT = None
    assert out == [("m-1", None)]
    req = seen[0]
    assert req.url.host == host and req.url.path == path
    from urllib.parse import unquote_plus
    raw = unquote_plus(req.content.decode())
    assert "x@y.example" in raw and "List-Unsubscribe" in raw and "r@agency.example" in raw
    if provider == "postmark":
        assert req.headers["x-postmark-server-token"] == "KEY-123"
    elif provider == "mailgun":
        assert req.headers["authorization"].startswith("Basic ")
    else:
        assert req.headers["authorization"] == "Bearer KEY-123"


def test_api_key_rejected_is_reported(client, monkeypatch):
    monkeypatch.setattr(mailer, "TRANSPORT", httpx.MockTransport(lambda req: httpx.Response(401, json={})))
    a = client.post("/api/sending/accounts", json={"provider": "resend", "from_email": "a@agency.example", "secret": "re_bad"}, headers=H(user())).json()
    assert a["status"] == "error" and "rejected the API key" in a["last_error"]


def _approved_own_campaign(client, monkeypatch, u, contacts, **acc):
    client.post("/api/sending/accounts", json={**SMTP, **acc}, headers=H(u))
    s, d, camp = ready_campaign(client, u, monkeypatch, contacts)
    doc = client.get(f"/api/studio/documents/{d['id']}", headers=H(u)).json()["doc"]
    for _, _, e, _ in E.iter_elements(doc):
        if e["type"] == "button":
            e["href"] = "https://agency.example/work"
    client.put(f"/api/studio/documents/{d['id']}", json={"doc": doc, "subject": "An idea for {{company_name}}'s website"}, headers=H(u))
    chk = client.post(f"/api/studio/documents/{d['id']}/check", headers=H(u)).json()
    assert chk["can_launch"], [f for f in chk["findings"] if f["severity"] == "critical"]
    assert client.post(f"/api/outreach/campaigns/{camp['id']}/approve", json={"checklist": FULL}, headers=H(u)).json()["status"] == "approved"
    return camp


def test_own_campaign_sends_personalised_with_unsubscribe_and_never_uses_platform_resend(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "resend_api_key", "re_platform")
    monkeypatch.setattr(mailer, "TRANSPORT", httpx.MockTransport(lambda req: pytest.fail(f"unexpected HTTP call {req.url}")))
    u = user(email="me@agency.example")
    camp = _approved_own_campaign(client, monkeypatch, u, [("maria@luigis.example", "verified"), ("info@cornercafe.example", "verified")])
    out = client.post(f"/api/outreach/campaigns/{camp['id']}/launch", json={"delivery": "own"}, headers=H(u)).json()
    assert out["provider"] == "own" and out["sent_from"] == "sam@agency.example"
    assert out["status"] == "launched" and out["metrics"]["sent"] == 2 and out["metrics"]["source"] == "Your email service"
    msgs = [m for i in FakeSMTP.instances for m in i.sent]
    assert sorted(m["To"] for m in msgs) == ["info@cornercafe.example", "maria@luigis.example"]
    m = next(x for x in msgs if x["To"] == "maria@luigis.example")
    assert "Luigi" in m["Subject"] and m["From"] == "Sam at Agency <sam@agency.example>" and m["Reply-To"] == "replies@agency.example"
    assert m["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click" and m["List-Unsubscribe"].startswith("<") and "/api/u/" in m["List-Unsubscribe"]
    html = m.get_body(("html",)).get_content()
    assert "Unsubscribe" in html
    with SessionLocal() as db:
        rs = db.query(CampaignRecipient).filter(CampaignRecipient.campaign_id == camp["id"]).all()
        assert all(r.provider_status == "sent" and r.sent_at and r.message_id for r in rs)
        assert db.query(UsageEvent).filter(UsageEvent.owner_id == u["_id"], UsageEvent.kind == "campaign_recipients").one().units == 2
    # unsubscribe link → owner's suppression list
    url = m["List-Unsubscribe"].strip("<>")
    path = "/api/u/" + url.split("/api/u/", 1)[1]
    assert client.post(path).json() == {"unsubscribed": True}
    page = client.get(path)
    assert page.status_code == 200 and "unsubscribed" in page.text
    assert client.get(path[:-4] + "0000").status_code == 404
    with SessionLocal() as db:
        assert db.query(Suppression).filter(Suppression.owner_id == u["_id"], Suppression.email == "maria@luigis.example").count() == 1


def test_daily_limit_and_per_minute_throttle_then_resume(client, monkeypatch):
    u = user()
    camp = _approved_own_campaign(client, monkeypatch, u, [("maria@luigis.example", "verified"), ("info@cornercafe.example", "verified")], daily_limit=1, per_minute=1)
    out = client.post(f"/api/outreach/campaigns/{camp['id']}/launch", json={"delivery": "own"}, headers=H(u)).json()
    assert out["status"] == "sending" and out["metrics"]["sent"] == 1 and out["metrics"]["queued"] == 1 and "Daily limit" in out["metrics"]["note"]
    assert sum(len(i.sent) for i in FakeSMTP.instances) == 1
    # next day: the scheduler resumes queued recipients
    with SessionLocal() as db:
        for r in db.query(CampaignRecipient).filter(CampaignRecipient.sent_at.isnot(None)).all():
            r.sent_at = r.sent_at.replace(year=r.sent_at.year - 1)
        db.commit()
    assert delivery.resume_all("http://test") == 1
    assert sum(len(i.sent) for i in FakeSMTP.instances) == 2
    with SessionLocal() as db:
        assert db.get(OutreachCampaign, camp["id"]).status == "launched"


def test_auth_failure_pauses_and_suppressed_recipient_skipped(client, monkeypatch):
    u = user()
    camp = _approved_own_campaign(client, monkeypatch, u, [("maria@luigis.example", "verified"), ("info@cornercafe.example", "verified")])
    client.post("/api/outreach/suppressions", json={"email": "info@cornercafe.example"}, headers=H(u))  # opted out after approval
    FakeSMTP.fail_login = True
    out = client.post(f"/api/outreach/campaigns/{camp['id']}/launch", json={"delivery": "own"}, headers=H(u)).json()
    assert out["status"] == "paused" and "app password" in out["error"]
    FakeSMTP.fail_login = False
    acc = client.get("/api/sending/accounts", headers=H(u)).json()["accounts"][0]
    assert acc["status"] == "error"
    assert client.post(f"/api/outreach/campaigns/{camp['id']}/resume", headers=H(u)).status_code == 409  # must re-test first
    assert client.post(f"/api/sending/accounts/{acc['id']}/verify", headers=H(u)).json()["status"] == "connected"
    out = client.post(f"/api/outreach/campaigns/{camp['id']}/resume", headers=H(u)).json()
    assert out["status"] == "launched" and out["metrics"]["sent"] == 1
    assert [m["To"] for i in FakeSMTP.instances for m in i.sent] == ["maria@luigis.example"]


def test_launch_own_requires_connected_account(client, monkeypatch):
    u = user()
    camp = _approved_own_campaign(client, monkeypatch, u, [("maria@luigis.example", "verified")])
    with SessionLocal() as db:
        db.query(SendingAccount).delete()
        db.commit()
    r = client.post(f"/api/outreach/campaigns/{camp['id']}/launch", json={"delivery": "own"}, headers=H(u))
    assert r.status_code == 409 and r.json()["detail"]["code"] == "no_sending_account"


def test_account_deletion_removes_sending_accounts(client):
    u = user()
    client.post("/api/sending/accounts", json=SMTP, headers=H(u))
    assert client.request("DELETE", "/api/me", json={"confirm": "DELETE"}, headers=H(u)).json()["deleted"]
    with SessionLocal() as db:
        assert db.query(SendingAccount).filter(SendingAccount.owner_id == u["_id"]).count() == 0

import jwt
import pytest

from app.config import get_settings


def seed(client):
    assert client.post("/api/demo/seed").json()["seeded"] is True


def test_health_and_status(client):
    assert client.get("/api/health").json()["ok"] is True
    st = client.get("/api/status").json()
    assert st["youtube_configured"] is True and st["database"] in ("sqlite", "postgresql") and st["plan"]["id"] == "elite"


def test_demo_seed_idempotent_and_clearable(client):
    seed(client)
    assert client.post("/api/demo/seed").json()["seeded"] is False
    r = client.get("/api/creators?page_size=5").json()
    assert r["total"] == 140 and all(i["is_demo"] for i in r["items"])
    assert client.get("/api/creators?demo=hide").json()["total"] == 0
    assert client.delete("/api/demo").json()["removed"] == 140
    assert client.get("/api/creators").json()["total"] == 0


def test_creator_filters_sort_pagination(client):
    seed(client)
    r = client.get("/api/creators?sort=subscribers&order=desc&page_size=10").json()
    subs = [i["subscriber_count"] for i in r["items"]]
    assert subs == sorted(subs, reverse=True) and len(subs) == 10
    gb = client.get("/api/creators?country=GB&has_email=true&page_size=200").json()
    assert gb["total"] > 0 and all(i["country"] == "GB" and i["public_email"] for i in gb["items"])
    p2 = client.get("/api/creators?page=2&page_size=10&sort=title&order=asc").json()["items"]
    p1 = client.get("/api/creators?page=1&page_size=10&sort=title&order=asc").json()["items"]
    assert p1[-1]["title"] <= p2[0]["title"]
    assert client.get("/api/creators?min_subs=100000&max_subs=200000").json()["items"] == [] or all(
        100000 <= i["subscriber_count"] <= 200000 for i in client.get("/api/creators?min_subs=100000&max_subs=200000&page_size=200").json()["items"])
    assert client.get("/api/creators?q=zzzznomatch").json()["total"] == 0


def test_bulk_campaign_flow_and_stats(client):
    seed(client)
    camp = client.post("/api/campaigns", json={"name": "Test", "status": "active"}).json()
    ids = [i["id"] for i in client.get("/api/creators?page_size=3&campaign_id=none").json()["items"]]
    assert client.post("/api/creators/bulk", json={"ids": ids, "action": "assign_campaign", "campaign_id": camp["id"]}).json()["affected"] == 3
    assert client.post("/api/creators/bulk", json={"ids": ids[:1], "action": "set_outreach", "outreach_status": "replied"}).status_code == 200
    stats = next(c for c in client.get("/api/campaigns").json() if c["id"] == camp["id"])
    assert stats["leads"] == 3 and stats["replied"] == 1
    assert client.post("/api/creators/bulk", json={"ids": ids, "action": "assign_campaign", "campaign_id": "00000000-0000-0000-0000-00000000dead"}).status_code == 404
    assert client.delete(f"/api/campaigns/{camp['id']}").status_code == 204
    assert client.get(f"/api/creators/{ids[0]}").json()["campaign_id"] is None


def test_csv_export_neutralises_formula_injection(client):
    from app.db import SessionLocal
    from app.models import Creator
    from app.auth import DEV_OWNER
    with SessionLocal() as db:
        db.add(Creator(owner_id=DEV_OWNER, youtube_channel_id="UCx", title="=HYPERLINK(\"http://evil\")", channel_url="https://y/x"))
        db.commit()
    body = client.get("/api/creators/export.csv")
    assert body.headers["content-type"].startswith("text/csv")
    assert "'=HYPERLINK" in body.text and "\n=HYPERLINK" not in body.text


def test_job_create_validation(client):
    assert client.post("/api/jobs", json={"params": {"keywords": [], "niches": []}}).status_code == 422
    assert client.post("/api/jobs", json={"params": {"keywords": ["a"], "min_subscribers": 10, "max_subscribers": 5}}).status_code == 422
    est = client.post("/api/jobs/estimate", json={"keywords": ["a", "b"], "mode": "deep"}).json()
    assert est["search_operations"] == 2 * 4 * 2


def test_job_requires_youtube_key(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "youtube_api_key", "")
    r = client.post("/api/jobs", json={"params": {"keywords": ["x"]}})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "youtube_not_configured"


def test_manual_contact_validation_and_verification_status(client):
    from app.db import SessionLocal
    from app.models import Creator
    from app.auth import DEV_OWNER
    with SessionLocal() as db:
        c = Creator(owner_id=DEV_OWNER, youtube_channel_id="UCy", title="T", channel_url="https://y")
        db.add(c); db.commit(); cid = c.id
    assert client.post(f"/api/creators/{cid}/contacts", json={"kind": "email", "value": "not-an-email"}).status_code == 422
    assert client.post(f"/api/creators/{cid}/contacts", json={"kind": "website", "value": "javascript:alert(1)"}).status_code == 422
    r = client.post(f"/api/creators/{cid}/contacts", json={"kind": "email", "value": "a@b.co"})
    assert r.status_code == 201 and r.json()["status"] == "unverified"
    assert client.post(f"/api/creators/{cid}/contacts", json={"kind": "email", "value": "A@b.co"}).status_code == 409
    assert client.get(f"/api/creators/{cid}").json()["verification_status"] == "unverified"


def test_api_keys_authenticate_and_revoke(client):
    k = client.post("/api/api-keys", json={"name": "ci"}).json()
    assert k["secret"].startswith("clk_") and "secret" not in client.get("/api/api-keys").json()[0]
    assert client.get("/api/status", headers={"X-API-Key": k["secret"]}).status_code == 200
    assert client.get("/api/status", headers={"X-API-Key": "clk_wrong"}).status_code == 401
    assert client.delete(f"/api/api-keys/{k['id']}").status_code == 204
    assert client.get("/api/status", headers={"X-API-Key": k["secret"]}).status_code == 401


def test_saved_search_and_views(client):
    s = client.post("/api/saved-searches", json={"name": "S", "params": {"keywords": ["x"]}, "schedule": "daily"}).json()
    assert s["next_run_at"] is not None
    assert client.patch(f"/api/saved-searches/{s['id']}", json={"schedule": "none"}).json()["next_run_at"] is None
    v = client.post("/api/views", json={"name": "V", "filters": {"country": ["GB"]}}).json()
    assert client.get("/api/views").json()[0]["id"] == v["id"]
    assert client.delete(f"/api/views/{v['id']}").status_code == 204


def test_analytics_overview_shape(client):
    seed(client)
    a = client.get("/api/analytics/overview").json()
    assert a["kpis"]["total"] == 140 and len(a["trend"]) == 30 and a["countries"] and a["niches"]
    assert client.get("/api/analytics/overview?demo=hide").json()["kpis"]["total"] == 0


def test_rate_limit_returns_429(client, monkeypatch):
    from app.main import app
    # find the rate-limit middleware instance in the stack
    node = app.middleware_stack
    while node is not None and not hasattr(node, "limit"):
        node = getattr(node, "app", None)
    node.limit = 3
    node._hits.clear()
    codes = [client.get("/api/status").status_code for _ in range(5)]
    node.limit = 100000
    assert codes[:3] == [200, 200, 200] and 429 in codes[3:]


def test_supabase_auth_mode(client, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "auth_mode", "supabase")
    monkeypatch.setattr(s, "supabase_jwt_secret", "s3cret-s3cret-s3cret-s3cret-s3cret")
    assert client.get("/api/status").status_code == 401
    good = jwt.encode({"sub": "11111111-1111-1111-1111-111111111111", "aud": "authenticated"}, s.supabase_jwt_secret, algorithm="HS256")
    assert client.get("/api/status", headers={"Authorization": f"Bearer {good}"}).status_code == 200
    forged = jwt.encode({"sub": "x", "aud": "authenticated"}, "wrong-secret-wrong-secret-wrong-secret", algorithm="HS256")
    assert client.get("/api/status", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_tenant_isolation(client, monkeypatch):
    seed(client)  # owned by dev user
    s = get_settings()
    monkeypatch.setattr(s, "auth_mode", "supabase")
    monkeypatch.setattr(s, "supabase_jwt_secret", "s3cret-s3cret-s3cret-s3cret-s3cret")
    other = jwt.encode({"sub": "22222222-2222-2222-2222-222222222222", "aud": "authenticated"}, s.supabase_jwt_secret, algorithm="HS256")
    h = {"Authorization": f"Bearer {other}"}
    assert client.get("/api/creators", headers=h).json()["total"] == 0
    monkeypatch.setattr(s, "auth_mode", "dev")
    cid = client.get("/api/creators?page_size=1").json()["items"][0]["id"]
    monkeypatch.setattr(s, "auth_mode", "supabase")
    assert client.get(f"/api/creators/{cid}", headers=h).status_code == 404
    assert client.delete(f"/api/creators/{cid}", headers=h).status_code == 404


def test_demo_seed_never_touches_real_quota_ledger(client):
    from app.auth import DEV_OWNER
    from app.db import SessionLocal
    from app.services import quota
    with SessionLocal() as db:
        quota.add_usage(db, DEV_OWNER, 123)  # a real job already spent units today
    assert client.post("/api/demo/seed").json()["seeded"] is True  # used to crash with a UNIQUE violation
    assert client.get("/api/status").json()["quota"]["used"] == 123  # and demo units must not be counted
    client.delete("/api/demo")
    assert client.get("/api/status").json()["quota"]["used"] == 123

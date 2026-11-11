import asyncio

import httpx
from sqlalchemy import select

from app.db import SessionLocal
from app.models import ContactRoute, Creator, DiscoveryJob, QuotaUsage
from app.schemas import JobParams
from app.services import jobs as job_svc
from app.services.contacts import PageFetcher
from app.services.discovery import expand_queries
from tests.fakes import website_handler, youtube_handler
from app.auth import DEV_OWNER


def run_job(params: dict, calls=None):
    calls = calls if calls is not None else []
    with SessionLocal() as db:
        job = job_svc.create_job(db, DEV_OWNER, JobParams(**params).model_dump())
        jid = job.id

    async def go():
        f = PageFetcher(transport=httpx.MockTransport(website_handler), url_guard=lambda u: True)
        try:
            await job_svc._run_job_async(jid, yt_transport=httpx.MockTransport(youtube_handler(calls)), fetcher=f)
        finally:
            await f.aclose()
    asyncio.run(go())
    with SessionLocal() as db:
        return db.get(DiscoveryJob, jid), jid


def test_expand_modes():
    base = dict(keywords=["tech"], niches=["Gaming", "Food"])
    assert len(expand_queries(JobParams(**base, mode="standard"))) == 3
    assert len(expand_queries(JobParams(**base, mode="deep"))) == 3 * 4 * 2  # (1+3 suffixes) x 2 orders
    assert len(expand_queries(JobParams(**base, mode="worldwide"))) == 3 * 14
    assert len(expand_queries(JobParams(keywords=["x"], countries=["GB", "US"], mode="repeat"))) == 2 * 4
    assert expand_queries(JobParams(keywords=["x"], niches=["A", "B"], mode="multi_niche"))[0].q == "A x"


def test_end_to_end_filters_dedupe_and_contacts():
    job, jid = run_job(dict(keywords=["tech"], min_subscribers=10_000, max_subscribers=100_000, limit=10, creator_type="creator",
                            activity="recent", countries=["GB", "US"]))
    assert job.status == "completed", job.error
    with SessionLocal() as db:
        creators = {c.youtube_channel_id: c for c in db.scalars(select(Creator)).unique()}
        # A qualifies. B is brand-like (filtered), C too small, D dormant, E hidden subs.
        assert set(creators) == {"UC_A"}
        a = creators["UC_A"]
        assert a.activity == "active" and a.engagement_rate == 5.0 and a.avg_views == 1000
        assert a.website == "https://alpha.test" and a.contact_page == "https://alpha.test/business"
        assert a.verification_status == "published" and a.niche == "Tech"
        emails = {r.value: r for r in a.contacts if r.kind == "email"}
        assert set(emails) == {"biz@alpha.test", "press@alpha.test", "partners@alpha.test"}
        assert all(r.status == "published" for r in emails.values())  # never 'verified' automatically
        assert emails["biz@alpha.test"].source == "channel_description"
        assert any(r.kind == "social" and r.platform == "instagram" for r in a.contacts)
        assert a.qualification_score > 60
        used = db.scalar(select(QuotaUsage.units))
    # two regions (GB, US) => two searches returning the same 5 channels: 10 found, 5 unique, 5 duplicates removed
    # the job tops up with wider searches when short, so totals grow, but each channel is still counted once
    assert job.unique_found == 5 and job.channels_found == job.unique_found + job.duplicates_removed and job.channels_found >= 10
    assert job.qualified == 1 and job.rejected == 4 and job.enriched == job.enrich_total >= 1
    # 2 searches (200) + 1 channels call (1) + per enriched channel: playlistItems (1) + videos (1)
    # planned: 2 searches (200 units) + reads; then at most DRY_LIMIT wider searches that found nothing new
    from app.services.discovery import DRY_LIMIT
    base = 200 + 1 + 2 * job.enrich_total
    assert job.quota_used == used and base <= used <= base + DRY_LIMIT * 100

    # Second run: everything already known (A saved; others re-appear only if not rejected before -> they are new rejects again)
    job2, _ = run_job(dict(keywords=["tech"], min_subscribers=10_000, limit=10))
    with SessionLocal() as db:
        assert db.scalar(select(Creator.id).where(Creator.youtube_channel_id == "UC_A").limit(1))
        assert len(db.scalars(select(Creator).where(Creator.youtube_channel_id == "UC_A")).unique().all()) == 1  # no duplicate record
    assert job2.duplicates_removed >= 1


def test_require_email_and_engagement_filters():
    job, _ = run_job(dict(keywords=["tech"], min_subscribers=1_000, limit=10, require_email=True, min_engagement=6))
    assert job.qualified == 0  # engagement is 5.0 < 6
    job, _ = run_job(dict(keywords=["tech"], min_subscribers=1_000, limit=10, require_email=True, min_engagement=4))
    assert job.qualified == 1


def test_limit_stops_early():
    job, _ = run_job(dict(keywords=["tech"], min_subscribers=1_000, limit=1))
    assert job.qualified == 1 and job.status == "completed"


def test_quota_exceeded_from_youtube_fails_cleanly():
    job, _ = run_job(dict(keywords=["boom"], min_subscribers=1000, limit=5))
    assert job.status == "failed" and "quota_exceeded" in job.error


def test_job_quota_cap_respected():
    job, _ = run_job(dict(keywords=["a", "b", "c"], min_subscribers=1_000_000_000, limit=5, max_quota_units=100))
    # first search costs 100 == cap; second would exceed
    assert job.quota_used <= 100 and job.queries_done <= 1


def test_scheduler_fires_due_searches_and_advances_next_run(monkeypatch):
    from datetime import datetime, timedelta, timezone

    from app.models import SavedSearch
    submitted = []
    monkeypatch.setattr(job_svc, "submit", lambda jid: submitted.append(jid))
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        due = SavedSearch(owner_id=DEV_OWNER, name="due", params=JobParams(keywords=["x"]).model_dump(), schedule="daily", next_run_at=now - timedelta(minutes=1))
        later = SavedSearch(owner_id=DEV_OWNER, name="later", params=JobParams(keywords=["x"]).model_dump(), schedule="daily", next_run_at=now + timedelta(hours=5))
        paused = SavedSearch(owner_id=DEV_OWNER, name="paused", params=JobParams(keywords=["x"]).model_dump(), schedule="none", next_run_at=None)
        db.add_all([due, later, paused])
        db.commit()
        due_id = due.id
    assert job_svc.Scheduler.tick() == 1 and len(submitted) == 1
    with SessionLocal() as db:
        s = db.get(SavedSearch, due_id)
        nxt = s.next_run_at if s.next_run_at.tzinfo else s.next_run_at.replace(tzinfo=timezone.utc)
        assert s.run_count == 1 and s.last_job_id == submitted[0] and nxt > now + timedelta(hours=23)
        job = db.get(DiscoveryJob, submitted[0])
        assert job.saved_search_id == due_id and job.status == "queued"
    assert job_svc.Scheduler.tick() == 0  # nothing else is due


def test_n8n_webhook_receives_job_event():
    import json
    import threading
    from http.server import BaseHTTPRequestHandler, HTTPServer

    from app.models import UserSettings
    got = []

    class H(BaseHTTPRequestHandler):
        def do_POST(self):
            got.append(json.loads(self.rfile.read(int(self.headers["content-length"]))))
            self.send_response(200); self.end_headers()
        def log_message(self, *a): pass

    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with SessionLocal() as db:
        db.add(UserSettings(owner_id=DEV_OWNER, n8n_webhook_url=f"http://127.0.0.1:{srv.server_port}/hook"))
        db.commit()
    try:
        job, jid = run_job(dict(keywords=["tech"], min_subscribers=1_000, limit=1))
    finally:
        srv.shutdown()
    assert len(got) == 1
    assert got[0]["event"] == "discovery.completed" and got[0]["job_id"] == jid and got[0]["qualified"] == 1


def test_top_up_searches_wider_when_short():
    from app.services.discovery import MAX_TOP_UP, JobParams, expand_queries, top_up_queries
    p = JobParams(keywords=["fitness"], countries=["GB"], limit=50)
    planned = expand_queries(p)
    extra = top_up_queries(p, planned)
    assert 0 < len(extra) <= MAX_TOP_UP
    assert {q.order for q in extra} >= {"viewCount", "date", "rating"}  # other sort orders of the same search
    assert all(q.region == "GB" for q in extra) and all(q.pages == 3 for q in extra)
    assert not ({(q.q, q.region, q.order) for q in extra} & {(q.q, q.region, q.order) for q in planned})  # nothing repeated

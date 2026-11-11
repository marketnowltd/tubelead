"""Background job execution. Jobs run in a bounded thread pool, each with its own event loop.
State lives in the database (not memory), so progress is real and survives page reloads.
A Redis-backed queue is a drop-in replacement for `submit` (see README: scaling)."""
from __future__ import annotations

import asyncio
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select

from ..config import get_settings
from ..db import SessionLocal
from ..models import DiscoveryJob, SavedSearch, UserSettings
from . import quota
from .contacts import PageFetcher
from .discovery import DiscoveryRun
from .youtube import QuotaBudgetExceeded, YouTubeClient

log = logging.getLogger("tubelead.jobs")
_pool: ThreadPoolExecutor | None = None
SCHEDULE_DELTA = {"hourly": timedelta(hours=1), "daily": timedelta(days=1), "weekly": timedelta(days=7)}


def _get_pool() -> ThreadPoolExecutor:
    global _pool
    if _pool is None:
        _pool = ThreadPoolExecutor(max_workers=get_settings().max_concurrent_jobs, thread_name_prefix="discovery")
    return _pool


def submit(job_id: str) -> None:
    _get_pool().submit(_run_job, job_id)


def _run_job(job_id: str) -> None:
    asyncio.run(_run_job_async(job_id))


async def _run_job_async(job_id: str, *, yt_transport=None, fetcher: PageFetcher | None = None) -> None:
    s = get_settings()
    with SessionLocal() as db:
        job = db.get(DiscoveryJob, job_id)
        owner, max_units = job.owner_id, int(job.params.get("max_quota_units", 1500))
    run: DiscoveryRun | None = None

    def budget_check(cost: int) -> None:
        with SessionLocal() as db:
            used = quota.used_today(db, owner)
        if used + cost > s.youtube_daily_quota - s.youtube_quota_reserve:
            raise QuotaBudgetExceeded("Daily YouTube API quota budget reached")
        if run and run.session_spent + cost > max_units:
            raise QuotaBudgetExceeded(f"This job's quota cap of {max_units} units was reached — raise the cap (Advanced) to continue")

    def spend(cost: int) -> None:
        if run:
            run.session_spent += cost
        with SessionLocal() as db:
            quota.add_usage(db, owner, cost)

    yt = YouTubeClient(s.youtube_api_key, base_url=s.youtube_api_base, transport=yt_transport, budget_check=budget_check, on_spend=spend)
    own_fetcher = fetcher is None and s.fetch_websites
    fetcher = fetcher or (PageFetcher() if s.fetch_websites else None)
    run = DiscoveryRun(SessionLocal, job_id, yt, fetcher)
    try:
        await run.run()
    finally:
        await yt.aclose()
        if own_fetcher and fetcher:
            await fetcher.aclose()
    await _notify_webhook(job_id)


async def _notify_webhook(job_id: str) -> None:
    s = get_settings()
    with SessionLocal() as db:
        job = db.get(DiscoveryJob, job_id)
        us = db.get(UserSettings, job.owner_id)
        url = (us.n8n_webhook_url if us and us.n8n_webhook_url else s.n8n_webhook_url)
        payload = {"event": f"discovery.{job.status}", "job_id": job.id, "status": job.status, "qualified": job.qualified,
                   "unique_found": job.unique_found, "duplicates_removed": job.duplicates_removed,
                   "quota_used": job.quota_used, "error": job.error}
    if not url or not url.startswith(("http://", "https://")):
        return
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            await c.post(url, json=payload)
    except httpx.HTTPError as exc:
        log.warning("n8n webhook failed: %s", exc)


def recover_orphans() -> int:
    """Jobs left queued/running by a previous process can never finish; mark them failed."""
    with SessionLocal() as db:
        rows = db.scalars(select(DiscoveryJob).where(DiscoveryJob.status.in_(["queued", "running", "cancelling"]), DiscoveryJob.is_demo.is_(False))).all()
        for j in rows:
            j.status, j.error = "failed", "Server restarted while this job was running"
            j.finished_at = datetime.now(timezone.utc)
            j.current_operation = "Interrupted by server restart"
        db.commit()
        return len(rows)


def create_job(db, owner: str, params: dict, saved_search_id: str | None = None) -> DiscoveryJob:
    job = DiscoveryJob(owner_id=owner, mode=params.get("mode", "standard"), params=params, saved_search_id=saved_search_id)
    db.add(job)
    db.commit()
    return job


class Scheduler(threading.Thread):
    """Fires saved searches whose next_run_at has passed."""

    def __init__(self, interval: int = 30):
        super().__init__(daemon=True, name="scheduler")
        self.interval, self._stop_evt = interval, threading.Event()

    def stop(self) -> None:
        self._stop_evt.set()

    def run(self) -> None:
        while not self._stop_evt.wait(self.interval):
            try:
                self.tick()
            except Exception:  # noqa: BLE001
                log.exception("scheduler tick failed")

    _last_maintenance = 0.0

    @classmethod
    def maintenance(cls) -> None:
        """Every 10 minutes: retry queued/failed email. Daily: delete chat conversations past the retention period."""
        if time.time() - cls._last_maintenance < 600:
            return
        cls._last_maintenance = time.time()
        from . import email as mail
        mail.deliver_pending()
        purge_old_chats()

    @staticmethod
    def tick() -> int:
        try:
            Scheduler.maintenance()
        except Exception:  # noqa: BLE001
            log.exception("maintenance failed")
        s = get_settings()
        if not s.youtube_api_key:
            return 0
        fired = 0
        now = datetime.now(timezone.utc)
        with SessionLocal() as db:
            due = db.scalars(select(SavedSearch).where(SavedSearch.schedule != "none", SavedSearch.next_run_at <= now)).all()
            for ss in due:
                job = create_job(db, ss.owner_id, ss.params, ss.id)
                ss.last_run_at, ss.last_job_id, ss.run_count = now, job.id, ss.run_count + 1
                ss.next_run_at = now + SCHEDULE_DELTA[ss.schedule]
                db.commit()
                submit(job.id)
                fired += 1
        return fired


def purge_old_chats() -> int:
    """Data retention: conversations untouched for CHAT_RETENTION_DAYS are deleted (messages cascade).
    Conversations linked to a support ticket are kept as part of the ticket record."""
    from sqlalchemy import delete
    from ..models import ChatConversation, ChatMessage, SupportTicket
    cutoff = datetime.now(timezone.utc) - timedelta(days=get_settings().chat_retention_days)
    with SessionLocal() as db:
        keep = select(SupportTicket.conversation_id).where(SupportTicket.conversation_id.is_not(None))
        old = db.scalars(select(ChatConversation.id).where(ChatConversation.updated_at < cutoff, ChatConversation.id.not_in(keep))).all()
        if old:
            db.execute(delete(ChatMessage).where(ChatMessage.conversation_id.in_(old)))
            db.execute(delete(ChatConversation).where(ChatConversation.id.in_(old)))
            db.commit()
        return len(old)

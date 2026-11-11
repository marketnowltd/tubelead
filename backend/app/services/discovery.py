"""Discovery engine: query expansion -> YouTube search -> dedupe -> channel metadata ->
filter -> enrichment (engagement + public contact routes) -> persist.

Every counter written to DiscoveryJob is a real measurement of what happened."""
from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import ActivityEvent, Creator, ContactRoute, DiscoveryJob
from ..schemas import JobParams
from . import contacts as ct
from . import scoring
from .youtube import QuotaBudgetExceeded, YouTubeClient, YouTubeError

log = logging.getLogger("tubelead.discovery")

WORLD_REGIONS = ["US", "GB", "IN", "BR", "DE", "FR", "JP", "KR", "MX", "CA", "AU", "ES", "ID", "TR"]
DEEP_SUFFIXES = ["channel", "creator", "review", "tutorial", "vlog"]
TOPIC_MODIFIERS = ["tips", "how to", "explained", "for beginners", "review"]
REPEAT_ORDERS = ["relevance", "viewCount", "date", "rating"]
MAX_TOP_UP = 24  # extra searches when the planned ones found fewer creators than requested
YOUTUBE_BUDGET = 40.0     # seconds of YouTube searching; then the other sources fill what is still missing
TOTAL_BUDGET = 60.0       # the whole job aims to finish within a minute
FILL_FROM_SOURCES = True  # tests switch this off (it reaches real websites)
DRY_LIMIT = 6    # the top-up stops after this many searches in a row that find no new channel (nothing left to find)


def top_up_queries(p: JobParams, planned: list[Query]) -> list[Query]:
    """When the planned searches come up short: more result pages, the other sort orders and related wording for the
    same keywords and countries, so the job keeps going until it reaches the number asked for (or the quota budget)."""
    base = list(dict.fromkeys([k for k in p.keywords] + [n for n in p.niches]))
    regions: list[str | None] = p.countries or [None]
    done = {(q.q.lower(), q.region, q.order) for q in planned}
    out: list[Query] = []
    for suffix in [""] + TOPIC_MODIFIERS[:2] + DEEP_SUFFIXES:
        for order in REPEAT_ORDERS:
            for region in regions:
                for term in base:
                    q = f"{term} {suffix}".strip()
                    if (q.lower(), region, order) not in done:
                        done.add((q.lower(), region, order))
                        out.append(Query(q, region, None, order, 3, "video" if p.source == "videos" else "channel"))
                    if len(out) >= MAX_TOP_UP:
                        return out
    return out


@dataclass(frozen=True)
class Query:
    q: str
    region: str | None
    niche: str | None
    order: str = "relevance"
    pages: int = 1
    kind: str = "channel"  # channel | video


def expand_queries(p: JobParams) -> list[Query]:
    kws, niches = p.keywords, p.niches
    terms: list[tuple[str, str | None]] = []
    if p.mode == "multi_niche" and niches:
        for n in niches:
            terms += [(f"{n} {k}".strip(), n) for k in (kws or [""])]
    else:
        terms += [(k, None) for k in kws]
        terms += [(n, n) for n in niches]
    if p.source == "topics":
        base = list(terms)
        for q, n in base:
            terms += [(f"{q} {s}", n) for s in TOPIC_MODIFIERS]
    if p.mode == "deep":
        base = list(terms)
        for q, n in base:
            terms += [(f"{q} {s}", n) for s in DEEP_SUFFIXES[:3]]
    # de-dup preserving order
    seen, uniq = set(), []
    for t in terms:
        if t[0].lower() not in seen:
            seen.add(t[0].lower())
            uniq.append(t)
    regions: list[str | None] = WORLD_REGIONS if p.mode == "worldwide" else (p.countries or [None])
    orders = REPEAT_ORDERS if p.mode == "repeat" else (["relevance", "viewCount"] if p.mode == "deep" else ["relevance"])
    pages = 2 if p.mode == "deep" else 1
    out: list[Query] = []
    # interleave so early queries already cover variety (niches x regions) before going deeper
    for order in orders:
        for region in regions:
            for q, n in uniq:
                out.append(Query(q, region, n, order, pages, "video" if p.source == "videos" else "channel"))
    return out


def estimate_cost(p: JobParams) -> int:
    """Upper-bound quota estimate used for UI preview: 100/search page + ~1 per 50 channels + ~2 per candidate."""
    qs = expand_queries(p)
    return sum(q.pages * 101 for q in qs)


def _int(v) -> int | None:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


class JobCancelled(Exception):
    pass


class DiscoveryRun:
    def __init__(self, session_factory: Callable[[], Session], job_id: str, yt: YouTubeClient,
                 fetcher: ct.PageFetcher | None, *, quota_spend: Callable[[int], None] | None = None,
                 enrich_concurrency: int = 32):
        self.sf, self.job_id, self.yt, self.fetcher = session_factory, job_id, yt, fetcher
        self.sem = asyncio.Semaphore(enrich_concurrency)
        self.t0 = time.monotonic()
        self.session_spent = 0
        self.quota_spend = quota_spend

    # ---- job persistence helpers (short transactions) ----
    def _update(self, **fields) -> str:
        with self.sf() as db:
            job = db.get(DiscoveryJob, self.job_id)
            for k, v in fields.items():
                if callable(v):
                    v = v(getattr(job, k))
                setattr(job, k, v)
            db.commit()
            return job.status

    def _log(self, msg: str) -> None:
        stamp = datetime.now(timezone.utc).strftime("%H:%M:%S")
        self._update(log=lambda cur: ((cur or []) + [f"{stamp}  {msg}"])[-60:])

    async def _check_cancel(self) -> None:
        """Checkpoint called between operations: raises on cancel, and blocks while the job is paused."""
        while True:
            with self.sf() as db:
                st = db.get(DiscoveryJob, self.job_id).status
            if st == "cancelling":
                raise JobCancelled()
            if st != "paused":
                return
            await asyncio.sleep(0.5)

    # ---- main ----
    async def run(self) -> None:
        with self.sf() as db:
            job = db.get(DiscoveryJob, self.job_id)
            if job.status not in ("queued", "running"):
                return  # cancelled before it started
            owner, params = job.owner_id, JobParams.model_validate(job.params)
            existing = set(db.scalars(select(Creator.youtube_channel_id).where(Creator.owner_id == owner)))
        queries = expand_queries(params)
        seeds: list[str] = []
        if params.seed_videos:
            try:
                for v in await self.yt.videos_by_id(params.seed_videos):
                    sn = v.get("snippet", {})
                    seeds.append(" ".join([sn.get("title", "")] + (sn.get("tags") or [])[:3]).strip())
            except QuotaBudgetExceeded:
                raise
            except YouTubeError as exc:
                self._log(f"Could not read seed videos: {exc}")
            queries = [Query(t, None, None, "relevance", 1, "channel") for t in seeds if t] + queries
        self._update(status="running", started_at=datetime.now(timezone.utc), queries_total=len(queries),
                     current_operation="Planning search queries")
        self._log(f"Planned {len(queries)} search operations in {params.mode} mode")
        t0 = time.monotonic()
        in_job: set[str] = set()
        rejected_ids: set[str] = set()
        qualified = 0
        seen_kw: set[str] = set()
        try:
            qi = -1
            topped_up = False
            dry = 0
            while True:
                qi += 1
                if qi >= len(queries):
                    if qualified >= params.limit or topped_up:
                        break
                    topped_up = True
                    extra = top_up_queries(params, queries)
                    if not extra:
                        break
                    self._log(f"Found {qualified} of {params.limit} requested: searching wider ({len(extra)} more searches)")
                    queries = queries + extra
                    self._update(queries_total=len(queries))
                query = queries[qi]
                if qualified >= params.limit:
                    break
                if FILL_FROM_SOURCES and time.monotonic() - t0 > YOUTUBE_BUDGET:
                    self._log(f"YouTube time budget used: {qualified} of {params.limit}; filling from the other sources")
                    break
                if topped_up and dry >= DRY_LIMIT:
                    self._log(f"Stopped widening: the last {DRY_LIMIT} searches found no new channels")
                    break
                found_new = False
                token = None
                for page in range(query.pages):
                    await self._check_cancel()
                    if qualified >= params.limit:
                        break
                    where = query.region or "worldwide"
                    self._update(current_operation=f"Searching “{query.q}” · {where} · {query.order} · page {page + 1}")
                    try:
                        search = self.yt.search_videos if query.kind == "video" else self.yt.search_channels
                        data = await search(query.q, region=query.region, order=query.order, page_token=token)
                    except (QuotaBudgetExceeded, JobCancelled):
                        raise
                    except YouTubeError as exc:
                        if exc.code in ("quota_exceeded", "invalid_api_key", "forbidden", "youtube_not_configured"):
                            raise
                        self._update(failed_requests=lambda v: v + 1)  # transient: skip this query, keep the job alive
                        self._log(f"Request failed, skipping: {exc}")
                        break
                    token = data.get("nextPageToken")
                    ids = [i.get("snippet", {}).get("channelId") or i.get("id", {}).get("channelId") for i in data.get("items", [])]
                    ids = [i for i in ids if i]
                    new, dups = [], 0
                    for cid in ids:
                        if cid in existing or cid in in_job or cid in rejected_ids:
                            dups += 1
                        else:
                            new.append(cid)
                            in_job.add(cid)
                    self._update(channels_found=lambda v: v + len(ids), unique_found=lambda v: v + len(new),
                                 duplicates_removed=lambda v: v + dups, quota_used=self.session_spent)
                    if new:
                        found_new = True
                        qualified += await self._process(owner, params, query, new, existing, rejected_ids, params.limit - qualified)
                    if not token:
                        break
                dry = 0 if found_new else dry + 1
                seen_kw.add(query.q.lower())
                self._update(queries_done=qi + 1, keywords_done=len(seen_kw), qualified=qualified, quota_used=self.session_spent)
            if FILL_FROM_SOURCES and qualified < params.limit:
                qualified += await self._fill(owner, params, params.limit - qualified, max(10.0, TOTAL_BUDGET - (time.monotonic() - t0)))
            self._finish("completed", f"Completed: {qualified} qualified creators")
        except JobCancelled:
            self._finish("cancelled", "Cancelled by user")
        except QuotaBudgetExceeded as exc:
            self._finish("completed" if qualified else "failed", f"Stopped: {exc}", error=str(exc))
        except YouTubeError as exc:
            log.warning("job %s failed: %s", self.job_id, exc)
            self._finish("failed", f"Failed: {exc}", error=f"[{exc.code}] {exc}")
        except Exception as exc:  # noqa: BLE001
            log.exception("job %s crashed", self.job_id)
            self._finish("failed", "Failed: unexpected error", error=f"{type(exc).__name__}: {exc}")

    async def _fill(self, owner: str, p: JobParams, need: int, budget: float) -> int:
        """Fills the rest of the request from the other connected sources: only people who publish an email."""
        from .search_everywhere import search_everywhere
        query = " ".join(list(p.keywords) + list(p.niches)).strip()[:300]
        if len(query) < 3:
            return 0
        self._update(current_operation=f"Finding {need} more leads with published emails on the other sources")
        try:
            out = await search_everywhere(query, need, time_budget=budget, skip_youtube=True)
        except Exception as exc:  # noqa: BLE001 - YouTube results stand on their own
            self._log(f"Other sources unavailable: {type(exc).__name__}")
            return 0
        saved = 0
        with self.sf() as db:
            emails = {e.lower() for e in db.scalars(select(ContactRoute.value).where(ContactRoute.owner_id == owner, ContactRoute.kind == "email"))}
            for l in out["leads"]:
                if saved >= need:
                    break
                ems = [e for e in l.get("emails", []) if e["email"].lower() not in emails]
                if not ems:
                    continue
                key = l["sources"][0] + ":" + hashlib.sha1((l.get("source_url") or l["creator_name"]).encode()).hexdigest()[:24]
                if db.scalar(select(Creator.id).where(Creator.owner_id == owner, Creator.youtube_channel_id == key)):
                    continue
                cr = Creator(owner_id=owner, youtube_channel_id=key, title=l["creator_name"][:300], channel_url=l.get("source_url") or "",
                             description=(l.get("snippet") or "")[:4000], subscriber_count=l.get("audience_size"), niche=(p.niches[0] if p.niches else "General"),
                             website=l.get("website"), website_status="ok" if l.get("website") else "none", qualification_score=60,
                             score_breakdown={"source": l["sources"][0]}, verification_status="published", job_id=self.job_id)
                for e in ems:
                    emails.add(e["email"].lower())
                    cr.contacts.append(ContactRoute(owner_id=owner, kind="email", value=e["email"], source=e["source"][:40],
                                                    source_url=e.get("source_url"), status="published", confidence=.8))
                db.add(cr)
                saved += 1
            job = db.get(DiscoveryJob, self.job_id)
            job.qualified += saved
            job.contact_routes_found += saved
            db.commit()
        self._log(f"Added {saved} leads with published emails from the other sources")
        return saved

    def _finish(self, status: str, op: str, error: str | None = None) -> None:
        self._update(status=status, current_operation=op, error=error, finished_at=datetime.now(timezone.utc),
                     quota_used=self.session_spent)
        self._log(op)
        with self.sf() as db:
            job = db.get(DiscoveryJob, self.job_id)
            db.add(ActivityEvent(owner_id=job.owner_id, kind=f"job_{status}",
                                 message=f"Discovery {status}: {job.qualified} qualified from {job.unique_found} unique channels ({job.quota_used} API units)"))
            db.commit()

    async def _process(self, owner: str, p: JobParams, query: Query, ids: list[str], existing: set[str],
                       rejected_ids: set[str], room: int) -> int:
        self._update(current_operation=f"Fetching metadata for {len(ids)} channels")
        chans = await self.yt.channels(ids)
        candidates = []
        for ch in chans:
            subs_hidden = ch.get("statistics", {}).get("hiddenSubscriberCount", False)
            subs = None if subs_hidden else _int(ch.get("statistics", {}).get("subscriberCount"))
            country = (ch.get("snippet", {}).get("country") or "").upper() or None
            ok = True
            if subs is not None and (subs < p.min_subscribers or (p.max_subscribers is not None and subs > p.max_subscribers)):
                ok = False
            if subs is None and p.min_subscribers > 0:
                ok = False  # cannot verify audience size
            if ok and p.countries and country and country not in p.countries and p.mode != "worldwide":
                ok = False
            if ok and p.creator_type != "any" and scoring.classify_creator_type(ch["snippet"].get("title", "")) != p.creator_type:
                ok = False
            if ok:
                candidates.append(ch)
            else:
                rejected_ids.add(ch["id"])
                self._update(rejected=lambda v: v + 1)
        if not candidates:
            return 0
        extra = candidates[max(room * 2, 8):]          # only enrich what could still be needed (speed)
        candidates = candidates[:max(room * 2, 8)]
        for ch in extra:
            rejected_ids.discard(ch["id"])              # not judged: may be picked up by a later search
        self._update(enrich_total=lambda v: v + len(candidates), current_operation=f"Enriching {len(candidates)} candidates")
        results = await asyncio.gather(*[self._enrich(ch, p, query) for ch in candidates])
        saved = 0
        for ch, enr in zip(candidates, results):
            if enr is None or not self._passes(p, enr):
                rejected_ids.add(ch["id"])
                self._update(rejected=lambda v: v + 1)
                continue
            if saved >= room:
                break
            self._persist(owner, ch, enr, p, query)
            existing.add(ch["id"])
            saved += 1
            self._update(qualified=lambda v: v + 1)
        return saved

    async def _enrich(self, ch: dict, p: JobParams, query: Query) -> dict | None:
        async with self.sem:
            try:
                await self._check_cancel()
                sn = ch["snippet"]
                desc = sn.get("description", "") or ""
                uploads = ch.get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads")
                vids = []
                if uploads:
                    try:
                        vids = await self.yt.recent_videos(uploads, 10)
                    except QuotaBudgetExceeded:
                        raise
                    except YouTubeError as exc:  # e.g. empty/private uploads: degrade, don't drop
                        log.info("no recent videos for %s: %s", ch["id"], exc)
                avg_views, engagement = scoring.engagement_from(vids)
                dates = [d for d in (_parse_dt(v.get("snippet", {}).get("publishedAt")) for v in vids) if d]
                last_upload = max(dates) if dates else None
                cands = ct.from_description(desc)
                site = ct.pick_primary_site(cands)
                site_status, contact_page = "none", None
                if site and self.fetcher is not None:
                    site_status, contact_page, extra = await ct.scan_website(self.fetcher, site)
                    cands += extra
                elif site:
                    site_status = "unchecked"
                cands = ct.dedupe(cands)
                return {"vids": vids, "avg_views": avg_views, "engagement": engagement, "last_upload": last_upload,
                        "cands": cands, "site": site, "site_status": site_status, "contact_page": contact_page}
            finally:
                self._update(enriched=lambda v: v + 1, quota_used=self.session_spent)

    def _passes(self, p: JobParams, e: dict) -> bool:
        act = scoring.activity_from(e["last_upload"])
        if p.activity == "active" and act != "active":
            return False
        if p.activity == "recent" and act not in ("active", "moderate"):
            return False
        if p.activity == "dormant" and act != "dormant":
            return False
        if p.min_engagement > 0 and (e["engagement"] is None or e["engagement"] < p.min_engagement):
            return False
        if p.require_email and not any(c.kind == "email" for c in e["cands"]):
            return False
        if p.require_website and not e["site"]:
            return False
        return True

    def _persist(self, owner: str, ch: dict, e: dict, p: JobParams, query: Query) -> None:
        sn, st = ch["snippet"], ch.get("statistics", {})
        subs = None if st.get("hiddenSubscriberCount") else _int(st.get("subscriberCount"))
        topic = scoring.niche_from_topics(ch.get("topicDetails", {}).get("topicCategories"))
        niche = query.niche or topic or "General"
        activity = scoring.activity_from(e["last_upload"])
        cands: list[ct.ContactCandidate] = e["cands"]
        score, parts = scoring.qualification_score(
            subs=subs, min_subs=p.min_subscribers, max_subs=p.max_subscribers, activity=activity,
            engagement=e["engagement"], has_email=any(c.kind == "email" for c in cands),
            has_website=bool(e["site"]), has_social=any(c.kind == "social" for c in cands),
            niche_match=bool(query.niche or topic))
        thumbs = sn.get("thumbnails", {})
        thumb = (thumbs.get("medium") or thumbs.get("default") or {}).get("url")
        handle = sn.get("customUrl")
        with self.sf() as db:
            routes = [{"kind": c.kind, "status": "published" if c.kind == "email" else "unverified"} for c in cands]
            cr = Creator(
                owner_id=owner, youtube_channel_id=ch["id"], title=sn.get("title", "Unknown"), handle=handle,
                thumbnail_url=thumb, channel_url=f"https://www.youtube.com/channel/{ch['id']}",
                description=(sn.get("description") or "")[:4000], subscriber_count=subs,
                video_count=_int(st.get("videoCount")) or 0, view_count=_int(st.get("viewCount")) or 0,
                country=(sn.get("country") or None), niche=niche,
                creator_type=scoring.classify_creator_type(sn.get("title", "")),
                avg_views=e["avg_views"], engagement_rate=e["engagement"], last_upload_at=e["last_upload"],
                activity=activity, website=e["site"], contact_page=e["contact_page"], website_status=e["site_status"],
                qualification_score=score, score_breakdown=parts,
                verification_status=scoring.verification_from(routes), job_id=self.job_id)
            for c in cands:
                cr.contacts.append(ContactRoute(
                    owner_id=owner, kind=c.kind, value=c.value, platform=c.platform, source=c.source,
                    source_url=c.source_url, status="published" if c.kind == "email" else "unverified",
                    confidence=round(c.confidence, 2), website_status=c.website_status))
            db.add(cr)
            db.get(DiscoveryJob, self.job_id).contact_routes_found += len(cands)
            db.commit()

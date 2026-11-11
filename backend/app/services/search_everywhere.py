"""One search, every configured source. Providers run concurrently; one failing never stops the others.
Results are normalised, then de-duplicated: the same YouTube channel, or the same creator name, is merged once."""
from __future__ import annotations

import asyncio
import re

from ..providers.applepodcasts import ApplePodcastsProvider
from ..providers.base import Lead, ProviderResult
from ..providers.bluesky import BlueskyProvider
from ..providers.brave import BraveProvider
from ..providers.dailymotion import DailymotionProvider
from ..providers.google_search import GoogleSearchProvider
from ..providers.lastfm import LastFmProvider
from ..providers.mastodon import MastodonProvider
from ..providers.musicbrainz import MusicBrainzProvider
from ..providers.reddit import RedditProvider
from ..providers.serpapi import ENGINES as SERP_ENGINES, SerpApiProvider
from ..providers.spotify import SpotifyProvider
from ..providers.twitch import TwitchProvider
from ..providers.vimeo import VimeoProvider
from ..providers.youtube import YouTubeProvider
from . import lead_contacts

PROVIDERS = [YouTubeProvider(), GoogleSearchProvider(), BraveProvider(), ApplePodcastsProvider(), RedditProvider(), TwitchProvider(), BlueskyProvider(),
             MastodonProvider(), DailymotionProvider(), VimeoProvider(), SpotifyProvider(), LastFmProvider(), MusicBrainzProvider()] + \
            [SerpApiProvider(n) for n in SERP_ENGINES]
FIND_EMAILS = True  # tests that only check merging switch the email step off
EMAILS_ONLY = True  # only people who publish an email address are returned


async def _safe(p, query: str, limit: int) -> ProviderResult:
    try:
        return await p.search(query, limit)
    except Exception as exc:  # noqa: BLE001 - a provider bug must not cancel the other providers
        return ProviderResult(p.name, "failed", f"Unexpected error: {type(exc).__name__}")


def _name_key(lead: Lead) -> str:
    return "name:" + re.sub(r"[^a-z0-9]", "", lead.creator_name.lower())


def _keys(lead: Lead) -> list[str]:
    """A lead matches an existing row by its channel ID or by its normalised name."""
    keys = [_name_key(lead)]
    if lead.youtube_channel_id:
        keys.insert(0, f"yt:{lead.youtube_channel_id}")
    return keys


def merge(results: list[ProviderResult]) -> tuple[list[dict], int]:
    rows: list[dict] = []
    index: dict[str, dict] = {}  # any key -> row
    duplicates = 0
    for r in results:
        for lead in r.leads:
            keys = _keys(lead)
            row = next((index[k] for k in keys if k in index), None)
            if row is not None:
                duplicates += 1
                row["sources"] = sorted(set(row["sources"]) | {lead.provider})
                row["evidence"] = row["evidence"] + [e for e in lead.evidence if e not in row["evidence"]]
                if lead.verification_status == "verified":
                    row["verification_status"] = "verified"
                if lead.youtube_channel_id and not row.get("youtube_channel_id"):
                    row["youtube_channel_id"] = lead.youtube_channel_id
                if lead.audience_size and not row.get("audience_size"):
                    row["audience_size"] = lead.audience_size
                if lead.youtube_url and not row.get("youtube_url"):
                    row["youtube_url"] = lead.youtube_url
                for k in ("website", "feed_url"):
                    if getattr(lead, k) and not row.get(k):
                        row[k] = getattr(lead, k)
                for e in lead.emails:
                    if all(x["email"] != e["email"] for x in row["emails"]):
                        row["emails"].append(e)
            else:
                row = lead.to_dict()
                row["sources"] = [lead.provider]
                rows.append(row)
            for k in keys + _keys(Lead(provider=row["provider"], creator_name=row["creator_name"], source_url=None,
                                       youtube_channel_id=row.get("youtube_channel_id"))):
                index.setdefault(k, row)
    return rows, duplicates


VARIANTS = ("podcast", "creator", "official", "channel", "blog")  # related wording for later rounds
TIME_BUDGET = 100.0  # seconds for all rounds together


async def search_everywhere(query: str, limit: int = 20, time_budget: float | None = None, skip_youtube: bool = False) -> dict:
    """Returns `limit` people who publish an email address (exactly that many when the sources have them).
    Rounds: the query with a normal result size, the query with each source's largest result size, then related
    wording. Emails are looked up only for people not checked before; it stops as soon as there are enough."""
    import time
    start = time.monotonic()
    rounds: list[tuple[str, int, bool]] = [(query, max(limit, 20), True), (query, 100, False)] + [(f"{query} {w}", 50, False) for w in VARIANTS]
    all_results: list[ProviderResult] = []
    checked: dict[str, dict] = {}   # first key -> row whose emails were looked up
    totals: dict[str, dict] = {}    # provider -> summary across rounds
    leads: list[dict] = []
    duplicates = 0
    for i, (q, size, with_youtube) in enumerate(rounds):
        provs = [p for p in PROVIDERS if (i == 0 or p.configured()) and (with_youtube and not skip_youtube or p.name != "youtube")]
        results = await asyncio.gather(*[_safe(p, q, size) for p in provs])
        all_results += results
        for r in results:
            if r.provider not in totals:
                totals[r.provider] = r.summary()
            else:
                totals[r.provider]["count"] += len(r.leads)
                if r.status == "ok" and totals[r.provider]["status"] != "ok":
                    totals[r.provider].update(status="ok", message=r.message)
        leads, duplicates = merge(list(all_results))
        if not FIND_EMAILS:
            break
        new = []
        for row in leads:
            k = _keys(Lead(provider=row["provider"], creator_name=row["creator_name"], source_url=None, youtube_channel_id=row.get("youtube_channel_id")))[0]
            if k in checked:
                row["emails"] = checked[k]["emails"] + [e for e in row["emails"] if e not in checked[k]["emails"]]
                row["contact_status"] = "email_found" if row["emails"] else "none_published"
            else:
                new.append((k, row))
        await lead_contacts.find_emails([row for _, row in new])
        for k, row in new:
            checked[k] = row
        if sum(1 for row in leads if row["emails"]) >= limit or time.monotonic() - start > (time_budget or TIME_BUDGET):
            break
    providers = list(totals.values())
    with_email_rows = [row for row in leads if row.get("emails")]
    if FIND_EMAILS:
        for p in providers:
            p["with_email"] = sum(1 for row in with_email_rows if p["provider"] in row["sources"])
    out_leads = with_email_rows[:limit] if (FIND_EMAILS and EMAILS_ONLY) else leads
    short = FIND_EMAILS and EMAILS_ONLY and len(out_leads) < limit
    return {
        "query": query,
        "requested": limit,
        "providers": providers,
        "leads": out_leads,
        "checked": len(leads),
        "duplicates_merged": duplicates,
        "verified_count": sum(1 for l in out_leads if l["verification_status"] == "verified"),
        "with_email": len(with_email_rows),
        "short_reason": ("The connected sources had no more people who publish an email for this search. Connect more sources "
                         "or use broader keywords.") if short else None,
    }

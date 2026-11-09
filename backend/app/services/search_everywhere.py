"""One search, every configured source. Providers run concurrently; one failing never stops the others.
Results are normalised, then de-duplicated: the same YouTube channel, or the same creator name, is merged once."""
from __future__ import annotations

import asyncio
import re

from ..providers.base import Lead, ProviderResult
from ..providers.google_search import GoogleSearchProvider
from ..providers.reddit import RedditProvider
from ..providers.youtube import YouTubeProvider

PROVIDERS = [YouTubeProvider(), GoogleSearchProvider(), RedditProvider()]


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
                if lead.youtube_url and not row.get("youtube_url"):
                    row["youtube_url"] = lead.youtube_url
            else:
                row = lead.to_dict()
                row["sources"] = [lead.provider]
                rows.append(row)
            for k in keys + _keys(Lead(provider=row["provider"], creator_name=row["creator_name"], source_url=None,
                                       youtube_channel_id=row.get("youtube_channel_id"))):
                index.setdefault(k, row)
    return rows, duplicates


async def search_everywhere(query: str, limit: int = 20) -> dict:
    results = await asyncio.gather(*[_safe(p, query, limit) for p in PROVIDERS])
    leads, duplicates = merge(list(results))
    return {
        "query": query,
        "providers": [r.summary() for r in results],
        "leads": leads,
        "duplicates_merged": duplicates,
        "verified_youtube": sum(1 for l in leads if l["verification_status"] == "verified"),
    }

"""Apple Podcasts, through Apple's public iTunes Search API (no key). Each result is a podcast record from Apple, with
its RSS feed address; podcast feeds carry the owner's contact email (<itunes:owner><itunes:email>), which the
podcaster publishes themselves. The feed is read later by the email step (services/lead_contacts.py)."""
from __future__ import annotations

import httpx

from .base import FAILED, OK, Lead, ProviderResult

API = "https://itunes.apple.com/search"


class ApplePodcastsProvider:
    name = "applepodcasts"
    label = "Apple Podcasts"
    required_settings: tuple[str, ...] = ()
    transport = None

    def configured(self) -> bool:
        return True

    async def search(self, query: str, limit: int) -> ProviderResult:
        try:
            async with httpx.AsyncClient(timeout=15, transport=self.transport) as c:
                r = await c.get(API, params={"media": "podcast", "entity": "podcast", "term": query, "limit": min(max(limit, 1), 50)})
        except httpx.HTTPError as exc:
            return ProviderResult(self.name, FAILED, f"Apple Podcasts unreachable: {type(exc).__name__}")
        if r.status_code >= 400:
            return ProviderResult(self.name, FAILED, f"Apple Podcasts returned {r.status_code}.")
        leads = []
        for p in r.json().get("results", []):
            name = p.get("collectionName") or p.get("trackName")
            if not name:
                continue
            leads.append(Lead(provider=self.name, creator_name=name[:200], source_url=p.get("collectionViewUrl") or p.get("trackViewUrl"),
                              snippet=" · ".join(x for x in [p.get("artistName"), p.get("primaryGenreName")] if x) or None,
                              verification_status="verified", feed_url=p.get("feedUrl"),
                              audience_size=None, evidence=[f"Apple Podcasts record {p.get('collectionId')}"]))
        return ProviderResult(self.name, OK, f"{len(leads)} podcasts.", leads)

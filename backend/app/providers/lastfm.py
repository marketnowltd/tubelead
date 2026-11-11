"""Last.fm API (official). Artist search with a server-side API key. Music creators only."""
from __future__ import annotations

import httpx

from ..config import get_settings
from .base import FAILED, NOT_CONFIGURED, OK, Lead, ProviderResult

API = "https://ws.audioscrobbler.com/2.0/"


class LastFmProvider:
    name = "lastfm"
    label = "Last.fm"
    required_settings = ("LASTFM_API_KEY",)
    transport = None

    def configured(self) -> bool:
        return bool(get_settings().lastfm_api_key)

    async def search(self, query: str, limit: int) -> ProviderResult:
        if not self.configured():
            return ProviderResult(self.name, NOT_CONFIGURED, "Add LASTFM_API_KEY on the server to enable Last.fm.")
        params = {"method": "artist.search", "artist": query, "api_key": get_settings().lastfm_api_key,
                  "format": "json", "limit": min(max(limit, 1), 50)}
        try:
            async with httpx.AsyncClient(timeout=15, transport=self.transport) as c:
                r = await c.get(API, params=params)
        except httpx.HTTPError as exc:
            return ProviderResult(self.name, FAILED, f"Last.fm unreachable: {type(exc).__name__}")
        if r.status_code >= 400:
            return ProviderResult(self.name, FAILED, f"Last.fm returned {r.status_code}.")
        body = r.json()
        if "error" in body:
            return ProviderResult(self.name, FAILED, f"Last.fm: {body.get('message', 'request failed')}")
        matches = ((body.get("results") or {}).get("artistmatches") or {}).get("artist") or []
        leads = []
        for a in matches:
            if not a.get("name") or not a.get("url"):
                continue
            listeners = a.get("listeners")
            leads.append(Lead(provider=self.name, creator_name=a["name"][:200], source_url=a["url"],
                              snippet=f"{int(listeners):,} listeners" if str(listeners or "").isdigit() else None,
                              verification_status="verified",
                              evidence=["Last.fm API artist record"]))
        return ProviderResult(self.name, OK, f"{len(leads)} Last.fm artists.", leads)

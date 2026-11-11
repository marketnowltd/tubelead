"""MusicBrainz web service (open, no key). Artist search. MusicBrainz asks for an identifying User-Agent and at most
one request per second; this provider makes a single request per search."""
from __future__ import annotations

import httpx

from ..config import get_settings
from .base import FAILED, OK, Lead, ProviderResult

API = "https://musicbrainz.org/ws/2/artist/"


class MusicBrainzProvider:
    name = "musicbrainz"
    label = "MusicBrainz"
    required_settings = ("MUSICBRAINZ_USER_AGENT",)
    transport = None

    def configured(self) -> bool:
        return bool(get_settings().musicbrainz_user_agent)

    async def search(self, query: str, limit: int) -> ProviderResult:
        if not self.configured():
            return ProviderResult(self.name, "not_configured", "Set MUSICBRAINZ_USER_AGENT on the server to enable MusicBrainz.")
        headers = {"User-Agent": get_settings().musicbrainz_user_agent, "Accept": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=15, transport=self.transport, headers=headers) as c:
                r = await c.get(API, params={"query": query, "fmt": "json", "limit": min(max(limit, 1), 100)})
        except httpx.HTTPError as exc:
            return ProviderResult(self.name, FAILED, f"MusicBrainz unreachable: {type(exc).__name__}")
        if r.status_code >= 400:
            return ProviderResult(self.name, FAILED, f"MusicBrainz returned {r.status_code}.")
        leads = []
        for a in r.json().get("artists", []):
            mbid = a.get("id")
            if not a.get("name") or not mbid:
                continue
            area = (a.get("area") or {}).get("name") or a.get("country")
            leads.append(Lead(provider=self.name, creator_name=a["name"][:200], source_url=f"https://musicbrainz.org/artist/{mbid}",
                              snippet=" · ".join(x for x in [a.get("type"), area] if x) or None,
                              evidence=[f"MusicBrainz artist {mbid}"]))
        return ProviderResult(self.name, OK, f"{len(leads)} MusicBrainz artists.", leads)

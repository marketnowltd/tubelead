"""Bluesky, through its public AppView API (no key): actor search. Profiles are returned by Bluesky itself."""
from __future__ import annotations

import httpx

from ..services.contacts import classify_links, extract_emails
from .base import FAILED, OK, Lead, ProviderResult

API = "https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors"


class BlueskyProvider:
    name = "bluesky"
    label = "Bluesky"
    required_settings: tuple[str, ...] = ()
    transport = None

    def configured(self) -> bool:
        return True

    async def search(self, query: str, limit: int) -> ProviderResult:
        try:
            async with httpx.AsyncClient(timeout=15, transport=self.transport) as c:
                r = await c.get(API, params={"q": query, "limit": min(max(limit, 1), 100)})
        except httpx.HTTPError as exc:
            return ProviderResult(self.name, FAILED, f"Bluesky unreachable: {type(exc).__name__}")
        if r.status_code >= 400:
            return ProviderResult(self.name, FAILED, f"Bluesky returned {r.status_code}.")
        leads = []
        for a in r.json().get("actors", []):
            handle = a.get("handle")
            if not handle:
                continue
            bio = a.get("description") or ""
            _, sites = classify_links(bio)
            leads.append(Lead(provider=self.name, creator_name=(a.get("displayName") or handle)[:200], source_url=f"https://bsky.app/profile/{handle}",
                              snippet=bio[:300] or None, verification_status="verified", website=sites[0] if sites else None,
                              emails=[{"email": e, "source": "Bluesky profile", "source_url": f"https://bsky.app/profile/{handle}"} for e in extract_emails(bio)],
                              evidence=[f"Bluesky profile {a.get('did', handle)}"]))
        return ProviderResult(self.name, OK, f"{len(leads)} Bluesky profiles.", leads)

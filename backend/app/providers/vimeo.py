"""Vimeo API (official): user search. Needs VIMEO_ACCESS_TOKEN (a free developer app token with the public scope)."""
from __future__ import annotations

import httpx

from ..config import get_settings
from ..services.contacts import extract_emails
from .base import FAILED, NOT_CONFIGURED, OK, Lead, ProviderResult

API = "https://api.vimeo.com/users"


class VimeoProvider:
    name = "vimeo"
    label = "Vimeo"
    required_settings = ("VIMEO_ACCESS_TOKEN",)
    transport = None

    def configured(self) -> bool:
        return bool(get_settings().vimeo_access_token)

    async def search(self, query: str, limit: int) -> ProviderResult:
        if not self.configured():
            return ProviderResult(self.name, NOT_CONFIGURED, "Add VIMEO_ACCESS_TOKEN on the server to enable Vimeo.")
        try:
            async with httpx.AsyncClient(timeout=15, transport=self.transport) as c:
                r = await c.get(API, params={"query": query, "per_page": min(max(limit, 1), 100),
                                             "fields": "uri,name,link,bio,websites.link,metadata.connections.followers.total"},
                                headers={"Authorization": f"bearer {get_settings().vimeo_access_token}", "Accept": "application/vnd.vimeo.*+json;version=3.4"})
        except httpx.HTTPError as exc:
            return ProviderResult(self.name, FAILED, f"Vimeo unreachable: {type(exc).__name__}")
        if r.status_code in (401, 403):
            return ProviderResult(self.name, FAILED, "Vimeo rejected the access token.")
        if r.status_code >= 400:
            return ProviderResult(self.name, FAILED, f"Vimeo returned {r.status_code}.")
        leads = []
        for u in r.json().get("data", []):
            if not u.get("name") or not u.get("link"):
                continue
            bio = u.get("bio") or ""
            sites = [w.get("link") for w in u.get("websites") or [] if w.get("link")]
            followers = ((u.get("metadata") or {}).get("connections") or {}).get("followers", {}).get("total")
            leads.append(Lead(provider=self.name, creator_name=u["name"][:200], source_url=u["link"], snippet=bio[:300] or None,
                              verification_status="verified", audience_size=followers, website=sites[0] if sites else None,
                              emails=[{"email": e, "source": "Vimeo profile", "source_url": u["link"]} for e in extract_emails(bio)],
                              evidence=[f"Vimeo user {u.get('uri')}"]))
        return ProviderResult(self.name, OK, f"{len(leads)} Vimeo creators.", leads)

"""Brave Search API (official). Web results for business discovery. Needs BRAVE_API_KEY on the server."""
from __future__ import annotations

from urllib.parse import urlparse

import httpx

from ..config import get_settings
from .base import FAILED, NOT_CONFIGURED, OK, Lead, ProviderResult

API = "https://api.search.brave.com/res/v1/web/search"


class BraveProvider:
    name = "brave"
    label = "Brave Search"
    required_settings = ("BRAVE_API_KEY",)
    transport = None

    def configured(self) -> bool:
        return bool(get_settings().brave_api_key)

    async def search(self, query: str, limit: int) -> ProviderResult:
        if not self.configured():
            return ProviderResult(self.name, NOT_CONFIGURED, "Add BRAVE_API_KEY on the server to enable Brave Search.")
        try:
            async with httpx.AsyncClient(timeout=15, transport=self.transport) as c:
                r = await c.get(API, params={"q": query, "count": min(max(limit, 1), 20), "country": "gb", "safesearch": "moderate"},
                                headers={"X-Subscription-Token": get_settings().brave_api_key, "Accept": "application/json"})
        except httpx.HTTPError as exc:
            return ProviderResult(self.name, FAILED, f"Brave Search unreachable: {type(exc).__name__}")
        if r.status_code >= 400:
            return ProviderResult(self.name, FAILED, f"Brave Search returned {r.status_code}.")
        leads = []
        for it in ((r.json().get("web") or {}).get("results") or []):
            url = it.get("url")
            if not url:
                continue
            host = urlparse(url).netloc.replace("www.", "")
            leads.append(Lead(provider=self.name, creator_name=(it.get("title") or host)[:200], source_url=url,
                              snippet=(it.get("description") or "")[:300] or None, evidence=[f"Web result from {host}"]))
        return ProviderResult(self.name, OK, f"{len(leads)} web results.", leads)

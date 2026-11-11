"""SerpApi (serpapi.com): one SERPAPI_KEY gives several search engines. Each engine is its own source; their results
are web pages, which the email step reads (site and contact page) for published emails."""
from __future__ import annotations

import httpx

from ..config import get_settings
from .base import FAILED, NOT_CONFIGURED, OK, Lead, ProviderResult

API = "https://serpapi.com/search.json"
ENGINES = {  # source name: (SerpApi engine, query parameter, label)
    "serp_google": ("google", "q", "Google (SerpApi)"),
    "serp_bing": ("bing", "q", "Bing"),
    "serp_duckduckgo": ("duckduckgo", "q", "DuckDuckGo"),
    "serp_brave": ("brave", "q", "Brave (SerpApi)"),
    "serp_yahoo": ("yahoo", "p", "Yahoo"),
}


class SerpApiProvider:
    required_settings = ("SERPAPI_KEY",)
    transport = None

    def __init__(self, name: str):
        self.name = name
        self.engine, self.param, self.label = ENGINES[name]

    def configured(self) -> bool:
        return bool(get_settings().serpapi_key)

    async def search(self, query: str, limit: int) -> ProviderResult:
        if not self.configured():
            return ProviderResult(self.name, NOT_CONFIGURED, "Add SERPAPI_KEY on the server to enable this search engine.")
        params = {"engine": self.engine, self.param: f"{query} contact email", "api_key": get_settings().serpapi_key}
        try:
            async with httpx.AsyncClient(timeout=20, transport=self.transport) as c:
                r = await c.get(API, params=params)
        except httpx.HTTPError as exc:
            return ProviderResult(self.name, FAILED, f"{self.label} unreachable: {type(exc).__name__}")
        if r.status_code in (401, 403):
            return ProviderResult(self.name, FAILED, "SerpApi rejected the key.")
        if r.status_code >= 400:
            return ProviderResult(self.name, FAILED, f"{self.label} returned {r.status_code}.")
        leads = [Lead(provider=self.name, creator_name=(o.get("title") or o["link"])[:200], source_url=o["link"], snippet=(o.get("snippet") or "")[:300] or None,
                      evidence=[f"{self.label} result"]) for o in (r.json().get("organic_results") or [])[:limit] if o.get("link")]
        return ProviderResult(self.name, OK, f"{len(leads)} web results.", leads)

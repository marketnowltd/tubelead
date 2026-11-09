"""Google Programmable Search (Custom Search JSON API). Official API; needs an API key and a search engine ID.
Results are web pages that match the query. They are not treated as verified creators."""
from __future__ import annotations

import re
from urllib.parse import urlparse

import httpx

from ..config import get_settings
from .base import FAILED, NOT_CONFIGURED, OK, Lead, ProviderResult

API = "https://www.googleapis.com/customsearch/v1"
_YT = re.compile(r"youtube\.com/(@[\w.-]+|channel/[\w-]+|c/[\w.-]+|user/[\w.-]+)", re.I)


class GoogleSearchProvider:
    name = "google"
    label = "Google Search"
    required_settings = ("GOOGLE_PSE_KEY", "GOOGLE_PSE_CX")
    transport = None  # tests inject a mock transport here

    def configured(self) -> bool:
        s = get_settings()
        return bool(s.google_pse_key and s.google_pse_cx)

    async def search(self, query: str, limit: int) -> ProviderResult:
        if not self.configured():
            return ProviderResult(self.name, NOT_CONFIGURED, "Add GOOGLE_PSE_KEY and GOOGLE_PSE_CX on the server to enable Google Search.")
        s = get_settings()
        params = {"key": s.google_pse_key, "cx": s.google_pse_cx, "q": query, "num": min(max(limit, 1), 10)}
        try:
            async with httpx.AsyncClient(timeout=15, transport=self.transport) as c:
                r = await c.get(API, params=params)
        except httpx.HTTPError as exc:
            return ProviderResult(self.name, FAILED, f"Google Search unreachable: {type(exc).__name__}")
        if r.status_code >= 400:
            return ProviderResult(self.name, FAILED, f"Google Search returned {r.status_code}. Check the key and search engine ID.")
        items = r.json().get("items", [])
        leads = []
        for it in items:
            url = it.get("link")
            if not url:
                continue
            host = urlparse(url).netloc.replace("www.", "")
            yt = _YT.search(url)
            leads.append(Lead(provider=self.name, creator_name=(it.get("title") or host)[:200], source_url=url,
                              youtube_url=f"https://www.youtube.com/{yt.group(1)}" if yt else None,
                              snippet=(it.get("snippet") or "")[:240] or None,
                              verification_status="unverified",
                              evidence=[f"Web result from {host}"]))
        return ProviderResult(self.name, OK, f"{len(leads)} web results.", leads)

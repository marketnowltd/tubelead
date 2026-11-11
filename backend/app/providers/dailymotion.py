"""Dailymotion public Data API (no key): user search, with each creator's own website when they list one."""
from __future__ import annotations

import httpx

from ..services.contacts import extract_emails
from .base import FAILED, OK, Lead, ProviderResult

API = "https://api.dailymotion.com/users"
FIELDS = "id,screenname,username,url,description,followers_total,website_url,country"


class DailymotionProvider:
    name = "dailymotion"
    label = "Dailymotion"
    required_settings: tuple[str, ...] = ()
    transport = None

    def configured(self) -> bool:
        return True

    async def search(self, query: str, limit: int) -> ProviderResult:
        try:
            async with httpx.AsyncClient(timeout=15, transport=self.transport) as c:
                r = await c.get(API, params={"search": query, "fields": FIELDS, "limit": min(max(limit, 1), 100)})
        except httpx.HTTPError as exc:
            return ProviderResult(self.name, FAILED, f"Dailymotion unreachable: {type(exc).__name__}")
        if r.status_code >= 400:
            return ProviderResult(self.name, FAILED, f"Dailymotion returned {r.status_code}.")
        leads = []
        for u in r.json().get("list", []):
            name = u.get("screenname") or u.get("username")
            if not name:
                continue
            bio = u.get("description") or ""
            url = u.get("url") or f"https://www.dailymotion.com/{u.get('username', '')}"
            leads.append(Lead(provider=self.name, creator_name=name[:200], source_url=url, snippet=bio[:300] or None,
                              verification_status="verified", audience_size=u.get("followers_total"), website=u.get("website_url") or None,
                              emails=[{"email": e, "source": "Dailymotion profile", "source_url": url} for e in extract_emails(bio)],
                              evidence=[f"Dailymotion user {u.get('id')}"]))
        return ProviderResult(self.name, OK, f"{len(leads)} Dailymotion creators.", leads)

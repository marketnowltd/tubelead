"""Mastodon public account search on one server (MASTODON_INSTANCE, default mastodon.social), no key. Some servers
only allow search for signed-in apps; then this source reports that it failed rather than returning nothing silently."""
from __future__ import annotations

import re

import httpx

from ..config import get_settings
from ..services.contacts import classify_links, extract_emails
from .base import FAILED, OK, Lead, ProviderResult


class MastodonProvider:
    name = "mastodon"
    label = "Mastodon"
    required_settings: tuple[str, ...] = ()
    transport = None

    def configured(self) -> bool:
        return bool(get_settings().mastodon_instance)

    async def search(self, query: str, limit: int) -> ProviderResult:
        host = get_settings().mastodon_instance.strip().removeprefix("https://").strip("/")
        try:
            async with httpx.AsyncClient(timeout=15, transport=self.transport) as c:
                r = await c.get(f"https://{host}/api/v2/search", params={"q": query, "type": "accounts", "limit": min(max(limit, 1), 40)})
        except httpx.HTTPError as exc:
            return ProviderResult(self.name, FAILED, f"Mastodon unreachable: {type(exc).__name__}")
        if r.status_code >= 400:
            return ProviderResult(self.name, FAILED, f"Mastodon ({host}) returned {r.status_code}.")
        leads = []
        for a in r.json().get("accounts", []):
            if not a.get("url"):
                continue
            bio = re.sub(r"<[^>]+>", " ", a.get("note") or "")
            fields = " ".join(f"{f.get('name', '')} {re.sub(r'<[^>]+>', ' ', f.get('value', ''))}" for f in a.get("fields") or [])
            hrefs = " ".join(re.findall(r'href="([^"]+)"', " ".join(f.get("value", "") for f in a.get("fields") or [])))
            _, sites = classify_links(bio + " " + hrefs)
            leads.append(Lead(provider=self.name, creator_name=(a.get("display_name") or a.get("acct") or "")[:200] or a["url"], source_url=a["url"],
                              snippet=bio.strip()[:300] or None, verification_status="verified", audience_size=a.get("followers_count"),
                              website=sites[0] if sites else None,
                              emails=[{"email": e, "source": "Mastodon profile", "source_url": a["url"]} for e in extract_emails(bio + " " + fields)],
                              evidence=[f"Mastodon account {a.get('acct')} on {host}"]))
        return ProviderResult(self.name, OK, f"{len(leads)} Mastodon profiles.", leads)

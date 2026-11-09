"""Reddit provider using the official Reddit API (application-only OAuth). Needs a Reddit app's client ID and secret.
Reddit's API terms and its User-Agent rule apply: the User-Agent identifies TubeLead and the owner's contact."""
from __future__ import annotations

import httpx

from ..config import get_settings
from .base import FAILED, NOT_CONFIGURED, OK, Lead, ProviderResult

TOKEN_URL = "https://www.reddit.com/api/v1/access_token"
SEARCH_URL = "https://oauth.reddit.com/search"


class RedditProvider:
    name = "reddit"
    label = "Reddit"
    required_settings = ("REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_USER_AGENT")
    transport = None

    def configured(self) -> bool:
        s = get_settings()
        return bool(s.reddit_client_id and s.reddit_client_secret and s.reddit_user_agent)

    async def search(self, query: str, limit: int) -> ProviderResult:
        if not self.configured():
            return ProviderResult(self.name, NOT_CONFIGURED, "Add REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET and REDDIT_USER_AGENT to enable Reddit.")
        s = get_settings()
        headers = {"User-Agent": s.reddit_user_agent}
        try:
            async with httpx.AsyncClient(timeout=15, transport=self.transport, headers=headers) as c:
                t = await c.post(TOKEN_URL, data={"grant_type": "client_credentials"}, auth=(s.reddit_client_id, s.reddit_client_secret))
                if t.status_code >= 400:
                    return ProviderResult(self.name, FAILED, f"Reddit sign-in returned {t.status_code}. Check the app credentials.")
                token = t.json().get("access_token")
                r = await c.get(SEARCH_URL, params={"q": query, "limit": min(max(limit, 1), 25), "sort": "relevance", "type": "link"},
                                headers={"Authorization": f"bearer {token}"})
        except httpx.HTTPError as exc:
            return ProviderResult(self.name, FAILED, f"Reddit unreachable: {type(exc).__name__}")
        if r.status_code >= 400:
            return ProviderResult(self.name, FAILED, f"Reddit search returned {r.status_code}.")
        leads = []
        for child in r.json().get("data", {}).get("children", []):
            d = child.get("data", {})
            if not d.get("permalink"):
                continue
            leads.append(Lead(provider=self.name, creator_name=d.get("author") or "Reddit user",
                              source_url=f"https://www.reddit.com{d['permalink']}", snippet=(d.get("title") or "")[:240] or None,
                              verification_status="unverified",
                              evidence=[f"Reddit post in r/{d.get('subreddit', '?')}"]))
        return ProviderResult(self.name, OK, f"{len(leads)} Reddit posts.", leads)

"""Twitch Helix API (official). Client-credentials app token, then channel search. Channel records are platform data,
so they are reported as 'unverified' creators until the owner checks them."""
from __future__ import annotations

import httpx

from ..config import get_settings
from .base import FAILED, NOT_CONFIGURED, OK, Lead, ProviderResult

TOKEN_URL = "https://id.twitch.tv/oauth2/token"
SEARCH_URL = "https://api.twitch.tv/helix/search/channels"


class TwitchProvider:
    name = "twitch"
    label = "Twitch"
    required_settings = ("TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET")
    transport = None  # tests inject a mock transport

    def configured(self) -> bool:
        s = get_settings()
        return bool(s.twitch_client_id and s.twitch_client_secret)

    async def search(self, query: str, limit: int) -> ProviderResult:
        if not self.configured():
            return ProviderResult(self.name, NOT_CONFIGURED, "Add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET on the server to enable Twitch.")
        s = get_settings()
        try:
            async with httpx.AsyncClient(timeout=15, transport=self.transport) as c:
                t = await c.post(TOKEN_URL, data={"client_id": s.twitch_client_id, "client_secret": s.twitch_client_secret, "grant_type": "client_credentials"})
                if t.status_code >= 400:
                    return ProviderResult(self.name, FAILED, f"Twitch sign-in returned {t.status_code}. Check the app credentials.")
                r = await c.get(SEARCH_URL, params={"query": query, "first": min(max(limit, 1), 100)},
                                headers={"Client-Id": s.twitch_client_id, "Authorization": f"Bearer {t.json().get('access_token', '')}"})
        except httpx.HTTPError as exc:
            return ProviderResult(self.name, FAILED, f"Twitch unreachable: {type(exc).__name__}")
        if r.status_code >= 400:
            return ProviderResult(self.name, FAILED, f"Twitch search returned {r.status_code}.")
        leads = []
        for ch in r.json().get("data", []):
            login = ch.get("broadcaster_login")
            if not login:
                continue
            url = f"https://www.twitch.tv/{login}"
            game = ch.get("game_name") or ""
            leads.append(Lead(provider=self.name, creator_name=(ch.get("display_name") or login)[:200], source_url=url,
                              snippet=(ch.get("title") or game or ch.get("broadcaster_language") or "")[:240] or None,
                              evidence=[f"Twitch channel {login}" + (f" · {game}" if game else "")]))
        return ProviderResult(self.name, OK, f"{len(leads)} Twitch channels.", leads)

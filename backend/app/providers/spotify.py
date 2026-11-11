"""Spotify Web API (official). Client-credentials app token, then artist search. Music creators only."""
from __future__ import annotations

import base64

import httpx

from ..config import get_settings
from .base import FAILED, NOT_CONFIGURED, OK, Lead, ProviderResult

TOKEN_URL = "https://accounts.spotify.com/api/token"
SEARCH_URL = "https://api.spotify.com/v1/search"


class SpotifyProvider:
    name = "spotify"
    label = "Spotify"
    required_settings = ("SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET")
    transport = None

    def configured(self) -> bool:
        s = get_settings()
        return bool(s.spotify_client_id and s.spotify_client_secret)

    async def search(self, query: str, limit: int) -> ProviderResult:
        if not self.configured():
            return ProviderResult(self.name, NOT_CONFIGURED, "Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET on the server to enable Spotify.")
        s = get_settings()
        basic = base64.b64encode(f"{s.spotify_client_id}:{s.spotify_client_secret}".encode()).decode()
        try:
            async with httpx.AsyncClient(timeout=15, transport=self.transport) as c:
                t = await c.post(TOKEN_URL, data={"grant_type": "client_credentials"}, headers={"Authorization": f"Basic {basic}"})
                if t.status_code >= 400:
                    return ProviderResult(self.name, FAILED, f"Spotify sign-in returned {t.status_code}. Check the app credentials.")
                r = await c.get(SEARCH_URL, params={"q": query, "type": "artist", "limit": min(max(limit, 1), 50)},
                                headers={"Authorization": f"Bearer {t.json().get('access_token', '')}"})
        except httpx.HTTPError as exc:
            return ProviderResult(self.name, FAILED, f"Spotify unreachable: {type(exc).__name__}")
        if r.status_code >= 400:
            return ProviderResult(self.name, FAILED, f"Spotify search returned {r.status_code}.")
        leads = []
        for a in (r.json().get("artists", {}) or {}).get("items", []):
            url = (a.get("external_urls") or {}).get("spotify")
            if not a.get("name") or not url:
                continue
            genres = ", ".join(a.get("genres") or [])[:200]
            followers = (a.get("followers") or {}).get("total")
            leads.append(Lead(provider=self.name, creator_name=a["name"][:200], source_url=url,
                              snippet=(f"{genres}" + (f" · {followers:,} followers" if isinstance(followers, int) else "")).strip(" ·") or None,
                              verification_status="verified",
                              evidence=["Spotify API artist record"]))
        return ProviderResult(self.name, OK, f"{len(leads)} Spotify artists.", leads)

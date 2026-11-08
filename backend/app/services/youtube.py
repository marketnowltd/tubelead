"""Thin async client for the official YouTube Data API v3 with quota accounting."""
from __future__ import annotations

from collections.abc import Callable

import httpx

API = "https://www.googleapis.com/youtube/v3"
COSTS = {"search": 100, "channels": 1, "playlistItems": 1, "videos": 1}


class YouTubeError(Exception):
    def __init__(self, message: str, code: str = "youtube_error", status: int = 502):
        super().__init__(message)
        self.code, self.status = code, status


class QuotaBudgetExceeded(YouTubeError):
    def __init__(self, message: str = "YouTube API quota budget exhausted"):
        super().__init__(message, "quota_exceeded", 429)


class YouTubeClient:
    def __init__(self, api_key: str, *, base_url: str = API, transport: httpx.AsyncBaseTransport | None = None,
                 budget_check: Callable[[int], None] | None = None,
                 on_spend: Callable[[int], None] | None = None):
        if not api_key:
            raise YouTubeError("YOUTUBE_API_KEY is not configured", "youtube_not_configured", 503)
        self._key = api_key
        self._http = httpx.AsyncClient(base_url=base_url, timeout=20, transport=transport)
        self._budget_check = budget_check or (lambda _c: None)
        self._on_spend = on_spend or (lambda _c: None)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def _get(self, endpoint: str, params: dict) -> dict:
        cost = COSTS[endpoint]
        self._budget_check(cost)
        try:
            r = await self._http.get(f"/{endpoint}", params={**params, "key": self._key})
        except httpx.HTTPError as exc:
            raise YouTubeError(f"Network error talking to YouTube: {exc}", "network_error") from exc
        # Google bills a request even when it errors with quotaExceeded, but not for 4xx auth errors.
        if r.status_code == 200:
            self._on_spend(cost)
            return r.json()
        reason, message = "", r.text[:300]
        try:
            err = r.json()["error"]
            message = err.get("message", message)
            reason = (err.get("errors") or [{}])[0].get("reason", "")
        except Exception:  # noqa: BLE001
            pass
        if reason in ("quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"):
            raise YouTubeError("YouTube reports the daily API quota is exhausted", "quota_exceeded", 429)
        if reason in ("keyInvalid", "badRequest") and "API key" in message:
            raise YouTubeError("The YouTube API key is invalid", "invalid_api_key", 401)
        if r.status_code == 403:
            raise YouTubeError(f"YouTube API access denied ({reason or 'forbidden'}): {message}", "forbidden", 403)
        raise YouTubeError(f"YouTube API error {r.status_code}: {message}", "youtube_error")

    async def search_channels(self, q: str, *, region: str | None = None, order: str = "relevance",
                              page_token: str | None = None) -> dict:
        params = {"part": "snippet", "type": "channel", "q": q, "maxResults": 50, "order": order}
        if region:
            params["regionCode"] = region
        if page_token:
            params["pageToken"] = page_token
        return await self._get("search", params)

    async def search_videos(self, q: str, *, region: str | None = None, order: str = "relevance", page_token: str | None = None) -> dict:
        params = {"part": "snippet", "type": "video", "q": q, "maxResults": 50, "order": order}
        if region:
            params["regionCode"] = region
        if page_token:
            params["pageToken"] = page_token
        return await self._get("search", params)

    async def videos_by_id(self, ids: list[str]) -> list[dict]:
        out: list[dict] = []
        for i in range(0, len(ids), 50):
            out.extend((await self._get("videos", {"part": "snippet", "id": ",".join(ids[i:i + 50])})).get("items", []))
        return out

    async def channels(self, ids: list[str]) -> list[dict]:
        out: list[dict] = []
        for i in range(0, len(ids), 50):
            data = await self._get("channels", {
                "part": "snippet,statistics,contentDetails,brandingSettings,topicDetails",
                "id": ",".join(ids[i:i + 50]), "maxResults": 50})
            out.extend(data.get("items", []))
        return out

    async def recent_videos(self, uploads_playlist: str, n: int = 10) -> list[dict]:
        pl = await self._get("playlistItems", {"part": "contentDetails", "playlistId": uploads_playlist, "maxResults": n})
        ids = [i["contentDetails"]["videoId"] for i in pl.get("items", [])]
        if not ids:
            return []
        vids = await self._get("videos", {"part": "statistics,snippet", "id": ",".join(ids)})
        return vids.get("items", [])

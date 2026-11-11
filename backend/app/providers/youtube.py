"""YouTube Data API provider. Channels returned here were confirmed by the YouTube API, so they are 'verified'."""
from __future__ import annotations

from ..config import get_settings
from ..services.youtube import QuotaBudgetExceeded, YouTubeClient, YouTubeError
from .base import FAILED, NOT_CONFIGURED, OK, Lead, ProviderResult


class YouTubeProvider:
    name = "youtube"
    label = "YouTube"
    required_settings = ("YOUTUBE_API_KEY",)

    def configured(self) -> bool:
        return bool(get_settings().youtube_api_key)

    async def search(self, query: str, limit: int) -> ProviderResult:
        if not self.configured():
            return ProviderResult(self.name, NOT_CONFIGURED, "Add YOUTUBE_API_KEY on the server to enable YouTube search.")
        s = get_settings()
        yt = YouTubeClient(s.youtube_api_key, base_url=s.youtube_api_base)
        try:
            data = await yt.search_channels(query, order="relevance")
            ids = [i.get("snippet", {}).get("channelId") or i.get("id", {}).get("channelId") for i in data.get("items", [])]
            ids = [i for i in ids if i][:limit]
            if not ids:
                return ProviderResult(self.name, OK, "No channels matched this search.")
            chans = await yt.channels(ids)
            leads = []
            for ch in chans:
                cid = ch["id"]
                title = ch.get("snippet", {}).get("title", "").strip()
                if not title:
                    continue
                leads.append(Lead(provider=self.name, creator_name=title, source_url=f"https://www.youtube.com/channel/{cid}",
                                  youtube_url=f"https://www.youtube.com/channel/{cid}", youtube_channel_id=cid,
                                  snippet=(ch.get("snippet", {}).get("description") or "")[:240] or None,
                                  verification_status="verified",
                                  audience_size=int(ch["statistics"]["subscriberCount"]) if str((ch.get("statistics") or {}).get("subscriberCount", "")).isdigit() and not (ch.get("statistics") or {}).get("hiddenSubscriberCount") else None,
                                  evidence=[f"YouTube Data API channel record {cid}"]))
            return ProviderResult(self.name, OK, f"{len(leads)} channels confirmed by the YouTube API.", leads)
        except QuotaBudgetExceeded as exc:
            return ProviderResult(self.name, FAILED, str(exc))
        except YouTubeError as exc:
            return ProviderResult(self.name, FAILED, f"YouTube: {exc}")
        finally:
            await yt.aclose()

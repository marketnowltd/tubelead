"""Deterministic fake YouTube + website servers for tests (httpx.MockTransport)."""
import json
from datetime import datetime, timedelta, timezone

import httpx

NOW = datetime.now(timezone.utc)


def iso(days_ago: int) -> str:
    return (NOW - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


CHANNELS = {
    "UC_A": dict(title="Alpha Tech", subs=50_000, country="GB", desc="Business: biz@alpha.test\nSite https://alpha.test and https://instagram.com/alpha", up=2),
    "UC_B": dict(title="Beta Official Network", subs=60_000, country="US", desc="No contact here", up=3),
    "UC_C": dict(title="Gamma Small", subs=200, country="GB", desc="tiny", up=1),
    "UC_D": dict(title="Delta Dormant", subs=40_000, country="GB", desc="old channel", up=400),
    "UC_E": dict(title="Echo Hidden", subs=None, country="GB", desc="hidden subs", up=1),
}


def youtube_handler(calls: list):
    def handler(req: httpx.Request) -> httpx.Response:
        path = req.url.path.rsplit("/", 1)[-1]
        q = dict(req.url.params)
        calls.append(path)
        if path == "search":
            if q.get("q") == "boom":
                return httpx.Response(403, json={"error": {"message": "quota", "errors": [{"reason": "quotaExceeded"}]}})
            return httpx.Response(200, json={"items": [{"snippet": {"channelId": cid}} for cid in CHANNELS]})
        if path == "channels":
            items = []
            for cid in q["id"].split(","):
                c = CHANNELS[cid]
                st = {"videoCount": "100", "viewCount": "1000000"}
                if c["subs"] is None:
                    st["hiddenSubscriberCount"] = True
                else:
                    st["subscriberCount"] = str(c["subs"])
                items.append({"id": cid, "snippet": {"title": c["title"], "description": c["desc"], "country": c["country"], "customUrl": "@" + cid.lower(),
                                                     "thumbnails": {"default": {"url": "https://img.test/x.jpg"}}},
                              "statistics": st, "contentDetails": {"relatedPlaylists": {"uploads": "UU" + cid}},
                              "topicDetails": {"topicCategories": ["https://en.wikipedia.org/wiki/Technology"]}})
            return httpx.Response(200, json={"items": items})
        if path == "playlistItems":
            cid = q["playlistId"][2:]
            return httpx.Response(200, json={"items": [{"contentDetails": {"videoId": f"{cid}-v{i}"}} for i in range(3)]})
        if path == "videos":
            ids = q["id"].split(",")
            cid = ids[0].split("-")[0]
            up = CHANNELS[cid]["up"]
            return httpx.Response(200, json={"items": [
                {"id": v, "snippet": {"publishedAt": iso(up + i * 7)}, "statistics": {"viewCount": "1000", "likeCount": "40", "commentCount": "10"}} for i, v in enumerate(ids)]})
        return httpx.Response(404)
    return handler


def website_handler(req: httpx.Request) -> httpx.Response:
    u = str(req.url)
    if u.endswith("/robots.txt"):
        return httpx.Response(200, text="User-agent: *\nDisallow: /private\n")
    if u in ("https://alpha.test", "https://alpha.test/"):
        return httpx.Response(200, headers={"content-type": "text/html"},
                              text='<html><a href="/business">Business enquiries</a> <a href="mailto:press@alpha.test">press</a></html>')
    if u == "https://alpha.test/business":
        return httpx.Response(200, headers={"content-type": "text/html"}, text="<p>Sponsorship: partners@alpha.test</p>")
    return httpx.Response(404)

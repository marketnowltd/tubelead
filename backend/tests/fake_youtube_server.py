"""Local stand-in for the YouTube Data API v3 for end-to-end UI testing (no real key needed).
Run:  uvicorn tests.fake_youtube_server:app --port 8765
Then: YOUTUBE_API_KEY=fake YOUTUBE_API_BASE=http://127.0.0.1:8765/youtube/v3 uvicorn app.main:app"""
import asyncio
import random
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Request

app = FastAPI()
ADJ = ["Neon", "Quantum", "Lunar", "Rapid", "Silent", "Golden", "Arctic", "Solar", "Velvet", "Iron"]
NOUN = ["Gadgets", "Kitchen", "Rides", "Tutor", "Beats", "Gaming", "Travels", "Fit", "Studio", "Reviews"]
CTRY = ["GB", "US", "DE", "FR", "IN", "BR", "JP", "CA", "AU", "ES"]
rng = random.Random(7)
CH = {}
for i in range(40):
    cid = f"UCfake{i:018d}"
    subs = int(10 ** rng.uniform(2.8, 6.0))
    CH[cid] = dict(title=f"{ADJ[i % 10]} {NOUN[(i * 3) % 10]}{' Official Network' if i % 13 == 0 else ''}", subs=subs, country=CTRY[i % 10] if i % 7 else None,
                   email=f"hello@fakecreator{i}.com" if i % 5 in (0, 2) else None, site=f"https://fake-{i}.invalid" if i % 3 else None,
                   up=rng.choice([1, 3, 9, 20, 45, 200, 400]), eng=rng.uniform(0.5, 8))
IDS = list(CH)


@app.middleware("http")
async def slow(request: Request, call_next):
    await asyncio.sleep(1.3)  # make job progress observable in the UI
    return await call_next(request)


@app.get("/youtube/v3/search")
async def search(q: str = "", regionCode: str = "", order: str = "relevance", pageToken: str = ""):
    r = random.Random(f"{q}|{regionCode}|{order}")
    pick = r.sample(IDS, 24)
    return {"items": [{"id": {"kind": "youtube#channel", "channelId": c}, "snippet": {"channelId": c}} for c in pick]}


@app.get("/youtube/v3/channels")
async def channels(id: str):
    out = []
    for cid in id.split(","):
        c = CH[cid]
        desc = f"Welcome to {c['title']}! " + (f"Business enquiries: {c['email']} " if c["email"] else "") + (f"Site {c['site']} " if c["site"] else "") + f"https://instagram.com/{cid[-6:]}"
        out.append({"id": cid, "snippet": {"title": c["title"], "description": desc, "customUrl": "@" + c["title"].lower().replace(" ", ""), "country": c["country"] or None,
                                            "thumbnails": {"medium": {"url": ""}}},
                    "statistics": {"subscriberCount": str(c["subs"]), "videoCount": str(rng.randint(30, 900)), "viewCount": str(c["subs"] * 80)},
                    "contentDetails": {"relatedPlaylists": {"uploads": "UU" + cid[2:]}}, "topicDetails": {"topicCategories": ["https://en.wikipedia.org/wiki/Technology"]}})
    return {"items": out}


@app.get("/youtube/v3/playlistItems")
async def playlist(playlistId: str):
    cid = "UC" + playlistId[2:]
    return {"items": [{"contentDetails": {"videoId": f"{cid}|{i}"}} for i in range(5)]}


@app.get("/youtube/v3/videos")
async def videos(id: str):
    items = []
    for v in id.split(","):
        cid, i = v.split("|")
        c = CH[cid]
        views = max(200, int(c["subs"] * 0.1))
        d = datetime.now(timezone.utc) - timedelta(days=c["up"] + int(i) * 6)
        items.append({"id": v, "snippet": {"publishedAt": d.strftime("%Y-%m-%dT%H:%M:%SZ")},
                      "statistics": {"viewCount": str(views), "likeCount": str(int(views * c["eng"] / 100 * 0.85)), "commentCount": str(int(views * c["eng"] / 100 * 0.15))}})
    return {"items": items}

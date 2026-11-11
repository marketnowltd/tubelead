import asyncio

import httpx
import pytest

from app.config import get_settings
from app.providers.lastfm import LastFmProvider
from app.providers.musicbrainz import MusicBrainzProvider
from app.providers.spotify import SpotifyProvider
from app.providers.twitch import TwitchProvider
from app.providers.base import FAILED, NOT_CONFIGURED, OK


def route(routes):
    def handler(request: httpx.Request):
        for key, resp in routes.items():
            if key in str(request.url):
                return resp(request) if callable(resp) else resp
        return httpx.Response(404)
    return httpx.MockTransport(handler)


@pytest.fixture
def keys(monkeypatch):
    s = get_settings()
    for k, v in {"twitch_client_id": "tid", "twitch_client_secret": "tsec", "spotify_client_id": "sid",
                 "spotify_client_secret": "ssec", "lastfm_api_key": "lk"}.items():
        monkeypatch.setattr(s, k, v)
    return s


def test_twitch_unconfigured_makes_no_request(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "twitch_client_id", "")
    p = TwitchProvider()
    p.transport = route({})
    r = asyncio.run(p.search("fitness", 5))
    assert r.status == NOT_CONFIGURED and r.leads == []


def test_twitch_token_then_channel_search(keys):
    p = TwitchProvider()
    p.transport = route({
        "id.twitch.tv": httpx.Response(200, json={"access_token": "tok"}),
        "helix/search/channels": lambda req: (
            httpx.Response(200, json={"data": [
                {"display_name": "Coach Jo", "broadcaster_login": "coachjo", "title": "Morning HIIT", "game_name": "Fitness"},
                {"display_name": "", "broadcaster_login": None},
            ]}) if req.headers.get("Authorization") == "Bearer tok" else httpx.Response(401)),
    })
    r = asyncio.run(p.search("fitness", 5))
    assert r.status == OK and len(r.leads) == 1
    assert r.leads[0].source_url == "https://www.twitch.tv/coachjo"
    assert r.leads[0].verification_status == "unverified"


def test_twitch_bad_credentials_reported(keys):
    p = TwitchProvider()
    p.transport = route({"id.twitch.tv": httpx.Response(400)})
    r = asyncio.run(p.search("fitness", 5))
    assert r.status == FAILED and "400" in r.message


def test_spotify_artist_search(keys):
    p = SpotifyProvider()
    p.transport = route({
        "accounts.spotify.com": httpx.Response(200, json={"access_token": "st"}),
        "v1/search": httpx.Response(200, json={"artists": {"items": [
            {"name": "Lena Keys", "external_urls": {"spotify": "https://open.spotify.com/artist/1"}, "genres": ["pop"], "followers": {"total": 12000}},
            {"name": "No Link", "external_urls": {}},
        ]}}),
    })
    r = asyncio.run(p.search("pop singer", 5))
    assert r.status == OK and [l.creator_name for l in r.leads] == ["Lena Keys"]
    assert "12,000 followers" in r.leads[0].snippet


def test_lastfm_artist_search_and_error_body(keys):
    p = LastFmProvider()
    p.transport = route({"ws.audioscrobbler.com": httpx.Response(200, json={"results": {"artistmatches": {"artist": [
        {"name": "Band A", "url": "https://www.last.fm/music/Band+A", "listeners": "5000"}]}}})})
    r = asyncio.run(p.search("band", 5))
    assert r.status == OK and r.leads[0].snippet == "5,000 listeners"

    p.transport = route({"ws.audioscrobbler.com": httpx.Response(200, json={"error": 10, "message": "Invalid API key"})})
    r = asyncio.run(p.search("band", 5))
    assert r.status == FAILED and "Invalid API key" in r.message


def test_musicbrainz_sends_user_agent_and_maps_artists(monkeypatch):
    seen = {}

    def handler(req):
        seen["ua"] = req.headers.get("User-Agent")
        return httpx.Response(200, json={"artists": [{"id": "abc", "name": "Cello Kit", "type": "Person", "country": "GB"}]})

    p = MusicBrainzProvider()
    p.transport = route({"musicbrainz.org": handler})
    r = asyncio.run(p.search("cello", 5))
    assert r.status == OK
    assert seen["ua"].startswith("TubeLead")
    assert r.leads[0].source_url == "https://musicbrainz.org/artist/abc"


def test_multi_source_is_pro_and_above(client, monkeypatch):
    from app.services.search_everywhere import PROVIDERS
    for p in PROVIDERS:
        monkeypatch.setattr(p, "configured", lambda: True)
    async def fake(query, limit):
        return {"query": query, "providers": [], "leads": [], "duplicates_merged": 0, "verified_youtube": 0}
    monkeypatch.setattr("app.routers.everywhere.search_everywhere", fake)

    st = get_settings()
    old = st.plan_override
    try:
        st.plan_override = "starter"
        r = client.post("/api/search-everywhere", json={"query": "fitness coach"})
        assert r.status_code == 402
        assert r.json()["detail"]["feature"] == "multi_source"
        assert r.json()["detail"]["required_plan"] == "Pro"
        st.plan_override = "pro"
        assert client.post("/api/search-everywhere", json={"query": "fitness coach"}).status_code == 200
    finally:
        st.plan_override = old

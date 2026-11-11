import asyncio

import httpx
import pytest

from app.config import get_settings
from app.providers import base
from app.providers.base import FAILED, NOT_CONFIGURED, OK, Lead, ProviderResult
from app.providers.google_search import GoogleSearchProvider
from app.providers.reddit import RedditProvider
from app.services import search_everywhere as se


@pytest.fixture
def no_keys(monkeypatch):
    s = get_settings()
    for k in ("youtube_api_key", "google_pse_key", "google_pse_cx", "reddit_client_id", "reddit_client_secret"):
        monkeypatch.setattr(s, k, "")
    return s


def test_unconfigured_providers_make_no_request(no_keys):
    calls = []

    def handler(request: httpx.Request):
        calls.append(request.url)
        return httpx.Response(500)

    g = GoogleSearchProvider()
    g.transport = httpx.MockTransport(handler)
    r = asyncio.run(g.search("fitness coach", 5))
    assert r.status == NOT_CONFIGURED
    assert r.leads == []
    assert calls == []


def test_google_results_are_unverified_and_normalised(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "google_pse_key", "k")
    monkeypatch.setattr(s, "google_pse_cx", "cx")

    def handler(request: httpx.Request):
        return httpx.Response(200, json={"items": [
            {"title": "Jane Fit", "link": "https://www.youtube.com/@janefit", "snippet": "Coach"},
            {"title": "", "link": "https://example.com/blog/x", "snippet": None},
            {"title": "no link"},
        ]})

    g = GoogleSearchProvider()
    g.transport = httpx.MockTransport(handler)
    r = asyncio.run(g.search("fitness coach", 5))
    assert r.status == OK
    assert len(r.leads) == 2
    assert all(l.verification_status == "unverified" for l in r.leads)
    assert r.leads[0].youtube_url == "https://www.youtube.com/@janefit"


def test_google_http_error_is_reported_not_raised(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "google_pse_key", "k")
    monkeypatch.setattr(s, "google_pse_cx", "cx")
    g = GoogleSearchProvider()
    g.transport = httpx.MockTransport(lambda req: httpx.Response(403))
    r = asyncio.run(g.search("fitness coach", 5))
    assert r.status == FAILED
    assert "403" in r.message


def test_one_provider_crashing_does_not_stop_others(monkeypatch, no_keys):
    class Boom:
        name = "boom"
        label = "Boom"
        required_settings = ()

        def configured(self):
            return True

        async def search(self, query, limit):
            raise RuntimeError("secret internal detail")

    class Ok:
        name = "ok"
        label = "Ok"
        required_settings = ()

        def configured(self):
            return True

        async def search(self, query, limit):
            return ProviderResult("ok", OK, "1 found", [Lead(provider="ok", creator_name="Ana Lee", source_url="https://x.test/a")])

    monkeypatch.setattr(se, "PROVIDERS", [Boom(), Ok()])
    out = asyncio.run(se.search_everywhere("fitness coach", 5))
    statuses = {p["provider"]: p["status"] for p in out["providers"]}
    assert statuses == {"boom": FAILED, "ok": OK}
    assert [l["creator_name"] for l in out["leads"]] == ["Ana Lee"]
    # internal exception text must not leak to the client
    assert "secret internal detail" not in str(out)


def test_merge_dedupes_channel_ids_and_names_and_promotes_verified():
    yt = ProviderResult("youtube", OK, "", [Lead(provider="youtube", creator_name="Jane Fit", source_url="https://www.youtube.com/channel/UC1",
                                                  youtube_channel_id="UC1", verification_status="verified", evidence=["api"])])
    web = ProviderResult("google", OK, "", [
        Lead(provider="google", creator_name="Jane  Fit!", source_url="https://blog.test/jane", evidence=["web"]),
        Lead(provider="google", creator_name="Other Person", source_url="https://blog.test/other"),
    ])
    leads, dupes = se.merge([yt, web])
    assert dupes == 1
    assert len(leads) == 2
    jane = next(l for l in leads if l["creator_name"] == "Jane Fit")
    assert jane["verification_status"] == "verified"
    assert sorted(jane["sources"]) == ["google", "youtube"]
    assert jane["youtube_channel_id"] == "UC1"


def test_unverified_duplicate_never_downgrades_verified():
    a = ProviderResult("youtube", OK, "", [Lead(provider="youtube", creator_name="Sam", source_url="u", youtube_channel_id="UC9", verification_status="verified")])
    b = ProviderResult("google", OK, "", [Lead(provider="google", creator_name="Sam", source_url="v", youtube_channel_id="UC9", verification_status="unverified")])
    leads, _ = se.merge([b, a])
    assert leads[0]["verification_status"] == "verified"


def test_endpoint_503_when_nothing_configured(client, no_keys, monkeypatch):
    for p in se.PROVIDERS:
        monkeypatch.setattr(p, "configured", lambda: False)
    r = client.post("/api/search-everywhere", json={"query": "fitness coach"})
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "no_providers"


def test_provider_status_lists_required_keys(client, no_keys):
    rows = client.get("/api/search-everywhere/providers").json()
    names = {r["name"]: r for r in rows}
    keyless = {"musicbrainz", "applepodcasts", "bluesky", "dailymotion", "mastodon"}
    assert set(names) == {"youtube", "google", "brave", "reddit", "twitch", "spotify", "lastfm", "vimeo"} | keyless
    # these need no key (MusicBrainz only an identifying User-Agent, which has a default)
    assert all(names[n]["configured"] is True for n in keyless)
    assert all(r["configured"] is False for n, r in names.items() if n not in keyless)
    assert "VIMEO_ACCESS_TOKEN" in names["vimeo"]["requires"]
    assert "TWITCH_CLIENT_SECRET" in names["twitch"]["requires"]
    assert "GOOGLE_PSE_KEY" in names["google"]["requires"]
    assert "REDDIT_CLIENT_SECRET" in names["reddit"]["requires"]


def test_search_validates_query_length(client):
    assert client.post("/api/search-everywhere", json={"query": "ab"}).status_code == 422


def test_merge_matches_second_lead_by_its_own_name():
    a = ProviderResult("google", OK, "", [Lead(provider="google", creator_name="Kim Lowe", source_url="a")])
    b = ProviderResult("reddit", OK, "", [Lead(provider="reddit", creator_name="kim-lowe", source_url="b")])
    c = ProviderResult("google", OK, "", [Lead(provider="google", creator_name="Kim Lowe", source_url="c")])
    leads, dupes = se.merge([a, b, c])
    assert len(leads) == 1 and dupes == 2
    assert leads[0]["sources"] == ["google", "reddit"]

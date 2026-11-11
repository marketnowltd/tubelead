"""New search sources (Apple Podcasts, Bluesky, Dailymotion, Mastodon, Vimeo) and finding published emails."""
import asyncio

import httpx
import pytest

from app.config import get_settings
from app.providers.applepodcasts import ApplePodcastsProvider
from app.providers.base import OK, Lead, ProviderResult
from app.providers.bluesky import BlueskyProvider
from app.providers.dailymotion import DailymotionProvider
from app.providers.mastodon import MastodonProvider
from app.providers.vimeo import VimeoProvider
from app.services import lead_contacts, search_everywhere as se


def run(p, handler, q="fitness"):
    p.transport = httpx.MockTransport(handler)
    try:
        return asyncio.run(p.search(q, 5))
    finally:
        p.transport = None


def test_apple_podcasts_keeps_the_feed_for_the_owner_email():
    seen = {}
    def h(req):
        seen.update(req.url.params)
        return httpx.Response(200, json={"results": [{"collectionId": 1, "collectionName": "Fit Talk", "artistName": "Sam Lee", "primaryGenreName": "Fitness",
                                                       "collectionViewUrl": "https://podcasts.apple.com/p/1", "feedUrl": "https://feeds.fit.example/rss"}]})
    r = run(ApplePodcastsProvider(), h)
    assert r.status == OK and seen["media"] == "podcast" and seen["term"] == "fitness"
    assert r.leads[0].creator_name == "Fit Talk" and r.leads[0].feed_url == "https://feeds.fit.example/rss" and r.leads[0].verification_status == "verified"


def test_bluesky_reads_email_and_site_from_bio():
    r = run(BlueskyProvider(), lambda req: httpx.Response(200, json={"actors": [{"did": "did:plc:x", "handle": "sam.bsky.social", "displayName": "Sam",
                                                                                  "description": "Trainer. Collabs: sam@fit.example · https://samfit.example"}]}))
    lead = r.leads[0]
    assert lead.source_url == "https://bsky.app/profile/sam.bsky.social" and lead.website == "https://samfit.example"
    assert lead.emails == [{"email": "sam@fit.example", "source": "Bluesky profile", "source_url": "https://bsky.app/profile/sam.bsky.social"}]


def test_dailymotion_creators_with_website_and_followers():
    r = run(DailymotionProvider(), lambda req: httpx.Response(200, json={"list": [{"id": "x1", "screenname": "Chef Ana", "url": "https://www.dailymotion.com/ana",
                                                                                   "description": "", "followers_total": 1200, "website_url": "https://ana.example"}]}))
    assert r.leads[0].audience_size == 1200 and r.leads[0].website == "https://ana.example"


def test_mastodon_accounts_and_failure_is_reported(monkeypatch):
    monkeypatch.setattr(get_settings(), "mastodon_instance", "mastodon.example")
    seen = {}
    def h(req):
        seen["host"] = req.url.host
        return httpx.Response(200, json={"accounts": [{"acct": "ana", "display_name": "Ana", "url": "https://mastodon.example/@ana", "followers_count": 40,
                                                       "note": "<p>Contact: ana@ana.example</p>", "fields": [{"name": "Site", "value": '<a href="https://ana.example">ana.example</a>'}]}]})
    r = run(MastodonProvider(), h)
    assert seen["host"] == "mastodon.example" and r.leads[0].emails[0]["email"] == "ana@ana.example" and r.leads[0].website == "https://ana.example"
    bad = run(MastodonProvider(), lambda req: httpx.Response(401))
    assert bad.status == "failed" and "401" in bad.message


def test_vimeo_needs_a_token_and_sends_it(monkeypatch):
    assert asyncio.run(VimeoProvider().search("x", 5)).status == "not_configured"
    monkeypatch.setattr(get_settings(), "vimeo_access_token", "tok")
    seen = {}
    def h(req):
        seen["auth"] = req.headers["authorization"]
        return httpx.Response(200, json={"data": [{"uri": "/users/1", "name": "Film Co", "link": "https://vimeo.com/filmco", "bio": "hello@filmco.example",
                                                   "websites": [{"link": "https://filmco.example"}], "metadata": {"connections": {"followers": {"total": 9}}}}]})
    r = run(VimeoProvider(), h)
    assert seen["auth"] == "bearer tok" and r.leads[0].audience_size == 9 and r.leads[0].emails[0]["email"] == "hello@filmco.example"


WEB = {
    "https://feeds.fit.example/rss": (200, "application/rss+xml",
                                      "<rss><channel><itunes:owner><itunes:name>Sam</itunes:name><itunes:email>Sam@Fit.example</itunes:email></itunes:owner></channel></rss>"),
    "https://ana.example/": (200, "text/html", '<html><a href="/contact">Contact</a></html>'),
    "https://ana.example/contact": (200, "text/html", '<html><a href="mailto:bookings@ana.example">Email us</a></html>'),
    "https://blocked.example/": (200, "text/html", "<html>press@blocked.example</html>"),
    "https://blocked.example/robots.txt": (200, "text/plain", "User-agent: *\nDisallow: /"),
    "https://cafe.example/": (200, "text/html", "<html><p>Say hi: hello@cafe.example</p></html>"),
}


@pytest.fixture
def fake_web(monkeypatch):
    def h(req):
        key = str(req.url)
        if key not in WEB:
            return httpx.Response(404, text="")
        code, ctype, body = WEB[key]
        return httpx.Response(code, text=body, headers={"content-type": ctype})
    monkeypatch.setattr(lead_contacts, "TRANSPORT", httpx.MockTransport(h))
    monkeypatch.setattr(lead_contacts, "URL_GUARD", lambda u: True)
    monkeypatch.setattr(se, "FIND_EMAILS", True)


class Fake:
    def __init__(self, name, leads):
        self.name, self.label, self.required_settings, self._leads = name, name, (), leads

    def configured(self):
        return True

    async def search(self, q, limit):
        return ProviderResult(self.name, OK, "", self._leads)


def test_search_finds_published_emails_from_feeds_sites_and_bios_and_respects_robots(fake_web, monkeypatch):
    monkeypatch.setattr(se, "PROVIDERS", [
        Fake("applepodcasts", [Lead(provider="applepodcasts", creator_name="Fit Talk", source_url="https://podcasts.apple.com/p/1", feed_url="https://feeds.fit.example/rss")]),
        Fake("dailymotion", [Lead(provider="dailymotion", creator_name="Chef Ana", source_url="https://dm.example/ana", website="https://ana.example/")]),
        Fake("bluesky", [Lead(provider="bluesky", creator_name="Bo", source_url="https://bsky.app/profile/bo", snippet="biz: bo@bo.example")]),
        Fake("brave", [Lead(provider="brave", creator_name="Cafe", source_url="https://cafe.example/"),
                       Lead(provider="brave", creator_name="Blocked", source_url="https://blocked.example/")]),
    ])
    out = asyncio.run(se.search_everywhere("fitness", 10))
    by = {l["creator_name"]: l for l in out["leads"]}
    assert by["Fit Talk"]["emails"] == [{"email": "sam@fit.example", "source": "Podcast feed", "source_url": "https://feeds.fit.example/rss"}]
    assert by["Chef Ana"]["emails"][0]["email"] == "bookings@ana.example" and by["Chef Ana"]["emails"][0]["source"] == "Contact page"
    assert by["Bo"]["emails"][0]["email"] == "bo@bo.example"
    assert by["Cafe"]["emails"][0]["email"] == "hello@cafe.example"
    assert by["Blocked"]["emails"] == [] and by["Blocked"]["contact_status"] == "none_published"  # robots.txt said no
    assert out["with_email"] == 4


def test_keyless_sources_are_on_by_default():
    names = {p.name for p in se.PROVIDERS if p.configured()}
    assert {"applepodcasts", "bluesky", "dailymotion", "mastodon", "musicbrainz"} <= names
    assert len(se.PROVIDERS) == 13

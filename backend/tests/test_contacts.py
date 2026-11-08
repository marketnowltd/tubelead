import asyncio

import httpx

from app.services import contacts as ct
from tests.fakes import website_handler


def test_extract_emails_filters_junk():
    t = "Mail me: Biz@Alpha.com, noreply@x.com, logo@2x.png, a@example.com. also 'you@real.io'."
    assert ct.extract_emails(t) == ["biz@alpha.com", "you@real.io"]


def test_classify_links():
    social, sites = ct.classify_links("https://instagram.com/a https://youtube.com/x https://site.test/p. https://x.com/b")
    assert {p for p, _ in social} == {"instagram", "x"}
    assert sites == ["https://site.test/p"]


def test_ssrf_guard_blocks_private_and_bad_schemes():
    for u in ("http://127.0.0.1/", "http://localhost:8000", "http://169.254.169.254/latest", "http://10.0.0.5", "file:///etc/passwd", "ftp://x.com"):
        assert not ct.is_public_url(u), u


def test_scan_website_finds_contact_page_and_respects_robots():
    async def go():
        f = ct.PageFetcher(transport=httpx.MockTransport(website_handler), url_guard=lambda u: True)
        try:
            status, page, cands = await ct.scan_website(f, "https://alpha.test")
            blocked = await f.get("https://alpha.test/private/x")
            bad = await f.get("https://alpha.test/nope")
        finally:
            await f.aclose()
        return status, page, cands, blocked, bad
    status, page, cands, blocked, bad = asyncio.run(go())
    assert status == "ok" and page == "https://alpha.test/business"
    emails = {c.value: c for c in cands if c.kind == "email"}
    assert set(emails) == {"press@alpha.test", "partners@alpha.test"}
    assert emails["partners@alpha.test"].source == "contact_page"
    assert blocked[0] == "blocked_by_robots" and bad[0] == "http_404"


def test_unreachable_guard_reports_not_public():
    async def go():
        f = ct.PageFetcher(transport=httpx.MockTransport(website_handler))
        try:
            return await ct.scan_website(f, "http://127.0.0.1/")
        finally:
            await f.aclose()
    assert asyncio.run(go())[0] == "not_public"

"""Finds published emails for Search Everywhere results. Only addresses the creator published themselves:
1. in the profile or bio the platform returned (already on the lead),
2. in a podcast's RSS feed (<itunes:owner><itunes:email>, <managingEditor>),
3. on the creator's own website and its contact page (web-search results: the page found).
Pages are fetched politely (robots.txt, public addresses only, size and time limits). Nothing is guessed."""
from __future__ import annotations

import asyncio
import re

from .contacts import PageFetcher, extract_emails, is_public_url, scan_website

WEB_PROVIDERS = ("google", "brave")  # their results are web pages: the page itself is the site to read
CONCURRENCY = 6
TIME_BUDGET = 25.0  # seconds for the whole step; results not finished in time are returned without emails
TRANSPORT = None    # tests inject a mock transport
URL_GUARD = None    # tests replace the public-address check (made-up test hosts don't resolve)
FEED_EMAIL = re.compile(r"<itunes:email>\s*([^<\s]+)\s*</itunes:email>|<managingEditor>\s*([^<]+?)\s*</managingEditor>", re.I)


def _add(row: dict, email: str, source: str, url: str | None) -> None:
    e = email.strip().lower()
    if e and all(x["email"] != e for x in row["emails"]):
        row["emails"].append({"email": e, "source": source, "source_url": url})


async def _one(fetcher: PageFetcher, row: dict, sem: asyncio.Semaphore) -> None:
    async with sem:
        for e in extract_emails(row.get("snippet") or ""):
            _add(row, e, "Profile text", row.get("source_url"))
        if row.get("feed_url"):
            status, body, final = await fetcher.get(row["feed_url"])
            if status == "ok" and body:
                for m in FEED_EMAIL.finditer(body):
                    for e in extract_emails(m.group(1) or m.group(2) or ""):
                        _add(row, e, "Podcast feed", final)
        site = row.get("website") or (row.get("source_url") if row.get("provider") in WEB_PROVIDERS else None)
        if site and not row["emails"]:
            status, contact_url, cands = await scan_website(fetcher, site)
            row["website_status"] = status
            for c in cands:
                if c.kind == "email":
                    _add(row, c.value, "Contact page" if c.source == "contact_page" else "Website", c.source_url)


async def find_emails(rows: list[dict]) -> int:
    """Adds `emails` (and `contact_status`) to each merged row. Returns how many rows have at least one email."""
    for r in rows:
        r.setdefault("emails", [])
    fetcher = PageFetcher(transport=TRANSPORT, url_guard=URL_GUARD or is_public_url, timeout=6.0, max_bytes=600_000)
    sem = asyncio.Semaphore(CONCURRENCY)
    try:
        tasks = [asyncio.create_task(_one(fetcher, r, sem)) for r in rows]
        done, pending = await asyncio.wait(tasks, timeout=TIME_BUDGET) if tasks else (set(), set())
        for t in pending:
            t.cancel()
    finally:
        await fetcher.aclose()
    for r in rows:
        r["contact_status"] = "email_found" if r["emails"] else "none_published"
    return sum(1 for r in rows if r["emails"])

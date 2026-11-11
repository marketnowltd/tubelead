"""Public business-contact discovery.

Only publicly published information is collected: channel descriptions, the creator's own
website and its contact page. Nothing is guessed or generated. Fetching is SSRF-guarded,
robots.txt-aware, size-capped and rate-limited by timeouts."""
from __future__ import annotations

import ipaddress
import re
import socket
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx

USER_AGENT = "TubeLeadBot/1.0 (+public business-contact discovery; respects robots.txt)"
EMAIL_RE = re.compile(r"(?<![\w.+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}(?![\w-])")
URL_RE = re.compile(r"https?://[^\s<>\"')\]]+", re.I)
BAD_EMAIL_PARTS = ("example.", "sentry.", "wixpress.", "domain.com", "email.com", "yourname", "your@")
BAD_EMAIL_SUFFIX = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".css", ".js")
BAD_LOCALPARTS = ("noreply", "no-reply", "donotreply", "do-not-reply")

SOCIAL = {
    "instagram.com": "instagram", "twitter.com": "x", "x.com": "x", "tiktok.com": "tiktok",
    "facebook.com": "facebook", "linkedin.com": "linkedin", "twitch.tv": "twitch",
    "discord.gg": "discord", "discord.com": "discord", "patreon.com": "patreon",
    "threads.net": "threads",
}
IGNORED_HOSTS = ("youtube.com", "youtu.be", "google.com", "goo.gl", "bit.ly", "amzn.to", "t.co")
HUB_HOSTS = ("linktr.ee", "beacons.ai", "bio.link", "lnk.bio", "carrd.co")
CONTACT_HINTS = ("contact", "business", "partner", "sponsor", "press", "inquir", "collab", "advertis")


@dataclass
class ContactCandidate:
    kind: str  # email|website|contact_page|social
    value: str
    source: str
    source_url: str | None = None
    platform: str | None = None
    confidence: float = 0.5
    website_status: str | None = None


def extract_emails(text: str) -> list[str]:
    found: dict[str, None] = {}
    for m in EMAIL_RE.findall(text or ""):
        e = m.strip(".,;:").lower()
        local = e.split("@")[0]
        if any(p in e for p in BAD_EMAIL_PARTS) or e.endswith(BAD_EMAIL_SUFFIX) or local in BAD_LOCALPARTS:
            continue
        found[e] = None
    return list(found)


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower().removeprefix("www.")


def classify_links(text: str) -> tuple[list[tuple[str, str]], list[str]]:
    """Returns (social [(platform,url)], websites [url])."""
    social: dict[str, str] = {}
    sites: dict[str, None] = {}
    for raw in URL_RE.findall(text or ""):
        url = raw.rstrip(".,;:!")
        h = _host(url)
        if not h or any(h == i or h.endswith("." + i) for i in IGNORED_HOSTS):
            continue
        plat = next((p for d, p in SOCIAL.items() if h == d or h.endswith("." + d)), None)
        if plat:
            social.setdefault(url, plat)
        else:
            sites.setdefault(url, None)
    return [(p, u) for u, p in social.items()], list(sites)


def is_public_url(url: str) -> bool:
    """SSRF guard: http(s) only and every resolved address must be globally routable."""
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        return False
    try:
        infos = socket.getaddrinfo(p.hostname, p.port or (443 if p.scheme == "https" else 80), proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        return False
    return bool(infos) and all(ipaddress.ip_address(i[4][0]).is_global for i in infos)


class PageFetcher:
    """Polite public-page fetcher. `transport` and `url_guard` are injectable for tests."""

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None, url_guard=is_public_url,
                 timeout: float = 8.0, max_bytes: int = 1_000_000):
        self._http = httpx.AsyncClient(timeout=timeout, transport=transport, follow_redirects=False,
                                       headers={"User-Agent": USER_AGENT, "Accept": "text/html,*/*;q=0.5"})
        self._guard, self._max = url_guard, max_bytes
        self._robots: dict[str, RobotFileParser | None] = {}

    async def aclose(self) -> None:
        await self._http.aclose()

    async def _allowed(self, url: str) -> bool:
        p = urlparse(url)
        origin = f"{p.scheme}://{p.netloc}"
        if origin not in self._robots:
            rp = RobotFileParser()
            try:
                if not self._guard(origin):
                    self._robots[origin] = None
                else:
                    r = await self._http.get(origin + "/robots.txt")
                    rp.parse(r.text.splitlines() if r.status_code == 200 else [])
                    self._robots[origin] = rp
            except Exception:  # noqa: BLE001 - unreachable robots => allow, page fetch will report
                self._robots[origin] = rp
        rp = self._robots[origin]
        return True if rp is None else rp.can_fetch(USER_AGENT, url)

    async def get(self, url: str) -> tuple[str, str | None, str]:
        """Returns (status, html, final_url). status: ok|blocked_by_robots|unreachable|not_public|http_<code>"""
        for _ in range(4):
            if not self._guard(url):
                return "not_public", None, url
            if not await self._allowed(url):
                return "blocked_by_robots", None, url
            try:
                r = await self._http.get(url)
            except httpx.HTTPError:
                return "unreachable", None, url
            if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
                url = urljoin(url, r.headers["location"])
                continue
            if r.status_code != 200:
                return f"http_{r.status_code}", None, url
            ctype = r.headers.get("content-type", "html")
            if not any(t in ctype for t in ("html", "text", "xml")):  # xml: podcast RSS feeds
                return "ok", "", url
            return "ok", r.text[: self._max], url
        return "unreachable", None, url


def _find_contact_link(html: str, base: str) -> str | None:
    base_host = _host(base)
    for href in re.findall(r"""href=["']([^"'#]+)["']""", html, flags=re.I):
        if href.lower().startswith(("mailto:", "tel:", "javascript:")):
            continue
        if any(h in href.lower() for h in CONTACT_HINTS):
            full = urljoin(base, href)
            if _host(full) == base_host:
                return full
    return None


async def scan_website(fetcher: PageFetcher, url: str) -> tuple[str, str | None, list[ContactCandidate]]:
    """Returns (website_status, contact_page_url, candidates)."""
    status, html, final = await fetcher.get(url)
    if status != "ok" or html is None:
        return status, None, []
    out: list[ContactCandidate] = []
    site_dom = _host(final)

    def add_emails(text: str, source: str, src_url: str, conf: float) -> None:
        for e in extract_emails(text):
            c = conf + (0.05 if e.split("@")[1].removeprefix("www.").endswith(site_dom) else 0)
            out.append(ContactCandidate("email", e, source, src_url, confidence=min(c, 0.95)))

    mailtos = " ".join(re.findall(r"mailto:([^\"'?>\s]+)", html, flags=re.I))
    add_emails(mailtos + " " + re.sub(r"<[^>]+>", " ", html), "website", final, 0.75)
    contact_url = _find_contact_link(html, final)
    if contact_url and contact_url != final:
        cs, chtml, cfinal = await fetcher.get(contact_url)
        if cs == "ok" and chtml:
            mailtos = " ".join(re.findall(r"mailto:([^\"'?>\s]+)", chtml, flags=re.I))
            add_emails(mailtos + " " + re.sub(r"<[^>]+>", " ", chtml), "contact_page", cfinal, 0.85)
            out.append(ContactCandidate("contact_page", cfinal, "website", final, confidence=0.9, website_status="ok"))
        else:
            contact_url = None
    return "ok", contact_url, out


def from_description(description: str) -> list[ContactCandidate]:
    out = [ContactCandidate("email", e, "channel_description", None, confidence=0.9) for e in extract_emails(description)]
    social, sites = classify_links(description)
    out += [ContactCandidate("social", u, "channel_description", None, platform=p, confidence=0.8) for p, u in social]
    out += [ContactCandidate("website", u, "channel_description", None, confidence=0.7) for u in sites[:3]]
    return out


def dedupe(cands: list[ContactCandidate]) -> list[ContactCandidate]:
    best: dict[tuple[str, str], ContactCandidate] = {}
    for c in cands:
        k = (c.kind, c.value.lower() if c.kind == "email" else c.value)
        if k not in best or c.confidence > best[k].confidence:
            best[k] = c
    return list(best.values())


def pick_primary_site(cands: list[ContactCandidate]) -> str | None:
    sites = [c for c in cands if c.kind == "website"]
    non_hub = [c for c in sites if not any(_host(c.value).endswith(h) for h in HUB_HOSTS)]
    pool = non_hub or sites
    return pool[0].value if pool else None


def check_mx(email: str) -> bool | None:
    """DNS MX/A lookup for the email's domain. True/False, or None when DNS is unavailable.
    NOTE: a valid MX record does NOT prove the mailbox exists or is deliverable."""
    try:
        import dns.exception
        import dns.resolver
    except ImportError:  # pragma: no cover
        return None
    domain = email.rsplit("@", 1)[-1]
    try:
        dns.resolver.resolve(domain, "MX", lifetime=5)
        return True
    except dns.resolver.NXDOMAIN:
        return False
    except dns.resolver.NoAnswer:
        try:
            dns.resolver.resolve(domain, "A", lifetime=5)
            return True
        except Exception:  # noqa: BLE001
            return False
    except (dns.exception.DNSException, OSError):
        return None

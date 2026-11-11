"""Growth Assistant: understand the business, discover prospects (existing TubeLead discovery engine), score them and
enrich contacts. Nothing is invented: every prospect comes from a provider result, every email from a public page
or Snov.io, and every score point carries its evidence and whether it is a fact or an estimate."""
from __future__ import annotations

import asyncio
import logging
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import SessionLocal
from ..models import GrowthSession, Prospect, ProspectContact
from . import ai, credits
from .audit import log_error
from .email_check import FREE_MAIL

log = logging.getLogger("tubelead.growth")
_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="growth")
_lock = threading.Lock()

STAGES = ["Understanding your audience", "Finding relevant prospects", "Searching available sources", "Collecting business information",
          "Ranking opportunities", "Preparing results"]
LOCATIONS = ["london", "manchester", "birmingham", "leeds", "glasgow", "edinburgh", "liverpool", "bristol", "sheffield", "cardiff", "belfast", "newcastle",
             "nottingham", "leicester", "brighton", "oxford", "cambridge", "uk", "united kingdom", "england", "scotland", "wales", "ireland", "dublin",
             "new york", "los angeles", "usa", "united states", "canada", "toronto", "australia", "sydney", "melbourne", "paris", "berlin", "europe"]
SIGNALS = {"hiring": "is hiring", "now open": "recently opened", "opening": "is opening", "new location": "is expanding", "launch": "is launching something",
           "book now": "takes online bookings", "booking": "takes bookings", "sponsor": "mentions sponsorship", "partnership": "is open to partnerships",
           "collab": "is open to collaborations", "business enquiries": "invites business enquiries", "for business": "invites business enquiries",
           "rebrand": "is rebranding", "funding": "mentions funding"}
STOP = {"i", "we", "sell", "offer", "provide", "to", "for", "the", "a", "an", "and", "in", "of", "our", "my", "services", "service", "products", "product",
        "help", "with", "who", "that", "based", "small", "independent", "local", "businesses", "business", "companies", "company"}


# ---------------------------------------------------------------- 1. understand the business
def _cap(s: str) -> str:
    return s.strip().rstrip(".").strip()[:1].upper() + s.strip().rstrip(".").strip()[1:]


def rules_interpret(text: str) -> dict:
    t = " ".join(text.split()).strip().rstrip(".!")
    low = t.lower()
    product = audience = location = ""
    want = re.search(r"\b(?:want to |looking to |hoping to )?(?:work with|reach|target|find|partner with|sell to|connect with)\s+(.+)$", t, re.I)
    m = re.search(r"\b(?:sell|offer|provide|do|make|run|build|have)\s+(.+?)\s+(?:to|for)\s+(.+)$", t, re.I)
    if want:
        audience = want.group(1)
        pm = re.search(r"\b(?:sell|offer|provide|make|run|build|have)\s+(.+?)(?:\s+(?:and|to|for)\b|$)", t[: want.start()], re.I)
        product = pm.group(1) if pm else ""
    elif m:
        product, audience = m.group(1), m.group(2)
    else:
        product = t
    lm = re.search(r"\s(?:in|across|around|near|based in|throughout)\s+(.+)$", audience, re.I)
    if lm:
        audience, location = audience[: lm.start()], lm.group(1)
    location = re.sub(r"^(the)\s+", "", location.strip(" .,"), flags=re.I)
    if not location:
        for loc in LOCATIONS:
            if re.search(rf"\b{re.escape(loc)}\b", low):
                location = loc.title() if loc not in ("uk", "usa") else loc.upper()
                break
    audience_l = audience.lower()
    b2c = bool(re.search(r"\b(consumers|people|parents|students|homeowners|individuals|families|customers who)\b", audience_l))
    creators = bool(re.search(r"\b(creators?|youtubers?|influencers?|streamers?|podcasters?|artists?|musicians?)\b", audience_l + " " + low))
    industry_words = [w for w in re.findall(r"[a-z]+", audience_l) if w not in STOP]
    industry = " ".join(industry_words[:3])
    signals = []
    if re.search(r"website|web design|seo|marketing|social media", low):
        signals.append("Businesses with outdated websites, few online reviews or no online booking")
    if re.search(r"accounting|bookkeeping|payroll", low):
        signals.append("Growing businesses that are hiring or opening new locations")
    if creators:
        signals.append("Creators who invite business enquiries or have done sponsorships")
    if not signals:
        signals.append("Businesses that are hiring, launching or expanding")
    sources = (["YouTube", "Twitch", "Brave Search"] if creators else ["Brave Search", "Google Search", "Public business directories"])
    product = _cap(product) if product else ""
    audience = _cap(audience) if audience else ""
    loc_name = location if location.isupper() else location.title()
    name_bits = [loc_name, (industry.title().replace("Youtubers", "YouTubers") or audience or product), "Outreach"]
    return {
        "campaign_name": " ".join(b for b in name_bits if b).strip()[:80] or "New outreach campaign",
        "product": product[:160], "audience": audience[:160], "industry": industry.title()[:80], "location": _cap(location)[:80] if location else "",
        "customer_type": "Creators" if creators else ("B2C" if b2c else "B2B"),
        "objective": "Book introductory calls" if not creators else "Start creator partnerships",
        "opportunity": signals[0], "signals": signals, "sources": sources, "interpreted_by": "rules",
    }


async def interpret(db: Session, owner: str, text: str) -> dict:
    base = rules_interpret(text)
    try:
        res = await ai.run_task(db, owner, "growth_interpretation",
                                f"Business description: {text}\n\nReturn JSON with keys: campaign_name, product, audience, industry, location, customer_type (B2B, B2C or Creators), objective, opportunity (who is most likely to buy and why), signals (list of buying signals), sources (list from: YouTube, Twitch, Brave Search, Google Search, Public business directories, Reddit, Spotify).",
                                max_tokens=500, timeout=25)
        data = ai.extract_json(res.text)
        if isinstance(data, dict):
            for k in ("campaign_name", "product", "audience", "industry", "location", "customer_type", "objective", "opportunity"):
                v = data.get(k)
                if isinstance(v, str) and v.strip():
                    base[k] = v.strip()[:160]
            for k in ("signals", "sources"):
                if isinstance(data.get(k), list) and data[k]:
                    base[k] = [str(x)[:120] for x in data[k][:6]]
            base["interpreted_by"] = "ai"
    except ai.AIError:
        pass  # no provider connected, or it failed: the rules result stands and says so
    return base


def search_query(b: dict) -> str:
    parts = [b.get("audience") or b.get("industry") or "", b.get("location") or ""]
    return " ".join(p for p in parts if p).strip()[:200] or (b.get("product") or "")[:200]


# ---------------------------------------------------------------- 2. score
def _tokens(s: str) -> set[str]:
    return {w.rstrip("s") for w in re.findall(r"[a-z]{3,}", (s or "").lower()) if w not in STOP}


def score(p: Prospect, b: dict, contacts: list[ProspectContact] | None = None) -> None:
    text = " ".join([p.name or "", p.description or "", p.industry or ""])
    target = _tokens(" ".join([b.get("audience", ""), b.get("industry", "")]))
    hits = sorted(target & _tokens(text))
    br = {}
    rel = min(30, 10 * len(hits))
    br["relevance"] = {"points": rel, "max": 30, "basis": "fact" if hits else "unknown",
                       "evidence": [f"Mentions “{h}” in its public description" for h in hits[:3]] or ["No direct match with your audience in the public text"]}
    suit, ev = 0, []
    if p.domain:
        suit += 10
        ev.append(f"Has its own website ({p.domain})")
    loc = (b.get("location") or "").lower()
    if loc and loc in text.lower():
        suit += 10
        ev.append(f"Mentions {b['location']}")
    elif loc:
        ev.append(f"Location not confirmed as {b['location']}")
    if p.platform in ("youtube", "twitch", "spotify") and b.get("customer_type") == "Creators":
        suit += 5
        ev.append(f"Is a {p.platform.title()} creator, matching your audience")
    br["suitability"] = {"points": min(25, suit), "max": 25, "basis": "fact" if suit else "unknown", "evidence": ev or ["Not enough public information"]}
    act, ev, basis = 0, [], "unknown"
    if "verified" in (p.score_breakdown or {}).get("_flags", []) or p.platform in ("youtube", "twitch", "spotify"):
        act += 10
        ev.append(f"Account confirmed by the {p.platform.title()} API")
        basis = "fact"
    if p.audience_size:
        act += 10 if p.audience_size >= 1000 else 5
        ev.append(f"{p.audience_size:,} followers or subscribers (platform figure)")
        basis = "fact"
    br["activity"] = {"points": min(20, act), "max": 20, "basis": basis, "evidence": ev or ["Recent activity is unknown"]}
    con, ev, basis = 0, [], "estimate"
    statuses = {c.status for c in (contacts or [])}
    if "verified" in statuses:
        con, basis = 15, "fact"
        ev.append("Has a verified business email")
    elif "risky" in statuses:
        con, basis = 9, "fact"
        ev.append("Has an email that could not be fully verified")
    elif "unverified" in statuses:
        con, basis = 7, "fact"
        ev.append("Publishes an email address on its website")
    elif p.website:
        con = 3
        ev.append("Has a website, so a contact route is likely (not yet checked)")
    else:
        ev.append("No contact route found yet")
    br["contact"] = {"points": con, "max": 15, "basis": basis, "evidence": ev}
    sig = [(k, v) for k, v in SIGNALS.items() if k in text.lower()]
    br["signals"] = {"points": min(10, 5 * len(sig)), "max": 10, "basis": "fact" if sig else "unknown",
                     "evidence": [f"Its public text says it {v} (“{k}”)" for k, v in sig[:2]] or ["No buying signals in the public text"]}
    flags = (p.score_breakdown or {}).get("_flags", [])
    br["_flags"] = flags
    p.score = sum(v["points"] for k, v in br.items() if not k.startswith("_"))
    p.classification = "excellent" if p.score >= 70 else "good" if p.score >= 45 else "low"
    p.score_breakdown = br


# ---------------------------------------------------------------- 3. discover (background)
def _domain(url: str | None) -> str | None:
    if not url:
        return None
    host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    return host or None


PLATFORM_HOSTS = {"youtube.com": "youtube", "twitch.tv": "twitch", "open.spotify.com": "spotify", "reddit.com": "reddit", "last.fm": "lastfm",
                  "musicbrainz.org": "musicbrainz", "facebook.com": "facebook", "instagram.com": "instagram", "linkedin.com": "linkedin",
                  "tripadvisor.co.uk": "directory", "tripadvisor.com": "directory", "yelp.com": "directory", "yell.com": "directory"}


def _platform(domain: str | None, provider: str) -> str:
    if provider in ("youtube", "twitch", "spotify", "lastfm", "musicbrainz", "reddit"):
        return provider
    for host, plat in PLATFORM_HOSTS.items():
        if domain and (domain == host or domain.endswith("." + host)):
            return plat
    return "web"


def _set(db: Session, sess: GrowthSession, **kw) -> None:
    d = dict(sess.discovery or {})
    d.update(kw)
    sess.discovery = d
    db.commit()


async def _discover(session_id: str) -> None:
    from .search_everywhere import PROVIDERS, _safe, merge
    with SessionLocal() as db:
        sess = db.get(GrowthSession, session_id)
        b = sess.business or {}
        query = search_query(b)
        _set(db, sess, status="running", stage=1, stages=STAGES, query=query, started_at=datetime.now(timezone.utc).isoformat())
        _set(db, sess, stage=2)
        configured = [p for p in PROVIDERS if p.configured()]
        if not configured:
            _set(db, sess, status="failed", error="No discovery source is configured on the server yet.")
            return
        _set(db, sess, stage=3, sources=[{"name": p.label, "status": "searching"} for p in configured])
        results = await asyncio.gather(*[_safe(p, query, 20) for p in configured])
        _set(db, sess, sources=[{"name": p.label, "status": r.status, "message": r.message, "count": len(r.leads)} for p, r in zip(configured, results)])
        _set(db, sess, stage=4)
        leads, dupes = merge(list(results))
        existing = {p.dedupe_key for p in db.scalars(select(Prospect).where(Prospect.session_id == session_id)).all()}
        added = []
        for lead in leads:
            url = lead.get("youtube_url") or lead.get("source_url")
            dom = _domain(lead.get("source_url"))
            plat = _platform(dom, lead["provider"])
            key = (f"yt:{lead['youtube_channel_id']}" if lead.get("youtube_channel_id") else
                   (f"d:{dom}" if dom and plat == "web" else "n:" + re.sub(r"[^a-z0-9]", "", lead["creator_name"].lower())))[:200]
            if key in existing:
                dupes += 1
                continue
            existing.add(key)
            p = Prospect(owner_id=sess.owner_id, session_id=session_id, dedupe_key=key, name=lead["creator_name"][:300],
                         website=lead.get("source_url") if plat == "web" else None, domain=dom if plat == "web" else None, platform=plat,
                         sources=lead.get("sources") or [lead["provider"]], source_url=url, description=(lead.get("snippet") or "")[:2000],
                         industry=b.get("industry", "")[:120], location="", score_breakdown={"_flags": ["verified"] if lead.get("verification_status") == "verified" else []})
            score(p, b)
            db.add(p)
            added.append(p)
        _set(db, sess, stage=5)
        db.commit()
        _set(db, sess, stage=6)
        credits.record(db, sess.owner_id, "discovery", 1, provider="brave" if any(p.name == "brave" for p in configured) else "")
        _set(db, sess, status="done", totals={"found": len(added), "duplicates_removed": dupes,
                                             "excellent": sum(1 for p in added if p.classification == "excellent"),
                                             "good": sum(1 for p in added if p.classification == "good")},
             finished_at=datetime.now(timezone.utc).isoformat())


def run_discovery(session_id: str) -> None:
    try:
        asyncio.run(_discover(session_id))
    except Exception as exc:  # noqa: BLE001
        log.exception("discovery failed")
        log_error("job", f"Growth discovery failed: {type(exc).__name__}: {exc}", session_id)
        with SessionLocal() as db:
            sess = db.get(GrowthSession, session_id)
            if sess:
                _set(db, sess, status="failed", error="Discovery stopped unexpectedly. Please try again.")


def start_discovery(session_id: str, inline: bool = False) -> None:
    if inline:
        run_discovery(session_id)
    else:
        _pool.submit(run_discovery, session_id)


# ---------------------------------------------------------------- 4. enrich (background)
def _is_personal(email: str) -> bool:
    return email.rsplit("@", 1)[-1].lower() in FREE_MAIL


async def _enrich(session_id: str, website_fetcher=None) -> None:
    from .contacts import PageFetcher, scan_website
    from .snov import SnovClient, SnovError
    s = get_settings()
    with SessionLocal() as db:
        sess = db.get(GrowthSession, session_id)
        owner = sess.owner_id
        targets = db.scalars(select(Prospect).where(Prospect.session_id == session_id, Prospect.selected.is_(True), Prospect.removed.is_(False))).all()
        e = {"status": "running", "done": 0, "total": len(targets), "credits_used": {"enrichment": 0, "verification": 0},
             "snov": "configured" if s.snov_client_id and s.snov_client_secret else "not_configured", "started_at": datetime.now(timezone.utc).isoformat()}
        sess.enrichment = e
        db.commit()
        snov = SnovClient(s.snov_client_id, s.snov_client_secret, s.snov_api_base) if e["snov"] == "configured" else None
        fetcher = website_fetcher or PageFetcher()
        try:
            for p in targets:
                found: dict[str, dict] = {}
                if p.website:
                    try:
                        _, contact_url, cands = await scan_website(fetcher, p.website)
                    except Exception:  # noqa: BLE001
                        cands, contact_url = [], None
                    for c in cands:
                        if c.kind == "email":
                            found.setdefault(c.value.lower(), {"email": c.value.lower(), "source": c.source, "source_url": c.source_url, "status": "unverified"})
                    if contact_url:
                        p.score_breakdown = {**(p.score_breakdown or {}), "_contact_page": contact_url}
                if snov and p.domain and credits.used(db, owner, "enrichment") < credits.allowance(db, owner, "enrichment"):
                    try:
                        for row in await snov.domain_emails(p.domain, limit=5):
                            dom = row["email"].rsplit("@", 1)[-1]
                            if dom == p.domain or dom.endswith("." + p.domain):  # only addresses on the prospect's own domain
                                found.setdefault(row["email"], {**row, "source": "snov", "source_url": None, "status": "unverified"})
                        credits.record(db, owner, "enrichment", 1, provider="snov")
                        e["credits_used"]["enrichment"] += 1
                    except SnovError as exc:
                        e["snov_error"] = str(exc)
                to_verify = [em for em in found if not _is_personal(em)]
                if snov and to_verify and credits.used(db, owner, "verification") + len(to_verify) <= credits.allowance(db, owner, "verification"):
                    try:
                        res = await snov.verify(to_verify[:10])
                        for em, st in res.items():
                            if em in found:
                                found[em]["status"] = st
                        credits.record(db, owner, "verification", len(res), provider="snov")
                        e["credits_used"]["verification"] += len(res)
                    except SnovError as exc:
                        e["snov_error"] = str(exc)
                now = datetime.now(timezone.utc)
                for em, row in found.items():
                    if row["status"] == "invalid":
                        continue
                    c = db.scalar(select(ProspectContact).where(ProspectContact.prospect_id == p.id, ProspectContact.email == em))
                    if not c:
                        c = ProspectContact(prospect_id=p.id, owner_id=owner, email=em, source=row["source"])
                        db.add(c)
                    c.first_name, c.last_name, c.position = row.get("first_name", "")[:120], row.get("last_name", "")[:120], row.get("position", "")[:160]
                    c.status, c.source_url, c.checked_at, c.personal = row["status"], row.get("source_url"), now, _is_personal(em)
                db.flush()
                contacts = db.scalars(select(ProspectContact).where(ProspectContact.prospect_id == p.id)).all()
                p.enrichment_status = "done"
                score(p, sess.business or {}, contacts)
                e["done"] += 1
                sess.enrichment = dict(e)
                db.commit()
        finally:
            if website_fetcher is None:
                await fetcher.aclose()
        e.update(status="done", finished_at=datetime.now(timezone.utc).isoformat())
        sess.enrichment = dict(e)
        db.commit()


def run_enrichment(session_id: str, fetcher=None) -> None:
    try:
        asyncio.run(_enrich(session_id, fetcher))
    except Exception as exc:  # noqa: BLE001
        log.exception("enrichment failed")
        log_error("job", f"Growth enrichment failed: {type(exc).__name__}: {exc}", session_id)
        with SessionLocal() as db:
            sess = db.get(GrowthSession, session_id)
            if sess:
                sess.enrichment = {**(sess.enrichment or {}), "status": "failed", "error": "Enrichment stopped unexpectedly. Please try again."}
                db.commit()


def start_enrichment(session_id: str, inline: bool = False, fetcher=None) -> None:
    if inline:
        run_enrichment(session_id, fetcher)
    else:
        _pool.submit(run_enrichment, session_id)

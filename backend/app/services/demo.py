"""Clearly-labelled DEMONSTRATION data. Every row is flagged is_demo=True and the UI marks it.
Contact emails use the reserved example.com domain, so none can belong to a real person."""
from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..models import (ActivityEvent, Campaign, ContactRoute, Creator, DiscoveryJob, QuotaUsage, SavedSearch)

NICHES = ["Gaming", "Tech", "Beauty", "Fitness", "Food", "Travel", "Finance", "Education", "Music", "Comedy", "Automotive", "Lifestyle"]
COUNTRIES = ["US", "GB", "IN", "BR", "DE", "FR", "JP", "KR", "MX", "CA", "AU", "ES", "ID", "TR", "NL", "SE", "PL", "NG", "ZA", "AE", "IT", "AR", "PH", "EG"]
COUNTRY_W = [18, 9, 12, 8, 6, 5, 6, 4, 5, 5, 4, 3, 3, 3, 2, 1, 2, 2, 2, 1, 3, 2, 2, 1]
A = ["Nova", "Pixel", "Ember", "Lumen", "Vector", "Orbit", "Quartz", "Echo", "Zenith", "Atlas", "Nimbus", "Cipher", "Aurora", "Falcon", "Mosaic", "Helix", "Onyx", "Vertex", "Pulse", "Drift"]
B = ["Labs", "Studio", "Daily", "Lab", "Vault", "Collective", "TV", "Hub", "Works", "Club", "Files", "Cast"]
SOCIALS = [("instagram", "https://instagram.com/demo_{}"), ("tiktok", "https://tiktok.com/@demo_{}"), ("x", "https://x.com/demo_{}")]


def seed(db: Session, owner: str, n: int = 140) -> dict:
    if db.scalar(select(Creator.id).where(Creator.owner_id == owner, Creator.is_demo.is_(True)).limit(1)):
        return {"seeded": False, "reason": "Demo data already present"}
    rng = random.Random(42)
    now = datetime.now(timezone.utc)
    camps = [Campaign(owner_id=owner, name=name, description=desc, status=st, target_niche=nn, is_demo=True)
             for name, desc, st, nn in [("Gaming Sponsorship Wave", "DEMO · Peripheral & energy-drink sponsorship outreach", "active", "Gaming"),
                                         ("Tech Review Partnerships", "DEMO · Hardware review seeding programme", "active", "Tech"),
                                         ("Beauty Affiliate Pilot", "DEMO · Affiliate onboarding for mid-tier beauty creators", "paused", "Beauty")]]
    db.add_all(camps)
    db.flush()
    jobs = []
    for i in range(8):
        found = rng.randint(120, 380)
        dup = rng.randint(10, 60)
        j = DiscoveryJob(owner_id=owner, mode=rng.choice(["standard", "deep", "multi_niche", "worldwide"]), is_demo=True, status="completed",
                         params={"keywords": ["demo"], "limit": 25, "mode": "standard"}, current_operation="Completed (demo)",
                         channels_found=found, unique_found=found - dup, duplicates_removed=dup,
                         qualified=rng.randint(18, 60), enrich_total=found - dup, enriched=found - dup,
                         quota_used=rng.randint(400, 1400), queries_total=6, queries_done=6,
                         created_at=now - timedelta(days=7 - i, hours=rng.randint(0, 8)),
                         finished_at=now - timedelta(days=7 - i))
        jobs.append(j)
    db.add_all(jobs)
    db.flush()
    for k in range(n):
        niche = rng.choice(NICHES)
        country = rng.choices(COUNTRIES, COUNTRY_W)[0]
        name = f"{rng.choice(A)} {rng.choice(B)}"
        slug = f"{name.lower().replace(' ', '')}{k}"
        subs = int(10 ** rng.uniform(3.3, 6.6))
        days = int(rng.expovariate(1 / 40))
        last = now - timedelta(days=days)
        activity = "active" if days <= 30 else "moderate" if days <= 120 else "dormant"
        eng = round(rng.uniform(0.6, 7.5), 2)
        has_email = rng.random() < 0.38
        has_site = rng.random() < 0.55
        score = min(100, int(25 + (20 if activity == "active" else 8) + min(eng * 3, 20) + (20 if has_email else 0) + (8 if has_site else 0) + rng.randint(0, 8)))
        camp = rng.choice(camps + [None, None, None]) if (camps and rng.random() < 0.5) else None
        cr = Creator(owner_id=owner, youtube_channel_id=f"DEMO{k:020d}", title=f"{name} (demo)", handle=f"@demo_{slug}",
                     thumbnail_url=None, channel_url=f"https://www.youtube.com/channel/DEMO{k:020d}",
                     description="DEMONSTRATION RECORD — not a real channel.", subscriber_count=subs,
                     video_count=rng.randint(20, 1800), view_count=subs * rng.randint(40, 400), country=country, niche=niche,
                     creator_type="creator", avg_views=int(subs * rng.uniform(0.02, 0.4)), engagement_rate=eng,
                     last_upload_at=last, activity=activity, website=f"https://{slug}.example.com" if has_site else None,
                     contact_page=f"https://{slug}.example.com/business" if has_site and rng.random() < 0.5 else None,
                     website_status="ok" if has_site else "none", qualification_score=score,
                     score_breakdown={"audience": 20, "activity": 25 if activity == "active" else 8, "engagement": int(min(eng * 3, 20)), "contact": 20 if has_email else 4, "relevance": 8},
                     outreach_status=rng.choices(["new", "contacted", "replied", "converted"], [60, 25, 10, 5])[0] if camp else "new",
                     campaign_id=camp.id if camp else None, job_id=rng.choice(jobs).id, is_demo=True,
                     discovered_at=now - timedelta(days=rng.randint(0, 29), hours=rng.randint(0, 23)))
        if has_email:
            cr.contacts.append(ContactRoute(owner_id=owner, kind="email", value=f"business@{slug}.example.com", source=rng.choice(["channel_description", "contact_page"]),
                                            status="published", confidence=round(rng.uniform(0.7, 0.95), 2),
                                            mx_valid=True, is_demo=True))
        if has_site:
            cr.contacts.append(ContactRoute(owner_id=owner, kind="website", value=cr.website, source="channel_description", status="unverified", confidence=0.7, website_status="ok", is_demo=True))
        if rng.random() < 0.6:
            p, tpl = rng.choice(SOCIALS)
            cr.contacts.append(ContactRoute(owner_id=owner, kind="social", value=tpl.format(slug), platform=p, source="channel_description", status="unverified", confidence=0.8, is_demo=True))
        cr.verification_status = ("verified" if any(c.status == "verified" for c in cr.contacts) else "published" if any(c.kind == "email" for c in cr.contacts) else "unverified" if cr.contacts else "none")
        db.add(cr)
    # Past days only: demo rows must never touch today's real quota ledger (and cannot collide with it).
    for d in range(1, 8):
        db.add(QuotaUsage(owner_id=owner, day=(now - timedelta(days=d)).date(), units=rng.randint(300, 2600), is_demo=True))
    for msg, kind, mins in [("DEMO · Discovery completed: 42 qualified from 311 unique channels", "job_completed", 6),
                            ("DEMO · 17 new business contact routes published", "contacts", 22),
                            ("DEMO · Campaign “Gaming Sponsorship Wave” received 12 creators", "campaign", 55),
                            ("DEMO · Scheduled search “Tech 10k–100k EU” ran", "schedule", 140)]:
        db.add(ActivityEvent(owner_id=owner, kind=kind, message=msg, is_demo=True, created_at=now - timedelta(minutes=mins)))
    db.add(SavedSearch(owner_id=owner, name="DEMO · Tech 10k–100k Europe", schedule="weekly", next_run_at=None,
                       params={"keywords": ["tech review"], "countries": ["DE", "FR", "GB"], "min_subscribers": 10000, "max_subscribers": 100000, "limit": 50, "mode": "standard"}))
    db.commit()
    return {"seeded": True, "creators": n}


def clear(db: Session, owner: str) -> dict:
    cnt = db.execute(delete(Creator).where(Creator.owner_id == owner, Creator.is_demo.is_(True))).rowcount
    for model in (ContactRoute, DiscoveryJob, QuotaUsage, ActivityEvent, Campaign):
        db.execute(delete(model).where(model.owner_id == owner, model.is_demo.is_(True)))
    db.execute(delete(SavedSearch).where(SavedSearch.owner_id == owner, SavedSearch.name.like("DEMO ·%")))
    db.commit()
    return {"removed": cnt}

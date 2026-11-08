from .models import ApiKey, Campaign, ContactRoute, Creator, DiscoveryJob, SavedSearch, SavedView


def iso(d):
    return d.isoformat() if d else None


def route_out(r: ContactRoute, creator: Creator | None = None) -> dict:
    d = {"id": r.id, "creator_id": r.creator_id, "kind": r.kind, "value": r.value, "platform": r.platform,
         "source": r.source, "source_url": r.source_url, "status": r.status, "confidence": r.confidence,
         "website_status": r.website_status, "mx_valid": r.mx_valid, "checked_at": iso(r.checked_at),
         "discovered_at": iso(r.discovered_at), "is_demo": r.is_demo}
    if creator:
        d["creator"] = {"id": creator.id, "title": creator.title, "thumbnail_url": creator.thumbnail_url, "niche": creator.niche, "country": creator.country}
    return d


def contact_state(c: Creator) -> tuple[str, dict]:
    """Separate, honest contact statuses. 'publicly_published' = an address the creator published on a public page;
    'deliverability_checked' = that address also passed a DNS/MX check (still not a guarantee the mailbox exists)."""
    emails = [r for r in c.contacts if r.kind == "email"]
    flags = {
        "publicly_published": any(r.status == "published" and r.source != "manual" for r in emails),
        "unverified": any(r.status == "unverified" or r.source == "manual" for r in emails),
        "deliverability_checked": any(r.mx_valid is True or r.status == "verified" for r in emails),
        "website": bool(c.website),
        "contact_form": bool(c.contact_page),
    }
    for k in ("deliverability_checked", "publicly_published", "unverified", "website", "contact_form"):
        if flags[k]:
            return k, flags
    return "none", flags


def creator_out(c: Creator, detail: bool = False) -> dict:
    emails = [r for r in c.contacts if r.kind == "email"]
    d = {
        "id": c.id, "youtube_channel_id": c.youtube_channel_id, "title": c.title, "handle": c.handle,
        "thumbnail_url": c.thumbnail_url, "channel_url": c.channel_url, "subscriber_count": c.subscriber_count,
        "video_count": c.video_count, "view_count": c.view_count, "country": c.country, "niche": c.niche,
        "creator_type": c.creator_type, "avg_views": c.avg_views, "engagement_rate": c.engagement_rate,
        "last_upload_at": iso(c.last_upload_at), "activity": c.activity, "website": c.website,
        "contact_page": c.contact_page, "website_status": c.website_status,
        "qualification_score": c.qualification_score, "verification_status": c.verification_status,
        "outreach_status": c.outreach_status, "campaign_id": c.campaign_id,
        "campaign_name": c.campaign.name if c.campaign else None,
        "discovered_at": iso(c.discovered_at), "is_demo": c.is_demo,
        "public_email": emails[0].value if emails else None,
        "email_status": emails[0].status if emails else None,
        "contact_count": len(c.contacts),
    }
    d["contact_status"], d["contact_flags"] = contact_state(c)
    if detail:
        d["description"] = c.description
        d["score_breakdown"] = c.score_breakdown
        d["contacts"] = [route_out(r) for r in sorted(c.contacts, key=lambda r: -r.confidence)]
    return d


def job_out(j: DiscoveryJob) -> dict:
    eta = None
    if j.status == "running" and j.started_at and j.queries_total and j.queries_done:
        from datetime import datetime, timezone
        elapsed = (datetime.now(timezone.utc) - (j.started_at if j.started_at.tzinfo else j.started_at.replace(tzinfo=timezone.utc))).total_seconds()
        remaining = max(j.queries_total - j.queries_done, 0)
        frac = min(1.0, j.qualified / max(j.params.get("limit", 1), 1))
        by_q = elapsed / j.queries_done * remaining
        by_lim = elapsed / frac * (1 - frac) if frac > 0 else by_q
        eta = int(min(by_q, by_lim))
    return {
        "id": j.id, "mode": j.mode, "params": j.params, "status": j.status, "current_operation": j.current_operation,
        "queries_total": j.queries_total, "queries_done": j.queries_done, "channels_found": j.channels_found,
        "unique_found": j.unique_found, "duplicates_removed": j.duplicates_removed, "qualified": j.qualified,
        "rejected": j.rejected, "failed_requests": j.failed_requests, "contact_routes_found": j.contact_routes_found, "keywords_done": j.keywords_done, "enrich_total": j.enrich_total, "enriched": j.enriched, "quota_used": j.quota_used,
        "error": j.error, "log": j.log or [], "eta_seconds": eta, "is_demo": j.is_demo,
        "created_at": iso(j.created_at), "started_at": iso(j.started_at), "finished_at": iso(j.finished_at),
    }


def campaign_out(c: Campaign, stats: dict | None = None) -> dict:
    return {"id": c.id, "name": c.name, "description": c.description, "status": c.status, "target_niche": c.target_niche,
            "target_countries": c.target_countries or [], "is_demo": c.is_demo, "created_at": iso(c.created_at), **(stats or {})}


def saved_out(s: SavedSearch) -> dict:
    return {"id": s.id, "name": s.name, "params": s.params, "schedule": s.schedule, "next_run_at": iso(s.next_run_at),
            "last_run_at": iso(s.last_run_at), "last_job_id": s.last_job_id, "run_count": s.run_count, "created_at": iso(s.created_at)}


def view_out(v: SavedView) -> dict:
    return {"id": v.id, "name": v.name, "filters": v.filters, "created_at": iso(v.created_at)}


def key_out(k: ApiKey) -> dict:
    return {"id": k.id, "name": k.name, "prefix": k.prefix, "created_at": iso(k.created_at),
            "last_used_at": iso(k.last_used_at), "revoked_at": iso(k.revoked_at)}

"""Qualification scoring and channel classification. All inputs are real channel data."""
from __future__ import annotations

from datetime import datetime, timezone

BRAND_HINTS = ("official", " inc", " ltd", " llc", "studios", "network", " tv", "media", "records", "vevo", "- topic", "news")

TOPIC_MAP = {
    "gaming": "Gaming", "video_game": "Gaming", "music": "Music", "sport": "Sports", "football": "Sports",
    "technology": "Tech", "knowledge": "Education", "lifestyle": "Lifestyle", "food": "Food",
    "entertainment": "Entertainment", "film": "Entertainment", "humour": "Comedy", "health": "Health & Fitness",
    "fitness": "Health & Fitness", "beauty": "Beauty", "fashion": "Beauty", "business": "Business",
    "finance": "Business", "travel": "Travel", "automotive": "Automotive", "vehicle": "Automotive",
    "pets": "Pets & Animals", "animal": "Pets & Animals", "society": "Society",
}


def niche_from_topics(topic_urls: list[str] | None) -> str | None:
    for url in topic_urls or []:
        slug = url.rsplit("/", 1)[-1].lower()
        for key, niche in TOPIC_MAP.items():
            if key in slug:
                return niche
    return None


def classify_creator_type(title: str, description: str = "") -> str:
    """HEURISTIC: 'brand' if the name looks corporate/institutional, else 'creator'."""
    t = f" {title.lower()} "
    return "brand" if any(h in t for h in BRAND_HINTS) else "creator"


def activity_from(last_upload: datetime | None, now: datetime | None = None) -> str:
    if not last_upload:
        return "unknown"
    now = now or datetime.now(timezone.utc)
    if last_upload.tzinfo is None:
        last_upload = last_upload.replace(tzinfo=timezone.utc)
    days = (now - last_upload).days
    return "active" if days <= 30 else "moderate" if days <= 120 else "dormant"


def engagement_from(videos: list[dict]) -> tuple[int | None, float | None]:
    """(avg views, engagement % = (likes+comments)/views) over recent videos. None when not computable."""
    views = likes = comments = n = 0
    for v in videos:
        st = v.get("statistics", {})
        vc = int(st.get("viewCount", 0) or 0)
        if vc <= 0:
            continue
        n += 1
        views += vc
        likes += int(st.get("likeCount", 0) or 0)
        comments += int(st.get("commentCount", 0) or 0)
    if n == 0 or views == 0:
        return None, None
    return views // n, round((likes + comments) / views * 100, 2)


def qualification_score(*, subs: int | None, min_subs: int, max_subs: int | None, activity: str,
                        engagement: float | None, has_email: bool, has_website: bool, has_social: bool,
                        niche_match: bool) -> tuple[int, dict]:
    """0-100. Transparent weights so users can see why a creator scored as they did."""
    if subs is None:
        sub_pts = 8
    else:
        lo, hi = min_subs, max_subs
        inside = subs >= lo and (hi is None or subs <= hi)
        sub_pts = 20 if inside else 5
    act_pts = {"active": 25, "moderate": 14, "dormant": 3}.get(activity, 8)
    if engagement is None:
        eng_pts = 6
    else:
        eng_pts = 20 if engagement >= 4 else 15 if engagement >= 2 else 9 if engagement >= 1 else 4
    contact_pts = (20 if has_email else 0) + (8 if has_website else 0) + (3 if has_social else 0)
    contact_pts = min(contact_pts, 25)
    niche_pts = 10 if niche_match else 5
    parts = {"audience": sub_pts, "activity": act_pts, "engagement": eng_pts, "contact": contact_pts, "relevance": niche_pts}
    return min(100, sum(parts.values())), parts


def verification_from(routes: list[dict]) -> str:
    """Summarise a creator's contact trust level from its routes."""
    emails = [r for r in routes if r["kind"] == "email"]
    if any(r["status"] == "verified" for r in emails):
        return "verified"
    if any(r["status"] == "published" for r in emails):
        return "published"
    if routes:
        return "unverified"
    return "none"

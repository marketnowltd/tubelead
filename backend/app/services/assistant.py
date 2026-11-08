"""Natural-language -> structured, EDITABLE search criteria. The result is only ever shown to the user for review;
nothing runs until they confirm. Works without AI via a transparent rules parser; with a connected provider the
model proposes criteria which are validated against the same schema (unknown/invalid fields are dropped)."""
from __future__ import annotations

import re

from pydantic import ValidationError
from sqlalchemy.orm import Session

from ..schemas import JobParams
from . import ai

COUNTRIES = {"uk": "GB", "united kingdom": "GB", "britain": "GB", "england": "GB", "usa": "US", "us": "US", "united states": "US", "america": "US",
             "canada": "CA", "australia": "AU", "germany": "DE", "france": "FR", "spain": "ES", "italy": "IT", "india": "IN", "brazil": "BR",
             "mexico": "MX", "japan": "JP", "korea": "KR", "ireland": "IE", "netherlands": "NL", "sweden": "SE", "norway": "NO", "poland": "PL",
             "turkey": "TR", "indonesia": "ID", "philippines": "PH", "south africa": "ZA", "nigeria": "NG", "uae": "AE", "singapore": "SG", "new zealand": "NZ"}
STOP = {"find", "me", "show", "get", "creators", "creator", "youtubers", "youtuber", "channels", "channel", "with", "who", "that", "have", "has", "and", "the", "a",
        "an", "in", "from", "for", "of", "on", "to", "subscribers", "subs", "subscriber", "between", "under", "over", "above", "below", "at", "least", "more", "than",
        "less", "public", "email", "emails", "website", "websites", "active", "recently", "recent", "based", "located", "about", "making", "make", "videos", "video",
        "please", "want", "need", "looking", "i", "are", "is", "uploading", "small", "mid", "large", "dormant", "worldwide", "global", "anywhere"}


def _num(s: str) -> int:
    m = re.fullmatch(r"([\d.,]+)\s*([kKmM]?)", s.strip())
    if not m:
        raise ValueError
    n = float(m.group(1).replace(",", ""))
    return int(n * {"": 1, "k": 1_000, "m": 1_000_000}[m.group(2).lower()])


def rules_parse(text: str) -> dict:
    t = text.lower()
    out: dict = {}
    m = re.search(r"(?:between\s+)?([\d.,]+\s*[km]?)\s*(?:-|to|and|–)\s*([\d.,]+\s*[km]?)\s*(?:subs|subscribers)", t)
    if m:
        try:
            lo, hi = _num(m.group(1)), _num(m.group(2))
            out["min_subscribers"], out["max_subscribers"] = min(lo, hi), max(lo, hi)
        except ValueError:
            pass
    else:
        for pat, key in ((r"(?:over|above|more than|at least|>)\s*([\d.,]+\s*[km]?)\s*(?:subs|subscribers)?", "min_subscribers"),
                         (r"(?:under|below|less than|<)\s*([\d.,]+\s*[km]?)\s*(?:subs|subscribers)", "max_subscribers")):
            m = re.search(pat, t)
            if m:
                try:
                    out[key] = _num(m.group(1))
                except ValueError:
                    pass
    countries = sorted({code for name, code in COUNTRIES.items() if re.search(rf"\b{re.escape(name)}\b", t)})
    if countries:
        out["countries"] = countries
    if re.search(r"\b(public )?e-?mails?\b", t) and not re.search(r"\bno e-?mails?\b", t):
        out["require_email"] = True
    if re.search(r"\bwebsite", t):
        out["require_website"] = True
    if re.search(r"\b(active|recently|recent|uploading)\b", t):
        out["activity"] = "recent"
    if re.search(r"\bbrands?\b", t):
        out["creator_type"] = "brand"
    if re.search(r"\bworldwide|global|anywhere\b", t):
        out["mode"] = "worldwide"
    cleaned = re.sub(r"[\d.,]+\s*[km]?\b", " ", t)
    for name in sorted(COUNTRIES, key=len, reverse=True):
        cleaned = re.sub(rf"\b{re.escape(name)}\b", " ", cleaned)
    words = [w for w in re.findall(r"[a-z][a-z'&-]+", cleaned) if w not in STOP]
    if words:
        out["keywords"] = [" ".join(words[:4])]
    return out


SCHEMA_HINT = ('Return ONLY a JSON object with any of these keys: keywords (list of strings), niches (list), countries (list of ISO 3166-1 alpha-2 codes), '
               'min_subscribers (int), max_subscribers (int), activity ("any"|"active"|"recent"|"dormant"), creator_type ("any"|"creator"|"brand"), '
               'require_email (bool), require_website (bool), mode ("standard"|"deep"|"multi_niche"|"worldwide"). Omit anything the request does not state. ')


def validate_criteria(raw: dict) -> tuple[dict, list[str]]:
    """Keep only valid fields. Returns (criteria, dropped_field_names)."""
    allowed = set(JobParams.model_fields) - {"limit", "max_quota_units", "region"}
    clean, dropped = {}, []
    for k, v in raw.items():
        if k not in allowed:
            dropped.append(k)
            continue
        try:
            probe = {"keywords": ["x"], **clean, k: v}
            JobParams.model_validate(probe)
            clean[k] = v
        except (ValidationError, ValueError):
            dropped.append(k)
    return clean, dropped


async def parse_request(db: Session, owner: str, text: str, *, transport=None) -> dict:
    text = text.strip()[:600]
    note = None
    source = "rules"
    raw: dict = rules_parse(text)
    try:
        res = await ai.run_task(db, owner, "search_assistant", f"{SCHEMA_HINT}\nRequest: {text}", max_tokens=300, timeout=25, transport=transport)
        data = ai.extract_json(res.text)
        if isinstance(data, dict) and data:
            raw, source = data, f"ai:{res.provider}"
        else:
            note = "The AI reply could not be read, so the built-in rules parser was used."
    except ai.AIError as exc:
        note = None if exc.code in ("no_provider", "task_disabled") else f"AI unavailable ({exc}); used the built-in rules parser."
    criteria, dropped = validate_criteria(raw)
    return {"source": source, "criteria": criteria, "dropped": dropped, "note": note, "requires_confirmation": True}

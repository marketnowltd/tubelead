"""AI Connect API: providers (BYO key), per-task routing, usage, and AI-assisted helpers."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import get_owner
from ..db import get_db
from ..models import AIProvider, AIRequestLog, AITaskAssignment, Creator
from ..schemas import AssistantIn, KeywordsIn, ProviderIn, ProviderPatch, TaskAssignIn
from ..services import ai, assistant, crypto
from ..services import entitlements as ent
from ..services.discovery import DEEP_SUFFIXES

router = APIRouter(prefix="/api/ai", tags=["ai"])


def prov_out(p: AIProvider) -> dict:
    meta = ai.PROVIDERS[p.provider]
    return {"id": p.id, "provider": p.provider, "provider_label": meta["label"], "label": p.label, "base_url": p.base_url or meta["base_url"],
            "has_key": bool(p.key_encrypted), "key_hint": p.key_hint, "model": p.model or meta["default_model"], "is_default": p.is_default,
            "status": p.status, "last_error": p.last_error, "last_tested_at": p.last_tested_at.isoformat() if p.last_tested_at else None,
            "created_at": p.created_at.isoformat()}


def _ai_http(exc: ai.AIError) -> HTTPException:
    return HTTPException(exc.status if 400 <= exc.status < 600 else 502, {"code": exc.code, "message": str(exc)})


def _own(db: Session, owner: str, pid: str) -> AIProvider:
    p = db.get(AIProvider, pid)
    if not p or p.owner_id != owner:
        raise HTTPException(404, "Provider not found")
    return p


def _set_default(db: Session, owner: str, keep: AIProvider) -> None:
    for o in db.scalars(select(AIProvider).where(AIProvider.owner_id == owner, AIProvider.id != keep.id)):
        o.is_default = False
    keep.is_default = True


@router.get("/catalog")
def catalog():
    return {"providers": [{"id": k, **{x: v[x] for x in ("label", "base_url", "needs_key", "default_model", "docs", "note")}} for k, v in ai.PROVIDERS.items()],
            "tasks": [{"id": k, "label": v["label"], "blurb": v["blurb"]} for k, v in ai.TASKS.items()],
            "subscription_notice": "AI API access is billed separately from consumer chat subscriptions. A ChatGPT Plus, Claude Pro or Gemini Advanced plan does not include API keys — create an API key in the provider's developer console and paste it here."}


@router.get("/providers")
def list_providers(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    return [prov_out(p) for p in db.scalars(select(AIProvider).where(AIProvider.owner_id == owner).order_by(AIProvider.created_at))]


@router.post("/providers", status_code=201)
def add_provider(body: ProviderIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    ent.require_feature(db, owner, "ai_connect")
    meta = ai.PROVIDERS[body.provider]
    key = (body.api_key or "").strip()
    if meta["needs_key"] and not key:
        raise HTTPException(422, f"{meta['label']} needs an API key. {meta['note']}")
    url = body.base_url.strip() if body.base_url else None
    if body.provider == "custom" and not url:
        raise HTTPException(422, "Custom providers need a base URL, e.g. https://my-host/v1")
    try:
        if url:
            url = ai.check_base_url(url)
    except ai.AIError as exc:
        raise HTTPException(422, str(exc)) from exc
    if db.scalar(select(AIProvider).where(AIProvider.owner_id == owner, AIProvider.provider == body.provider, AIProvider.label == body.label)):
        raise HTTPException(409, "You already have a connection with that label")
    first = not db.scalar(select(func.count()).select_from(AIProvider).where(AIProvider.owner_id == owner))
    p = AIProvider(owner_id=owner, provider=body.provider, label=body.label, base_url=url, model=body.model or meta["default_model"],
                   key_encrypted=crypto.encrypt(key) if key else None, key_hint=crypto.mask(key) if key else None)
    db.add(p)
    db.flush()
    if body.make_default or first:
        _set_default(db, owner, p)
    db.commit()
    return prov_out(p)


@router.patch("/providers/{pid}")
def patch_provider(pid: str, body: ProviderPatch, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    p = _own(db, owner, pid)
    if body.label:
        p.label = body.label
    if body.model is not None:
        p.model = body.model
    if body.base_url is not None:
        try:
            p.base_url = ai.check_base_url(body.base_url) if body.base_url.strip() else None
        except ai.AIError as exc:
            raise HTTPException(422, str(exc)) from exc
    if body.api_key:
        p.key_encrypted, p.key_hint, p.status, p.last_error = crypto.encrypt(body.api_key.strip()), crypto.mask(body.api_key.strip()), "untested", None
    if body.disabled is True:
        p.status, p.is_default = "disabled", False
    elif body.disabled is False and p.status == "disabled":
        p.status = "untested"
    if body.is_default:
        _set_default(db, owner, p)
    db.commit()
    return prov_out(p)


@router.delete("/providers/{pid}", status_code=204)
def delete_provider(pid: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    p = _own(db, owner, pid)
    db.delete(p)  # task assignments SET NULL via FK; key ciphertext is removed with the row
    db.commit()


@router.post("/providers/{pid}/test")
async def test_provider(pid: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    p = _own(db, owner, pid)
    cfg = ai.make_cfg(p)
    p.last_tested_at = datetime.now(timezone.utc)
    import time
    t0 = time.monotonic()
    try:
        res = await ai.chat(cfg, "You are a connection test.", "Reply with the single word OK.", max_tokens=16, timeout=20)
        p.status, p.last_error = "connected", None
        db.commit()
        return {"ok": True, "latency_ms": int((time.monotonic() - t0) * 1000), "model": res.model or cfg.model, "reply": res.text.strip()[:60]}
    except ai.AIError as exc:
        p.status, p.last_error = "error", str(exc)[:300]
        db.commit()
        return {"ok": False, "code": exc.code, "error": str(exc), "latency_ms": int((time.monotonic() - t0) * 1000)}


@router.get("/providers/{pid}/models")
async def provider_models(pid: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    p = _own(db, owner, pid)
    try:
        return {"models": await ai.list_models(ai.make_cfg(p))}
    except ai.AIError as exc:
        raise _ai_http(exc) from exc


@router.get("/tasks")
def list_tasks(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    rows = {a.task: a for a in db.scalars(select(AITaskAssignment).where(AITaskAssignment.owner_id == owner))}
    default = db.scalar(select(AIProvider).where(AIProvider.owner_id == owner, AIProvider.is_default.is_(True)))
    return [{"task": k, "label": v["label"], "blurb": v["blurb"], "enabled": rows[k].enabled if k in rows else True,
             "provider_id": rows[k].provider_id if k in rows else None, "fallback_provider_id": rows[k].fallback_provider_id if k in rows else None,
             "effective_provider_id": (rows[k].provider_id if k in rows and rows[k].provider_id else (default.id if default else None))} for k, v in ai.TASKS.items()]


@router.put("/tasks/{task}")
def assign_task(task: str, body: TaskAssignIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    if task not in ai.TASKS:
        raise HTTPException(404, "Unknown task")
    for pid in (body.provider_id, body.fallback_provider_id):
        if pid:
            _own(db, owner, pid)
    a = db.scalar(select(AITaskAssignment).where(AITaskAssignment.owner_id == owner, AITaskAssignment.task == task))
    if not a:
        a = AITaskAssignment(owner_id=owner, task=task)
        db.add(a)
    a.provider_id, a.fallback_provider_id, a.enabled = body.provider_id, body.fallback_provider_id, body.enabled
    db.commit()
    return {"ok": True}


@router.get("/usage")
def usage(days: int = 30, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(days=min(max(days, 1), 365))
    rows = db.scalars(select(AIRequestLog).where(AIRequestLog.owner_id == owner, AIRequestLog.created_at >= since).order_by(AIRequestLog.created_at.desc())).all()
    by_provider: dict[str, dict] = {}
    by_task: dict[str, dict] = {}
    for r in rows:
        for bucket, key in ((by_provider, r.provider), (by_task, r.task)):
            b = bucket.setdefault(key, {"requests": 0, "errors": 0, "tokens": 0, "cost_usd": 0.0})
            b["requests"] += 1
            b["errors"] += 0 if r.ok else 1
            b["tokens"] += r.prompt_tokens + r.completion_tokens
            b["cost_usd"] = round(b["cost_usd"] + (r.cost_usd or 0), 6)
    return {"days": days, "requests": len(rows), "errors": sum(1 for r in rows if not r.ok), "tokens": sum(r.prompt_tokens + r.completion_tokens for r in rows),
            "cost_usd_estimate": round(sum(r.cost_usd or 0 for r in rows), 6),
            "cost_note": "Estimates from public list prices; models not in the price table show no estimate. Your provider's invoice is the source of truth.",
            "by_provider": by_provider, "by_task": by_task,
            "recent": [{"id": r.id, "task": r.task, "provider": r.provider, "model": r.model, "ok": r.ok, "error": r.error, "tokens": r.prompt_tokens + r.completion_tokens,
                        "cost_usd": r.cost_usd, "latency_ms": r.latency_ms, "attempts": r.attempts, "created_at": r.created_at.isoformat()} for r in rows[:25]]}


@router.post("/assistant/parse")
async def assistant_parse(body: AssistantIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    return await assistant.parse_request(db, owner, body.text)


@router.post("/keywords")
async def keyword_ideas(body: KeywordsIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    topic = body.topic.strip()
    static = [topic] + [f"{topic} {s}" for s in DEEP_SUFFIXES]
    try:
        res = await ai.run_task(db, owner, "keyword_research", f'Topic: "{topic}". Return ONLY a JSON array of 10 distinct YouTube search keywords (strings).', max_tokens=300, timeout=25)
        data = ai.extract_json(res.text)
        if isinstance(data, list):
            kws = [str(k).strip() for k in data if isinstance(k, (str, int, float)) and str(k).strip()][:15]
            if kws:
                return {"source": f"ai:{res.provider}", "keywords": kws}
        return {"source": "rules", "keywords": static, "note": "The AI reply could not be read; showing rule-based variations."}
    except ai.AIError as exc:
        if exc.code in ("no_provider", "task_disabled"):
            return {"source": "rules", "keywords": static, "note": "Connect an AI provider in AI Connect for smarter suggestions."}
        return {"source": "rules", "keywords": static, "note": f"AI unavailable: {exc}"}


@router.post("/creators/{cid}/analyse")
async def analyse_creator(cid: str, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    c = db.get(Creator, cid)
    if not c or c.owner_id != owner:
        raise HTTPException(404, "Creator not found")
    facts = (f"Channel: {c.title}\nSubscribers: {c.subscriber_count}\nVideos: {c.video_count}\nCountry: {c.country}\nNiche: {c.niche}\n"
             f"Activity: {c.activity}\nEngagement %: {c.engagement_rate}\nPublic description:\n{(c.description or '')[:1500]}")
    try:
        res = await ai.run_task(db, owner, "creator_analysis", "Summarise this channel in 3 short bullet points: what it covers, audience fit, and any caveats. " + facts, max_tokens=300)
    except ai.AIError as exc:
        raise _ai_http(exc) from exc
    return {"summary": res.text.strip(), "provider": res.provider, "model": res.model, "note": "AI-generated summary of public data. Verify before outreach."}


@router.post("/report")
async def ai_report(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    """Plain-English summary of the dashboard numbers. The model only sees aggregate statistics, never contact details."""
    import json
    from .analytics import overview
    o = overview(days=30, demo="hide", owner=owner, db=db)
    stats = {"kpis": o["kpis"], "top_countries": o["countries"][:5], "top_niches": o["niches"][:5], "recent_runs": o["search_performance"][-5:], "avg_search_yield_pct": o["avg_conversion"]}
    try:
        res = await ai.run_task(db, owner, "report_generation", "Write a 4-6 sentence summary of these discovery results for a non-technical reader. Use only these numbers.\n" + json.dumps(stats, default=str), max_tokens=350)
    except ai.AIError as exc:
        raise _ai_http(exc) from exc
    return {"summary": res.text.strip(), "provider": res.provider, "model": res.model, "stats": stats}

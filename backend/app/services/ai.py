"""AI Connect: provider adapters + central orchestrator.

Design rules
- Adapters are small and independent: OpenAI-compatible (OpenAI, OpenRouter, Ollama, custom), Anthropic, Gemini.
- Keys are decrypted only here, at call time, and are never logged or returned.
- AI output is ADVISORY. Tasks are told never to invent contact details or facts; factual fields always come from
  YouTube / the creator's own public pages, never from a model.
- The orchestrator handles routing (per-task assignment -> fallback -> account default), timeouts, retries with
  back-off, a per-user rate limit, usage + cost-estimate logging and error logging.
"""
from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import re
import socket
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import AIProvider, AIRequestLog, AITaskAssignment
from . import crypto

log = logging.getLogger("tubelead.ai")

PROVIDERS: dict[str, dict] = {
    "openai": {"label": "OpenAI", "kind": "openai", "base_url": "https://api.openai.com/v1", "needs_key": True, "default_model": "gpt-4o-mini",
               "docs": "https://platform.openai.com/api-keys", "note": "Uses an API key from platform.openai.com. A ChatGPT subscription does not include API access."},
    "anthropic": {"label": "Anthropic (Claude)", "kind": "anthropic", "base_url": "https://api.anthropic.com", "needs_key": True, "default_model": "claude-haiku-4-5",
                  "docs": "https://console.anthropic.com/settings/keys", "note": "Uses an API key from console.anthropic.com. A Claude.ai subscription does not include API access."},
    "gemini": {"label": "Google Gemini", "kind": "gemini", "base_url": "https://generativelanguage.googleapis.com", "needs_key": True, "default_model": "gemini-2.0-flash",
               "docs": "https://aistudio.google.com/apikey", "note": "Uses a Gemini API key from Google AI Studio. A Gemini Advanced subscription does not include API access."},
    "openrouter": {"label": "OpenRouter", "kind": "openai", "base_url": "https://openrouter.ai/api/v1", "needs_key": True, "default_model": "openai/gpt-4o-mini",
                   "docs": "https://openrouter.ai/keys", "note": "One key, many models. Pay-as-you-go credits."},
    "ollama": {"label": "Ollama (local)", "kind": "openai", "base_url": "http://localhost:11434/v1", "needs_key": False, "default_model": "llama3.2",
               "docs": "https://ollama.com", "note": "Runs on your own machine/VPS. No key needed; the backend must be able to reach the URL."},
    "custom": {"label": "Custom (OpenAI-compatible)", "kind": "openai", "base_url": "", "needs_key": False, "default_model": "",
               "docs": "", "note": "Any server exposing /chat/completions (vLLM, LM Studio, LiteLLM, Together, Groq…)."},
}

TASKS: dict[str, dict] = {
    "keyword_research": {"label": "Keyword research", "blurb": "Expand a topic into related search keywords",
                         "system": "You help find YouTube creators. Given a topic, suggest related search keywords a creator in that niche would use."},
    "creator_analysis": {"label": "Creator analysis", "blurb": "Summarise what a channel is about from its public description",
                         "system": "You summarise a YouTube channel using ONLY the public text provided."},
    "lead_qualification": {"label": "Lead qualification", "blurb": "Judge fit against your criteria with reasons",
                           "system": "You judge whether a creator matches the user's criteria using ONLY the data provided, and explain briefly."},
    "lead_scoring": {"label": "Lead scoring", "blurb": "Suggest a 0–100 fit score with a breakdown",
                     "system": "You suggest a 0-100 fit score from the supplied metrics only and give the reasons."},
    "contact_analysis": {"label": "Contact analysis", "blurb": "Interpret public contact pages (never invents addresses)",
                         "system": "You read public text and report which contact routes it states. NEVER guess or construct email addresses."},
    "campaign_intelligence": {"label": "Campaign intelligence", "blurb": "Suggest segmentation and next steps for a campaign",
                              "system": "You advise on organising creator outreach campaigns from supplied statistics."},
    "report_generation": {"label": "Report generation", "blurb": "Write a plain-English summary of results",
                          "system": "You write a concise factual report from the statistics provided, citing only those numbers."},
    "search_assistant": {"label": "Search assistant", "blurb": "Turn natural language into editable search criteria",
                         "system": "You convert a natural-language request into structured creator-search criteria."},
    "growth_interpretation": {"label": "Growth Assistant setup", "blurb": "Understand what you sell and who to reach",
                              "system": "You read a short business description and return ONLY JSON describing the product, audience, location and campaign. Use only what the text says; leave unknown fields empty."},
    "email_writing": {"label": "Email writing", "blurb": "Improve wording in Creative Studio without changing meaning",
                      "system": "You edit marketing email copy. Keep the meaning, facts, offers, prices and legal wording exactly; never add claims, numbers or promises. Return ONLY JSON."},
    "reply_assistant": {"label": "Reply assistant", "blurb": "Sort campaign replies and draft responses for your approval",
                        "system": "You classify replies to a business outreach email and draft a short, polite response. Never promise discounts, refunds or anything not in the supplied context. Return ONLY JSON."},
}
PREAMBLE = ("Rules: never invent facts, numbers, names, URLs or email addresses. If the supplied data does not say it, say it is unknown. "
            "Be concise. ")

# USD per 1M tokens (input, output) — rough public list prices used for ESTIMATES only; unknown models show no estimate.
PRICES: dict[str, tuple[float, float]] = {
    "gpt-4o-mini": (0.15, 0.60), "gpt-4o": (2.5, 10.0), "claude-haiku-4-5": (1.0, 5.0), "claude-sonnet-4-5": (3.0, 15.0),
    "gemini-2.0-flash": (0.10, 0.40), "gemini-1.5-flash": (0.075, 0.30),
}


TEST_TRANSPORT: httpx.AsyncBaseTransport | None = None  # tests inject a mock transport here


def redact(msg: str, key: str | None) -> str:
    """Providers occasionally echo the credential in error bodies; never let it reach logs, the DB or the browser."""
    if key and len(key) >= 6:
        msg = msg.replace(key, "[redacted]")
    return re.sub(r"(sk-|AIza|key-)[A-Za-z0-9_\-]{12,}", "[redacted]", msg)


class AIError(Exception):
    def __init__(self, message: str, code: str = "ai_error", status: int = 502, retryable: bool = False):
        super().__init__(message)
        self.code, self.status, self.retryable = code, status, retryable


@dataclass
class AIResult:
    text: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    model: str = ""
    provider: str = ""


@dataclass
class Cfg:
    id: str
    provider: str
    kind: str
    base_url: str
    key: str
    model: str


# ---------------------------------------------------------------- URL safety
def check_base_url(url: str) -> str:
    u = urlparse(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        raise AIError("Base URL must start with http:// or https://", "bad_url", 422)
    if not get_settings().ai_allow_private_hosts:
        try:
            infos = socket.getaddrinfo(u.hostname, None)
        except socket.gaierror as exc:
            raise AIError(f"Cannot resolve {u.hostname}", "bad_url", 422) from exc
        for info in infos:
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                raise AIError("Private/loopback addresses are blocked on this deployment (AI_ALLOW_PRIVATE_HOSTS=false).", "bad_url", 422)
    return url.rstrip("/")


def make_cfg(p: AIProvider) -> Cfg:
    meta = PROVIDERS[p.provider]
    base = (p.base_url or meta["base_url"]).rstrip("/")
    key = crypto.decrypt(p.key_encrypted) if p.key_encrypted else ""
    return Cfg(p.id, p.provider, meta["kind"], base, key, p.model or meta["default_model"])


# ---------------------------------------------------------------- adapters
def _http_err(r: httpx.Response, provider: str) -> AIError:
    msg = r.text[:240]
    try:
        j = r.json()
        e = j.get("error", j)
        msg = e.get("message", msg) if isinstance(e, dict) else str(e)
    except Exception:  # noqa: BLE001
        pass
    if r.status_code in (401, 403):
        return AIError(f"{provider} rejected the API key ({r.status_code}). Check the key and its permissions.", "invalid_key", 401)
    if r.status_code == 404:
        return AIError(f"{provider}: model or endpoint not found. {msg}", "not_found", 404)
    if r.status_code == 429:
        return AIError(f"{provider} rate limit or insufficient quota: {msg}", "rate_limited", 429, retryable=True)
    return AIError(f"{provider} error {r.status_code}: {msg}", "provider_error", 502, retryable=r.status_code >= 500)


async def _post(cfg: Cfg, url: str, headers: dict, body: dict, timeout: float, transport=None) -> dict:
    try:
        async with httpx.AsyncClient(timeout=timeout, transport=transport or TEST_TRANSPORT) as c:
            r = await c.post(url, headers=headers, json=body)
    except httpx.TimeoutException as exc:
        raise AIError(f"{cfg.provider} timed out after {int(timeout)}s", "timeout", 504, retryable=True) from exc
    except httpx.HTTPError as exc:
        raise AIError(f"Could not reach {cfg.provider}: {type(exc).__name__}", "unreachable", 502, retryable=True) from exc
    if r.status_code >= 400:
        raise _http_err(r, cfg.provider)
    try:
        return r.json()
    except ValueError as exc:
        raise AIError(f"{cfg.provider} returned a non-JSON response", "bad_response", 502) from exc


async def chat(cfg: Cfg, system: str, user: str, *, max_tokens: int = 600, timeout: float = 30, transport=None) -> AIResult:
    if not cfg.model:
        raise AIError("No model selected for this provider", "no_model", 422)
    if cfg.kind == "openai":
        h = {"Authorization": f"Bearer {cfg.key}"} if cfg.key else {}
        j = await _post(cfg, f"{cfg.base_url}/chat/completions", h,
                        {"model": cfg.model, "max_tokens": max_tokens, "temperature": 0.2,
                         "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}, timeout, transport)
        try:
            text = j["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as exc:
            raise AIError("Unexpected response shape from provider", "bad_response") from exc
        u = j.get("usage") or {}
        return AIResult(text, u.get("prompt_tokens", 0), u.get("completion_tokens", 0), j.get("model", cfg.model), cfg.provider)
    if cfg.kind == "anthropic":
        j = await _post(cfg, f"{cfg.base_url}/v1/messages", {"x-api-key": cfg.key, "anthropic-version": "2023-06-01"},
                        {"model": cfg.model, "max_tokens": max_tokens, "system": system, "messages": [{"role": "user", "content": user}]}, timeout, transport)
        text = "".join(b.get("text", "") for b in j.get("content", []) if b.get("type") == "text")
        u = j.get("usage") or {}
        return AIResult(text, u.get("input_tokens", 0), u.get("output_tokens", 0), j.get("model", cfg.model), cfg.provider)
    if cfg.kind == "gemini":
        m = cfg.model.removeprefix("models/")
        j = await _post(cfg, f"{cfg.base_url}/v1beta/models/{m}:generateContent", {"x-goog-api-key": cfg.key},
                        {"systemInstruction": {"parts": [{"text": system}]}, "contents": [{"role": "user", "parts": [{"text": user}]}],
                         "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.2}}, timeout, transport)
        try:
            text = "".join(p.get("text", "") for p in j["candidates"][0]["content"]["parts"])
        except (KeyError, IndexError, TypeError) as exc:
            raise AIError("Gemini returned no candidates (possibly blocked by safety filters)", "bad_response") from exc
        u = j.get("usageMetadata") or {}
        return AIResult(text, u.get("promptTokenCount", 0), u.get("candidatesTokenCount", 0), cfg.model, cfg.provider)
    raise AIError(f"Unknown provider kind {cfg.kind}", "bad_provider", 500)


async def list_models(cfg: Cfg, transport=None) -> list[str]:
    try:
        async with httpx.AsyncClient(timeout=15, transport=transport or TEST_TRANSPORT) as c:
            if cfg.kind == "openai":
                r = await c.get(f"{cfg.base_url}/models", headers={"Authorization": f"Bearer {cfg.key}"} if cfg.key else {})
            elif cfg.kind == "anthropic":
                r = await c.get(f"{cfg.base_url}/v1/models", headers={"x-api-key": cfg.key, "anthropic-version": "2023-06-01"})
            else:
                r = await c.get(f"{cfg.base_url}/v1beta/models", headers={"x-goog-api-key": cfg.key})
    except httpx.TimeoutException as exc:
        raise AIError(f"{cfg.provider} timed out", "timeout", 504) from exc
    except httpx.HTTPError as exc:
        raise AIError(f"Could not reach {cfg.provider}: {type(exc).__name__}", "unreachable", 502) from exc
    if r.status_code >= 400:
        raise _http_err(r, cfg.provider)
    j = r.json()
    if cfg.kind == "gemini":
        return sorted(m["name"].removeprefix("models/") for m in j.get("models", []) if "generateContent" in m.get("supportedGenerationMethods", []))
    return sorted(m.get("id", "") for m in j.get("data", []) if m.get("id"))


# ---------------------------------------------------------------- orchestrator
_RATE: dict[str, deque] = defaultdict(deque)
RATE_PER_MIN = 30


def _rate_limit(owner: str) -> None:
    q, now = _RATE[owner], time.monotonic()
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= RATE_PER_MIN:
        raise AIError(f"AI request limit reached ({RATE_PER_MIN}/minute). Try again shortly.", "rate_limited", 429)
    q.append(now)


def estimate_cost(model: str, pt: int, ct: int) -> float | None:
    price = PRICES.get(model) or next((v for k, v in PRICES.items() if model.startswith(k)), None)
    return round((pt * price[0] + ct * price[1]) / 1_000_000, 6) if price else None


def resolve_chain(db: Session, owner: str, task: str) -> list[AIProvider]:
    """assigned provider -> its fallback -> account default. Empty list means AI is unavailable for this task."""
    a = db.scalar(select(AITaskAssignment).where(AITaskAssignment.owner_id == owner, AITaskAssignment.task == task))
    if a and not a.enabled:
        raise AIError(f"The “{TASKS[task]['label']}” AI task is switched off in AI Task Manager.", "task_disabled", 409)
    ids = [x for x in ((a.provider_id, a.fallback_provider_id) if a else ()) if x]
    chain: list[AIProvider] = []
    for pid in ids:
        p = db.get(AIProvider, pid)
        if p and p.owner_id == owner and p.status != "disabled":
            chain.append(p)
    default = db.scalar(select(AIProvider).where(AIProvider.owner_id == owner, AIProvider.is_default.is_(True), AIProvider.status != "disabled"))
    if default and default.id not in {c.id for c in chain}:
        chain.append(default)
    return chain


async def run_task(db: Session, owner: str, task: str, user_prompt: str, *, max_tokens: int = 600, timeout: float = 30,
                   retries: int = 2, transport=None) -> AIResult:
    if task not in TASKS:
        raise AIError(f"Unknown AI task {task}", "bad_task", 422)
    chain = resolve_chain(db, owner, task)
    if not chain:
        raise AIError("No AI provider is connected for this task. Connect one in AI Connect (bring your own API key).", "no_provider", 409)
    _rate_limit(owner)
    system = PREAMBLE + TASKS[task]["system"]
    last: AIError | None = None
    for p in chain:
        cfg = make_cfg(p)
        attempts = 0
        for attempt in range(retries + 1):
            attempts += 1
            t0 = time.monotonic()
            try:
                res = await chat(cfg, system, user_prompt, max_tokens=max_tokens, timeout=timeout, transport=transport)
                db.add(AIRequestLog(owner_id=owner, task=task, provider=p.provider, model=res.model or cfg.model, ok=True,
                                    prompt_tokens=res.prompt_tokens, completion_tokens=res.completion_tokens,
                                    cost_usd=estimate_cost(res.model or cfg.model, res.prompt_tokens, res.completion_tokens),
                                    latency_ms=int((time.monotonic() - t0) * 1000), attempts=attempts))
                db.commit()
                return res
            except AIError as exc:
                last = exc
                log.warning("ai %s via %s failed (%s): %s", task, p.provider, exc.code, exc)
                if exc.retryable and attempt < retries:
                    await asyncio.sleep(0.4 * (2 ** attempt))
                    continue
                break
        db.add(AIRequestLog(owner_id=owner, task=task, provider=p.provider, model=cfg.model, ok=False, error=redact(f"[{last.code}] {last}", cfg.key)[:500],
                            latency_ms=0, attempts=attempts))
        if last and last.code == "invalid_key":
            p.status, p.last_error = "error", redact(str(last), cfg.key)[:300]
        db.commit()
    assert last is not None
    raise last


def extract_json(text: str) -> dict | list | None:
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    cand = m.group(1) if m else text
    start = min([i for i in (cand.find("{"), cand.find("[")) if i >= 0], default=-1)
    if start < 0:
        return None
    for end in range(len(cand), start, -1):
        try:
            return json.loads(cand[start:end])
        except ValueError:
            continue
    return None

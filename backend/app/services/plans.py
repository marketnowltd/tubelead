"""TubeLead plans. Prices and allowances are configuration: edit DEFAULT_PLANS or point PLANS_FILE
at a JSON file ({"pro": {"leads": 30000}}) to override individual values without code changes.
Enforcement is real (see services/entitlements.py); Stripe confirms purchases via verified webhooks only."""
import json
from copy import deepcopy

from ..config import get_settings

ORDER = ["free", "starter", "pro", "elite"]
OPERATOR_ALL = {k: True for k in ("csv_export", "scheduled_discovery", "ai_connect", "api_access", "automation", "team", "priority_queue", "multi_source")}
CREDIT_KINDS = ("discovery", "enrichment", "verification", "campaign_recipients")
OPERATOR = {"label": "Operator", "tagline": "Site owner: unlimited access", "price_monthly_gbp": 0, "price_annual_gbp": 0,
            "leads": 1_000_000_000, "lead_period": "lifetime", "max_jobs_per_day": 1_000_000, "team_seats": 1000, "features": OPERATOR_ALL,
            "credits": {"discovery": 10**9, "enrichment": 10**9, "verification": 10**9, "campaign_recipients": 10**9, "storage_mb": 10**6}}

DEFAULT_PLANS: dict[str, dict] = {
    "free": {"label": "Free", "tagline": "Try discovery with a 25-lead trial", "price_monthly_gbp": 0, "price_annual_gbp": 0,
             "leads": 25, "lead_period": "lifetime", "max_jobs_per_day": 3, "team_seats": 1,
             "credits": {"discovery": 5, "enrichment": 10, "verification": 25, "campaign_recipients": 0, "storage_mb": 20},
             "features": {"csv_export": False, "scheduled_discovery": False, "ai_connect": False, "api_access": False, "automation": False, "team": False, "priority_queue": False, "multi_source": False}},
    "starter": {"label": "Starter", "tagline": "For solo researchers and small outreach teams", "price_monthly_gbp": 19, "price_annual_gbp": 190,
                "leads": 2500, "lead_period": "month", "max_jobs_per_day": 15, "team_seats": 1,
             "credits": {"discovery": 60, "enrichment": 250, "verification": 500, "campaign_recipients": 500, "storage_mb": 200},
                "features": {"csv_export": True, "scheduled_discovery": False, "ai_connect": True, "api_access": False, "automation": False, "team": False, "priority_queue": False, "multi_source": False}},
    "pro": {"label": "Pro", "tagline": "Scheduled discovery, automation and AI task routing", "price_monthly_gbp": 49, "price_annual_gbp": 490,
            "leads": 25000, "lead_period": "month", "max_jobs_per_day": 60, "team_seats": 3,
             "credits": {"discovery": 300, "enrichment": 1500, "verification": 3000, "campaign_recipients": 5000, "storage_mb": 1000},
            "features": {"csv_export": True, "scheduled_discovery": True, "ai_connect": True, "api_access": False, "automation": True, "team": False, "priority_queue": False, "multi_source": True}},
    "elite": {"label": "Elite", "tagline": "High volume, API access, teams and priority queue", "price_monthly_gbp": 99, "price_annual_gbp": 990,
              "leads": 100000, "lead_period": "month", "max_jobs_per_day": 300, "team_seats": 10,
             "credits": {"discovery": 1500, "enrichment": 6000, "verification": 12000, "campaign_recipients": 25000, "storage_mb": 5000},
              "features": {"csv_export": True, "scheduled_discovery": True, "ai_connect": True, "api_access": True, "automation": True, "team": True, "priority_queue": True, "multi_source": True}},
}

FEATURE_MIN_PLAN = {"csv_export": "Starter", "scheduled_discovery": "Pro", "ai_connect": "Starter", "api_access": "Elite", "automation": "Pro", "team": "Elite", "multi_source": "Pro"}
FEATURE_LABELS = {"csv_export": "CSV export", "scheduled_discovery": "Scheduled discovery", "ai_connect": "AI Connect", "api_access": "API access", "automation": "Automation", "team": "Team accounts", "multi_source": "Multi-source search"}


_cache: dict = {"at": 0.0, "plans": None}
CACHE_SECONDS = 30


def invalidate() -> None:
    _cache["plans"] = None


def _merge(plans: dict, overrides: dict) -> None:
    for k, v in overrides.items():
        if k in plans and isinstance(v, dict):
            for kk, vv in v.items():
                if isinstance(vv, dict) and isinstance(plans[k].get(kk), dict):
                    plans[k][kk].update(vv)
                else:
                    plans[k][kk] = vv


def _db_overrides() -> dict:
    try:
        from ..db import SessionLocal
        from ..models import PlanConfig
        with SessionLocal() as db:
            return {r.plan_id: r.data for r in db.query(PlanConfig).all()}
    except Exception:  # noqa: BLE001 - table missing before migration 005, or DB unavailable
        return {}


def _load() -> dict[str, dict]:
    import time
    if _cache["plans"] is not None and time.time() - _cache["at"] < CACHE_SECONDS:
        return _cache["plans"]
    plans = deepcopy(DEFAULT_PLANS)
    plans["operator"] = deepcopy(OPERATOR)
    f = get_settings().plans_file
    if f:
        try:
            with open(f) as fh:
                for k, v in json.load(fh).items():
                    if k in plans:
                        for kk, vv in v.items():
                            if isinstance(vv, dict) and isinstance(plans[k].get(kk), dict):
                                plans[k][kk].update(vv)
                            else:
                                plans[k][kk] = vv
        except (OSError, ValueError):
            pass
    _merge(plans, {k: v for k, v in _db_overrides().items() if k != "operator"})  # admin edits (Admin > Plans) win
    _cache.update(at=time.time(), plans=plans)
    return plans


def all_plans() -> dict[str, dict]:
    return _load()


def purchasable_plans() -> dict[str, dict]:
    """Plans a customer can see and buy. The operator plan is never offered."""
    return {k: v for k, v in _load().items() if k != "operator"}


def plan_id(name: str | None) -> str:
    name = {"enterprise": "elite"}.get(name or "free", name or "free")
    return name if name in _load() else "free"


def operator_ids() -> set[str]:
    return {x.strip() for x in get_settings().operator_user_ids.split(",") if x.strip()}


def plan_for(name: str | None) -> dict:
    return _load()[plan_id(name)]


def price_id(plan: str, interval: str) -> str:
    return getattr(get_settings(), f"stripe_price_{plan}_{'annual' if interval == 'annual' else 'monthly'}", "")

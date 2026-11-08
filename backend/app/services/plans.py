"""TubeLead plans. Prices and allowances are configuration: edit DEFAULT_PLANS or point PLANS_FILE
at a JSON file ({"pro": {"leads": 30000}}) to override individual values without code changes.
Enforcement is real (see services/entitlements.py); Stripe confirms purchases via verified webhooks only."""
import json
from copy import deepcopy
from functools import lru_cache

from ..config import get_settings

ORDER = ["free", "starter", "pro", "elite"]

DEFAULT_PLANS: dict[str, dict] = {
    "free": {"label": "Free", "tagline": "Try discovery with a 25-lead trial", "price_monthly_gbp": 0, "price_annual_gbp": 0,
             "leads": 25, "lead_period": "lifetime", "max_jobs_per_day": 3, "team_seats": 1,
             "features": {"csv_export": False, "scheduled_discovery": False, "ai_connect": False, "api_access": False, "automation": False, "team": False, "priority_queue": False}},
    "starter": {"label": "Starter", "tagline": "For solo researchers and small outreach teams", "price_monthly_gbp": 19, "price_annual_gbp": 190,
                "leads": 2500, "lead_period": "month", "max_jobs_per_day": 15, "team_seats": 1,
                "features": {"csv_export": True, "scheduled_discovery": False, "ai_connect": True, "api_access": False, "automation": False, "team": False, "priority_queue": False}},
    "pro": {"label": "Pro", "tagline": "Scheduled discovery, automation and AI task routing", "price_monthly_gbp": 49, "price_annual_gbp": 490,
            "leads": 25000, "lead_period": "month", "max_jobs_per_day": 60, "team_seats": 3,
            "features": {"csv_export": True, "scheduled_discovery": True, "ai_connect": True, "api_access": False, "automation": True, "team": False, "priority_queue": False}},
    "elite": {"label": "Elite", "tagline": "High volume, API access, teams and priority queue", "price_monthly_gbp": 99, "price_annual_gbp": 990,
              "leads": 100000, "lead_period": "month", "max_jobs_per_day": 300, "team_seats": 10,
              "features": {"csv_export": True, "scheduled_discovery": True, "ai_connect": True, "api_access": True, "automation": True, "team": True, "priority_queue": True}},
}

FEATURE_MIN_PLAN = {"csv_export": "Starter", "scheduled_discovery": "Pro", "ai_connect": "Starter", "api_access": "Elite", "automation": "Pro", "team": "Elite"}
FEATURE_LABELS = {"csv_export": "CSV export", "scheduled_discovery": "Scheduled discovery", "ai_connect": "AI Connect", "api_access": "API access", "automation": "Automation", "team": "Team accounts"}


@lru_cache
def _load() -> dict[str, dict]:
    plans = deepcopy(DEFAULT_PLANS)
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
    return plans


def all_plans() -> dict[str, dict]:
    return _load()


def plan_id(name: str | None) -> str:
    name = {"enterprise": "elite"}.get(name or "free", name or "free")
    return name if name in _load() else "free"


def plan_for(name: str | None) -> dict:
    return _load()[plan_id(name)]


def price_id(plan: str, interval: str) -> str:
    return getattr(get_settings(), f"stripe_price_{plan}_{'annual' if interval == 'annual' else 'monthly'}", "")

"""Application configuration. All secrets come from environment variables and are
never sent to the browser."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    # SQLite for zero-config local dev; point at Supabase Postgres in production:
    # postgresql+psycopg://postgres:<pw>@db.<ref>.supabase.co:5432/postgres
    database_url: str = "sqlite:///./tubelead.db"

    youtube_api_key: str = ""
    youtube_api_base: str = "https://www.googleapis.com/youtube/v3"  # override for tests / a caching proxy
    youtube_daily_quota: int = 10_000
    youtube_quota_reserve: int = 300  # units never spent, kept for manual use

    auth_mode: str = "dev"  # "dev" (single local user) | "supabase" (JWT required)
    supabase_jwt_secret: str = ""  # legacy HS256 projects only
    supabase_url: str = ""         # e.g. https://<ref>.supabase.co — used to verify newer ECC/RSA signed tokens

    # Encrypts stored provider keys (Fernet key derived from this). MUST be set to a long random value in production.
    secret_key: str = "dev-only-change-me-tubelead-secret"
    app_base_url: str = "http://localhost:3000"

    # Stripe (all optional: billing screens show a clear "not configured" state without them)
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_publishable_key: str = ""
    # Price IDs per plan/interval, e.g. STRIPE_PRICE_STARTER_MONTHLY=price_123
    stripe_price_starter_monthly: str = ""
    stripe_price_starter_annual: str = ""
    stripe_price_pro_monthly: str = ""
    stripe_price_pro_annual: str = ""
    stripe_price_elite_monthly: str = ""
    stripe_price_elite_annual: str = ""
    stripe_api_base: str = "https://api.stripe.com"
    ai_allow_private_hosts: bool = True  # set false on multi-tenant deployments to block loopback/private AI base URLs
    plan_override: str = ""  # DEV ONLY (auth_mode=dev): pretend the local user is on this plan, to evaluate paid features without Stripe
    plans_file: str = ""  # optional JSON file overriding plan prices/allowances

    cors_origins: str = "http://localhost:3000"
    redis_url: str = ""  # optional: shared rate limiting across processes
    n8n_webhook_url: str = ""
    rate_limit_per_minute: int = 300
    max_concurrent_jobs: int = 2
    fetch_websites: bool = True
    scheduler_enabled: bool = True

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

"""Application configuration. All secrets come from environment variables and are
never sent to the browser."""
from functools import lru_cache

from pydantic import field_validator
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
    dev_owner_is_operator: bool = True  # local single-user mode behaves as the operator; tests switch this off
    # Search Everywhere providers (each optional; a missing key reports "awaiting configuration")
    google_pse_key: str = ""
    google_pse_cx: str = ""
    reddit_client_id: str = ""
    reddit_client_secret: str = ""
    reddit_user_agent: str = "TubeLead/1.0 (lead discovery)"
    twitch_client_id: str = ""
    twitch_client_secret: str = ""
    spotify_client_id: str = ""
    spotify_client_secret: str = ""
    lastfm_api_key: str = ""
    musicbrainz_user_agent: str = "TubeLead/1.0 (lead discovery)"
    vimeo_access_token: str = ""      # Vimeo API (developer.vimeo.com): an app's access token with the "public" scope
    mastodon_instance: str = "mastodon.social"  # Mastodon server whose public account search is used
    # Support assistant (OpenAI). Server-side only; the browser never sees the key.
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_api_base: str = "https://api.openai.com/v1"
    chat_retention_days: int = 180
    # Transactional email (Resend)
    resend_api_key: str = ""
    resend_api_base: str = "https://api.resend.com"
    email_from: str = "TubeLead <support@tubelead.app>"
    admin_alert_email: str = ""
    support_email: str = ""
    # Supabase service key: only used server-side to delete a user's sign-in record when they delete their account
    supabase_service_role_key: str = ""
    # Growth Assistant providers (server-side; customers never configure these)
    public_api_url: str = ""         # public URL of this API, used for hosted email images (e.g. https://tubelead-api.onrender.com)
    snov_client_id: str = ""         # TubeLead's own Snov.io account, used for contact enrichment and verification
    snov_client_secret: str = ""
    snov_api_base: str = "https://api.snov.io"
    snov_cost_per_credit_pence: float = 0.0   # what one Snov.io credit costs you, for margin reporting
    brave_api_key: str = ""          # Brave Search API (web discovery)
    brave_cost_per_query_pence: float = 0.0
    operator_user_ids: str = ""  # comma-separated Supabase user IDs with unlimited access (site owner)
    plan_override: str = ""  # DEV ONLY (auth_mode=dev): pretend the local user is on this plan, to evaluate paid features without Stripe
    plans_file: str = ""  # optional JSON file overriding plan prices/allowances

    cors_origins: str = "http://localhost:3000"
    redis_url: str = ""  # optional: shared rate limiting across processes
    n8n_webhook_url: str = ""
    rate_limit_per_minute: int = 300
    max_concurrent_jobs: int = 2
    fetch_websites: bool = True
    scheduler_enabled: bool = True

    @field_validator("database_url", "supabase_url", "app_base_url", mode="before")
    @classmethod
    def _strip_whitespace(cls, v):
        # Copy-paste into hosting dashboards often adds spaces or line breaks; those break connections.
        return v.strip() if isinstance(v, str) else v

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

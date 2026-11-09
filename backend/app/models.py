"""Relational schema. Mirrors supabase/migrations/001_init.sql (keep in sync)."""
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (JSON, BigInteger, Boolean, Date, DateTime, Float, ForeignKey,
                        Integer, String, Text, UniqueConstraint, Uuid)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def uid() -> str:
    return str(uuid.uuid4())


def now() -> datetime:
    return datetime.now(timezone.utc)


UUID = Uuid(as_uuid=False)


class Campaign(Base):
    __tablename__ = "campaigns"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(24), default="draft")  # draft|active|paused|completed
    target_niche: Mapped[str | None] = mapped_column(String(80), nullable=True)
    target_countries: Mapped[list] = mapped_column(JSON, default=list)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Creator(Base):
    __tablename__ = "creators"
    __table_args__ = (UniqueConstraint("owner_id", "youtube_channel_id", name="uq_creator_owner_channel"),)
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    youtube_channel_id: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(300))
    handle: Mapped[str | None] = mapped_column(String(120), nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    channel_url: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text, default="")
    subscriber_count: Mapped[int | None] = mapped_column(BigInteger, nullable=True)  # null = hidden
    video_count: Mapped[int] = mapped_column(Integer, default=0)
    view_count: Mapped[int] = mapped_column(BigInteger, default=0)
    country: Mapped[str | None] = mapped_column(String(2), nullable=True, index=True)
    niche: Mapped[str] = mapped_column(String(80), default="General", index=True)
    creator_type: Mapped[str] = mapped_column(String(24), default="creator")
    avg_views: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    engagement_rate: Mapped[float | None] = mapped_column(Float, nullable=True)  # percent
    last_upload_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    activity: Mapped[str] = mapped_column(String(16), default="unknown")  # active|moderate|dormant|unknown
    website: Mapped[str | None] = mapped_column(Text, nullable=True)
    contact_page: Mapped[str | None] = mapped_column(Text, nullable=True)
    website_status: Mapped[str] = mapped_column(String(24), default="unchecked")
    qualification_score: Mapped[int] = mapped_column(Integer, default=0, index=True)
    score_breakdown: Mapped[dict] = mapped_column(JSON, default=dict)
    verification_status: Mapped[str] = mapped_column(String(16), default="none")  # none|unverified|published|verified
    outreach_status: Mapped[str] = mapped_column(String(16), default="new")  # new|contacted|replied|converted
    campaign_id: Mapped[str | None] = mapped_column(UUID, ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True, index=True)
    job_id: Mapped[str | None] = mapped_column(UUID, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    discovered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)

    contacts: Mapped[list["ContactRoute"]] = relationship(back_populates="creator", cascade="all, delete-orphan", lazy="selectin")
    campaign: Mapped["Campaign | None"] = relationship(lazy="joined")


class ContactRoute(Base):
    __tablename__ = "contact_routes"
    __table_args__ = (UniqueConstraint("creator_id", "kind", "value", name="uq_route"),)
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    creator_id: Mapped[str] = mapped_column(UUID, ForeignKey("creators.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # email|website|contact_page|social
    value: Mapped[str] = mapped_column(Text)
    platform: Mapped[str | None] = mapped_column(String(24), nullable=True)
    source: Mapped[str] = mapped_column(String(32))  # channel_description|website|contact_page|manual
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="published")  # published|unverified|verified
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    website_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    mx_valid: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    discovered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    creator: Mapped[Creator] = relationship(back_populates="contacts")


class DiscoveryJob(Base):
    __tablename__ = "discovery_jobs"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    mode: Mapped[str] = mapped_column(String(24), default="standard")
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)  # queued|running|paused|completed|failed|cancelling|cancelled
    current_operation: Mapped[str] = mapped_column(Text, default="Queued")
    queries_total: Mapped[int] = mapped_column(Integer, default=0)
    queries_done: Mapped[int] = mapped_column(Integer, default=0)
    channels_found: Mapped[int] = mapped_column(Integer, default=0)
    unique_found: Mapped[int] = mapped_column(Integer, default=0)
    duplicates_removed: Mapped[int] = mapped_column(Integer, default=0)
    qualified: Mapped[int] = mapped_column(Integer, default=0)
    rejected: Mapped[int] = mapped_column(Integer, default=0)
    enrich_total: Mapped[int] = mapped_column(Integer, default=0)
    enriched: Mapped[int] = mapped_column(Integer, default=0)
    failed_requests: Mapped[int] = mapped_column(Integer, default=0)
    contact_routes_found: Mapped[int] = mapped_column(Integer, default=0)
    keywords_done: Mapped[int] = mapped_column(Integer, default=0)
    quota_used: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    log: Mapped[list] = mapped_column(JSON, default=list)
    saved_search_id: Mapped[str | None] = mapped_column(UUID, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SavedSearch(Base):
    __tablename__ = "saved_searches"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    name: Mapped[str] = mapped_column(String(160))
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    schedule: Mapped[str] = mapped_column(String(16), default="none")  # none|hourly|daily|weekly
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_job_id: Mapped[str | None] = mapped_column(UUID, nullable=True)
    run_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class SavedView(Base):
    __tablename__ = "saved_views"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    name: Mapped[str] = mapped_column(String(120))
    filters: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class QuotaUsage(Base):
    __tablename__ = "quota_usage"
    __table_args__ = (UniqueConstraint("owner_id", "day", name="uq_quota_day"),)
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID)
    day: Mapped[date] = mapped_column(Date)
    units: Mapped[int] = mapped_column(Integer, default=0)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class ActivityEvent(Base):
    __tablename__ = "activity_events"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    kind: Mapped[str] = mapped_column(String(32))
    message: Mapped[str] = mapped_column(Text)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class ApiKey(Base):
    __tablename__ = "api_keys"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    name: Mapped[str] = mapped_column(String(120))
    prefix: Mapped[str] = mapped_column(String(16))
    key_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class UserSettings(Base):
    __tablename__ = "user_settings"
    owner_id: Mapped[str] = mapped_column(UUID, primary_key=True)
    plan: Mapped[str] = mapped_column(String(16), default="free")
    display_name: Mapped[str] = mapped_column(String(120), default="Operator")
    email: Mapped[str] = mapped_column(String(255), default="")
    n8n_webhook_url: Mapped[str] = mapped_column(Text, default="")
    default_filters: Mapped[dict] = mapped_column(JSON, default=dict)
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class AIProvider(Base):
    """A connected AI provider. The API key is stored Fernet-encrypted and is never returned to the browser."""
    __tablename__ = "ai_providers"
    __table_args__ = (UniqueConstraint("owner_id", "provider", "label", name="uq_ai_provider_label"),)
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    provider: Mapped[str] = mapped_column(String(24))  # openai|anthropic|gemini|openrouter|ollama|custom
    label: Mapped[str] = mapped_column(String(80), default="default")
    base_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_hint: Mapped[str | None] = mapped_column(String(24), nullable=True)
    model: Mapped[str] = mapped_column(String(160), default="")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(16), default="untested")  # untested|connected|error|disabled
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class AITaskAssignment(Base):
    __tablename__ = "ai_task_assignments"
    __table_args__ = (UniqueConstraint("owner_id", "task", name="uq_ai_task"),)
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    task: Mapped[str] = mapped_column(String(40))
    provider_id: Mapped[str | None] = mapped_column(UUID, ForeignKey("ai_providers.id", ondelete="SET NULL"), nullable=True)
    fallback_provider_id: Mapped[str | None] = mapped_column(UUID, ForeignKey("ai_providers.id", ondelete="SET NULL"), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class AIRequestLog(Base):
    __tablename__ = "ai_request_logs"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    task: Mapped[str] = mapped_column(String(40))
    provider: Mapped[str] = mapped_column(String(24))
    model: Mapped[str] = mapped_column(String(160), default="")
    ok: Mapped[bool] = mapped_column(Boolean, default=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)  # estimate; null when the model is not in the price table
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class Subscription(Base):
    """Billing state. Written ONLY from verified Stripe webhooks (or by the explicit local test override)."""
    __tablename__ = "subscriptions"
    owner_id: Mapped[str] = mapped_column(UUID, primary_key=True)
    plan: Mapped[str] = mapped_column(String(16), default="free")
    interval: Mapped[str] = mapped_column(String(8), default="monthly")
    status: Mapped[str] = mapped_column(String(24), default="none")  # none|active|trialing|past_due|canceled|unpaid
    stripe_customer_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_payment_status: Mapped[str | None] = mapped_column(String(24), nullable=True)  # paid|failed|refunded
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class StripeEvent(Base):
    """Webhook idempotency + audit trail."""
    __tablename__ = "stripe_events"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    type: Mapped[str] = mapped_column(String(80))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Review(Base):
    """A customer review. Nothing is shown publicly until an operator approves it (status = approved)."""
    __tablename__ = "reviews"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(120))
    company: Mapped[str | None] = mapped_column(String(160), nullable=True)
    role: Mapped[str | None] = mapped_column(String(120), nullable=True)
    rating: Mapped[int] = mapped_column(Integer)  # 1-5
    body: Mapped[str] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)  # kept private, never shown
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)  # pending|approved|rejected
    verified: Mapped[bool] = mapped_column(Boolean, default=False)  # set by an operator only, after checking the customer
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)  # only with the customer's permission
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

"""Relational schema. Mirrors supabase/migrations/001_init.sql (keep in sync)."""
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (JSON, BigInteger, Boolean, Date, DateTime, Float, ForeignKey, LargeBinary,
                        Integer, String, Text, UniqueConstraint, Uuid)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def uid() -> str:
    return str(uuid.uuid4())


def is_uuid(value: str | None) -> bool:
    """True if value can be compared with a UUID column (Postgres rejects anything else with an error)."""
    try:
        uuid.UUID(str(value))
        return True
    except ValueError:
        return False


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


# ---------------------------------------------------------------------------------------------------------------
# Business infrastructure: accounts, support, chatbot, refunds, email, audit and error logs.
# Mirrors supabase/migrations/004_business.sql (keep in sync).
# ---------------------------------------------------------------------------------------------------------------

class UserAccount(Base):
    """One row per signed-in user, created on first authenticated request. Holds status and staff role."""
    __tablename__ = "user_accounts"
    owner_id: Mapped[str] = mapped_column(UUID, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), default="", index=True)
    full_name: Mapped[str] = mapped_column(String(160), default="")
    status: Mapped[str] = mapped_column(String(16), default="active", index=True)  # active|suspended
    role: Mapped[str] = mapped_column(String(16), default="customer")  # customer|support|admin
    status_reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    last_login_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class Payment(Base):
    """A paid Stripe invoice, recorded from verified webhooks. Used for revenue reporting and refund review."""
    __tablename__ = "payments"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)  # Stripe invoice id
    owner_id: Mapped[str | None] = mapped_column(UUID, nullable=True, index=True)
    amount: Mapped[int] = mapped_column(Integer, default=0)  # minor units (pence)
    currency: Mapped[str] = mapped_column(String(8), default="gbp")
    charge_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    payment_intent_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    refunded_amount: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class KnowledgeArticle(Base):
    __tablename__ = "knowledge_articles"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    title: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(40), default="faq", index=True)  # company|product|pricing|faq|policy|tutorial|support
    body: Mapped[str] = mapped_column(Text)
    published: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class ChatConversation(Base):
    __tablename__ = "chat_conversations"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str | None] = mapped_column(UUID, nullable=True, index=True)  # null for visitors
    visitor_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)  # open|escalated|closed
    escalated: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    conversation_id: Mapped[str] = mapped_column(UUID, ForeignKey("chat_conversations.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))  # user|assistant
    content: Mapped[str] = mapped_column(Text)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)  # answered, source, tokens, blocked_tools
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class SupportTicket(Base):
    __tablename__ = "support_tickets"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    ref: Mapped[str] = mapped_column(String(16), unique=True, index=True)  # TL-XXXXXX, shown to the customer
    owner_id: Mapped[str | None] = mapped_column(UUID, nullable=True, index=True)
    email: Mapped[str] = mapped_column(String(255), default="")
    name: Mapped[str] = mapped_column(String(160), default="")
    conversation_id: Mapped[str | None] = mapped_column(UUID, nullable=True)
    category: Mapped[str] = mapped_column(String(24), default="general", index=True)  # general|technical|billing|refund|cancellation|account
    subject: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="open", index=True)  # open|in_progress|waiting_customer|resolved|closed
    assigned_to: Mapped[str | None] = mapped_column(UUID, nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(16), default="web")  # chatbot|web|admin
    resolution: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TicketMessage(Base):
    __tablename__ = "ticket_messages"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    ticket_id: Mapped[str] = mapped_column(UUID, ForeignKey("support_tickets.id", ondelete="CASCADE"), index=True)
    author_type: Mapped[str] = mapped_column(String(16))  # customer|staff
    author_id: Mapped[str | None] = mapped_column(UUID, nullable=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class RefundRequest(Base):
    """A customer's request for a refund. Only staff can decide it; only an admin can execute a refund."""
    __tablename__ = "refund_requests"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    ticket_id: Mapped[str] = mapped_column(UUID, ForeignKey("support_tickets.id", ondelete="CASCADE"), index=True)
    owner_id: Mapped[str | None] = mapped_column(UUID, nullable=True, index=True)
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)  # pending|approved|rejected|refunded
    decided_by: Mapped[str | None] = mapped_column(UUID, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision_note: Mapped[str] = mapped_column(Text, default="")
    payment_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    refund_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    refund_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    actor_id: Mapped[str | None] = mapped_column(UUID, nullable=True, index=True)
    actor_type: Mapped[str] = mapped_column(String(16))  # staff|system|chatbot|customer
    action: Mapped[str] = mapped_column(String(64), index=True)
    target_type: Mapped[str] = mapped_column(String(32), default="")
    target_id: Mapped[str] = mapped_column(String(80), default="")
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class EmailOutbox(Base):
    """Every transactional email. dedupe_key makes each notification send at most once."""
    __tablename__ = "email_outbox"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    dedupe_key: Mapped[str] = mapped_column(String(160), unique=True)
    to_email: Mapped[str] = mapped_column(String(255))
    template: Mapped[str] = mapped_column(String(48), index=True)
    subject: Mapped[str] = mapped_column(String(200))
    html: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="queued", index=True)  # queued|sent|failed|not_configured
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str] = mapped_column(Text, default="")
    provider_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ErrorLog(Base):
    __tablename__ = "error_logs"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    source: Mapped[str] = mapped_column(String(32), index=True)  # api|webhook|email|job|chatbot|frontend
    path: Mapped[str] = mapped_column(String(300), default="")
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


# ---------------------------------------------------------------------------------------------------------------
# Growth Assistant, Creative Studio and outreach. Mirrors supabase/migrations/005_growth.sql (keep in sync).
# ---------------------------------------------------------------------------------------------------------------

class GrowthSession(Base):
    """One run of the Growth Assistant wizard. Customers can leave and resume."""
    __tablename__ = "growth_sessions"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    step: Mapped[int] = mapped_column(Integer, default=1)
    description: Mapped[str] = mapped_column(Text, default="")
    business: Mapped[dict] = mapped_column(JSON, default=dict)  # interpreted, customer-editable summary
    discovery: Mapped[dict] = mapped_column(JSON, default=dict)  # {status, stages[], sources[], totals, error}
    enrichment: Mapped[dict] = mapped_column(JSON, default=dict)  # {status, done, total, credits_used, error}
    document_id: Mapped[str | None] = mapped_column(UUID, nullable=True)
    campaign_id: Mapped[str | None] = mapped_column(UUID, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Prospect(Base):
    __tablename__ = "prospects"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    session_id: Mapped[str | None] = mapped_column(UUID, ForeignKey("growth_sessions.id", ondelete="SET NULL"), nullable=True, index=True)
    dedupe_key: Mapped[str] = mapped_column(String(200))
    name: Mapped[str] = mapped_column(String(300))
    website: Mapped[str | None] = mapped_column(Text, nullable=True)
    domain: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    platform: Mapped[str] = mapped_column(String(32), default="web")
    sources: Mapped[list] = mapped_column(JSON, default=list)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str] = mapped_column(Text, default="")
    industry: Mapped[str] = mapped_column(String(120), default="")
    location: Mapped[str] = mapped_column(String(120), default="")
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    audience_size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    score: Mapped[int] = mapped_column(Integer, default=0, index=True)
    score_breakdown: Mapped[dict] = mapped_column(JSON, default=dict)  # {relevance:{points,max,evidence,basis}, ...}
    classification: Mapped[str] = mapped_column(String(24), default="low")  # excellent|good|low
    selected: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    saved: Mapped[bool] = mapped_column(Boolean, default=False)
    removed: Mapped[bool] = mapped_column(Boolean, default=False)
    enrichment_status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|done|failed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class ProspectContact(Base):
    __tablename__ = "prospect_contacts"
    __table_args__ = (UniqueConstraint("prospect_id", "email", name="uq_prospect_contact_email"),)
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    prospect_id: Mapped[str] = mapped_column(UUID, ForeignKey("prospects.id", ondelete="CASCADE"), index=True)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    email: Mapped[str] = mapped_column(String(255))
    first_name: Mapped[str] = mapped_column(String(120), default="")
    last_name: Mapped[str] = mapped_column(String(120), default="")
    position: Mapped[str] = mapped_column(String(160), default="")
    status: Mapped[str] = mapped_column(String(16), default="unverified")  # verified|risky|unverified|not_found
    personal: Mapped[bool] = mapped_column(Boolean, default=False)  # free-mail address -> treated as an individual under PECR
    source: Mapped[str] = mapped_column(String(32))  # website|contact_page|snov
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class EmailDocument(Base):
    """The Creative Studio document. One JSON model shared by Easy and Pro editors; HTML is generated from it."""
    __tablename__ = "email_documents"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    name: Mapped[str] = mapped_column(String(200), default="Untitled email")
    subject: Mapped[str] = mapped_column(String(300), default="")
    preheader: Mapped[str] = mapped_column(String(300), default="")
    doc: Mapped[dict] = mapped_column(JSON, default=dict)
    editor_mode: Mapped[str] = mapped_column(String(8), default="easy")
    version: Mapped[int] = mapped_column(Integer, default=1)
    html: Mapped[str] = mapped_column(Text, default="")
    text: Mapped[str] = mapped_column(Text, default="")
    last_check: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now, index=True)


class EmailDocumentVersion(Base):
    __tablename__ = "email_document_versions"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    document_id: Mapped[str] = mapped_column(UUID, ForeignKey("email_documents.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    subject: Mapped[str] = mapped_column(String(300), default="")
    doc: Mapped[dict] = mapped_column(JSON, default=dict)
    note: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class EmailTemplate(Base):
    __tablename__ = "email_templates"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str | None] = mapped_column(UUID, nullable=True, index=True)  # null = built-in
    category: Mapped[str] = mapped_column(String(40), index=True)
    name: Mapped[str] = mapped_column(String(160))
    subject: Mapped[str] = mapped_column(String(300), default="")
    doc: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class BrandKit(Base):
    __tablename__ = "brand_kits"
    owner_id: Mapped[str] = mapped_column(UUID, primary_key=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class EmailAsset(Base):
    """Uploaded email images, served from /api/assets/{id} so emails reference a hosted https URL."""
    __tablename__ = "email_assets"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    filename: Mapped[str] = mapped_column(String(200))
    content_type: Mapped[str] = mapped_column(String(40))
    size: Mapped[int] = mapped_column(Integer)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class OutreachCampaign(Base):
    __tablename__ = "outreach_campaigns"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    session_id: Mapped[str | None] = mapped_column(UUID, nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    document_id: Mapped[str] = mapped_column(UUID, ForeignKey("email_documents.id", ondelete="RESTRICT"))
    document_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="draft", index=True)  # draft|approved|launching|launched|failed
    approval: Mapped[dict] = mapped_column(JSON, default=dict)  # checklist, approved_by, approved_at, check scores
    provider: Mapped[str] = mapped_column(String(16), default="snov")
    provider_ref: Mapped[dict] = mapped_column(JSON, default=dict)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)  # provider metrics with fetched_at
    error: Mapped[str] = mapped_column(Text, default="")
    launched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class CampaignRecipient(Base):
    __tablename__ = "campaign_recipients"
    __table_args__ = (UniqueConstraint("campaign_id", "email", name="uq_campaign_recipient"),)
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    campaign_id: Mapped[str] = mapped_column(UUID, ForeignKey("outreach_campaigns.id", ondelete="CASCADE"), index=True)
    prospect_id: Mapped[str | None] = mapped_column(UUID, nullable=True)
    email: Mapped[str] = mapped_column(String(255))
    eligibility: Mapped[str] = mapped_column(String(16), default="eligible")  # eligible|suppressed|needs_consent|unverified
    reason: Mapped[str] = mapped_column(Text, default="")
    provider_status: Mapped[str] = mapped_column(String(24), default="")
    variables: Mapped[dict] = mapped_column(JSON, default=dict)


class Suppression(Base):
    __tablename__ = "suppressions"
    __table_args__ = (UniqueConstraint("owner_id", "email", name="uq_suppression"),)
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    email: Mapped[str] = mapped_column(String(255))
    reason: Mapped[str] = mapped_column(String(32))  # unsubscribe|bounce|manual|complaint
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class OutreachReply(Base):
    __tablename__ = "outreach_replies"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    campaign_id: Mapped[str | None] = mapped_column(UUID, nullable=True, index=True)
    external_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    from_email: Mapped[str] = mapped_column(String(255))
    subject: Mapped[str] = mapped_column(String(300), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    classification: Mapped[str] = mapped_column(String(24), default="other", index=True)
    classified_by: Mapped[str] = mapped_column(String(8), default="rules")  # rules|ai|customer
    suggested_response: Mapped[str] = mapped_column(Text, default="")
    response_status: Mapped[str] = mapped_column(String(16), default="none")  # none|draft|approved
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class BusinessResult(Base):
    """Customer-entered outcomes: meetings, enquiries and sales. Never inferred from replies."""
    __tablename__ = "business_results"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    campaign_id: Mapped[str | None] = mapped_column(UUID, nullable=True)
    kind: Mapped[str] = mapped_column(String(16))  # meeting|enquiry|sale
    amount_pence: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str] = mapped_column(Text, default="")
    occurred_on: Mapped[date] = mapped_column(Date, default=lambda: datetime.now(timezone.utc).date())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ProviderConnection(Base):
    """A customer's own connection to a sending provider (Snov.io). Secrets are encrypted at rest."""
    __tablename__ = "provider_connections"
    __table_args__ = (UniqueConstraint("owner_id", "provider", name="uq_provider_connection"),)
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    provider: Mapped[str] = mapped_column(String(16))
    client_id_enc: Mapped[str] = mapped_column(Text)
    client_secret_enc: Mapped[str] = mapped_column(Text)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)  # list id, campaign id, sender domain, webhook token
    status: Mapped[str] = mapped_column(String(16), default="unchecked")
    last_error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class UsageEvent(Base):
    """Metered usage for credits and for the owner's cost/margin reporting."""
    __tablename__ = "usage_events"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(UUID, index=True)
    kind: Mapped[str] = mapped_column(String(24), index=True)  # discovery|enrichment|verification|campaign
    units: Mapped[int] = mapped_column(Integer, default=1)
    provider: Mapped[str] = mapped_column(String(24), default="")
    provider_cost_pence: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class PlanConfig(Base):
    """Admin overrides for plan prices and allowances (merged over DEFAULT_PLANS)."""
    __tablename__ = "plan_configs"
    plan_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)

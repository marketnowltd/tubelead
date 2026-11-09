from typing import Literal

from pydantic import BaseModel, Field, field_validator

Mode = Literal["standard", "deep", "multi_niche", "worldwide", "repeat"]


class JobParams(BaseModel):
    keywords: list[str] = Field(default_factory=list, max_length=20)
    niches: list[str] = Field(default_factory=list, max_length=12)
    countries: list[str] = Field(default_factory=list, max_length=60)
    region: str | None = None
    mode: Mode = "standard"
    # channels: search channels directly | videos: find creators via videos on the topic | topics: expand each niche into sub-topics
    source: Literal["channels", "videos", "topics"] = "channels"
    seed_videos: list[str] = Field(default_factory=list, max_length=10)  # video URLs/IDs: find creators similar to them
    min_subscribers: int = Field(1000, ge=0)
    max_subscribers: int | None = Field(500_000, ge=0)  # big-brand channels are usually far above this
    min_engagement: float = Field(0.0, ge=0, le=100)
    creator_type: Literal["any", "creator", "brand"] = "creator"  # exclude brands by default
    activity: Literal["any", "active", "recent", "dormant"] = "any"  # recent = active or moderate
    limit: int = Field(25, ge=1, le=500)
    require_email: bool = True  # leads are creators with a publicly published email
    require_website: bool = False
    max_quota_units: int = Field(3000, ge=100, le=10_000)  # about 30 searches; raise it for larger lists

    @field_validator("keywords", "niches", mode="before")
    @classmethod
    def _clean_list(cls, v):
        return [s.strip() for s in (v or []) if isinstance(s, str) and s.strip()]

    @field_validator("seed_videos", mode="before")
    @classmethod
    def _clean_videos(cls, v):
        import re
        out = []
        for s in (v or []):
            if not isinstance(s, str):
                continue
            m = re.search(r"(?:v=|youtu\.be/|shorts/|embed/)([\w-]{11})", s) or re.fullmatch(r"\s*([\w-]{11})\s*", s)
            if m and m.group(1) not in out:
                out.append(m.group(1))
        return out

    @field_validator("countries", mode="before")
    @classmethod
    def _clean_countries(cls, v):
        return [s.strip().upper() for s in (v or []) if isinstance(s, str) and len(s.strip()) == 2]

    def model_post_init(self, _ctx) -> None:
        if not self.keywords and not self.niches and not self.seed_videos:
            raise ValueError("Provide at least one keyword, niche or seed video")
        if self.max_subscribers is not None and self.max_subscribers < self.min_subscribers:
            if "max_subscribers" in self.model_fields_set:
                raise ValueError("max_subscribers must be >= min_subscribers")
            self.max_subscribers = None  # the default ceiling gives way to an explicit minimum


class JobCreate(BaseModel):
    params: JobParams
    save_as: str | None = Field(None, max_length=160)
    schedule: Literal["none", "hourly", "daily", "weekly"] = "none"


class CampaignIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = ""
    status: Literal["draft", "active", "paused", "completed"] = "draft"
    target_niche: str | None = None
    target_countries: list[str] = Field(default_factory=list)


class SavedSearchIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    params: JobParams
    schedule: Literal["none", "hourly", "daily", "weekly"] = "none"


class SavedViewIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    filters: dict = Field(default_factory=dict)


class CreatorPatch(BaseModel):
    campaign_id: str | None = None
    outreach_status: Literal["new", "contacted", "replied", "converted"] | None = None
    niche: str | None = None


class BulkAction(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=1000)
    action: Literal["assign_campaign", "unassign_campaign", "set_outreach", "delete"]
    campaign_id: str | None = None
    outreach_status: Literal["new", "contacted", "replied", "converted"] | None = None


class ManualContact(BaseModel):
    kind: Literal["email", "website", "contact_page", "social"]
    value: str = Field(min_length=3, max_length=500)


class SettingsIn(BaseModel):
    display_name: str | None = Field(None, max_length=120)
    email: str | None = Field(None, max_length=255)
    default_filters: dict | None = None
    preferences: dict | None = None


class WebhookIn(BaseModel):
    url: str = Field(default="", max_length=500)


class ApiKeyIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ProviderIn(BaseModel):
    provider: Literal["openai", "anthropic", "gemini", "openrouter", "ollama", "custom"]
    label: str = Field("default", min_length=1, max_length=80)
    base_url: str | None = Field(None, max_length=300)
    api_key: str | None = Field(None, max_length=400)
    model: str = Field("", max_length=160)
    make_default: bool = False


class ProviderPatch(BaseModel):
    label: str | None = Field(None, min_length=1, max_length=80)
    base_url: str | None = Field(None, max_length=300)
    api_key: str | None = Field(None, max_length=400)  # rotation
    model: str | None = Field(None, max_length=160)
    is_default: bool | None = None
    disabled: bool | None = None


class TaskAssignIn(BaseModel):
    provider_id: str | None = None
    fallback_provider_id: str | None = None
    enabled: bool = True


class AssistantIn(BaseModel):
    text: str = Field(min_length=3, max_length=600)


class KeywordsIn(BaseModel):
    topic: str = Field(min_length=2, max_length=120)

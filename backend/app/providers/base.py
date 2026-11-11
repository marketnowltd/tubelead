from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Protocol


NOT_CONFIGURED = "not_configured"
OK = "ok"
FAILED = "failed"


@dataclass
class Lead:
    """Common output for every provider. Missing values stay None; nothing is guessed."""
    provider: str
    creator_name: str
    source_url: str | None
    youtube_url: str | None = None
    youtube_channel_id: str | None = None
    snippet: str | None = None
    verification_status: str = "unverified"  # verified only when the platform's own API returned the account record
    evidence: list[str] = field(default_factory=list)
    collected_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ProviderResult:
    provider: str
    status: str  # ok | not_configured | failed
    message: str
    leads: list[Lead] = field(default_factory=list)

    def summary(self) -> dict:
        return {"provider": self.provider, "status": self.status, "message": self.message, "count": len(self.leads)}


class Provider(Protocol):
    name: str
    label: str
    required_settings: tuple[str, ...]

    def configured(self) -> bool: ...
    async def search(self, query: str, limit: int) -> ProviderResult: ...

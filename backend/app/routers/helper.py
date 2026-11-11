"""The TubeLead Helper (the astronaut assistant): page knowledge for the current page, and onboarding progress.
Conversation goes through /api/support/chat with the page context attached, so the same safety rules apply."""
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import get_optional_owner, get_owner
from ..db import get_db
from ..services import helper_guide as G, limits
from .system import get_user_settings

router = APIRouter(prefix="/api/helper", tags=["helper"])


FALLBACK = {"key": None, "title": "TubeLead", "greeting": "Hi! I'm your TubeLead helper. Ask me anything about TubeLead.", "purpose": G.GENERAL,
            "can_do": [], "next_steps": [], "suggestions": ["How do I get started?", "What does TubeLead do?"], "tour": None, "tour_title": ""}


def _out(p: G.Page | None) -> dict:
    if not p:
        return dict(FALLBACK)
    return {"key": p.key, "title": p.title, "greeting": p.greeting, "purpose": p.purpose, "can_do": list(p.can_do), "next_steps": list(p.next_steps),
            "suggestions": list(p.suggestions), "tour": p.tour, "tour_title": p.tour_title}


@router.get("/pages")
def pages(response: Response):
    """Everything the helper says about every page, loaded once per browser session so moving between pages costs
    no requests (the API rate limit counts every request)."""
    response.headers["Cache-Control"] = "public, max-age=300"
    return {"pages": {k: _out(p) for k, p in G.PAGES.items()}, "fallback": FALLBACK}


@router.get("/page")
def page(request: Request, path: str = "/", owner: str | None = Depends(get_optional_owner)):
    limits.check(f"helper-page:{owner or limits.client_ip(request)}", 240, 600, "Too many requests. Please wait a moment.")
    return {**_out(G.page_for(path)), "signed_in": bool(owner)}


class Progress(BaseModel):
    intro_done: bool = False
    tips_off: bool = False
    pages_seen: list[str] = Field(default_factory=list, max_length=60)
    tours_done: list[str] = Field(default_factory=list, max_length=60)
    tours_skipped: list[str] = Field(default_factory=list, max_length=60)


def _clean(p: Progress) -> dict:
    keep = lambda xs: sorted({x[:60] for x in xs if isinstance(x, str) and x})[:60]  # noqa: E731
    return {"intro_done": p.intro_done, "tips_off": p.tips_off, "pages_seen": keep(p.pages_seen), "tours_done": keep(p.tours_done),
            "tours_skipped": keep(p.tours_skipped)}


@router.get("/progress")
def get_progress(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    prefs = get_user_settings(db, owner).preferences or {}
    return _clean(Progress(**{k: v for k, v in (prefs.get("helper") or {}).items() if k in Progress.model_fields}))


@router.put("/progress")
def put_progress(body: Progress, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    us = get_user_settings(db, owner)
    us.preferences = {**(us.preferences or {}), "helper": _clean(body)}
    db.commit()
    return us.preferences["helper"]

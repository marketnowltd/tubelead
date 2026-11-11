"""POST /api/search-everywhere: one request, every configured source. Authenticated; counts as a normal search."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import get_owner
from ..db import get_db
from ..services import entitlements as ent
from ..services.search_everywhere import PROVIDERS, search_everywhere

router = APIRouter(prefix="/api", tags=["search"])


class SearchIn(BaseModel):
    query: str = Field(min_length=3, max_length=300)
    limit: int = Field(20, ge=1, le=100)  # how many people with an email to return


@router.get("/search-everywhere/providers")
def provider_status(owner: str = Depends(get_owner)):
    return [{"name": p.name, "label": p.label, "configured": p.configured(), "requires": list(p.required_settings)} for p in PROVIDERS]


@router.post("/search-everywhere")
async def run(body: SearchIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    ent.require_feature(db, owner, "multi_source")  # Pro plan and above
    if not any(p.configured() for p in PROVIDERS):
        raise HTTPException(503, {"code": "no_providers", "message": "No discovery source is configured yet. Add a provider key on the server."})
    return await search_everywhere(body.query.strip(), body.limit)

import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ["YOUTUBE_API_KEY"] = "test-key"
os.environ["SCHEDULER_ENABLED"] = "false"
os.environ["AUTH_MODE"] = "dev"
os.environ["RATE_LIMIT_PER_MINUTE"] = "100000"

import pytest  # noqa: E402
from sqlalchemy import text  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    if engine.dialect.name == "postgresql":
        # schema comes from supabase/migrations/001_init.sql — tests prove it matches the models
        with engine.begin() as c:
            c.execute(text("truncate table " + ",".join(Base.metadata.tables) + " restart identity cascade"))
    else:
        Base.metadata.drop_all(engine)
        Base.metadata.create_all(engine)
    yield


@pytest.fixture(autouse=True)
def no_email_lookups(monkeypatch):
    """Search Everywhere's email step reads real websites; tests that cover it turn it on with a fake web."""
    from app.services import search_everywhere as se
    monkeypatch.setattr(se, "FIND_EMAILS", False)


@pytest.fixture(autouse=True)
def elite_by_default():
    from app.config import get_settings as _gs
    _gs().dev_owner_is_operator = False  # tests exercise the customer plan rules

    """Most tests exercise features regardless of plan; entitlement tests set plan_override = '' to use real plans."""
    from app.config import get_settings
    st = get_settings()
    old = st.plan_override
    st.plan_override = "elite"
    yield
    st.plan_override = old


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def reset_support_limits():
    from app.services import limits
    limits.reset()
    yield

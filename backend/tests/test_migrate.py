"""The API applies its own database migrations at start-up (PostgreSQL / Supabase)."""
import os
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text

from app import migrate

ROOT = Path(__file__).resolve().parents[2]


def test_shipped_migrations_match_supabase_folder():
    src = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
    shipped = sorted(migrate.MIGRATIONS_DIR.glob("*.sql"))
    assert [f.name for f in src] == [f.name for f in shipped], "copy supabase/migrations/*.sql into backend/app/migrations/"
    for a, b in zip(src, shipped):
        assert a.read_bytes() == b.read_bytes(), f"{b.name} differs from supabase/migrations/{a.name}"


def test_sqlite_is_left_alone():
    assert migrate.run_migrations(create_engine("sqlite://")) == []


PG = os.environ.get("TEST_DATABASE_URL", "")


@pytest.mark.skipif(not PG.startswith("postgresql"), reason="needs PostgreSQL (TEST_DATABASE_URL)")
def test_fresh_database_is_created_and_second_start_does_nothing():
    admin = create_engine(PG.rsplit("/", 1)[0] + "/postgres", isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text("DROP DATABASE IF EXISTS tl_mig_test"))
        c.execute(text("CREATE DATABASE tl_mig_test"))
    eng = create_engine(PG.rsplit("/", 1)[0] + "/tl_mig_test")
    try:
        with eng.begin() as c:  # what every Supabase project already has
            c.execute(text("CREATE SCHEMA IF NOT EXISTS auth"))
            c.execute(text("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'select null::uuid'"))
        done = migrate.run_migrations(eng)
        assert done == [f.name for f in sorted(migrate.MIGRATIONS_DIR.glob("*.sql"))]
        tables = set(inspect(eng).get_table_names())
        assert {"creators", "user_settings", "plan_configs", "sending_accounts", "tubelead_migrations"} <= tables
        assert migrate.run_migrations(eng) == []  # second start: nothing to do
        # a database set up by hand (tables present, no record of it) is brought up to date without errors
        with eng.begin() as c:
            c.execute(text("DELETE FROM tubelead_migrations"))
        assert len(migrate.run_migrations(eng)) == len(done)
    finally:
        eng.dispose()
        with admin.connect() as c:
            c.execute(text("DROP DATABASE IF EXISTS tl_mig_test"))

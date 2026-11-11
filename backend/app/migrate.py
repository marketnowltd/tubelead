"""Applies the database migrations automatically when the API starts (PostgreSQL / Supabase only).

The SQL files in app/migrations/ are copies of supabase/migrations/ (a test keeps them identical), shipped inside the
API image. Each file is applied once and recorded in `tubelead_migrations`; every file is written to be safe to run
again, so a database that was set up by hand is simply brought up to date. A failing file is logged and the API
still starts. Turn off with AUTO_MIGRATE=false."""
from __future__ import annotations

import logging
from pathlib import Path

from sqlalchemy.engine import Engine

log = logging.getLogger("tubelead.migrate")
MIGRATIONS_DIR = Path(__file__).parent / "migrations"
LOCK_ID = 7_412_093  # pg advisory lock, so two starting instances never migrate at the same time


def run_migrations(engine: Engine) -> list[str]:
    if engine.dialect.name != "postgresql":
        return []
    applied: list[str] = []
    with engine.connect() as conn:
        conn.exec_driver_sql("SELECT pg_advisory_lock(%s)", (LOCK_ID,))
        try:
            conn.exec_driver_sql("CREATE TABLE IF NOT EXISTS tubelead_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())")
            conn.exec_driver_sql("ALTER TABLE tubelead_migrations ENABLE ROW LEVEL SECURITY")  # not readable through Supabase's public API
            conn.commit()
            done = {r[0] for r in conn.exec_driver_sql("SELECT name FROM tubelead_migrations")}
            for f in sorted(MIGRATIONS_DIR.glob("*.sql")):
                if f.name in done:
                    continue
                try:
                    with conn.connection.dbapi_connection.cursor() as cur:  # no parameters: "%" in the SQL is left alone
                        cur.execute(f.read_text(encoding="utf-8"))
                    conn.exec_driver_sql("INSERT INTO tubelead_migrations (name) VALUES (%s) ON CONFLICT DO NOTHING", (f.name,))
                    conn.commit()
                    applied.append(f.name)
                    log.info("Applied database migration %s", f.name)
                except Exception:  # noqa: BLE001 - report it and keep the API running
                    conn.rollback()
                    log.exception("Database migration %s failed", f.name)
                    break  # later files may depend on this one
        finally:
            conn.exec_driver_sql("SELECT pg_advisory_unlock(%s)", (LOCK_ID,))
            conn.commit()
    return applied

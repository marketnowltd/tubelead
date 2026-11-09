import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .db import Base, engine, ensure_sqlite_columns
from .ratelimit import RateLimitMiddleware
from .routers import account, ai, analytics, billing, contacts, creators, jobs, public, system, workspace
from .services import jobs as job_svc
from .services.youtube import YouTubeError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
# httpx logs full request URLs at INFO, which would write the YouTube API key (a query param) to logs.
for _noisy in ("httpx", "httpcore"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)
log = logging.getLogger("tubelead")


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    if engine.dialect.name == "sqlite":
        Base.metadata.create_all(engine)
        ensure_sqlite_columns()  # Postgres/Supabase schema is managed by supabase/migrations
    n = job_svc.recover_orphans()
    if n:
        log.warning("Marked %d orphaned job(s) as failed", n)
    sched = None
    if s.scheduler_enabled:
        sched = job_svc.Scheduler()
        sched.start()
    log.info("TubeLead API ready | db=%s auth=%s youtube=%s", engine.dialect.name, s.auth_mode, "configured" if s.youtube_api_key else "NOT configured")
    yield
    if sched:
        sched.stop()


app = FastAPI(title="TubeLead API", version="1.0.0", lifespan=lifespan)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_list, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(YouTubeError)
async def yt_handler(_: Request, exc: YouTubeError):
    return JSONResponse({"detail": {"code": exc.code, "message": str(exc)}}, status_code=exc.status)


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    log.exception("Unhandled error")
    return JSONResponse({"detail": {"code": "internal_error", "message": "Something went wrong on the server."}}, status_code=500)


for r in (system, jobs, creators, contacts, workspace, analytics, account, ai, billing, public):
    app.include_router(r.router)

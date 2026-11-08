"""Fixed-window rate limiter. Redis-backed when REDIS_URL is set (shared across workers),
otherwise in-process."""
import threading
import time

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import get_settings


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        s = get_settings()
        self.limit = s.rate_limit_per_minute
        self.redis = None
        if s.redis_url:
            try:
                import redis
                self.redis = redis.Redis.from_url(s.redis_url, socket_timeout=1, socket_connect_timeout=1)
                self.redis.ping()
            except Exception:  # noqa: BLE001 - degrade to in-process
                self.redis = None
        self._hits: dict[str, tuple[int, int]] = {}
        self._lock = threading.Lock()

    def _count(self, key: str) -> int:
        window = int(time.time() // 60)
        if self.redis is not None:
            try:
                k = f"rl:{key}:{window}"
                pipe = self.redis.pipeline()
                pipe.incr(k)
                pipe.expire(k, 70)
                return int(pipe.execute()[0])
            except Exception:  # noqa: BLE001
                pass
        with self._lock:
            w, n = self._hits.get(key, (window, 0))
            n = n + 1 if w == window else 1
            self._hits[key] = (window, n)
            if len(self._hits) > 20_000:
                self._hits = {k: v for k, v in self._hits.items() if v[0] == window}
            return n

    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/api/health":
            return await call_next(request)
        fwd = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        key = request.headers.get("x-api-key", "")[:12] or fwd or (request.client.host if request.client else "anon")
        n = self._count(key)
        if n > self.limit:
            return JSONResponse({"detail": {"code": "rate_limited", "message": "Too many requests. Slow down."}}, status_code=429,
                                headers={"Retry-After": "60"})
        resp = await call_next(request)
        resp.headers["X-RateLimit-Limit"] = str(self.limit)
        resp.headers["X-RateLimit-Remaining"] = str(max(self.limit - n, 0))
        return resp

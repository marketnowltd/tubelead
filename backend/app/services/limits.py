"""Small sliding-window limits for the public support endpoints, on top of the global rate limiter.
In-process (per worker); the per-email ticket limit is checked in the database so it holds across workers."""
from __future__ import annotations

import threading
import time
from collections import deque

from fastapi import HTTPException, Request

_hits: dict[str, deque] = {}
_lock = threading.Lock()


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return (fwd.split(",")[0].strip() if fwd else "") or (request.client.host if request.client else "unknown")


def check(key: str, limit: int, window_s: int, message: str) -> None:
    now = time.monotonic()
    with _lock:
        q = _hits.setdefault(key, deque())
        while q and now - q[0] > window_s:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(429, {"code": "too_many_requests", "message": message})
        q.append(now)
        if len(_hits) > 50_000:  # bound memory
            for k in list(_hits)[:10_000]:
                _hits.pop(k, None)


def reset() -> None:
    with _lock:
        _hits.clear()

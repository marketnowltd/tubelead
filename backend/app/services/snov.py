"""Snov.io API client.

Endpoint paths below follow Snov.io's published knowledge-base articles (v1 OAuth and list management, v2 async
"start"/"result" pairs). They could not be checked against the live API from the build environment, so they are kept
together here: verify them against https://snov.io/api when credentials are added and adjust in one place.

Two separate uses:
- TubeLead's own account (SNOV_CLIENT_ID/SECRET): enrichment (domain emails) and verification, sold as credits.
- A customer's own account (connected in Integrations): campaign launch, analytics and replies, so emails are sent
  from the customer's own sender identity."""
from __future__ import annotations

import asyncio
import time

import httpx

PATHS = {
    "token": "/v1/oauth/access_token",
    "domain_emails_start": "/v2/domain-search/domain-emails/start",
    "domain_emails_result": "/v2/domain-search/domain-emails/result/{task_hash}",
    "verify_start": "/v2/email-verification/start",
    "verify_result": "/v2/email-verification/result",
    "lists": "/v1/get-user-lists",
    "add_prospect": "/v1/add-prospect-to-list",
    "campaign_analytics": "/v2/statistics/campaign-analytics",
}
VERIFY_MAP = {"valid": "verified", "deliverable": "verified", "unknown": "risky", "catch_all": "risky", "accept_all": "risky", "risky": "risky",
              "unverifiable": "risky", "invalid": "invalid", "not_valid": "invalid", "undeliverable": "invalid"}


class SnovError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


class SnovClient:
    transport: httpx.AsyncBaseTransport | None = None  # tests inject a mock transport
    poll_interval = 2.0

    def __init__(self, client_id: str, client_secret: str, base: str = "https://api.snov.io"):
        self.cid, self.secret, self.base = client_id, client_secret, base.rstrip("/")
        self._token: str | None = None
        self._exp = 0.0

    async def _req(self, method: str, path: str, **kw) -> dict:
        async with httpx.AsyncClient(base_url=self.base, timeout=30, transport=self.transport) as c:
            try:
                r = await c.request(method, path, **kw)
            except httpx.HTTPError as exc:
                raise SnovError(f"Snov.io unreachable: {type(exc).__name__}") from exc
        if r.status_code == 401:
            raise SnovError("Snov.io rejected the credentials.", 401)
        if r.status_code == 402 or r.status_code == 403:
            raise SnovError("Snov.io says the account has no credits or lacks API access for this action.", 402)
        if r.status_code == 429:
            raise SnovError("Snov.io rate limit reached. Try again shortly.", 429)
        if r.status_code >= 400:
            raise SnovError(f"Snov.io returned {r.status_code}.")
        try:
            return r.json()
        except ValueError as exc:
            raise SnovError("Snov.io returned an unreadable response.") from exc

    async def token(self) -> str:
        if self._token and time.time() < self._exp - 60:
            return self._token
        d = await self._req("POST", PATHS["token"], data={"grant_type": "client_credentials", "client_id": self.cid, "client_secret": self.secret})
        if not d.get("access_token"):
            raise SnovError("Snov.io did not return an access token.", 401)
        self._token, self._exp = d["access_token"], time.time() + int(d.get("expires_in") or 3600)
        return self._token

    async def _auth(self) -> dict:
        return {"Authorization": f"Bearer {await self.token()}"}

    async def _poll(self, path: str, params: dict | None = None, tries: int = 10) -> dict:
        for _ in range(tries):
            d = await self._req("GET", path, params=params or {}, headers=await self._auth())
            if str(d.get("status", "completed")).lower() not in ("in_progress", "pending", "processing"):
                return d
            await asyncio.sleep(self.poll_interval)
        raise SnovError("Snov.io is still processing; try again in a minute.", 504)

    async def domain_emails(self, domain: str, limit: int = 10) -> list[dict]:
        start = await self._req("POST", PATHS["domain_emails_start"], params={"domain": domain}, headers=await self._auth())
        task = ((start.get("meta") or {}).get("task_hash")) or start.get("task_hash") or (start.get("data") or {}).get("task_hash")
        if not task:
            raise SnovError("Snov.io did not start the domain search.")
        res = await self._poll(PATHS["domain_emails_result"].format(task_hash=task))
        out = []
        for row in (res.get("data") or [])[:limit]:
            email = (row.get("email") or "").strip().lower()
            if email and "@" in email:
                out.append({"email": email, "first_name": row.get("first_name") or "", "last_name": row.get("last_name") or "",
                            "position": row.get("position") or ""})
        return out

    async def verify(self, emails: list[str]) -> dict[str, str]:
        if not emails:
            return {}
        start = await self._req("POST", PATHS["verify_start"], data={"emails[]": emails[:10]}, headers=await self._auth())
        task = ((start.get("meta") or {}).get("task_hash")) or start.get("task_hash") or (start.get("data") or {}).get("task_hash")
        if not task:
            raise SnovError("Snov.io did not start verification.")
        res = await self._poll(PATHS["verify_result"], params={"task_hash": task})
        out = {}
        for row in res.get("data") or []:
            email = (row.get("email") or "").lower()
            raw = str(((row.get("result") or {}).get("smtp_status")) or row.get("status") or "unknown").lower()
            out[email] = VERIFY_MAP.get(raw, "risky")
        return out

    async def lists(self) -> list[dict]:
        d = await self._req("GET", PATHS["lists"], headers=await self._auth())
        rows = d if isinstance(d, list) else d.get("data") or []
        return [{"id": str(r.get("id")), "name": r.get("name", "")} for r in rows if r.get("id") is not None]

    async def add_prospect(self, list_id: str, prospect: dict, custom: dict[str, str]) -> dict:
        data = {"listId": list_id, "email": prospect["email"], "firstName": prospect.get("first_name", ""), "lastName": prospect.get("last_name", ""),
                "companyName": prospect.get("company_name", ""), "companySite": prospect.get("website", ""), "updateContact": "1"}
        for k, v in custom.items():
            data[f"customFields[{k}]"] = v
        return await self._req("POST", PATHS["add_prospect"], data=data, headers=await self._auth())

    async def campaign_analytics(self, campaign_id: str, date_from: str, date_to: str) -> dict:
        return await self._req("GET", PATHS["campaign_analytics"], params={"campaign_id": campaign_id, "date_from": date_from, "date_to": date_to},
                               headers=await self._auth())

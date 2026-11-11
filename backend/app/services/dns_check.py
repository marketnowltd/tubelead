"""Sender-domain DNS checks for TubeLead Email Check. Results are 'present', 'missing' or 'unavailable' (DNS lookup
failed); DKIM is looked up on common selectors only, so 'not_found' means "not on the usual selectors"."""
from __future__ import annotations

DKIM_SELECTORS = ("default", "google", "selector1", "selector2", "k1", "k2", "s1", "s2", "mail", "dkim", "smtp", "mx", "snov", "resend")


def _txt(name: str) -> list[str] | None:
    try:
        import dns.exception
        import dns.resolver
    except ImportError:  # pragma: no cover
        return None
    try:
        ans = dns.resolver.resolve(name, "TXT", lifetime=4)
        return [b"".join(r.strings).decode(errors="ignore") for r in ans]
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
        return []
    except Exception:  # noqa: BLE001 - timeouts, no nameservers
        return None


def check(domain: str) -> dict:
    domain = domain.strip().lower().removeprefix("www.")
    out = {}
    spf = _txt(domain)
    out["spf"] = "unavailable" if spf is None else ("present" if any(t.lower().startswith("v=spf1") for t in spf) else "missing")
    dmarc = _txt(f"_dmarc.{domain}")
    out["dmarc"] = "unavailable" if dmarc is None else ("present" if any(t.lower().startswith("v=dmarc1") for t in dmarc) else "missing")
    dkim = "not_found"
    for sel in DKIM_SELECTORS:
        r = _txt(f"{sel}._domainkey.{domain}")
        if r is None:
            dkim = "unavailable"
            break
        if any("p=" in t for t in r):
            dkim = f"present ({sel})"
            break
    out["dkim"] = dkim
    return out

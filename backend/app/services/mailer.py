"""Send customer emails through the CUSTOMER'S OWN email service.

TubeLead never sends a customer's emails through TubeLead's own provider (that is reserved for TubeLead's account
notices). Supported: any SMTP server (Gmail/Google Workspace, Microsoft 365/Outlook, Zoho, cPanel hosts, ...) and the
customer's own SendGrid, Mailgun, Postmark or Resend account.

Every campaign email carries List-Unsubscribe headers (URL and one-click POST) and an unsubscribe link, so recipients
can opt out (UK PECR); opting out adds them to the customer's suppression list."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import ipaddress
import smtplib
import socket
import ssl
from dataclasses import dataclass, field
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid

import httpx

from ..config import get_settings
from ..models import SendingAccount
from . import crypto

PROVIDERS = ("smtp", "sendgrid", "mailgun", "postmark", "resend")
SMTP_PORTS = (25, 465, 587, 2525)
PRESETS = {  # convenience defaults shown in the UI
    "gmail": {"host": "smtp.gmail.com", "port": 587, "security": "starttls", "note": "Use an app password (Google Account > Security > App passwords)."},
    "outlook": {"host": "smtp.office365.com", "port": 587, "security": "starttls", "note": "Your Microsoft 365 admin may need to allow SMTP AUTH for the mailbox."},
    "zoho": {"host": "smtp.zoho.eu", "port": 465, "security": "ssl", "note": "Use smtp.zoho.com outside the EU."},
}
TRANSPORT: httpx.AsyncBaseTransport | None = None  # tests inject a mock transport
SMTP_CLASS = smtplib.SMTP          # tests replace these
SMTP_SSL_CLASS = smtplib.SMTP_SSL


class MailError(Exception):
    pass


@dataclass
class Outgoing:
    to: str
    subject: str
    html: str
    text: str
    headers: dict[str, str] = field(default_factory=dict)


def public_host_ok(host: str) -> bool:
    """SSRF guard: the SMTP host must resolve only to public addresses."""
    try:
        infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        return False
    return bool(infos) and all(ipaddress.ip_address(i[4][0]).is_global for i in infos)


def unsubscribe_token(recipient_id: str) -> str:
    return hmac.new(get_settings().secret_key.encode(), f"unsub:{recipient_id}".encode(), hashlib.sha256).hexdigest()[:32]


def unsubscribe_url(recipient_id: str) -> str:
    s = get_settings()
    base = (s.public_api_url or s.app_base_url).rstrip("/")
    return f"{base}/api/u/{recipient_id}/{unsubscribe_token(recipient_id)}"


def _from(acc: SendingAccount) -> str:
    return formataddr((acc.from_name, acc.from_email)) if acc.from_name else acc.from_email


# ---------------- SMTP
def _smtp_connect(acc: SendingAccount, password: str):
    st = acc.settings or {}
    host, port, security = st.get("host", ""), int(st.get("port") or 587), st.get("security", "starttls")
    if port not in SMTP_PORTS:
        raise MailError(f"Port {port} isn't allowed. Use 465, 587, 2525 or 25.")
    if not public_host_ok(host):
        raise MailError(f"{host} doesn't resolve to a public mail server.")
    try:
        if security == "ssl":
            conn = SMTP_SSL_CLASS(host, port, timeout=20, context=ssl.create_default_context())
        else:
            conn = SMTP_CLASS(host, port, timeout=20)
            conn.ehlo()
            if security == "starttls":
                conn.starttls(context=ssl.create_default_context())
                conn.ehlo()
        if st.get("username"):
            conn.login(st["username"], password)
        return conn
    except smtplib.SMTPAuthenticationError as exc:
        raise MailError("The mail server rejected the username or password. For Gmail and Microsoft 365, use an app password.") from exc
    except (smtplib.SMTPException, OSError) as exc:
        raise MailError(f"Couldn't connect to {host}:{port} ({type(exc).__name__}).") from exc


def _smtp_send(acc: SendingAccount, password: str, msgs: list[Outgoing]) -> list[tuple[str, str | None]]:
    """Returns [(message_id, error_or_None)] in order. One connection for the batch."""
    conn = _smtp_connect(acc, password)
    out = []
    try:
        domain = acc.from_email.rsplit("@", 1)[-1]
        for m in msgs:
            em = EmailMessage()
            em["From"], em["To"], em["Subject"] = _from(acc), m.to, m.subject
            em["Date"], em["Message-ID"] = formatdate(localtime=False), make_msgid(domain=domain)
            if acc.reply_to:
                em["Reply-To"] = acc.reply_to
            for k, v in m.headers.items():
                em[k] = v
            em.set_content(m.text)
            em.add_alternative(m.html, subtype="html")
            try:
                conn.send_message(em)
                out.append((em["Message-ID"], None))
            except smtplib.SMTPRecipientsRefused:
                out.append(("", "The recipient's server refused the address."))
            except smtplib.SMTPException as exc:
                out.append(("", f"Send failed: {type(exc).__name__}"))
    finally:
        try:
            conn.quit()
        except Exception:  # noqa: BLE001
            pass
    return out


# ---------------- API providers (the customer's own keys)
def _api_request(acc: SendingAccount, key: str, m: Outgoing) -> tuple[str, str, dict]:
    p, st = acc.provider, acc.settings or {}
    if p == "resend":
        body = {"from": _from(acc), "to": [m.to], "subject": m.subject, "html": m.html, "text": m.text, "headers": m.headers}
        if acc.reply_to:
            body["reply_to"] = acc.reply_to
        return "https://api.resend.com/emails", "json", {"json": body, "headers": {"Authorization": f"Bearer {key}"}}
    if p == "sendgrid":
        body = {"personalizations": [{"to": [{"email": m.to}]}], "from": {"email": acc.from_email, **({"name": acc.from_name} if acc.from_name else {})},
                "subject": m.subject, "content": [{"type": "text/plain", "value": m.text}, {"type": "text/html", "value": m.html}], "headers": m.headers}
        if acc.reply_to:
            body["reply_to"] = {"email": acc.reply_to}
        return "https://api.sendgrid.com/v3/mail/send", "json", {"json": body, "headers": {"Authorization": f"Bearer {key}"}}
    if p == "mailgun":
        base = "https://api.eu.mailgun.net" if st.get("region") == "eu" else "https://api.mailgun.net"
        data = {"from": _from(acc), "to": m.to, "subject": m.subject, "text": m.text, "html": m.html, **{f"h:{k}": v for k, v in m.headers.items()}}
        if acc.reply_to:
            data["h:Reply-To"] = acc.reply_to
        return f"{base}/v3/{st.get('domain', '')}/messages", "form", {"data": data, "auth": ("api", key)}
    if p == "postmark":
        body = {"From": _from(acc), "To": m.to, "Subject": m.subject, "HtmlBody": m.html, "TextBody": m.text, "MessageStream": st.get("stream") or "outbound",
                "Headers": [{"Name": k, "Value": v} for k, v in m.headers.items()]}
        if acc.reply_to:
            body["ReplyTo"] = acc.reply_to
        return "https://api.postmarkapp.com/email", "json", {"json": body, "headers": {"X-Postmark-Server-Token": key, "Accept": "application/json"}}
    raise MailError("Unknown email service.")


async def _api_send(acc: SendingAccount, key: str, msgs: list[Outgoing]) -> list[tuple[str, str | None]]:
    out = []
    async with httpx.AsyncClient(timeout=20, transport=TRANSPORT) as c:
        for m in msgs:
            url, _, kw = _api_request(acc, key, m)
            try:
                r = await c.post(url, **kw)
            except httpx.HTTPError as exc:
                out.append(("", f"{acc.provider.title()} unreachable: {type(exc).__name__}"))
                continue
            if r.status_code in (401, 403):
                raise MailError(f"{acc.provider.title()} rejected the API key.")
            if r.status_code >= 300:
                out.append(("", f"{acc.provider.title()} returned {r.status_code}."))
                continue
            try:
                j = r.json()
            except ValueError:
                j = {}
            out.append((str(j.get("id") or j.get("MessageID") or r.headers.get("x-message-id") or ""), None))
    return out


VERIFY = {"resend": ("GET", "https://api.resend.com/domains"), "sendgrid": ("GET", "https://api.sendgrid.com/v3/scopes"),
          "postmark": ("GET", "https://api.postmarkapp.com/server")}


async def verify(acc: SendingAccount) -> None:
    """Check the connection without sending anything. Raises MailError with a readable reason."""
    secret = crypto.decrypt(acc.secret_enc)
    if acc.provider == "smtp":
        conn = await asyncio.to_thread(_smtp_connect, acc, secret)
        try:
            conn.quit()
        except Exception:  # noqa: BLE001
            pass
        return
    if acc.provider == "mailgun":
        base = "https://api.eu.mailgun.net" if (acc.settings or {}).get("region") == "eu" else "https://api.mailgun.net"
        method, url, kw = "GET", f"{base}/v3/domains/{(acc.settings or {}).get('domain', '')}", {"auth": ("api", secret)}
    else:
        method, url = VERIFY[acc.provider]
        kw = {"headers": {"X-Postmark-Server-Token": secret, "Accept": "application/json"}} if acc.provider == "postmark" else {"headers": {"Authorization": f"Bearer {secret}"}}
    try:
        async with httpx.AsyncClient(timeout=15, transport=TRANSPORT) as c:
            r = await c.request(method, url, **kw)
    except httpx.HTTPError as exc:
        raise MailError(f"Couldn't reach {acc.provider.title()} ({type(exc).__name__}).") from exc
    if r.status_code in (401, 403):
        raise MailError(f"{acc.provider.title()} rejected the API key.")
    if r.status_code == 404 and acc.provider == "mailgun":
        raise MailError("Mailgun doesn't know that sending domain. Check the domain and region.")
    if r.status_code >= 400:
        raise MailError(f"{acc.provider.title()} returned {r.status_code}.")


async def send(acc: SendingAccount, msgs: list[Outgoing]) -> list[tuple[str, str | None]]:
    secret = crypto.decrypt(acc.secret_enc)
    if acc.provider == "smtp":
        return await asyncio.to_thread(_smtp_send, acc, secret, msgs)
    return await _api_send(acc, secret, msgs)

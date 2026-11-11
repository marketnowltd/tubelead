"""Stripe billing. Entitlements change ONLY from signature-verified webhooks; the browser returning from Checkout
never unlocks anything by itself."""
import hashlib
import hmac
import json
import logging
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_owner
from ..config import get_settings
from ..db import get_db
from ..models import ActivityEvent, Payment, StripeEvent, Subscription, UserAccount
from ..services import email as mail
from ..services.audit import log_error
from ..services import entitlements as ent
from ..services.plans import FEATURE_LABELS, all_plans, plan_for, price_id, purchasable_plans
from .system import get_user_settings

log = logging.getLogger("tubelead.billing")
router = APIRouter(prefix="/api/billing", tags=["billing"])


class CheckoutIn(BaseModel):
    plan: str
    interval: str = "monthly"


def _configured() -> bool:
    return bool(get_settings().stripe_secret_key)


async def _stripe(method: str, path: str, data: dict | None = None) -> dict:
    s = get_settings()
    if not s.stripe_secret_key:
        raise HTTPException(503, {"code": "stripe_not_configured", "message": "Stripe is not configured on this server. Set STRIPE_SECRET_KEY and the price IDs (see docs/DEPLOY.md)."})
    try:
        async with httpx.AsyncClient(timeout=20, base_url=s.stripe_api_base) as c:
            r = await c.request(method, path, data=data, headers={"Authorization": f"Bearer {s.stripe_secret_key}"})
    except httpx.HTTPError as exc:
        raise HTTPException(502, {"code": "stripe_unreachable", "message": f"Could not reach Stripe: {type(exc).__name__}"}) from exc
    if r.status_code >= 400:
        msg = r.json().get("error", {}).get("message", r.text[:200]) if r.headers.get("content-type", "").startswith("application/json") else r.text[:200]
        raise HTTPException(502, {"code": "stripe_error", "message": f"Stripe: {msg}"})
    return r.json()


def _sub_row(db: Session, owner: str) -> Subscription:
    row = db.get(Subscription, owner)
    if not row:
        row = Subscription(owner_id=owner)
        db.add(row)
        db.commit()
    return row


def sub_out(row: Subscription | None) -> dict:
    if not row:
        return {"status": "none", "plan": "free", "interval": "monthly", "cancel_at_period_end": False, "current_period_end": None, "last_payment_status": None, "has_customer": False}
    return {"status": row.status, "plan": row.plan, "interval": row.interval, "cancel_at_period_end": row.cancel_at_period_end,
            "current_period_end": row.current_period_end.isoformat() if row.current_period_end else None,
            "last_payment_status": row.last_payment_status, "has_customer": bool(row.stripe_customer_id)}


@router.get("")
def overview(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    s = get_settings()
    row = db.get(Subscription, owner)
    plans = []
    for pid, p in purchasable_plans().items():
        plans.append({"id": pid, **p, "feature_labels": {k: FEATURE_LABELS[k] for k in FEATURE_LABELS},
                      "purchasable": pid != "free" and bool(price_id(pid, "monthly")) and _configured()})
    return {"stripe_configured": _configured(), "publishable_key": s.stripe_publishable_key or None,
            "webhook_configured": bool(s.stripe_webhook_secret),
            "plan_override": s.plan_override if (s.auth_mode == "dev" and s.plan_override) else None, "current_plan": ent.current_plan_id(db, owner),
            "subscription": sub_out(row), "usage": ent.usage(db, owner), "plans": plans}


@router.post("/checkout")
async def checkout(body: CheckoutIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    if body.plan not in purchasable_plans() or body.plan == "free" or body.interval not in ("monthly", "annual"):
        raise HTTPException(422, "Choose a paid plan and a monthly or annual interval")
    pr = price_id(body.plan, body.interval)
    if not pr:
        raise HTTPException(503, {"code": "price_not_configured", "message": f"No Stripe price ID is set for {body.plan}/{body.interval} (STRIPE_PRICE_{body.plan.upper()}_{body.interval.upper()})."})
    row = _sub_row(db, owner)
    if row.stripe_subscription_id and row.status in ("active", "trialing", "past_due"):
        raise HTTPException(409, {"code": "already_subscribed", "message": "You already have a subscription. Use change plan or the billing portal."})
    us = get_user_settings(db, owner)
    base = get_settings().app_base_url.rstrip("/")
    data = {"mode": "subscription", "line_items[0][price]": pr, "line_items[0][quantity]": "1", "client_reference_id": owner,
            "success_url": f"{base}/billing?checkout=success", "cancel_url": f"{base}/billing?checkout=cancelled",
            "metadata[owner_id]": owner, "metadata[plan]": body.plan, "metadata[interval]": body.interval,
            "subscription_data[metadata][owner_id]": owner, "subscription_data[metadata][plan]": body.plan,
            "allow_promotion_codes": "true"}
    if row.stripe_customer_id:
        data["customer"] = row.stripe_customer_id
    elif us.email:
        data["customer_email"] = us.email
    sess = await _stripe("POST", "/v1/checkout/sessions", data)
    return {"url": sess.get("url"), "id": sess.get("id")}


@router.post("/portal")
async def portal(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    row = db.get(Subscription, owner)
    if not row or not row.stripe_customer_id:
        raise HTTPException(409, {"code": "no_customer", "message": "No billing account yet — subscribe to a paid plan first."})
    sess = await _stripe("POST", "/v1/billing_portal/sessions", {"customer": row.stripe_customer_id, "return_url": f"{get_settings().app_base_url.rstrip('/')}/billing"})
    return {"url": sess.get("url")}


@router.post("/change")
async def change_plan(body: CheckoutIn, owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    """Upgrade/downgrade an existing subscription (prorated by Stripe). Local state updates when the webhook arrives."""
    row = db.get(Subscription, owner)
    if not row or not row.stripe_subscription_id:
        raise HTTPException(409, {"code": "no_subscription", "message": "No active subscription to change. Start one with Checkout."})
    if body.plan == "free":
        return await cancel(owner, db)
    pr = price_id(body.plan, body.interval)
    if body.plan not in purchasable_plans() or not pr:
        raise HTTPException(503, {"code": "price_not_configured", "message": "No Stripe price ID configured for that plan/interval."})
    sub = await _stripe("GET", f"/v1/subscriptions/{row.stripe_subscription_id}")
    item = sub["items"]["data"][0]["id"]
    await _stripe("POST", f"/v1/subscriptions/{row.stripe_subscription_id}", {"items[0][id]": item, "items[0][price]": pr, "proration_behavior": "create_prorations",
                                                                              "cancel_at_period_end": "false", "metadata[plan]": body.plan})
    return {"ok": True, "message": "Plan change requested. It takes effect when Stripe confirms."}


@router.post("/cancel")
async def cancel(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    row = db.get(Subscription, owner)
    if not row or not row.stripe_subscription_id:
        raise HTTPException(409, {"code": "no_subscription", "message": "No active subscription to cancel."})
    await _stripe("POST", f"/v1/subscriptions/{row.stripe_subscription_id}", {"cancel_at_period_end": "true"})
    return {"ok": True, "message": "Cancellation scheduled for the end of the billing period."}


@router.post("/resume")
async def resume(owner: str = Depends(get_owner), db: Session = Depends(get_db)):
    row = db.get(Subscription, owner)
    if not row or not row.stripe_subscription_id:
        raise HTTPException(409, {"code": "no_subscription", "message": "No subscription to resume."})
    await _stripe("POST", f"/v1/subscriptions/{row.stripe_subscription_id}", {"cancel_at_period_end": "false"})
    return {"ok": True}


# ------------------------------------------------------------------ webhook
def verify_signature(payload: bytes, header: str | None, secret: str, tolerance: int = 300) -> bool:
    if not header or not secret:
        return False
    try:
        parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
        ts = int(parts["t"])
        sigs = [p.split("=", 1)[1] for p in header.split(",") if p.startswith("v1=")]
    except (KeyError, ValueError):
        return False
    if abs(time.time() - ts) > tolerance:
        return False
    expected = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, s) for s in sigs)


def _plan_from_price(pr: str | None) -> tuple[str, str] | None:
    if not pr:
        return None
    for pid in purchasable_plans():
        for iv in ("monthly", "annual"):
            if pid != "free" and price_id(pid, iv) == pr:
                return pid, iv
    return None


def _find_owner(db: Session, obj: dict) -> str | None:
    meta = obj.get("metadata") or {}
    if meta.get("owner_id"):
        return meta["owner_id"]
    if obj.get("client_reference_id"):
        return obj["client_reference_id"]
    for col, val in (("stripe_subscription_id", obj.get("subscription") or (obj.get("id") if str(obj.get("id", "")).startswith("sub_") else None)),
                     ("stripe_customer_id", obj.get("customer"))):
        if val:
            row = db.scalar(select(Subscription).where(getattr(Subscription, col) == val))
            if row:
                return row.owner_id
    return None


def _ts(v) -> datetime | None:
    return datetime.fromtimestamp(int(v), timezone.utc) if v else None


def _money(amount: int, currency: str) -> str:
    sym = {"gbp": "£", "usd": "$", "eur": "€"}.get((currency or "").lower(), "")
    return f"{sym}{amount / 100:,.2f}" if sym else f"{amount / 100:,.2f} {currency.upper()}"


def _side_effects(db: Session, owner: str, t: str, obj: dict, row: Subscription) -> None:
    """Payments ledger and customer emails. Every email has a dedupe key, so Stripe retries never send twice."""
    acc = db.get(UserAccount, owner)
    to = (acc.email if acc else "") or get_user_settings(db, owner).email
    name = acc.full_name if acc else ""
    label = all_plans().get(row.plan, {}).get("label", row.plan.title())
    if t == "checkout.session.completed" and row.status == "active":
        mail.queue(db, to=to, template="subscription_confirmed", ctx={"name": name, "plan": label}, dedupe_key=f"subscription_confirmed:{obj.get('subscription') or obj.get('id')}")
    elif t in ("invoice.paid", "invoice.payment_succeeded") and obj.get("id"):
        if not db.get(Payment, obj["id"]):
            db.add(Payment(id=obj["id"], owner_id=owner, amount=int(obj.get("amount_paid") or 0), currency=obj.get("currency") or "gbp",
                           charge_id=obj.get("charge"), payment_intent_id=obj.get("payment_intent"), created_at=_ts(obj.get("created")) or datetime.now(timezone.utc)))
        if int(obj.get("amount_paid") or 0) > 0:
            mail.queue(db, to=to, template="payment_confirmed", ctx={"name": name, "amount": _money(int(obj["amount_paid"]), obj.get("currency") or "gbp")}, dedupe_key=f"payment_confirmed:{obj['id']}")
    elif t == "invoice.payment_failed":
        mail.queue(db, to=to, template="payment_failed", ctx={"name": name}, dedupe_key=f"payment_failed:{obj.get('id')}")
        mail.alert_admin(db, "Payment failed", [f"Customer: {to or owner}", f"Invoice: {obj.get('id')}"], f"payment_failed:{obj.get('id')}")
    elif t == "customer.subscription.deleted" or (t == "customer.subscription.updated" and obj.get("cancel_at_period_end")):
        mail.queue(db, to=to, template="cancellation_confirmed", ctx={"name": name}, dedupe_key=f"cancellation:{obj.get('id')}")
    elif t == "charge.refunded" and obj.get("id"):
        pay = db.scalar(select(Payment).where(Payment.charge_id == obj["id"]))
        if pay:
            pay.refunded_amount = int(obj.get("amount_refunded") or 0)


def apply_event(db: Session, ev: dict) -> str:
    t, obj = ev["type"], ev["data"]["object"]
    owner = _find_owner(db, obj)
    if not owner:
        return "ignored: no matching account"
    row = _sub_row(db, owner)
    if t == "checkout.session.completed":
        if obj.get("mode") == "subscription":
            row.stripe_customer_id = obj.get("customer") or row.stripe_customer_id
            row.stripe_subscription_id = obj.get("subscription") or row.stripe_subscription_id
            meta = obj.get("metadata") or {}
            if meta.get("plan") in purchasable_plans() and obj.get("payment_status") in ("paid", "no_payment_required"):
                row.plan, row.interval, row.status = meta["plan"], meta.get("interval", "monthly"), "active"
                row.last_payment_status = "paid"
    elif t in ("customer.subscription.created", "customer.subscription.updated"):
        items = (obj.get("items") or {}).get("data") or []
        mapped = _plan_from_price(items[0]["price"]["id"] if items else None)
        meta_plan = (obj.get("metadata") or {}).get("plan")
        row.stripe_customer_id = obj.get("customer") or row.stripe_customer_id
        row.stripe_subscription_id = obj.get("id")
        row.status = obj.get("status", row.status)
        if mapped:
            row.plan, row.interval = mapped
        elif meta_plan in purchasable_plans():
            row.plan = meta_plan
        row.cancel_at_period_end = bool(obj.get("cancel_at_period_end"))
        row.current_period_end = _ts(obj.get("current_period_end") or (items[0].get("current_period_end") if items else None))
        if row.status in ("canceled", "unpaid", "incomplete_expired"):
            row.plan = "free"
    elif t == "customer.subscription.deleted":
        row.status, row.plan, row.cancel_at_period_end = "canceled", "free", False
    elif t == "invoice.payment_failed":
        row.status, row.last_payment_status = "past_due", "failed"
    elif t in ("invoice.paid", "invoice.payment_succeeded"):
        row.last_payment_status = "paid"
        if row.status == "past_due":
            row.status = "active"
    elif t == "charge.refunded":
        row.last_payment_status = "refunded"
    else:
        return f"ignored: {t}"
    _side_effects(db, owner, t, obj, row)
    us = get_user_settings(db, owner)
    us.plan = row.plan
    db.add(ActivityEvent(owner_id=owner, kind="billing", message=f"Billing update ({t}): plan {row.plan}, status {row.status}"))
    db.commit()
    return "applied"


@router.post("/webhook")
async def webhook(request: Request, db: Session = Depends(get_db)):
    s = get_settings()
    if not s.stripe_webhook_secret:
        raise HTTPException(503, {"code": "webhook_not_configured", "message": "STRIPE_WEBHOOK_SECRET is not set"})
    payload = await request.body()
    if not verify_signature(payload, request.headers.get("stripe-signature"), s.stripe_webhook_secret):
        raise HTTPException(400, "Invalid signature")
    try:
        ev = json.loads(payload)
        eid, etype = ev["id"], ev["type"]
    except (ValueError, KeyError) as exc:
        raise HTTPException(400, "Malformed event") from exc
    if db.get(StripeEvent, eid):
        return {"received": True, "duplicate": True}
    db.add(StripeEvent(id=eid, type=etype))
    db.commit()
    try:
        result = apply_event(db, ev)
    except Exception as exc:
        # Forget the event so Stripe's automatic retry is processed instead of skipped as a duplicate.
        db.rollback()
        db.query(StripeEvent).filter(StripeEvent.id == eid).delete()
        db.commit()
        log_error("webhook", f"Stripe {etype} {eid} failed: {type(exc).__name__}: {exc}", "/api/billing/webhook")
        raise
    mail.deliver_pending_soon()
    log.info("stripe %s %s -> %s", etype, eid, result)
    return {"received": True, "result": result}

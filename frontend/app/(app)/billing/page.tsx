"use client";
import { AlertTriangle, ArrowRight, Check, CreditCard, ExternalLink, Info, Minus, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Badge, ErrorState, PageHeader, Panel, PanelHeader, Progress, Skeleton } from "@/components/ui/core";
import { Modal, useToast } from "@/components/ui/overlay";
import { cn } from "@/components/ui/cn";
import { api, useApi } from "@/lib/api";
import { dateLong } from "@/lib/format";
import type { Billing, BillingPlan } from "@/lib/types";

const ORDER = ["free", "starter", "pro", "elite"];

function BillingInner() {
  const toast = useToast();
  const params = useSearchParams();
  const { data: b, error, mutate } = useApi<Billing>("/billing");
  const [annual, setAnnual] = useState(params.get("interval") === "annual");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<BillingPlan | null>(null);
  const [waiting, setWaiting] = useState(params.get("checkout") === "success");
  const startPlan = useRef(b?.current_plan);

  // After Stripe Checkout the plan only changes when Stripe's verified webhook arrives — poll for it, never assume.
  useEffect(() => {
    if (!waiting) return;
    let n = 0; const t = setInterval(async () => { n++; const fresh = await mutate(); if (fresh && fresh.current_plan !== "free") { setWaiting(false); toast("success", `You're on ${fresh.current_plan}. Thanks!`); clearInterval(t); } if (n > 20) { setWaiting(false); clearInterval(t); } }, 2500);
    return () => clearInterval(t);
  }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (b && !startPlan.current) startPlan.current = b.current_plan; }, [b]);

  const sub = b?.subscription;
  const subscribed = !!sub && ["active", "trialing", "past_due"].includes(sub.status) && sub.plan !== "free";
  const interval = annual ? "annual" : "monthly";

  const checkout = async (p: BillingPlan) => {
    setBusy(p.id);
    try {
      const r = await api<{ url: string }>(subscribed ? "/billing/change" : "/billing/checkout", { method: "POST", json: { plan: p.id, interval } }) as any;
      if (r.url) { window.location.href = r.url; return; }
      toast("success", r.message ?? "Plan change requested"); setConfirm(null); setTimeout(() => mutate(), 2500);
    } catch (e: any) { toast("error", e.message); } finally { setBusy(null); }
  };
  const portal = async () => { setBusy("portal"); try { const r = await api<{ url: string }>("/billing/portal", { method: "POST" }); window.location.href = r.url; } catch (e: any) { toast("error", e.message); setBusy(null); } };
  const cancel = async () => { setBusy("cancel"); try { await api("/billing/cancel", { method: "POST" }); toast("success", "Cancellation scheduled for the end of the period"); setTimeout(() => mutate(), 2500); } catch (e: any) { toast("error", e.message); } finally { setBusy(null); setConfirm(null); } };
  const resume = async () => { setBusy("resume"); try { await api("/billing/resume", { method: "POST" }); toast("success", "Subscription will continue"); setTimeout(() => mutate(), 2500); } catch (e: any) { toast("error", e.message); } finally { setBusy(null); } };

  const cur = b?.plans.find((p) => p.id === b.current_plan);
  const pct = b ? Math.min(100, (b.usage.leads_used / Math.max(b.usage.leads_allowance, 1)) * 100) : 0;
  const rank = (id: string) => ORDER.indexOf(id);

  return (
    <div>
      <PageHeader eyebrow="Workspace" title="Billing & Subscription" sub="Plans, usage and payment. Paid features unlock only after Stripe confirms your payment to our server." />
      {error ? <Panel><ErrorState error={error} onRetry={() => mutate()} /></Panel> : !b ? <Skeleton className="h-64" /> : (
        <div className="space-y-6">
          {b.plan_override && <div role="status" className="flex gap-3 rounded-2xl border border-gold/50 bg-gold/15 p-4 text-sm text-gold-text"><Info size={18} className="mt-0.5 shrink-0" /><p><strong>Local evaluation mode.</strong> This server forces the <span className="capitalize">{b.plan_override}</span> plan (<code className="data rounded bg-ink/10 px-1">PLAN_OVERRIDE</code>) so you can try paid features without Stripe. Remove it in production — real plans come only from verified Stripe payments.</p></div>}
          {waiting && <div role="status" className="flex items-center gap-3 rounded-2xl border border-forest/30 bg-forest/5 p-4 text-sm"><span className="h-4 w-4 animate-spin rounded-full border-2 border-forest border-t-transparent" />Payment received by Stripe — waiting for their confirmation to reach TubeLead. This usually takes a few seconds. Your plan updates automatically.</div>}
          {params.get("checkout") === "cancelled" && <div role="status" className="flex items-center gap-3 rounded-2xl border border-line bg-panel p-4 text-sm"><Info size={16} /> Checkout was cancelled. You haven’t been charged.</div>}
          {!b.stripe_configured && (
            <div role="alert" className="flex gap-3 rounded-2xl border border-gold/50 bg-gold/15 p-4 text-sm text-gold-text"><AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div><p className="font-semibold">Payments aren’t set up on this server yet.</p><p className="mt-1">The plan comparison below is live, but upgrading needs Stripe. Set <code className="data rounded bg-ink/10 px-1">STRIPE_SECRET_KEY</code>, <code className="data rounded bg-ink/10 px-1">STRIPE_WEBHOOK_SECRET</code> and the six <code className="data rounded bg-ink/10 px-1">STRIPE_PRICE_*</code> IDs, and point a Stripe webhook at <code className="data rounded bg-ink/10 px-1">/api/billing/webhook</code> (see docs/DEPLOY.md).</p></div></div>)}
          {sub?.status === "past_due" && <div role="alert" className="flex gap-3 rounded-2xl border border-[#B5493A]/40 bg-[#B5493A]/10 p-4 text-sm text-[#A33A2A]"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><p className="font-semibold">Your last payment failed.</p><p className="mt-1">Your plan stays active while Stripe retries. Update your card in the billing portal to avoid losing access.</p></div><button className="btn-primary btn-sm pill-terracotta ml-auto self-center" onClick={portal} disabled={busy === "portal"}>Fix payment</button></div>}
          {sub?.cancel_at_period_end && <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-gold/50 bg-gold/15 p-4 text-sm text-gold-text"><Info size={16} /> Your subscription ends on {sub.current_period_end ? dateLong(sub.current_period_end) : "the period end"}. You keep full access until then.<button className="btn-ghost btn-sm ml-auto" onClick={resume} disabled={busy === "resume"}>Keep my plan</button></div>}

          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <Panel><PanelHeader title="Current plan" icon={<CreditCard size={16} />} action={<Badge tone="purple" dot>{cur?.label ?? b.current_plan}</Badge>} />
              <div className="px-5 pb-5">
                <p className="data text-4xl font-semibold">£{cur ? (sub && subscribed && sub.interval === "annual" ? Math.round(cur.price_annual_gbp / 12) : cur.price_monthly_gbp) : 0}<span className="text-base text-dim"> / month</span></p>
                <p className="mt-1 text-sm text-mute">{subscribed ? `${sub!.interval === "annual" ? "Billed yearly" : "Billed monthly"}${sub!.current_period_end && !sub!.cancel_at_period_end ? ` · renews ${dateLong(sub!.current_period_end)}` : ""}` : "No paid subscription"}</p>
                <div className="mt-5"><div className="mb-1.5 flex justify-between text-xs text-mute"><span>Leads {b.usage.period === "lifetime" ? "used in your trial" : "used this month"}</span><span className="data">{b.usage.leads_used.toLocaleString()} / {b.usage.leads_allowance.toLocaleString()}</span></div>
                  <Progress label="Lead allowance used" value={pct} tone={pct > 85 ? "purple" : "green"} />
                  {b.usage.at_limit && <p className="mt-2 text-xs font-semibold text-[#A33A2A]">You’ve used your whole allowance. Upgrade to keep discovering.</p>}</div>
                <dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><dt className="label">Last payment</dt><dd className="mt-0.5 capitalize">{sub?.last_payment_status ?? "—"}</dd></div><div><dt className="label">Status</dt><dd className="mt-0.5 capitalize">{sub?.status === "none" ? "Free" : sub?.status}</dd></div></dl>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <button className="btn-ghost btn-sm" onClick={portal} disabled={!sub?.has_customer || busy === "portal"} title={!sub?.has_customer ? "Available after your first purchase" : undefined}><ExternalLink size={13} /> Billing portal</button>
                  {subscribed && !sub!.cancel_at_period_end && <button className="btn-ghost btn-sm !border-[#B5493A]/40 !text-[#A33A2A]" onClick={() => setConfirm({ ...(cur as BillingPlan), id: "cancel" })}>Cancel subscription</button>}
                </div>
                <p className="mt-3 text-[11.5px] text-dim">Invoices, receipts, payment methods and refund requests live in the Stripe billing portal. Refunds show up here as “refunded” once Stripe confirms.</p>
              </div></Panel>

            <Panel><PanelHeader title="What your plan includes" icon={<ShieldCheck size={16} />} />
              <ul className="space-y-2.5 px-5 pb-5 text-sm">{cur && Object.entries(cur.feature_labels).map(([k, label]) => <li key={k} className={cn("flex items-center gap-2.5", !cur.features[k] && "text-dim")}>{cur.features[k] ? <Check size={15} className="text-moss" /> : <Minus size={15} />}{label}{!cur.features[k] && <span className="text-[11px]">— upgrade to unlock</span>}</li>)}
                {cur && <li className="flex items-center gap-2.5"><Check size={15} className="text-moss" />{cur.max_jobs_per_day} discovery runs per day · {cur.team_seats} seat{cur.team_seats > 1 ? "s" : ""}</li>}</ul></Panel>
          </div>

          <div>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-2xl font-extrabold tracking-tight">Change plan</h2>
              <div role="group" aria-label="Billing interval" className="inline-flex rounded-full border border-line bg-panel p-1">{[["Monthly", false], ["Annual · 2 months free", true]].map(([l, v]) => <button key={String(l)} aria-pressed={annual === v} onClick={() => setAnnual(v as boolean)} className={cn("rounded-full px-4 py-1.5 text-[12.5px] font-bold", annual === v ? "bg-forest text-paper" : "text-mute hover:text-ink")}>{l as string}</button>)}</div></div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {b.plans.map((p) => {
                const here = p.id === b.current_plan; const up = rank(p.id) > rank(b.current_plan);
                return (
                  <div key={p.id} className={cn("flex flex-col rounded-[20px] border p-5", here ? "border-forest bg-forest/5 shadow-lift" : "border-line bg-panel")}>
                    <div className="flex items-center justify-between"><h3 className="font-display text-lg font-extrabold">{p.label}</h3>{here && <Badge tone="purple" dot>Current</Badge>}</div>
                    <p className="data mt-2 text-3xl font-semibold">£{annual ? Math.round(p.price_annual_gbp / 12) : p.price_monthly_gbp}<span className="text-sm text-dim"> / mo</span></p>
                    <p className="h-4 text-[11px] text-dim">{annual && p.price_annual_gbp ? `£${p.price_annual_gbp} billed yearly` : ""}</p>
                    <p className="mt-2 rounded-lg bg-bg2 px-3 py-1.5 text-[12.5px] font-semibold"><span className="data">{p.leads.toLocaleString()}</span> leads {p.lead_period === "lifetime" ? "to try" : "/ month"}</p>
                    <ul className="mt-3 flex-1 space-y-1.5 text-[12.5px]">{Object.entries(p.feature_labels).map(([k, l]) => <li key={k} className={cn("flex items-center gap-2", !p.features[k] && "text-dim line-through")}>{p.features[k] ? <Check size={13} className="text-moss" /> : <Minus size={13} />}{l}</li>)}</ul>
                    <button disabled={here || busy === p.id || (p.id !== "free" && !b.stripe_configured) || (p.id !== "free" && !p.purchasable && b.stripe_configured)}
                      onClick={() => (p.id === "free" ? setConfirm({ ...p, id: "cancel" }) : subscribed && !up ? setConfirm(p) : checkout(p))}
                      className={cn("mt-4 w-full", here ? "btn-ghost btn-sm" : up ? "btn-primary" : "btn-ghost")} title={p.id !== "free" && !b.stripe_configured ? "Stripe isn’t configured on this server" : undefined}>
                      {here ? "Current plan" : busy === p.id ? "Working…" : p.id === "free" ? "Downgrade to Free" : up ? `Upgrade to ${p.label}` : `Switch to ${p.label}`} {!here && <ArrowRight size={14} />}</button>
                    {p.id !== "free" && b.stripe_configured && !p.purchasable && <p className="mt-1.5 text-[11px] text-dim">Price ID not configured.</p>}
                  </div>);
              })}
            </div>
          </div>
        </div>
      )}

      <Modal open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} title={confirm?.id === "cancel" ? "Cancel your subscription?" : `Switch to ${confirm?.label}?`}
        description={confirm?.id === "cancel" ? "You keep your current plan until the end of the billing period, then move to Free." : "Stripe prorates the difference. The change applies once Stripe confirms it."}
        footer={<><button className="btn-ghost btn-sm" onClick={() => setConfirm(null)}>Keep current plan</button>{confirm?.id === "cancel" ? <button className="btn-primary btn-sm pill-terracotta" onClick={cancel} disabled={busy === "cancel"}>Cancel at period end</button> : <button className="btn-primary btn-sm" onClick={() => confirm && checkout(confirm)} disabled={!!busy}>Confirm change</button>}</>}>
        <p className="text-sm text-mute">{confirm?.id !== "cancel" && confirm && `${confirm.label}: ${confirm.leads.toLocaleString()} leads ${confirm.lead_period === "lifetime" ? "to try" : "per month"}. Features not included in the new plan are locked immediately after the change.`}</p>
      </Modal>
    </div>
  );
}
export default function BillingPage() { return <Suspense><BillingInner /></Suspense>; }

"use client";
import { BrainCircuit, CheckCircle2, CreditCard, Database, KeyRound, Play, Plug, Webhook, Zap } from "lucide-react";
import Link from "next/link";
import { N8nConfig } from "@/components/pages/N8nCard";
import { Badge, ErrorState, PageHeader, Panel, Skeleton } from "@/components/ui/core";
import { useApi } from "@/lib/api";
import type { Integration } from "@/lib/types";

const ICONS: Record<string, any> = { stripe: CreditCard, ai: BrainCircuit, youtube: Play, supabase: Database, auth: KeyRound, redis: Zap, n8n: Webhook };
const HELP: Record<string, string> = {
  stripe: "In Stripe: create three products (Starter, Pro, Elite) each with a monthly and annual recurring price, copy the six price IDs into STRIPE_PRICE_*, add a webhook endpoint https://YOUR-DOMAIN/api/billing/webhook for checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_failed and charge.refunded, then set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET. Plans unlock only from verified webhooks.",
  ai: "Open AI Connect, choose a provider and paste an API key (or a base URL for Ollama / custom servers). Keys are encrypted at rest.",
  youtube: "1. Create a project at console.cloud.google.com  2. Enable “YouTube Data API v3”  3. Create an API key (restrict it to that API)  4. Put it in backend/.env as YOUTUBE_API_KEY and restart the API. The key never reaches the browser.",
  supabase: "Create a Supabase project, run supabase/migrations/001_init.sql in the SQL editor, then set DATABASE_URL (Settings → Database → Connection string, URI) in backend/.env.",
  auth: "Set AUTH_MODE=supabase and SUPABASE_JWT_SECRET (Settings → API → JWT secret) on the backend, and NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY on the frontend.",
  redis: "Set REDIS_URL (e.g. redis://localhost:6379/0). Rate-limit counters become shared across API workers.",
  n8n: "Create a Webhook node in n8n, copy its production URL below, and TubeLead will POST an event when each discovery job finishes.",
};

export default function Integrations() {
  const { data, error, mutate } = useApi<Integration[]>("/integrations", { refreshInterval: 20000 });
  return (
    <div>
      <PageHeader eyebrow="Connected services" title="Integrations" sub="Live status read from the running backend — not hard-coded. Secrets are configured server-side only." />
      {error ? <Panel><ErrorState error={error} onRetry={() => mutate()} /></Panel> : !data ? <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-48" />)}</div> : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((i) => { const I = ICONS[i.id] ?? Plug; return (
            <Panel key={i.id} lift glow={i.connected} className="flex flex-col p-5">
              <div className="flex items-start gap-3"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ${i.connected ? "bg-moss/10 text-moss ring-moss/30" : "bg-forest/15 text-forest ring-forest/30"}`}><I size={20} /></span>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-heading text-base font-semibold">{i.name}</h3><Badge tone={i.connected ? "green" : "amber"} dot>{i.connected ? "Connected" : "Not configured"}</Badge></div>
                  <p className="label mt-0.5">{i.category}</p><p className="mt-2 break-words text-[13px] text-mute">{i.detail}</p></div></div>
              <div className="mt-4 flex-1 border-t border-forest/10 pt-4">{i.id === "n8n" ? <N8nConfig /> : (
                <details className="group text-[13px] text-mute"><summary className="cursor-pointer select-none font-semibold text-forest marker:text-forest">{i.connected ? "Configuration reference" : "How to set this up"}</summary><p className="mt-2 leading-relaxed">{HELP[i.id]}</p></details>)}</div>
              {i.connected && i.id !== "n8n" && <p className="mt-3 flex items-center gap-1.5 text-[11px] text-moss"><CheckCircle2 size={12} /> Active</p>}
            </Panel>); })}
        </div>)}
      <Panel className="mt-6 p-5"><p className="text-sm text-mute"><strong className="text-ink">Not integrated yet:</strong> email-verification providers (mailbox-level), CRM sync (HubSpot / Salesforce) and team workspaces. TubeLead does not send email. AI providers are managed in <Link className="font-semibold text-forest underline" href="/ai-connect">AI Connect</Link>.</p></Panel>
    </div>
  );
}

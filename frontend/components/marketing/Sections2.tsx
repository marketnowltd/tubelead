"use client";
import { ArrowRight, Check, ChevronDown, KeyRound, Route } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cn } from "../ui/cn";
import { COUNTRY_NAME, SAMPLE, k } from "@/lib/sample";
import { AvatarTile, ContactBadge, Reveal, SampleTag, ScoreDial, SectionHead } from "./bits";

/* ---------- 05 AI integrations ---------- */
const PROVIDERS = ["OpenAI", "Anthropic", "Gemini", "OpenRouter", "Ollama", "Custom"];
const TASKS = ["Keyword research", "Creator analysis", "Lead qualification", "Lead scoring", "Contact analysis", "Campaign intelligence", "Report generation"];
export function AIIntegrations() {
  const [sel, setSel] = useState(1);
  return (
    <section id="ai" className="scroll-mt-20 bg-bg2/60 py-24">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <SectionHead n="04" eyebrow="AI integrations" title={<>Bring your own AI. <span className="italic-accent">Route</span> it task by task.</>} sub="Connect the providers you already pay for with your own API key, then decide which model handles which job. AI suggests and summarises — it never invents contact details or facts." />
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <Reveal>
            <div className="panel h-full p-6">
              <p className="label mb-3 flex items-center gap-2"><KeyRound size={13} /> Providers</p>
              <div className="flex flex-wrap gap-2">{PROVIDERS.map((p, i) => <button key={p} onClick={() => setSel(i)} aria-pressed={sel === i} className={cn("rounded-full border px-4 py-2 text-[13px] font-bold transition", sel === i ? "border-forest bg-forest text-paper" : "border-line bg-bg text-ink hover:border-forest/40")}>{p}</button>)}</div>
              <ul className="mt-6 space-y-3 text-[14px] text-mute">
                {["Keys are encrypted at rest and never reach your browser", "Test a connection, pick a model, set a default, rotate or delete any time", "Automatic retries, timeouts and fallbacks between providers", "Per-provider usage, request log and cost estimates"].map((x) => <li key={x} className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-moss" />{x}</li>)}
              </ul>
              <div className="mt-6 rounded-xl border border-gold/50 bg-gold/15 p-3.5 text-[12.5px] leading-relaxed text-gold-text"><strong>A consumer subscription isn&rsquo;t an API key.</strong> ChatGPT Plus, Claude Pro and Gemini Advanced don&rsquo;t include API access. Create a key in the provider&rsquo;s developer console — TubeLead explains exactly where.</div>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="panel h-full p-6">
              <p className="label mb-4 flex items-center gap-2"><Route size={13} /> Task routing</p>
              <ul className="space-y-2">{TASKS.map((t, i) => (
                <li key={t} className="flex items-center gap-3 rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[13px]">
                  <span className="min-w-0 flex-1 font-semibold">{t}</span>
                  <span className="hidden h-px w-8 bg-forest/30 sm:block" /><span className="data rounded-full bg-forest/10 px-2.5 py-1 text-[11.5px] font-semibold text-forest">{PROVIDERS[(sel + i) % PROVIDERS.length]}</span>
                </li>))}</ul>
              <p className="mt-4 text-[11.5px] text-dim">Illustrative assignment. Any task can be switched off or given a fallback.</p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------- 06/07 Lead database + advanced filtering ---------- */
type Sort = "score" | "subs";
export function DatabasePreview() {
  const [niche, setNiche] = useState("All");
  const [country, setCountry] = useState("All");
  const [onlyEmail, setOnlyEmail] = useState(false);
  const [active, setActive] = useState(false);
  const [sort, setSort] = useState<Sort>("score");
  const rows = useMemo(() => SAMPLE.filter((c) => (niche === "All" || c.niche === niche) && (country === "All" || c.country === country) && (!onlyEmail || c.contact === "publicly_published") && (!active || c.activity === "active"))
    .sort((a, b) => (sort === "score" ? b.score - a.score : b.subs - a.subs)), [niche, country, onlyEmail, active, sort]);
  const niches = ["All", "Fitness", "Tech", "Food", "Travel", "Design"];
  return (
    <section className="py-24">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <SectionHead n="05" eyebrow="Lead database & filtering" title={<>Every creator, <span className="italic-accent">sortable</span> down to the detail.</>} sub="Filter by niche, country, audience, activity and contact route. Sort, save views, bulk-assign to campaigns and export — with every record kept private to your account." />
        <Reveal>
          <div className="panel overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-bg2/50 px-4 py-3">
              {niches.map((n) => <button key={n} aria-pressed={niche === n} onClick={() => setNiche(n)} className={cn("rounded-full border px-3 py-1 text-[12px] font-semibold", niche === n ? "border-forest bg-forest text-paper" : "border-line bg-panel text-mute hover:text-ink")}>{n}</button>)}
              <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
              <select aria-label="Country" className="field !w-auto !rounded-full !py-1 !text-[12px]" value={country} onChange={(e) => setCountry(e.target.value)}><option value="All">All countries</option>{Object.entries(COUNTRY_NAME).map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
              <label className="flex items-center gap-1.5 text-[12px] font-semibold"><input type="checkbox" className="accent-forest" checked={onlyEmail} onChange={(e) => setOnlyEmail(e.target.checked)} /> Public email</label>
              <label className="flex items-center gap-1.5 text-[12px] font-semibold"><input type="checkbox" className="accent-forest" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active only</label>
              <SampleTag className="ml-auto" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead><tr className="label border-b border-line !text-[10.5px]">
                  <th className="px-4 py-3">Creator</th><th className="px-3">Niche</th><th className="px-3">Country</th>
                  <th className="px-3"><button onClick={() => setSort("subs")} className={cn("font-semibold uppercase tracking-[0.14em]", sort === "subs" && "text-forest")}>Subscribers {sort === "subs" && "↓"}</button></th>
                  <th className="px-3">Contact route</th>
                  <th className="px-3"><button onClick={() => setSort("score")} className={cn("font-semibold uppercase tracking-[0.14em]", sort === "score" && "text-forest")}>Score {sort === "score" && "↓"}</button></th></tr></thead>
                <tbody>{rows.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-bg2/40">
                    <td className="px-4 py-2.5"><span className="flex items-center gap-3"><AvatarTile c={c} size={34} /><span className="font-bold">{c.name}</span></span></td>
                    <td className="px-3 text-mute">{c.niche}</td><td className="px-3 text-mute">{c.country}</td><td className="data px-3">{k(c.subs)}</td>
                    <td className="px-3"><ContactBadge kind={c.contact} /></td><td className="px-3"><ScoreDial score={c.score} size={34} /></td>
                  </tr>))}
                  {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-mute">No sample creators match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line bg-bg2/40 px-4 py-2.5 text-[11.5px] text-dim">Contact statuses are kept separate and honest: <em>publicly published</em> ≠ <em>verified</em>. TubeLead never guesses an address.</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- 08 Campaign management ---------- */
export function Campaigns() {
  const cols = [["New", 128, "bg-ink/10", ["Northline Fitness", "Quiet Circuits", "Fold & Frame"]], ["Contacted", 64, "bg-gold/30", ["Marlow Money", "Studio Sundial"]], ["Replied", 21, "bg-sage/50", ["Kettlebell Kate"]], ["Converted", 9, "bg-forest/20", ["Tidy Tuesday Kitchen"]]] as const;
  return (
    <section className="bg-bg2/60 py-24">
      <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <SectionHead n="06" eyebrow="Campaign management" title={<>Turn a list into a <span className="italic-accent">pipeline</span>.</>} sub="Group leads into campaigns, track outreach status and reply rate, and keep saved searches running on a schedule so your pipeline refills itself." />
          <ul className="space-y-3 text-[15px]">{["Campaigns with per-stage counts and reply rate", "Saved searches that re-run hourly, daily or weekly", "Bulk assign, bulk status change, CSV export", "One-click hand-off to SendLoom for sending"].map((x) => <li key={x} className="flex gap-3"><Check size={18} className="mt-0.5 shrink-0 text-moss" />{x}</li>)}</ul>
        </div>
        <Reveal>
          <div className="panel p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between"><p className="font-heading font-bold">Spring partnerships</p><SampleTag /></div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {cols.map(([t, n, cls, names]) => (
                <div key={t} className="rounded-2xl bg-bg p-2.5 ring-1 ring-line">
                  <p className="flex items-center justify-between px-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-mute">{t}<span className={cn("data rounded-full px-2 py-0.5 text-ink", cls)}>{n}</span></p>
                  <ul className="space-y-2">{names.map((nm) => { const c = SAMPLE.find((s) => s.name === nm)!; return <li key={nm} className="rounded-xl border border-line bg-panel p-2 text-[11.5px] font-semibold shadow-card"><AvatarTile c={c} size={22} /><span className="mt-1.5 block truncate">{nm}</span></li>; })}</ul>
                </div>))}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-forest px-4 py-3 text-paper"><span className="text-[12.5px]">Reply rate</span><span className="data text-xl font-semibold">23.3%</span></div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- 09 Pricing ---------- */
interface PlanCard { id: string; label: string; tagline: string; price_monthly_gbp: number; price_annual_gbp: number; leads: number; lead_period: string; team_seats: number; features: Record<string, boolean> }
const FALLBACK: PlanCard[] = [
  { id: "free", label: "Free", tagline: "Try discovery with a 25-lead trial", price_monthly_gbp: 0, price_annual_gbp: 0, leads: 25, lead_period: "lifetime", team_seats: 1, features: { csv_export: false, scheduled_discovery: false, ai_connect: false, api_access: false, automation: false, team: false } },
  { id: "starter", label: "Starter", tagline: "For solo researchers and small outreach teams", price_monthly_gbp: 19, price_annual_gbp: 190, leads: 2500, lead_period: "month", team_seats: 1, features: { csv_export: true, scheduled_discovery: false, ai_connect: true, api_access: false, automation: false, team: false } },
  { id: "pro", label: "Pro", tagline: "Scheduled discovery, automation and AI task routing", price_monthly_gbp: 49, price_annual_gbp: 490, leads: 25000, lead_period: "month", team_seats: 3, features: { csv_export: true, scheduled_discovery: true, ai_connect: true, api_access: false, automation: true, team: false } },
  { id: "elite", label: "Elite", tagline: "High volume, API access, teams and priority queue", price_monthly_gbp: 99, price_annual_gbp: 990, leads: 100000, lead_period: "month", team_seats: 10, features: { csv_export: true, scheduled_discovery: true, ai_connect: true, api_access: true, automation: true, team: true } },
];
const FEATURE_ROWS: [string, string][] = [["csv_export", "CSV export"], ["ai_connect", "AI Connect (bring your own key)"], ["scheduled_discovery", "Scheduled discovery"], ["automation", "Automation & webhooks"], ["api_access", "API access"], ["team", "Team accounts"]];

export function Pricing() {
  const [annual, setAnnual] = useState(false);
  const [plans, setPlans] = useState<PlanCard[]>(FALLBACK);
  useEffect(() => {
    // Live values when the API is reachable (so edited prices/allowances show up here); the static copy is the fallback.
    fetch("/api/plans").then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && typeof j === "object") setPlans(Object.entries(j).map(([id, p]: [string, any]) => ({ id, ...p }))); }).catch(() => {});
  }, []);
  return (
    <section id="pricing" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <SectionHead center n="07" eyebrow="Pricing" title={<>Pay for leads, <span className="italic-accent">not</span> for seats you don&rsquo;t use.</>} sub="Start free with 25 leads. Upgrade when the list is earning its keep. Cancel any time from the billing portal." />
        <div className="mb-10 flex justify-center">
          <div role="group" aria-label="Billing interval" className="inline-flex rounded-full border border-line bg-panel p-1">
            {[["Monthly", false], ["Annual · 2 months free", true]].map(([l, v]) => <button key={String(l)} aria-pressed={annual === v} onClick={() => setAnnual(v as boolean)} className={cn("rounded-full px-5 py-2 text-[13px] font-bold transition", annual === v ? "bg-forest text-paper" : "text-mute hover:text-ink")}>{l as string}</button>)}
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((p, i) => {
            const feat = p.id === "pro";
            const price = annual ? Math.round(p.price_annual_gbp / 12) : p.price_monthly_gbp;
            return (
              <Reveal key={p.id} delay={i * 0.06}>
                <div className={cn("relative flex h-full flex-col rounded-[22px] border p-6", feat ? "border-forest bg-forest text-paper shadow-pop" : "border-line bg-panel shadow-card")}>
                  {feat && <span className="absolute -top-3 left-6 rounded-full bg-gold px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-ink">Most chosen</span>}
                  <h3 className="font-display text-xl font-extrabold">{p.label}</h3>
                  <p className={cn("mt-1 min-h-[40px] text-[13px]", feat ? "text-paper/75" : "text-mute")}>{p.tagline}</p>
                  <p className="mt-5 flex items-baseline gap-1"><span className="data text-[44px] font-semibold leading-none">£{price}</span><span className={cn("text-sm", feat ? "text-paper/70" : "text-dim")}>/ month</span></p>
                  <p className={cn("mt-1 h-4 text-[11.5px]", feat ? "text-paper/70" : "text-dim")}>{annual && p.price_annual_gbp > 0 ? `£${p.price_annual_gbp} billed yearly` : p.price_monthly_gbp > 0 ? "billed monthly" : "no card needed"}</p>
                  <p className={cn("mt-5 rounded-xl px-3 py-2 text-[13px] font-bold", feat ? "bg-paper/10" : "bg-bg2")}><span className="data">{p.leads.toLocaleString()}</span> leads {p.lead_period === "lifetime" ? "to try" : "per month"}</p>
                  <ul className="mt-5 flex-1 space-y-2.5 text-[13.5px]">
                    {FEATURE_ROWS.map(([key, label]) => <li key={key} className={cn("flex items-center gap-2.5", !p.features[key] && "opacity-45")}><Check size={15} className={cn("shrink-0", feat ? "text-gold" : "text-moss", !p.features[key] && "invisible")} /><span className={cn(!p.features[key] && "line-through")}>{label}</span></li>)}
                    <li className="flex items-center gap-2.5"><Check size={15} className={cn("shrink-0", feat ? "text-gold" : "text-moss")} />{p.team_seats} seat{p.team_seats > 1 ? "s" : ""}</li>
                  </ul>
                  <Link href={`/signup?plan=${p.id}&interval=${annual ? "annual" : "monthly"}&next=/billing`} className={cn("mt-7", feat ? "btn-primary pill-gold" : p.id === "free" ? "btn-ghost" : "btn-primary")}>{p.id === "free" ? "Start free" : `Choose ${p.label}`} <ArrowRight size={14} /></Link>
                </div>
              </Reveal>);
          })}
        </div>
        <p className="mt-8 text-center text-[12.5px] text-dim">Prices in GBP. Allowances and prices are configurable by the operator. Paid features unlock only after Stripe confirms your payment.</p>
      </div>
    </section>
  );
}

/* ---------- 10 FAQ ---------- */
const FAQ: [string, string][] = [
  ["Where do the contact details come from?", "Only from what creators publish themselves: their YouTube channel description and the official website or contact page linked there. The YouTube API does not expose private email addresses, and TubeLead never guesses, scrapes private data or invents addresses. Each route shows its source."],
  ["What does “publicly published” mean versus “verified”?", "Publicly published means we found the address on a public page. It is not a guarantee the mailbox exists. A separate deliverability check (DNS/MX) can be run, and the two statuses are always shown separately."],
  ["Do I need my own YouTube API key?", "The platform uses the official YouTube Data API. Self-hosted deployments add their own key; quota is monitored with a protected reserve and runs stop gracefully when the daily budget is used."],
  ["Is my ChatGPT / Claude / Gemini subscription enough for AI Connect?", "No. Consumer chat subscriptions don’t include API access. Create an API key in the provider’s developer console (or run a local model with Ollama) and paste it into AI Connect. Keys are stored encrypted and never shown again."],
  ["Will TubeLead send emails for me?", "TubeLead is for discovery and organisation. It has no unsolicited mass-email feature. If you want to email creators, hand leads to SendLoom, which enforces unsubscribes and suppression."],
  ["What happens when I hit my lead allowance?", "Runs are capped so you never exceed the plan, and you’ll see exactly which limit you reached with the option to upgrade. You can still view, filter and export (on paid plans) everything you already have."],
  ["Can I cancel or change plan?", "Yes — upgrade, downgrade or cancel from Billing & Subscription or the Stripe customer portal. Changes take effect when Stripe confirms them."],
];
export function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="scroll-mt-20 bg-bg2/60 py-24">
      <div className="mx-auto grid max-w-[1240px] gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
        <SectionHead n="08" eyebrow="FAQ" title={<>Straight answers, <span className="italic-accent">no</span> fine print.</>} />
        <ul className="divide-y divide-line rounded-[22px] border border-line bg-panel">
          {FAQ.map(([q, a], i) => (
            <li key={q}>
              <h3><button aria-expanded={open === i} aria-controls={`faq-${i}`} onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-heading text-[15.5px] font-bold"><span>{q}</span><ChevronDown size={18} className={cn("shrink-0 text-forest transition", open === i && "rotate-180")} /></button></h3>
              <div id={`faq-${i}`} role="region" hidden={open !== i} className="px-5 pb-5 text-[14.5px] leading-relaxed text-mute">{a}</div>
            </li>))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- 11 Final CTA + 12 Footer ---------- */
export function FinalCTA() {
  return (
    <section className="px-5 py-24 sm:px-8">
      <div className="relative mx-auto max-w-[1240px] overflow-hidden rounded-[32px] bg-forest px-6 py-16 text-center text-paper sm:px-12 sm:py-20">
        <div aria-hidden className="absolute -left-10 -top-10 h-56 w-56 rounded-full bg-forest-400/50" /><div aria-hidden className="absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-terracotta/30" />
        <div className="relative">
          <h2 className="mx-auto max-w-3xl font-display text-[clamp(2rem,5vw,3.8rem)] font-extrabold leading-[1.02] tracking-[-0.04em] text-balance">Find the creators. Build the connections. <span className="text-gold">Grow your network.</span></h2>
          <p className="mx-auto mt-5 max-w-xl text-[17px] text-paper/80">Start with 25 free leads — no card, no commitment.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3.5"><Link href="/signup" className="btn-primary pill-gold">Start discovering <ArrowRight size={15} /></Link><a href="#pricing" className="btn-ghost !border-paper/60 !text-paper hover:!text-forest" style={{ ["--c1" as string]: "transparent", ["--c2" as string]: "transparent" }}>See pricing <ArrowRight size={15} /></a></div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const cols: [string, [string, string][]][] = [
    ["Product", [["Lead generator", "#demo"], ["How it works", "#how"], ["AI integrations", "#ai"], ["Pricing", "#pricing"]]],
    ["Account", [["Sign in", "/login"], ["Create account", "/signup"], ["Billing", "/billing"]]],
    ["Platform", [["SendLoom email marketing", "/mail"], ["FAQ", "#faq"], ["Privacy", "/privacy"], ["Terms", "/terms"]]],
  ];
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div><p className="font-display text-2xl font-extrabold tracking-tight">Tube<span className="text-forest">Lead</span></p><p className="mt-3 max-w-xs text-[14px] text-mute">Find the creators. Build the connections. Grow your network.</p></div>
        {cols.map(([h, links]) => <nav key={h} aria-label={h}><p className="label mb-3">{h}</p><ul className="space-y-2.5 text-[14px]">{links.map(([l, href]) => <li key={l}>{href.startsWith("#") ? <a href={href} className="text-mute hover:text-ink">{l}</a> : href === "/mail" ? <a href={href} className="text-mute hover:text-ink">{l}</a> : <Link href={href} className="text-mute hover:text-ink">{l}</Link>}</li>)}</ul></nav>)}
      </div>
      <div className="border-t border-line"><p className="mx-auto max-w-[1240px] px-5 py-5 text-[12px] text-dim sm:px-8">© {new Date().getFullYear()} TubeLead. Not affiliated with or endorsed by YouTube or Google. YouTube is a trademark of Google LLC.</p></div>
    </footer>
  );
}

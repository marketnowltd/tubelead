"use client";
import { ArrowRight, Briefcase, Gauge, Mail, Megaphone, Sparkles, Users, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CampaignChart, CountryBars, NicheDonut, PerformanceChart, QuotaChart, TrendChart } from "@/components/charts/lazy";
import { WorldMap } from "@/components/map/lazy";
import { ActivityFeed } from "@/components/pages/ActivityFeed";
import { Badge, DemoBanner, EmptyState, ErrorState, Panel, PanelHeader, Skeleton, StatCard } from "@/components/ui/core";
import { useApi } from "@/lib/api";
import { useDemo } from "@/lib/demo";
import { compact } from "@/lib/format";
import type { Overview, Status } from "@/lib/types";

const Loading = ({ h = 240 }: { h?: number }) => <div className="p-5"><div className="skeleton w-full" style={{ height: h }} /></div>;

export default function Dashboard() {
  const router = useRouter();
  const demo = useDemo();
  const { data: o, error, mutate } = useApi<Overview>("/analytics/overview", { refreshInterval: 20000 });
  const { data: st } = useApi<Status>("/status", { refreshInterval: 15000 });
  const empty = o && o.kpis.total === 0;

  return (
    <div className="space-y-6">
      <div id="command-centre" className="scroll-mt-24 pt-2">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div><p className="label mb-1.5 text-forest">Your day at a glance</p><h1 className="font-display text-[30px] font-extrabold leading-none tracking-tight sm:text-[38px]">Good to see you<span className="text-terracotta">.</span></h1><p className="mt-2 max-w-xl text-sm text-mute">Discover creators, review what the engine found, and move the best leads into a campaign.</p></div>
          {st && !st.youtube_configured && <Badge tone="amber" dot>Add YOUTUBE_API_KEY to run real discovery</Badge>}
        </div>

        <DemoBanner count={st?.demo_count ?? 0} onClear={demo.clear} busy={demo.busy} />
        {error && <Panel><ErrorState error={error} onRetry={() => mutate()} /></Panel>}

        {empty ? (
          <Panel glow>
            <EmptyState icon={<Sparkles size={24} />} title="Your creator database is empty"
              body={st?.youtube_configured ? "Run your first discovery to start building a qualified creator database — or load clearly-labelled demonstration data to explore the platform."
                : "Searches will appear here as soon as they run. In the meantime you can explore every screen with clearly-labelled demonstration data."}
              action={<div className="flex flex-wrap justify-center gap-3"><Link href="/lead-generator" className="btn-primary">Start discovering <ArrowRight size={15} /></Link><button className="btn-ghost pill-amber" onClick={demo.seed} disabled={demo.busy}>{demo.busy ? "Loading…" : "Load demo data"}</button></div>} />
          </Panel>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              <StatCard loading={!o} label="Discovered creators" value={o?.kpis.total ?? 0} icon={<Users size={16} />} sub="All time" />
              <StatCard loading={!o} tone="green" label="Qualified leads" value={o?.kpis.qualified ?? 0} icon={<Sparkles size={16} />} sub="Score ≥ 70" />
              <StatCard loading={!o} tone="cyan" label="Public emails" value={o?.kpis.with_email ?? 0} icon={<Mail size={16} />} sub={`${o?.kpis.with_route ?? 0} with any route`} />
              <StatCard loading={!o} tone="magenta" label="Active campaigns" value={o?.kpis.active_campaigns ?? 0} icon={<Megaphone size={16} />} sub="Running now" />
              <StatCard loading={!o} label="Avg. qualification" value={o?.kpis.avg_score ?? 0} icon={<Gauge size={16} />} sub={`${o?.avg_conversion ?? 0}% search yield`} />
              <StatCard loading={!o} tone="cyan" label="API units today" value={o?.quota.today ?? 0} icon={<Zap size={16} />} sub={`of ${compact(o?.quota.daily_limit ?? 0)} daily`} format={(n) => compact(Math.round(n))} />
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <Panel className="xl:col-span-2"><PanelHeader title="Lead acquisition trend" sub="Creators discovered per day · last 30 days" icon={<Briefcase size={16} />} />
                <div className="px-3 pb-4">{o ? <TrendChart data={o.trend} /> : <Loading />}</div></Panel>
              <Panel><PanelHeader title="Live activity" sub="Streaming from the platform" action={<span className="flex items-center gap-1.5 text-[11px] text-moss"><i className="h-1.5 w-1.5 animate-pulseGlow rounded-full bg-moss" />LIVE</span>} />
                <ActivityFeed limit={7} /></Panel>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <Panel className="xl:col-span-2"><PanelHeader title="Global discovery map" sub="Click a country to open its creators" action={<Link className="text-xs font-semibold text-forest hover:underline" href="/creator-intelligence">Open full map →</Link>} />
                <div className="px-4 pb-4">{o ? <WorldMap height={360} data={o.countries.map((c) => ({ country: c.country, count: c.count, avg_score: c.avg_score }))} onSelect={(c) => router.push(`/lead-database?country=${c}`)} /> : <Loading h={360} />}</div></Panel>
              <Panel><PanelHeader title="Niche distribution" sub="Share of discovered creators" />
                <div className="px-5 pb-5">{o ? <NicheDonut data={o.niches} /> : <Loading />}</div></Panel>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel><PanelHeader title="Search performance" sub="Last 10 discovery runs · unique vs qualified" />
                <div className="px-3 pb-4">{o ? (o.search_performance.length ? <PerformanceChart data={o.search_performance} /> : <EmptyState title="No discovery runs yet" />) : <Loading />}</div></Panel>
              <Panel><PanelHeader title="Campaign performance" sub="Leads through the outreach funnel" action={<Link className="text-xs font-semibold text-forest hover:underline" href="/campaigns">Manage →</Link>} />
                <div className="px-3 pb-4">{o ? (o.campaigns.length ? <CampaignChart data={o.campaigns} /> : <EmptyState title="No campaigns yet" body="Create a campaign and assign leads to track outreach." action={<Link href="/campaigns" className="btn-ghost btn-sm">Create campaign</Link>} />) : <Loading />}</div></Panel>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Panel><PanelHeader title="API consumption" sub="YouTube Data API units · 7 days" />
                <div className="px-3 pb-4">{o ? <QuotaChart week={o.quota.week} limit={o.quota.daily_limit} /> : <Loading h={200} />}</div></Panel>
              <Panel><PanelHeader title="Top countries" sub="By creators discovered" />
                <div className="px-3 pb-4">{o ? <CountryBars data={o.countries} /> : <Loading />}</div></Panel>
              <Panel><PanelHeader title="Email trust levels" sub="Published ≠ verified" />
                <div className="space-y-3 px-5 pb-5 pt-1">
                  {o ? (["published", "unverified", "verified"] as const).map((k) => {
                    const total = Object.values(o.email_status).reduce((a, b) => a + b, 0) || 1;
                    const tone = { published: "bg-sage", unverified: "bg-[#C6A46B]", verified: "bg-moss" }[k];
                    const desc = { published: "Found on a public page", unverified: "Added manually, unchecked", verified: "Mailbox-level verified" }[k];
                    return (<div key={k}><div className="mb-1 flex justify-between text-sm"><span className="capitalize">{k} <span className="text-xs text-dim">· {desc}</span></span><span className="data">{o.email_status[k]}</span></div>
                      <div className="h-2 rounded-full bg-ink/[0.06]"><div className={`h-2 rounded-full ${tone}`} style={{ width: `${(o.email_status[k] / total) * 100}%`, transition: "width .8s" }} /></div></div>);
                  }) : <Loading h={140} />}
                  <p className="pt-1 text-[11px] leading-relaxed text-dim">Addresses are only ever collected from public pages. “Verified” is reserved for mailbox-level verification, which needs an email-verification provider.</p>
                </div></Panel>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

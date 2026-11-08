"use client";
import { Activity, Cpu, Gauge, ListChecks, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { JobMonitor, isActiveJob } from "@/components/pages/JobMonitor";
import { Badge, DemoTag, EmptyState, ErrorState, PageHeader, Panel, PanelHeader, Progress, Skeleton, StatCard, statusTone } from "@/components/ui/core";
import { cn } from "@/components/ui/cn";
import { useApi } from "@/lib/api";
import { compact, dateLong, duration, titleCase } from "@/lib/format";
import type { Job, Status } from "@/lib/types";

export default function DiscoveryEngine() {
  const { data: jobs, error, mutate } = useApi<Job[]>("/jobs?limit=40", { refreshInterval: (d) => (d?.some(isActiveJob) ? 2000 : 10000) });
  const { data: st } = useApi<Status>("/status", { refreshInterval: 10000 });
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { if (!sel && jobs?.length) setSel((jobs.find(isActiveJob) ?? jobs[0]).id); }, [jobs, sel]);
  const active = jobs?.filter(isActiveJob).length ?? 0;
  const q = st?.quota;
  const pctUsed = q ? (q.used / q.daily_limit) * 100 : 0;
  const real = jobs?.filter((j) => !j.is_demo) ?? [];
  const totalFound = real.reduce((s, j) => s + j.unique_found, 0);

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Discovery Engine" sub="Every discovery job, live. State is persisted in the database, so progress survives reloads and server restarts are detected and flagged." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active jobs" value={active} icon={<Cpu size={16} />} tone="cyan" loading={!jobs} sub={jobs ? `${jobs.filter((j) => j.status === "queued").length} queued · ${jobs.filter((j) => j.status === "running").length} running · ${jobs.filter((j) => j.status === "paused").length} paused` : "…"} />
        <StatCard label="Jobs listed" value={jobs?.length ?? 0} icon={<ListChecks size={16} />} loading={!jobs} sub={`${real.length} real · ${(jobs?.length ?? 0) - real.length} demo`} />
        <StatCard label="Unique channels (real)" value={totalFound} icon={<Activity size={16} />} tone="green" loading={!jobs} sub="Across listed real jobs" format={(n) => compact(Math.round(n))} />
        <Panel className="p-4"><div className="flex items-start justify-between"><p className="label">API quota today</p><span className="grid h-8 w-8 place-items-center rounded-lg bg-sage/10 text-moss ring-1 ring-sage/30"><Zap size={16} /></span></div>
          <p className="data mt-2 text-[28px] font-semibold leading-none">{q ? compact(q.used) : "…"}<span className="text-base text-dim"> / {q ? compact(q.daily_limit) : ""}</span></p><Progress label="YouTube API units used today" value={pctUsed} tone="cyan" className="mt-3" /><p className="mt-1.5 text-[11px] text-dim">{q ? `${compact(q.reserve)} reserved · resets 00:00 UTC` : ""}</p></Panel>
      </div>
      {st && !st.youtube_configured && <div className="mb-6 rounded-xl border border-[#C6A46B]/30 bg-[#C6A46B]/[0.07] p-4 text-sm text-[#6E5420]"><Gauge size={16} className="mr-2 inline" />The engine is idle: <code className="data rounded bg-ink/10 px-1">YOUTUBE_API_KEY</code> is not configured. <Link href="/integrations" className="underline">See setup →</Link></div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Panel className="overflow-hidden"><PanelHeader title="Job history" sub="Select a job to inspect it" action={<Link href="/lead-generator" className="btn-primary !px-3 !py-1.5 !text-[11px]">New job</Link>} />
          {error ? <ErrorState error={error} onRetry={() => mutate()} /> : !jobs ? <div className="space-y-2 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div> : jobs.length === 0 ? (
            <EmptyState title="No discovery jobs yet" body="Start one from the Lead Generator." action={<Link href="/lead-generator" className="btn-primary">Open Lead Generator</Link>} />) : (
            <ul className="divide-y divide-line">{jobs.map((j) => (
              <li key={j.id}><button onClick={() => setSel(j.id)} aria-pressed={sel === j.id} className={cn("flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-forest-50", sel === j.id && "bg-forest-50")}>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{[...(j.params.keywords ?? []), ...(j.params.niches ?? [])].slice(0, 3).join(", ") || "Discovery"} {j.is_demo && <DemoTag />}</p>
                  <p className="mt-0.5 text-[11px] text-dim">{titleCase(j.mode)} · {dateLong(j.created_at)}{j.finished_at && j.started_at ? ` · ${duration(Math.round((+new Date(j.finished_at) - +new Date(j.started_at)) / 1000))}` : ""}</p></div>
                <div className="hidden text-right sm:block"><p className="data text-sm">{j.qualified}<span className="text-dim"> / {j.unique_found}</span></p><p className="text-[10px] text-dim">qualified / unique</p></div>
                <Badge tone={statusTone[j.status]} dot>{titleCase(j.status)}</Badge></button></li>))}</ul>)}
        </Panel>
        <Panel glow={!!jobs?.some(isActiveJob)} className="xl:sticky xl:top-24 xl:self-start"><PanelHeader title="Job inspector" sub="Live counters, current operation and log" />
          {sel ? <JobMonitor key={sel} jobId={sel} /> : <EmptyState title="Select a job" />}</Panel>
      </div>
    </div>
  );
}

"use client";
import { Bot, CalendarClock, Webhook } from "lucide-react";
import Link from "next/link";
import { N8nConfig } from "@/components/pages/N8nCard";
import { Badge, EmptyState, ErrorState, PageHeader, Panel, PanelHeader, Skeleton, statusTone } from "@/components/ui/core";
import { useToast } from "@/components/ui/overlay";
import { api, useApi } from "@/lib/api";
import { ago, dateLong, titleCase } from "@/lib/format";
import type { Job, SavedSearch, Status } from "@/lib/types";

const SAMPLE = `POST <your webhook URL>
{
  "event": "discovery.completed",   // or discovery.failed / discovery.cancelled
  "job_id": "3f1c…",
  "status": "completed",
  "qualified": 24,
  "unique_found": 187,
  "duplicates_removed": 41,
  "quota_used": 612,
  "error": null
}`;

export default function Automation() {
  const toast = useToast();
  const { data: st } = useApi<Status>("/status");
  const { data: ss, error, mutate } = useApi<SavedSearch[]>("/saved-searches");
  const { data: jobs } = useApi<Job[]>("/jobs?limit=40", { refreshInterval: 15000 });
  const scheduled = ss?.filter((s) => s.schedule !== "none") ?? [];
  const setSchedule = async (s: SavedSearch, schedule: string) => { try { await api(`/saved-searches/${s.id}`, { method: "PATCH", json: { schedule } }); toast("success", schedule === "none" ? "Schedule paused" : `Now runs ${schedule}`); mutate(); } catch (e: any) { toast("error", e.message); } };
  return (
    <div>
      <PageHeader eyebrow="Hands-free" title="Automation Centre" sub="Scheduled discovery runs and outbound webhooks (n8n) so finished jobs can trigger the rest of your workflow." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Panel className="p-4"><p className="label">Scheduler</p><div className="mt-2 flex items-center gap-2"><Badge tone={st?.scheduler_enabled ? "green" : "red"} dot>{st ? (st.scheduler_enabled ? "Running" : "Disabled") : "…"}</Badge></div><p className="mt-2 text-[11px] text-dim">Checks for due searches every 30 s while the API process is up.</p></Panel>
        <Panel className="p-4"><p className="label">Scheduled searches</p><p className="data mt-1.5 text-3xl font-semibold">{ss ? scheduled.length : "…"}</p><p className="mt-1 text-[11px] text-dim">of {ss?.length ?? 0} saved</p></Panel>
        <Panel className="p-4"><p className="label">Needs YouTube key?</p><div className="mt-2"><Badge tone={st?.youtube_configured ? "green" : "amber"} dot>{st ? (st.youtube_configured ? "Key configured" : "Key missing — runs are skipped") : "…"}</Badge></div></Panel>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Panel className="overflow-hidden"><PanelHeader title="Scheduled discovery" icon={<CalendarClock size={16} />} sub="Change cadence here; create new schedules in the Lead Generator" action={<Link href="/lead-generator" className="text-xs font-semibold text-forest hover:underline">New →</Link>} />
          {error ? <ErrorState error={error} onRetry={() => mutate()} /> : !ss ? <Skeleton className="m-5 h-24" /> : ss.length === 0 ? <EmptyState icon={<Bot size={22} />} title="Nothing scheduled" body="In the Lead Generator choose “Scheduled Discovery”, or save a search and set its cadence on the Saved Searches page." /> : (
            <ul className="divide-y divide-line">{ss.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{s.name}</p><p className="mt-0.5 text-[11px] text-dim">{s.schedule === "none" ? "Not scheduled" : `Next: ${dateLong(s.next_run_at)}`} · {s.run_count} run(s){s.last_run_at ? ` · last ${ago(s.last_run_at)}` : ""}</p></div>
                <select aria-label={`Cadence for ${s.name}`} className="field !w-auto !py-1.5 text-xs" value={s.schedule} onChange={(e) => setSchedule(s, e.target.value)}><option value="none">Paused</option><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></li>))}</ul>)}
        </Panel>
        <div className="space-y-6">
          <Panel><PanelHeader title="n8n webhook" icon={<Webhook size={16} />} sub="Receive an event whenever a job finishes" /><div className="px-5 pb-5"><N8nConfig /></div></Panel>
          <Panel><PanelHeader title="Event payload" sub="What n8n receives" /><pre className="data mx-5 mb-5 overflow-x-auto rounded-xl border border-forest/15 bg-[#EFEAE0] p-3 text-[11.5px] leading-relaxed text-mute">{SAMPLE}</pre></Panel>
        </div>
      </div>
      <Panel className="mt-6 overflow-hidden"><PanelHeader title="Recent runs" sub="Latest jobs, manual and scheduled" />
        {!jobs ? <Skeleton className="m-5 h-20" /> : jobs.filter((j) => !j.is_demo).length === 0 ? <p className="px-5 pb-6 text-sm text-mute">No real runs yet.</p> : (
          <ul className="divide-y divide-line pb-1">{jobs.filter((j) => !j.is_demo).slice(0, 8).map((j) => <li key={j.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span className="truncate">{[...(j.params.keywords ?? []), ...(j.params.niches ?? [])].slice(0, 3).join(", ")}</span><span className="flex shrink-0 items-center gap-3"><span className="text-xs text-dim">{ago(j.created_at)}</span><span className="data text-xs">{j.qualified} leads</span><Badge tone={statusTone[j.status]}>{titleCase(j.status)}</Badge></span></li>)}</ul>)}
      </Panel>
    </div>
  );
}

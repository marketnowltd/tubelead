"use client";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import type { Job } from "@/lib/types";

/** Live progress for a discovery job: a geometric ring that fills with the percentage, and each step as it completes.
 *  Every number comes from the job record, so the percentage moves only when real work finishes. */
export function jobPercent(j: Job): number {
  if (j.status === "completed") return 100;
  if (j.status === "failed" || j.status === "cancelled") return Math.round(percentRaw(j) * 100);
  return Math.min(99, Math.round(percentRaw(j) * 100));
}

function percentRaw(j: Job): number {
  const search = j.queries_total ? j.queries_done / j.queries_total : 0;
  const enrich = j.enrich_total ? j.enriched / j.enrich_total : 0;
  const goal = Math.min(1, j.qualified / Math.max(j.params?.limit ?? 1, 1));
  return 0.45 * search + 0.35 * enrich + 0.2 * goal;
}

export function GeometricProgress({ job }: { job: Job }) {
  const pct = jobPercent(job);
  const steps = [
    { label: "Planning searches", done: job.queries_total > 0 },
    { label: "Searching YouTube", done: job.queries_total > 0 && job.queries_done >= job.queries_total },
    { label: "Removing duplicates and big brands", done: job.unique_found > 0 || job.queries_done >= job.queries_total },
    { label: "Checking channels for public emails", done: job.enrich_total > 0 && job.enriched >= job.enrich_total },
    { label: "Saving unique creators", done: job.status === "completed" },
  ];
  const current = steps.findIndex((s) => !s.done);
  const running = ["queued", "running", "cancelling"].includes(job.status);
  const r = 84, c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-5 py-2">
      <div className="relative h-[210px] w-[210px]" role="img" aria-label={`Discovery ${pct}% complete`}>
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
          <defs>
            <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#7B3FF2" /><stop offset=".55" stopColor="#E0237F" /><stop offset="1" stopColor="#FF9A3D" />
            </linearGradient>
          </defs>
          <circle cx="100" cy="100" r={r} fill="none" stroke="#EFEAFB" strokeWidth="14" />
          <circle cx="100" cy="100" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="14" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: "stroke-dashoffset .6s ease" }} />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="data text-[38px] font-semibold leading-none text-ink">{pct}%</p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-forest">{job.status === "completed" ? "Done" : job.status === "paused" ? "Paused" : "In progress"}</p>
          </div>
        </div>
      </div>
      <ol className="w-full max-w-sm space-y-2 text-[13px]" aria-label="Steps">
        {steps.map((s, i) => {
          const active = !s.done && i === current && running;
          return (
            <li key={s.label} className={`flex items-center gap-2.5 ${s.done ? "text-ink" : "text-dim"}`}>
              {s.done ? <CheckCircle2 size={16} className="shrink-0 text-moss" /> : active ? <Loader2 size={16} className="shrink-0 animate-spin text-forest" /> : <Circle size={16} className="shrink-0" />}
              <span className={active ? "font-semibold text-forest" : ""}>{s.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Results summary in the style of the discovery dashboard. Every number is a stored job counter. */
export function ResultsCard({ job }: { job: Job }) {
  const secs = job.started_at ? Math.max(0, Math.round(((job.finished_at ? new Date(job.finished_at) : new Date()).getTime() - new Date(job.started_at).getTime()) / 1000)) : 0;
  const stats: [string, number | string][] = [
    ["Creators", job.qualified],
    ["Contacts", job.contact_routes_found],
    ["Duplicates", job.duplicates_removed],
    ["Scan time", `${secs}s`],
  ];
  return (
    <div className="rounded-[20px] bg-gradient-to-br from-[#2A1466] to-[#4B1A8C] p-5 text-white shadow-lg">
      <div className="flex items-center justify-between">
        <p className="font-heading text-sm font-semibold text-white/80">Discovery results</p>
        <span className="rounded-full bg-moss px-3 py-1 text-[11px] font-bold">{job.status === "completed" ? "Completed" : job.status}</span>
      </div>
      <p className="data mt-3 text-[48px] font-semibold leading-none">{job.qualified}</p>
      <p className="text-sm text-white/75">Leads found{job.params?.limit ? ` of ${job.params.limit} requested` : ""}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(([l, v]) => (
          <div key={l} className="rounded-xl bg-white/10 p-3 text-center">
            <p className="data text-xl font-semibold">{v}</p>
            <p className="mt-0.5 text-[11px] text-white/70">{l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

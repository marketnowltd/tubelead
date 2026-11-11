"use client";
import { AnimatePresence, motion } from "motion/react";
import { AlertOctagon, CheckCircle2, CopyMinus, Layers, Link2, Loader2, Pause, Play, Radar, Sparkles, Square, Tags, XCircle, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { dateLong, duration, num, titleCase } from "@/lib/format";
import type { Job } from "@/lib/types";
import { Badge, DemoTag, Progress, Skeleton, statusTone } from "../ui/core";
import { GeometricProgress } from "./GeometricProgress";
import { useToast } from "../ui/overlay";

export const isActiveJob = (j?: Job | null) => !!j && ["queued", "running", "paused", "cancelling"].includes(j.status);

function Tile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <p className="label flex items-center gap-1.5">{icon}{label}</p>
      <p className="data mt-1.5 text-xl font-semibold leading-none">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-dim">{sub}</p>}
    </div>
  );
}

/** Real job telemetry: every number is a database counter written by the discovery worker. */
export function JobMonitor({ jobId, compact }: { jobId: string; compact?: boolean }) {
  const toast = useToast();
  const [cancelling, setCancelling] = useState(false);
  const { data: job, error, mutate } = useApi<Job>(`/jobs/${jobId}`, { refreshInterval: (j) => (isActiveJob(j) ? 1500 : 0) });
  // tell the TubeLead Helper when a search it watched finishes (not for jobs that were already finished when opened)
  const wasActive = useRef(false);
  useEffect(() => {
    if (!job) return;
    if (isActiveJob(job)) wasActive.current = true;
    else if (wasActive.current && job.status === "completed") {
      wasActive.current = false;
      window.dispatchEvent(new CustomEvent("tubelead:helper", { detail: { type: "search_completed", found: job.qualified, jobId: job.id } }));
    }
  }, [job]);
  if (error) return <p className="p-5 text-sm text-[#A33A2A]">{error.message}</p>;
  if (!job) return <div className="space-y-3 p-5"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-2 w-full" /><div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div></div>;
  const active = isActiveJob(job);
  const qPct = job.queries_total ? (job.queries_done / job.queries_total) * 100 : 0;
  const limit = job.params.limit ?? 1;
  const goalPct = Math.min(100, (job.qualified / limit) * 100);
  const enrichPct = job.enrich_total ? (job.enriched / job.enrich_total) * 100 : 0;
  const act = async (what: "pause" | "resume") => {
    try { await api(`/jobs/${job.id}/${what}`, { method: "POST" }); mutate(); } catch (e: any) { toast("error", e.message); }
  };
  const cancel = async () => {
    setCancelling(true);
    try { await api(`/jobs/${job.id}/cancel`, { method: "POST" }); mutate(); } catch (e: any) { toast("error", e.message); } finally { setCancelling(false); }
  };
  const StatusIcon = job.status === "completed" ? CheckCircle2 : job.status === "failed" || job.status === "cancelled" ? XCircle : Loader2;
  return (
    <div className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <StatusIcon size={20} className={job.status === "running" || job.status === "queued" ? "animate-spin text-moss" : active ? "text-gold-text" : job.status === "completed" ? "text-moss" : "text-[#A33A2A]"} />
          <Badge tone={statusTone[job.status]} dot>{titleCase(job.status)}</Badge>
          <Badge tone="purple">{titleCase(job.mode)}</Badge>
          {job.is_demo && <DemoTag />}
        </div>
        <div className="flex flex-wrap gap-2">
        {job.status === "running" && <button onClick={() => act("pause")} className="btn-ghost btn-sm"><Pause size={12} /> Pause</button>}
        {job.status === "paused" && <button onClick={() => act("resume")} className="btn-primary btn-sm pill-forest"><Play size={12} /> Resume</button>}
        {active && <button onClick={cancel} disabled={cancelling || job.status === "cancelling"} className="btn-ghost btn-sm"><Square size={12} /> {job.status === "cancelling" ? "Cancelling…" : "Cancel job"}</button>}
        </div>
      </div>

      <div className="mt-4"><GeometricProgress job={job} /></div>

      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-bg2 p-3.5">
        <p className="label mb-1 flex items-center gap-1.5"><Radar size={12} className="text-moss" /> Current operation</p>
        <AnimatePresence mode="wait">
          <motion.p key={job.current_operation} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="data break-words text-[13px] leading-snug text-ink">{job.current_operation}</motion.p>
        </AnimatePresence>
        <Progress label="Qualified leads toward goal" value={goalPct} tone="purple" animated={active} className="mt-3" />
        <div className="mt-1.5 flex justify-between text-[11px] text-dim"><span>{job.qualified} / {limit} qualified leads</span><span>{active ? `ETA ${duration(job.eta_seconds)}` : job.finished_at ? `Finished ${dateLong(job.finished_at)}` : ""}</span></div>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"}`}>
        <Tile icon={<Layers size={12} />} label="Channels found" value={num(job.channels_found)} sub={`${job.queries_done}/${job.queries_total} searches`} />
        <Tile icon={<Sparkles size={12} />} label="Unique channels" value={num(job.unique_found)} sub={`${job.rejected} rejected by filters`} />
        <Tile icon={<CopyMinus size={12} />} label="Duplicates removed" value={num(job.duplicates_removed)} sub="Already known / repeated" />
        <Tile icon={<CheckCircle2 size={12} />} label="Qualified creators" value={<span className="text-moss">{num(job.qualified)}</span>} sub="Passed every filter" />
        <Tile icon={<Tags size={12} />} label="Keywords processed" value={num(job.keywords_done)} sub={`${job.queries_total} search operations`} />
        <Tile icon={<Link2 size={12} />} label="Contact routes found" value={num(job.contact_routes_found)} sub="Public emails, sites, forms" />
        <Tile icon={<AlertOctagon size={12} />} label="Failed requests" value={<span className={job.failed_requests ? "text-[#A33A2A]" : ""}>{num(job.failed_requests)}</span>} sub="Skipped, job continued" />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel p-3"><div className="mb-1.5 flex justify-between text-[11px]"><span className="label">Enrichment</span><span className="data text-mute">{job.enriched}/{job.enrich_total}</span></div><Progress label="Enrichment progress" value={enrichPct} tone="cyan" /><p className="mt-1.5 text-[11px] text-dim">Engagement + public contact routes</p></div>
        <div className="rounded-xl border border-line bg-panel p-3"><div className="mb-1.5 flex justify-between text-[11px]"><span className="label flex items-center gap-1"><Zap size={11} className="text-moss" />API quota</span><span className="data text-mute">{num(job.quota_used)} / {num(job.params.max_quota_units ?? 1500)}</span></div><Progress label="API quota used by this job" value={(job.quota_used / (job.params.max_quota_units ?? 1500)) * 100} tone="green" /><p className="mt-1.5 text-[11px] text-dim">Units spent by this job (cap shown)</p></div>
      </div>

      {job.error && <p role="alert" className="mt-3 rounded-lg border border-[#B5493A]/30 bg-[#B5493A]/10 px-3 py-2 text-xs text-[#A33A2A]">{job.error}</p>}
      {!compact && job.log.length > 0 && (
        <div className="mt-4"><p className="label mb-1.5">Job log</p>
          <ol className="data max-h-44 overflow-y-auto rounded-xl border border-forest/15 bg-bg2 p-3 text-[11.5px] leading-relaxed text-mute">{job.log.map((l, i) => <li key={i}>{l}</li>)}</ol></div>
      )}
      {job.status !== "queued" && job.qualified > 0 && !job.is_demo && (
        <Link href={`/lead-database?job_id=${job.id}`} className="btn-ghost btn-sm mt-4">View {job.qualified} discovered creators →</Link>
      )}
    </div>
  );
}

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
  const R = 72, cx = 100, cy = 100;
  // Six triangles around a hexagon. Each lights up as the percentage passes its share.
  const seg = (i: number) => {
    const a0 = (Math.PI / 3) * i - Math.PI / 2, a1 = a0 + Math.PI / 3;
    const p = (a: number) => `${cx + R * Math.cos(a)},${cy + R * Math.sin(a)}`;
    return `M${cx},${cy} L${p(a0)} L${p(a1)} Z`;
  };
  const lit = (i: number) => pct >= (i + 1) * (100 / 6);
  const running = ["queued", "running", "cancelling"].includes(job.status);

  return (
    <div className="flex flex-col items-center gap-5 py-2">
      <div className="relative h-[200px] w-[200px]" role="img" aria-label={`Discovery ${pct}% complete`}>
        <svg viewBox="0 0 200 200" className="h-full w-full">
          <circle cx={cx} cy={cy} r={92} fill="none" stroke="#E4DED2" strokeWidth="2" strokeDasharray="3 7" className={running ? "origin-center animate-[spin_18s_linear_infinite]" : ""} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path key={i} d={seg(i)} fill={lit(i) ? "#244A3A" : "#EFEAE0"} stroke="#FFFDF8" strokeWidth="3" style={{ transition: "fill .5s ease" }} />
          ))}
          <circle cx={cx} cy={cy} r={48} fill="#FFFDF8" stroke="#E4DED2" strokeWidth="1" />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="data text-[34px] font-semibold leading-none text-forest">{pct}%</p>
            <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-dim">{job.status === "completed" ? "Done" : job.status === "paused" ? "Paused" : "Complete"}</p>
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

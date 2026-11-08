"use client";
import { Activity, Bot, CheckCircle2, Megaphone, Radar, Sparkles, XCircle } from "lucide-react";
import { useApi } from "@/lib/api";
import { ago } from "@/lib/format";
import type { ActivityItem } from "@/lib/types";
import { DemoTag, EmptyState, ErrorState, Skeleton } from "../ui/core";

const ICON: Record<string, any> = { job_completed: CheckCircle2, job_failed: XCircle, job_started: Radar, job_cancelled: XCircle, contacts: Sparkles, campaign: Megaphone, schedule: Bot };

export function ActivityFeed({ limit = 8 }: { limit?: number }) {
  const { data, error, mutate } = useApi<ActivityItem[]>(`/activity?limit=${limit}`, { refreshInterval: 8000 });
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <div className="space-y-3 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>;
  if (!data.length) return <EmptyState icon={<Activity size={22} />} title="No activity yet" body="Discovery runs, contact scans and campaign changes will stream in here." />;
  return (
    <ul className="relative px-5 pb-4">
      <span aria-hidden className="absolute bottom-6 left-[34px] top-2 w-px bg-gradient-to-b from-forest/50 to-transparent" />
      {data.map((a, i) => {
        const I = ICON[a.kind] ?? Activity;
        return (
          <li key={a.id} className="relative flex gap-3 py-2.5">
            <span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#FFFDF8] ring-1 ${i === 0 ? "text-moss ring-sage/50 shadow-[0_0_14px_-2px_#6F8668]" : "text-forest ring-forest/30"}`}><I size={14} /></span>
            <div className="min-w-0"><p className="text-[13px] leading-snug">{a.message.replace(/^DEMO · /, "")} {a.is_demo && <DemoTag />}</p><p className="mt-0.5 text-[11px] text-dim">{ago(a.created_at)}</p></div>
          </li>
        );
      })}
    </ul>
  );
}

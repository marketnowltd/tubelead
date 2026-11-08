"use client";
import { CheckCircle2, Clock3 } from "lucide-react";
import { Badge, ErrorState, PageHeader, Panel, Skeleton } from "@/components/ui/core";
import { useApi } from "@/lib/api";
import type { Integration } from "@/lib/types";

/** What the user needs to know: is each part of TubeLead working. Setup instructions belong to the site owner, not here. */
const FRIENDLY: Record<string, { name: string; ready: string; waiting: string }> = {
  youtube: { name: "Creator search", ready: "Ready — search for leads any time.", waiting: "Being prepared. Search will be available shortly." },
  supabase: { name: "Your data", ready: "Saved securely to your account.", waiting: "Saving is temporarily unavailable." },
  auth: { name: "Sign-in", ready: "You're signed in securely.", waiting: "Sign-in is being set up." },
  ai: { name: "AI suggestions", ready: "Smart suggestions are on.", waiting: "Optional — basic search works without them." },
  stripe: { name: "Plans and billing", ready: "Upgrades are available.", waiting: "Upgrades are coming soon." },
};

export default function Integrations() {
  const { data, error, mutate } = useApi<Integration[]>("/integrations", { refreshInterval: 20000 });
  const items = (data ?? []).filter((i) => FRIENDLY[i.id]);
  return (
    <div>
      <PageHeader eyebrow="Your workspace" title="Service status" sub="Everything TubeLead needs to find and save your leads, at a glance." />
      {error ? <Panel><ErrorState error={error} onRetry={() => mutate()} /></Panel> : !data ? <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div> : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((i) => {
            const f = FRIENDLY[i.id];
            return (
              <Panel key={i.id} className="flex items-start gap-3 p-5">
                <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ${i.connected ? "bg-moss/10 text-moss ring-moss/30" : "bg-gold/15 text-gold-text ring-gold/40"}`}>
                  {i.connected ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-heading text-base font-semibold">{f.name}</h3>
                    <Badge tone={i.connected ? "green" : "amber"} dot>{i.connected ? "Ready" : "Preparing"}</Badge>
                  </div>
                  <p className="mt-1 text-[13px] text-mute">{i.connected ? f.ready : f.waiting}</p>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}

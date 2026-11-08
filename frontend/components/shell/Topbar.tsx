"use client";
import { Bell, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApi } from "@/lib/api";
import type { ActivityItem, Status } from "@/lib/types";
import { ago } from "@/lib/format";
import { Badge } from "../ui/core";
import { Sheet } from "../ui/overlay";

export function Topbar() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data: st, error } = useApi<Status>("/status", { refreshInterval: 15000 });
  const { data: act } = useApi<ActivityItem[]>(open ? "/activity?limit=30" : null);
  return (
    <div className="sticky top-0 z-30 hidden h-[72px] items-center gap-4 border-b border-line bg-bg/85 px-8 backdrop-blur-xl lg:flex">
      <form role="search" onSubmit={(e) => { e.preventDefault(); router.push(`/lead-database?q=${encodeURIComponent(q)}`); }} className="relative max-w-md flex-1">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dim" />
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Global search" placeholder="Search creators, niches, handles…" className="field !rounded-xl !py-2.5 !pl-10" />
        <kbd className="data absolute right-3 top-1/2 -translate-y-1/2 rounded border border-line px-1.5 text-[10px] text-dim">↵</kbd>
      </form>
      <div className="ml-auto flex items-center gap-3">
        {error ? <Badge tone="red" dot>Offline</Badge> : st && st.youtube_configured ? <Badge tone="green" dot>Search ready</Badge> : null}
        {st && <Badge tone="neutral" className="uppercase">{st.database}</Badge>}
        <button onClick={() => setOpen(true)} aria-label="Open activity feed" className="relative grid h-10 w-10 place-items-center rounded-xl border border-line bg-panel text-mute transition hover:border-forest/50 hover:text-ink">
          <Bell size={18} /><span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-terracotta" />
        </button>
        <Link href="/lead-generator" className="btn-primary !px-4 !py-2.5 !text-xs"><Plus size={15} /> New discovery</Link>
      </div>
      <Sheet open={open} onOpenChange={setOpen} title="Activity" description="Recent platform events">
        <ul className="divide-y divide-line">
          {(act ?? []).map((a) => (
            <li key={a.id} className="px-5 py-3 text-sm"><p>{a.message}</p><p className="mt-1 text-[11px] text-dim">{ago(a.created_at)}</p></li>
          ))}
          {act && act.length === 0 && <li className="px-5 py-10 text-center text-sm text-mute">No activity yet.</li>}
        </ul>
      </Sheet>
    </div>
  );
}

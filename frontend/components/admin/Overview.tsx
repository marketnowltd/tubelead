"use client";
import { AlertTriangle, CreditCard, Info, LifeBuoy, PoundSterling, RotateCcw, UserPlus, Users, XCircle } from "lucide-react";
import { Panel, PanelHeader, StatCard } from "@/components/ui/core";
import { ago } from "@/lib/format";
import { ACTION_LABEL, type Overview as O } from "./shared";

export function OverviewTab({ data }: { data: O }) {
  const gbp = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Registered users" value={data.users_total} icon={<Users size={18} />} sub={`${data.users_new_7d} new this week`} />
        <StatCard label="Active (30 days)" value={data.users_active_30d} icon={<UserPlus size={18} />} tone="cyan" />
        <StatCard label="Active subscriptions" value={data.subscriptions_active} icon={<CreditCard size={18} />} tone="green" />
        <StatCard label="Monthly recurring revenue" value={data.mrr_gbp} format={gbp} icon={<PoundSterling size={18} />} tone="magenta" sub={`${gbp(data.revenue_total_gbp)} collected in total`} />
        <StatCard label="Open support tickets" value={data.tickets_open} icon={<LifeBuoy size={18} />} />
        <StatCard label="Refund requests to review" value={data.refunds_pending} icon={<RotateCcw size={18} />} tone="magenta" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="System alerts" icon={<AlertTriangle size={16} />} />
          {data.alerts.length === 0 ? <p className="px-5 pb-5 text-sm text-mute">No alerts.</p> : (
            <ul className="space-y-2 px-5 pb-5">{data.alerts.map((a, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13px]">
                {a.level === "error" ? <XCircle size={15} className="mt-0.5 shrink-0 text-[#B5493A]" /> : a.level === "warning" ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-gold-text" /> : <Info size={15} className="mt-0.5 shrink-0 text-forest" />}
                {a.message}
              </li>))}</ul>
          )}
        </Panel>
        <Panel>
          <PanelHeader title="Recent activity" />
          {data.recent_activity.length === 0 ? <p className="px-5 pb-5 text-sm text-mute">Nothing yet.</p> : (
            <ul className="divide-y divide-line pb-2">{data.recent_activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                <span className="min-w-0 truncate">{ACTION_LABEL[a.action] ?? a.action}{a.target_id ? <span className="data text-mute"> · {a.target_id.slice(0, 14)}</span> : null}</span>
                <span className="shrink-0 text-[11px] text-mute">{ago(a.created_at)}</span>
              </li>))}</ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

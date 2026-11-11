"use client";
import { ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AssistantTab } from "@/components/admin/Assistant";
import { CustomersTab, SubscriptionsTab } from "@/components/admin/Customers";
import { OverviewTab } from "@/components/admin/Overview";
import { RefundsTab } from "@/components/admin/Refunds";
import { isAdmin, type Overview } from "@/components/admin/shared";
import { SystemTab } from "@/components/admin/System";
import { TicketsTab } from "@/components/admin/Tickets";
import { EmptyState, ErrorState, PageHeader, Panel, Skeleton } from "@/components/ui/core";
import { useApi } from "@/lib/api";

const TABS = [
  { id: "overview", label: "Overview", admin: false }, { id: "tickets", label: "Support tickets", admin: false }, { id: "refunds", label: "Refund requests", admin: true },
  { id: "customers", label: "Customers", admin: true }, { id: "subscriptions", label: "Subscriptions", admin: true }, { id: "assistant", label: "Assistant & help", admin: false },
  { id: "system", label: "System", admin: true },
] as const;

function Admin() {
  const router = useRouter();
  const params = useSearchParams();
  const { data, error, mutate } = useApi<Overview>("/admin/overview", { refreshInterval: 30000 });
  if (error) return error.status === 403
    ? <Panel><EmptyState icon={<ShieldCheck size={24} />} title="Staff only" body="This area is for the TubeLead team." /></Panel>
    : <Panel><ErrorState error={error} onRetry={() => mutate()} /></Panel>;
  if (!data) return <Skeleton className="h-64" />;
  const tabs = TABS.filter((t) => !t.admin || isAdmin(data.role));
  const tab = tabs.find((t) => t.id === params.get("tab"))?.id ?? "overview";
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Admin sections" className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => router.replace(`/admin?tab=${t.id}`, { scroll: false })}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition ${tab === t.id ? "bg-forest text-paper shadow-card" : "text-mute hover:text-ink"}`}>
            {t.label}{t.id === "tickets" && data.tickets_open > 0 ? ` (${data.tickets_open})` : ""}{t.id === "refunds" && data.refunds_pending > 0 ? ` (${data.refunds_pending})` : ""}
          </button>))}
      </div>
      {tab === "overview" && <OverviewTab data={data} />}
      {tab === "tickets" && <TicketsTab />}
      {tab === "refunds" && <RefundsTab />}
      {tab === "customers" && <CustomersTab myRole={data.role} />}
      {tab === "subscriptions" && <SubscriptionsTab />}
      {tab === "assistant" && <AssistantTab myRole={data.role} />}
      {tab === "system" && <SystemTab />}
    </div>
  );
}

export default function AdminPage() {
  return (
    <div>
      <PageHeader eyebrow="Private" title="Admin" sub="Customers, support, refunds and system health. Every change is recorded in the audit log." />
      <Suspense fallback={<Skeleton className="h-64" />}><Admin /></Suspense>
    </div>
  );
}

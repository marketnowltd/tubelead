"use client";
import { ArrowRight, ListChecks } from "lucide-react";
import Link from "next/link";
import { Badge, EmptyState, ErrorState, PageHeader, Panel, PanelHeader, Skeleton } from "@/components/ui/core";
import { Switch } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/overlay";
import { api, useApi } from "@/lib/api";
import type { AIProviderRow, AITask, AIUsage } from "@/lib/types";

export default function AITasksPage() {
  const toast = useToast();
  const { data: tasks, error, mutate } = useApi<AITask[]>("/ai/tasks");
  const { data: provs } = useApi<AIProviderRow[]>("/ai/providers");
  const { data: usage } = useApi<AIUsage>("/ai/usage?days=30");
  const usable = (provs ?? []).filter((p) => p.status !== "disabled");
  const save = async (t: AITask, patch: Partial<AITask>) => {
    const next = { ...t, ...patch };
    try { await api(`/ai/tasks/${t.task}`, { method: "PUT", json: { provider_id: next.provider_id, fallback_provider_id: next.fallback_provider_id, enabled: next.enabled } }); mutate(); toast("success", `${t.label} updated`); }
    catch (e: any) { toast("error", e.message); }
  };
  const name = (id: string | null) => { const p = provs?.find((x) => x.id === id); return p ? `${p.provider_label} · ${p.label}` : null; };
  return (
    <div>
      <PageHeader eyebrow="Intelligence" title="AI Task Manager" sub="Decide which provider handles each kind of job. A task can use its own provider, fall back to another, follow your default, or be switched off entirely."
        actions={<Link href="/ai-connect" className="btn-ghost btn-sm">AI Connect <ArrowRight size={13} /></Link>} />
      {provs && usable.length === 0 && (
        <Panel className="mb-6"><EmptyState icon={<ListChecks size={22} />} title="Connect a provider first" body="Tasks need an AI provider. Until you connect one, the search assistant and keyword ideas use built-in rules." action={<Link href="/ai-connect" className="btn-primary btn-sm">Connect a provider <ArrowRight size={13} /></Link>} /></Panel>
      )}
      <Panel><PanelHeader title="Task routing" icon={<ListChecks size={16} />} sub="Routing order: assigned provider → fallback → your default provider. Failures are retried with back-off before falling back." />
        {error ? <ErrorState error={error} onRetry={() => mutate()} /> : !tasks ? <Skeleton className="m-5 h-40" /> : (
          <ul className="divide-y divide-line">{tasks.map((t) => {
            const u = usage?.by_task[t.task];
            return (
              <li key={t.task} className="grid gap-4 px-5 py-4 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-center">
                <div><p className="flex items-center gap-2 font-heading text-[15px] font-bold">{t.label}{!t.enabled && <Badge tone="amber">Off</Badge>}</p><p className="text-[12.5px] text-mute">{t.blurb}</p>
                  {u && <p className="data mt-1 text-[11px] text-dim">{u.requests} requests · {u.errors} errors · 30d</p>}</div>
                <label className="block"><span className="label mb-1 block">Provider</span>
                  <select className="field !py-2" value={t.provider_id ?? ""} disabled={!t.enabled} onChange={(e) => save(t, { provider_id: e.target.value || null })} aria-label={`${t.label} provider`}>
                    <option value="">Default provider{t.effective_provider_id && !t.provider_id ? ` (${name(t.effective_provider_id)})` : ""}</option>{usable.map((p) => <option key={p.id} value={p.id}>{p.provider_label} · {p.label}</option>)}</select></label>
                <label className="block"><span className="label mb-1 block">Fallback</span>
                  <select className="field !py-2" value={t.fallback_provider_id ?? ""} disabled={!t.enabled} onChange={(e) => save(t, { fallback_provider_id: e.target.value || null })} aria-label={`${t.label} fallback`}>
                    <option value="">None</option>{usable.filter((p) => p.id !== t.provider_id).map((p) => <option key={p.id} value={p.id}>{p.provider_label} · {p.label}</option>)}</select></label>
                <Switch checked={t.enabled} onChange={(v) => save(t, { enabled: v })} label="Enabled" />
              </li>);
          })}</ul>)}
      </Panel>
      <p className="mt-4 max-w-3xl text-[12.5px] text-dim">Every task is constrained to the data it is given and told never to invent facts, names or email addresses. Contact details and metrics always come from YouTube and the creator’s own public pages — never from a model.</p>
    </div>
  );
}

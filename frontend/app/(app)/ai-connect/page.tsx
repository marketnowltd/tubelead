"use client";
import { Activity, BrainCircuit, CheckCircle2, ExternalLink, KeyRound, Plug, PowerOff, RefreshCw, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { Badge, EmptyState, ErrorState, PageHeader, Panel, PanelHeader, Skeleton, StatCard } from "@/components/ui/core";
import { Field } from "@/components/ui/inputs";
import { Modal, useToast } from "@/components/ui/overlay";
import { cn } from "@/components/ui/cn";
import { api, useApi } from "@/lib/api";
import { ago } from "@/lib/format";
import type { AICatalog, AIProviderRow, AIUsage } from "@/lib/types";

const tone = { connected: "green", error: "red", untested: "neutral", disabled: "amber" } as const;

export default function AIConnectPage() {
  const toast = useToast();
  const { data: cat } = useApi<AICatalog>("/ai/catalog");
  const { data: provs, error, mutate } = useApi<AIProviderRow[]>("/ai/providers");
  const { data: usage, mutate: refreshUsage } = useApi<AIUsage>("/ai/usage?days=30");
  const [adding, setAdding] = useState<string | null>(null);
  const [form, setForm] = useState({ label: "default", api_key: "", model: "", base_url: "", make_default: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [rotate, setRotate] = useState<AIProviderRow | null>(null);
  const [newKey, setNewKey] = useState("");
  const [del, setDel] = useState<AIProviderRow | null>(null);
  const meta = cat?.providers.find((p) => p.id === adding);

  const open = (id: string) => { const m = cat?.providers.find((p) => p.id === id); setAdding(id); setForm({ label: "default", api_key: "", model: m?.default_model ?? "", base_url: id === "custom" ? "" : "", make_default: !provs?.length }); };
  const add = async () => {
    setBusy("add");
    try {
      await api("/ai/providers", { method: "POST", json: { provider: adding, label: form.label.trim() || "default", api_key: form.api_key.trim() || null, model: form.model.trim(), base_url: form.base_url.trim() || null, make_default: form.make_default } });
      toast("success", "Provider connected. Press Test to verify the key."); setAdding(null); mutate();
    } catch (e: any) { toast("error", e.message); } finally { setBusy(null); }
  };
  const test = async (p: AIProviderRow) => {
    setBusy(p.id);
    try {
      const r = await api<any>(`/ai/providers/${p.id}/test`, { method: "POST" });
      setResults((s) => ({ ...s, [p.id]: r.ok ? { ok: true, text: `Connected in ${r.latency_ms} ms · model ${r.model}` } : { ok: false, text: r.error } }));
      mutate(); refreshUsage();
    } catch (e: any) { setResults((s) => ({ ...s, [p.id]: { ok: false, text: e.message } })); } finally { setBusy(null); }
  };
  const patch = async (p: AIProviderRow, body: object, ok?: string) => { try { await api(`/ai/providers/${p.id}`, { method: "PATCH", json: body }); if (ok) toast("success", ok); mutate(); } catch (e: any) { toast("error", e.message); } };
  const loadModels = async (p: AIProviderRow) => {
    setBusy("m" + p.id);
    try { const r = await api<{ models: string[] }>(`/ai/providers/${p.id}/models`); setModels((s) => ({ ...s, [p.id]: r.models })); if (!r.models.length) toast("info", "The provider returned no models."); }
    catch (e: any) { toast("error", e.message); } finally { setBusy(null); }
  };
  const doDelete = async () => { if (!del) return; try { await api(`/ai/providers/${del.id}`, { method: "DELETE" }); toast("success", "Provider disconnected and its key deleted"); setDel(null); mutate(); } catch (e: any) { toast("error", e.message); } };
  const doRotate = async () => { if (!rotate || !newKey.trim()) return; await patch(rotate, { api_key: newKey.trim() }, "Key rotated — run Test to verify"); setRotate(null); setNewKey(""); };

  return (
    <div>
      <PageHeader eyebrow="Intelligence" title="AI Connect" sub="Bring your own AI. Connect a provider with your API key, then decide which tasks it handles in AI Task Manager. Keys are encrypted at rest and never sent back to your browser." />

      <div className="mb-6 flex gap-3 rounded-2xl border border-gold/50 bg-gold/15 p-4 text-sm">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-gold-text" />
        <p className="text-gold-text"><strong>{cat ? "API keys are separate from chat subscriptions." : "…"}</strong> {cat?.subscription_notice.replace("AI API access is billed separately from consumer chat subscriptions. ", "")} AI never supplies contact details or facts — it only suggests criteria, keywords and summaries for you to review.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard loading={!usage} label="Requests · 30d" value={usage?.requests ?? 0} icon={<Activity size={16} />} />
        <StatCard loading={!usage} tone="magenta" label="Errors" value={usage?.errors ?? 0} icon={<XCircle size={16} />} />
        <StatCard loading={!usage} tone="cyan" label="Tokens" value={usage?.tokens ?? 0} icon={<BrainCircuit size={16} />} format={(n) => Math.round(n).toLocaleString()} />
        <StatCard loading={!usage} tone="green" label="Est. cost (USD)" value={usage?.cost_usd_estimate ?? 0} icon={<KeyRound size={16} />} format={(n) => `$${n.toFixed(4)}`} sub={usage ? "Estimate only" : undefined} />
      </div>

      <Panel className="mb-6"><PanelHeader title="Connect a provider" icon={<Plug size={16} />} sub="Adapters for each provider run through one orchestrator." />
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
          {!cat ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />) : cat.providers.map((p) => (
            <button key={p.id} onClick={() => open(p.id)} className="rounded-2xl border border-line bg-panel p-4 text-left transition hover:border-forest/40 hover:shadow-card">
              <span className="flex items-center justify-between"><span className="font-heading text-[15px] font-bold">{p.label}</span><span className="label !text-[10px] text-forest">Connect →</span></span>
              <span className="mt-1.5 block text-[12px] leading-snug text-mute">{p.note}</span>
              <span className="data mt-2 block text-[11px] text-dim">{p.needs_key ? "API key required" : "No key required"}</span>
            </button>))}
        </div>
      </Panel>

      <Panel className="mb-6"><PanelHeader title="Connected providers" icon={<BrainCircuit size={16} />} />
        {error ? <ErrorState error={error} onRetry={() => mutate()} /> : !provs ? <Skeleton className="m-5 h-24" /> : provs.length === 0 ? (
          <EmptyState icon={<BrainCircuit size={22} />} title="No AI provider connected" body="Pick a provider above and paste an API key. Without one, TubeLead still works: the search assistant falls back to a built-in rules parser and keyword ideas use rule-based variations." />
        ) : (
          <ul className="divide-y divide-line">{provs.map((p) => (
            <li key={p.id} className="space-y-3 px-5 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-heading text-[15px] font-bold">{p.provider_label} <span className="text-sm font-normal text-mute">· {p.label}</span>
                    <Badge tone={tone[p.status]} dot>{p.status}</Badge>{p.is_default && <Badge tone="purple">Default</Badge>}</p>
                  <p className="data mt-0.5 text-[11.5px] text-dim">{p.has_key ? `Key ${p.key_hint}` : "No key"} · {p.base_url}{p.last_tested_at ? ` · tested ${ago(p.last_tested_at)}` : ""}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary btn-sm" onClick={() => test(p)} disabled={busy === p.id}>{busy === p.id ? "Testing…" : "Test connection"}</button>
                  {!p.is_default && p.status !== "disabled" && <button className="btn-ghost btn-sm" onClick={() => patch(p, { is_default: true }, "Set as default")}>Make default</button>}
                  {p.has_key && <button className="btn-ghost btn-sm" onClick={() => { setRotate(p); setNewKey(""); }}><RefreshCw size={12} /> Rotate key</button>}
                  <button className="btn-ghost btn-sm" onClick={() => patch(p, { disabled: p.status !== "disabled" }, p.status === "disabled" ? "Re-enabled" : "Disabled")}><PowerOff size={12} /> {p.status === "disabled" ? "Enable" : "Disable"}</button>
                  <button aria-label={`Disconnect ${p.provider_label}`} onClick={() => setDel(p)} className="rounded-full p-2 text-mute hover:bg-[#B5493A]/15 hover:text-[#A33A2A]"><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="block min-w-[220px] flex-1"><span className="label mb-1 block">Model</span>
                  <input list={`m-${p.id}`} className="field !py-1.5" defaultValue={p.model} onBlur={(e) => e.target.value !== p.model && patch(p, { model: e.target.value.trim() }, "Model updated")} />
                  <datalist id={`m-${p.id}`}>{(models[p.id] ?? []).map((m) => <option key={m} value={m} />)}</datalist></label>
                <button className="btn-ghost btn-sm" onClick={() => loadModels(p)} disabled={busy === "m" + p.id}>{busy === "m" + p.id ? "Loading…" : "Load available models"}</button>
              </div>
              {results[p.id] && <p role="status" className={cn("flex items-start gap-2 rounded-xl px-3 py-2 text-sm", results[p.id].ok ? "bg-moss/10 text-moss" : "bg-[#B5493A]/10 text-[#A33A2A]")}>{results[p.id].ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}{results[p.id].text}</p>}
              {!results[p.id] && p.last_error && <p className="rounded-xl bg-[#B5493A]/10 px-3 py-2 text-xs text-[#A33A2A]">Last error: {p.last_error}</p>}
            </li>))}</ul>
        )}
      </Panel>

      <Panel><PanelHeader title="Recent AI requests" sub="Every call is logged with tokens, latency and an estimated cost" icon={<Activity size={16} />} />
        {!usage ? <Skeleton className="m-5 h-20" /> : usage.recent.length === 0 ? <EmptyState title="No AI requests yet" body="Requests appear here after you test a provider or use the search assistant, keyword suggestions or creator analysis." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-[13px]"><thead><tr className="label border-b border-line !text-[10.5px]"><th className="px-5 py-2.5">When</th><th>Task</th><th>Provider · model</th><th>Tokens</th><th>Latency</th><th>Cost</th><th>Result</th></tr></thead>
            <tbody>{usage.recent.map((r) => <tr key={r.id} className="border-b border-line last:border-0"><td className="px-5 py-2 text-mute">{ago(r.created_at)}</td><td>{r.task.replace(/_/g, " ")}</td><td className="data text-[12px]">{r.provider} · {r.model}</td><td className="data">{r.tokens}</td><td className="data">{r.latency_ms} ms{r.attempts > 1 ? ` ×${r.attempts}` : ""}</td><td className="data">{r.cost_usd == null ? "—" : `$${r.cost_usd.toFixed(5)}`}</td><td>{r.ok ? <Badge tone="green">ok</Badge> : <span title={r.error ?? ""}><Badge tone="red">failed</Badge></span>}</td></tr>)}</tbody></table></div>)}
        {usage && <p className="px-5 pb-4 pt-2 text-[11px] text-dim">{usage.cost_note}</p>}
      </Panel>

      <Modal open={!!adding} onOpenChange={(o) => !o && setAdding(null)} title={`Connect ${meta?.label ?? ""}`} description={meta?.note}
        footer={<><button className="btn-ghost btn-sm" onClick={() => setAdding(null)}>Cancel</button><button className="btn-primary btn-sm" onClick={add} disabled={busy === "add" || (!!meta?.needs_key && !form.api_key.trim()) || (adding === "custom" && !form.base_url.trim())}>{busy === "add" ? "Saving…" : "Save connection"}</button></>}>
        <div className="space-y-3">
          {meta?.docs && <a href={meta.docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-forest hover:underline">Where do I get a key? <ExternalLink size={12} /></a>}
          <Field label="Label" hint="Lets you connect two keys for the same provider."><input className="field" value={form.label} maxLength={80} onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
          {(adding === "custom" || adding === "ollama" || adding === "openai" || adding === "openrouter") && <Field label={adding === "custom" ? "Base URL (required)" : "Base URL (optional)"} hint={`Default: ${meta?.base_url || "none"}`}><input className="field data" value={form.base_url} placeholder={meta?.base_url || "https://my-host/v1"} onChange={(e) => setForm({ ...form, base_url: e.target.value })} /></Field>}
          {(meta?.needs_key || adding === "custom") && <Field label={meta?.needs_key ? "API key" : "API key (if your server needs one)"} hint="Encrypted before it is stored. You won’t be able to read it again."><input className="field data" type="password" autoComplete="off" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} /></Field>}
          <Field label="Model"><input className="field data" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-forest" checked={form.make_default} onChange={(e) => setForm({ ...form, make_default: e.target.checked })} /> Use as my default provider</label>
        </div>
      </Modal>
      <Modal open={!!rotate} onOpenChange={(o) => !o && setRotate(null)} title="Rotate API key" description="Paste the new key. The old key is overwritten immediately."
        footer={<><button className="btn-ghost btn-sm" onClick={() => setRotate(null)}>Cancel</button><button className="btn-primary btn-sm" onClick={doRotate} disabled={!newKey.trim()}>Replace key</button></>}>
        <Field label="New API key"><input className="field data" type="password" autoComplete="off" value={newKey} onChange={(e) => setNewKey(e.target.value)} /></Field>
      </Modal>
      <Modal open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Disconnect provider?" description="The stored key is permanently deleted. Tasks assigned to it fall back to your default provider."
        footer={<><button className="btn-ghost btn-sm" onClick={() => setDel(null)}>Keep</button><button className="btn-primary btn-sm pill-terracotta" onClick={doDelete}>Disconnect &amp; delete key</button></>}><p className="text-sm text-mute">{del?.provider_label} · {del?.label}</p></Modal>
    </div>
  );
}

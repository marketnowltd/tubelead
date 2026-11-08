"use client";
import { Check, Copy, KeyRound, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, EmptyState, ErrorState, PageHeader, Panel, PanelHeader, Progress, Skeleton } from "@/components/ui/core";
import { Modal, useToast } from "@/components/ui/overlay";
import { api, useApi } from "@/lib/api";
import { ago, compact, dateLong } from "@/lib/format";
import type { ApiKeyRow, Status } from "@/lib/types";

const ENDPOINTS = [
  ["POST", "/api/jobs", "Start a discovery job"], ["GET", "/api/jobs/{id}", "Poll job status and counters"], ["POST", "/api/jobs/{id}/cancel", "Cancel a running job"],
  ["GET", "/api/creators", "List creators (filters, sort, pagination)"], ["GET", "/api/creators/{id}", "Creator detail with contact routes"], ["GET", "/api/creators/export.csv", "CSV export (same filters)"],
  ["GET", "/api/contacts", "Contact routes"], ["GET", "/api/campaigns", "Campaigns with funnel stats"], ["GET", "/api/analytics/overview", "Dashboard metrics"],
];

export default function ApiManagement() {
  const toast = useToast();
  const [base, setBase] = useState("https://your-host"); // set after mount to avoid a hydration mismatch
  useEffect(() => setBase(window.location.origin), []);
  const { data: keys, error, mutate } = useApi<ApiKeyRow[]>("/api-keys");
  const { data: st } = useApi<Status>("/status");
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoke, setRevoke] = useState<ApiKeyRow | null>(null);
  const create = async () => { try { const k = await api<ApiKeyRow>("/api-keys", { method: "POST", json: { name: name.trim() } }); setSecret(k.secret!); setOpen(false); setName(""); mutate(); } catch (e: any) { toast("error", e.message); } };
  const doRevoke = async () => { if (!revoke) return; try { await api(`/api-keys/${revoke.id}`, { method: "DELETE" }); toast("success", "Key revoked — it stops working immediately"); setRevoke(null); mutate(); } catch (e: any) { toast("error", e.message); } };
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { toast("error", "Copy blocked by the browser"); } };
  const q = st?.quota; const active = keys?.filter((k) => !k.revoked_at) ?? [];
  return (
    <div>
      <PageHeader eyebrow="Developers" title="API Management" sub="Use keys to call TubeLead from your own tools. Keys are hashed on the server — the full secret is shown once, at creation."
        actions={<button className="btn-primary !px-5 !py-2.5 !text-xs" onClick={() => setOpen(true)}><Plus size={15} /> Create key</button>} />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Panel className="p-4"><p className="label">Active keys</p><p className="data mt-1.5 text-3xl font-semibold">{keys ? active.length : "…"}<span className="text-base text-dim"> / 10</span></p></Panel>
        <Panel className="p-4"><p className="label">YouTube units today</p><p className="data mt-1.5 text-3xl font-semibold">{q ? compact(q.used) : "…"}<span className="text-base text-dim"> / {q ? compact(q.daily_limit) : ""}</span></p><Progress label="YouTube API units used today" value={q ? (q.used / q.daily_limit) * 100 : 0} tone="cyan" className="mt-3" /></Panel>
        <Panel className="p-4"><p className="label">Plan limits</p><p className="mt-2 text-sm">{st ? `${st.plan.label}: ${st.plan.leads.toLocaleString()} leads ${st.plan.lead_period === "lifetime" ? "(trial)" : "/ month"} · ${st.plan.max_jobs_per_day} jobs / day` : "…"}</p><p className="mt-1 text-[11px] text-dim">Requests are also rate-limited per client.</p></Panel>
      </div>
      <Panel className="mb-6 overflow-hidden"><PanelHeader title="API keys" icon={<KeyRound size={16} />} />
        {error ? <ErrorState error={error} onRetry={() => mutate()} /> : !keys ? <Skeleton className="m-5 h-20" /> : keys.length === 0 ? <EmptyState icon={<KeyRound size={22} />} title="No API keys" body="Create a key to authenticate programmatic requests with the X-API-Key header." action={<button className="btn-primary" onClick={() => setOpen(true)}>Create your first key</button>} /> : (
          <ul className="divide-y divide-line">{keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{k.name}</p><p className="data mt-0.5 text-xs text-dim">{k.prefix}••••••••••••</p></div>
              <div className="text-right text-[11px] text-dim"><p>Created {dateLong(k.created_at)}</p><p>{k.last_used_at ? `Last used ${ago(k.last_used_at)}` : "Never used"}</p></div>
              {k.revoked_at ? <Badge tone="red">Revoked</Badge> : <><Badge tone="green" dot>Active</Badge><button aria-label={`Revoke ${k.name}`} onClick={() => setRevoke(k)} className="rounded-lg p-2 text-mute hover:bg-[#B5493A]/15 hover:text-[#A33A2A]"><Trash2 size={15} /></button></>}</li>))}</ul>)}
      </Panel>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel><PanelHeader title="Quick start" sub="Authenticate with X-API-Key" /><pre className="data mx-5 mb-5 overflow-x-auto rounded-xl border border-forest/15 bg-[#EFEAE0] p-3 text-[11.5px] leading-relaxed text-mute">{`curl -X POST ${base}/api/jobs \\
  -H "X-API-Key: clk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"params":{"keywords":["fpv drone"],
       "min_subscribers":10000,"limit":25}}'

curl "${base}/api/creators?sort=score&has_email=true" \\
  -H "X-API-Key: clk_your_key"`}</pre></Panel>
        <Panel><PanelHeader title="Endpoints" sub="Interactive docs: /docs on the backend host" /><div className="overflow-x-auto px-2 pb-3"><table className="w-full text-xs"><tbody className="divide-y divide-line">{ENDPOINTS.map(([m, p, d]) => <tr key={p + m}><td className="py-2 pl-3"><Badge tone={m === "GET" ? "cyan" : "magenta"}>{m}</Badge></td><td className="data px-2">{p}</td><td className="pr-3 text-mute">{d}</td></tr>)}</tbody></table></div></Panel>
      </div>
      <Modal open={open} onOpenChange={setOpen} title="Create API key" footer={<><button className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary !px-4 !py-2 !text-xs" disabled={!name.trim()} onClick={create}>Create key</button></>}>
        <label className="block"><span className="label mb-1.5 block">Key name</span><input className="field" autoFocus maxLength={120} placeholder="e.g. n8n production" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && create()} /></label></Modal>
      <Modal open={!!secret} onOpenChange={(o) => !o && setSecret(null)} title="Copy your new key now" description="This is the only time the full key is shown." footer={<button className="btn-primary !px-4 !py-2 !text-xs" onClick={() => setSecret(null)}>I’ve saved it</button>}>
        <div className="flex items-center gap-2 rounded-xl border border-forest/30 bg-[#EFEAE0] p-3"><code className="data flex-1 break-all text-xs text-moss">{secret}</code><button aria-label="Copy key" onClick={() => secret && copy(secret)} className="rounded-lg p-2 hover:bg-ink/[0.06]">{copied ? <Check size={16} className="text-moss" /> : <Copy size={16} />}</button></div>
        <p className="mt-3 flex items-start gap-2 text-xs text-[#7F6226]"><ShieldAlert size={14} className="mt-0.5 shrink-0" /> Treat it like a password. Anyone with this key can act as you.</p></Modal>
      <Modal open={!!revoke} onOpenChange={(o) => !o && setRevoke(null)} title={`Revoke “${revoke?.name}”?`} description="Applications using this key will immediately receive 401 errors." footer={<><button className="btn-ghost btn-sm" onClick={() => setRevoke(null)}>Cancel</button><button className="btn-primary !bg-none !bg-[#B5493A] !px-4 !py-2 !text-xs" onClick={doRevoke}>Revoke</button></>}><span /></Modal>
    </div>
  );
}

"use client";
import { ExternalLink, Globe, Link2, Mail, Plus, RefreshCw, ScanSearch, Trash2 } from "lucide-react";
import { useState } from "react";
import { mutate as globalMutate } from "swr";
import { api, useApi } from "@/lib/api";
import { countryName, flag } from "@/lib/countries";
import { ago, compact, dateLong, num, pct, titleCase } from "@/lib/format";
import type { Campaign, ContactRoute, Creator } from "@/lib/types";
import { Avatar, Badge, DemoTag, ErrorState, ScoreRing, Skeleton, statusTone } from "../ui/core";
import { Modal, Sheet, useToast } from "../ui/overlay";
import { Progress } from "../ui/core";

export const routeStatusLabel: Record<string, string> = { published: "Publicly published", unverified: "Unverified", verified: "Verified deliverable" };
export const verificationLabel: Record<string, string> = { none: "No route", unverified: "Unverified", published: "Email published", verified: "Verified" };

export function RouteRow({ r, onChanged, showCreator }: { r: ContactRoute; onChanged?: () => void; showCreator?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const Icon = r.kind === "email" ? Mail : r.kind === "social" ? Link2 : Globe;
  const act = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast("success", ok); onChanged?.(); } catch (e: any) { toast("error", e.message); } finally { setBusy(false); } };
  return (
    <li className="rounded-xl border border-forest/15 bg-bg/50 p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-forest/15 text-forest"><Icon size={15} /></span>
        <div className="min-w-0 flex-1">
          {showCreator && r.creator && <p className="mb-0.5 text-[11px] text-dim">{r.creator.title}</p>}
          <p className="data break-all text-[13px]">{r.kind === "email" ? r.value : <a className="text-moss hover:underline" href={r.value} target="_blank" rel="noopener noreferrer nofollow">{r.value}</a>}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={statusTone[r.status]} dot>{routeStatusLabel[r.status]}</Badge>
            <Badge tone="neutral">{r.platform ?? titleCase(r.kind)}</Badge>
            <span className="text-[11px] text-dim">via {titleCase(r.source)} · {ago(r.discovered_at)}</span>
            {r.is_demo && <DemoTag />}
          </div>
          <div className="mt-2 flex items-center gap-2"><span className="text-[11px] text-dim">Confidence</span><div className="w-24"><Progress label="Contact confidence" value={r.confidence * 100} tone={r.confidence > 0.8 ? "green" : "purple"} /></div><span className="data text-[11px] text-mute">{Math.round(r.confidence * 100)}%</span>
            {r.kind === "email" && r.mx_valid != null && <Badge tone={r.mx_valid ? "green" : "red"}>{r.mx_valid ? "Domain accepts mail" : "Domain has no mail server"}</Badge>}</div>
        </div>
        <div className="flex shrink-0 gap-1">
          {r.kind === "email" && !r.is_demo && <button disabled={busy} title="Check the domain's mail (MX) records" aria-label="Check domain MX" onClick={() => act(() => api(`/contacts/${r.id}/check`, { method: "POST" }), "Domain checked")} className="rounded-lg p-1.5 text-mute hover:bg-ink/[0.06] hover:text-ink"><RefreshCw size={14} /></button>}
          {onChanged && <button disabled={busy} aria-label="Remove route" onClick={() => act(() => api(`/contacts/${r.id}`, { method: "DELETE" }), "Route removed")} className="rounded-lg p-1.5 text-mute hover:bg-[#B5493A]/15 hover:text-[#A33A2A]"><Trash2 size={14} /></button>}
        </div>
      </div>
    </li>
  );
}

export function CreatorDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged?: () => void }) {
  const toast = useToast();
  const { data: c, error, mutate } = useApi<Creator>(id ? `/creators/${id}` : null);
  const { data: camps } = useApi<Campaign[]>(id ? "/campaigns" : null);
  const [scanning, setScanning] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [newKind, setNewKind] = useState<"email" | "website" | "contact_page" | "social">("email");
  const [newVal, setNewVal] = useState("");
  const refresh = () => { mutate(); onChanged?.(); globalMutate((k) => typeof k === "string" && (k.startsWith("/contacts") || k.startsWith("/analytics")), undefined, { revalidate: true }); };
  const patch = async (body: object, ok: string) => { try { await api(`/creators/${id}`, { method: "PATCH", json: body }); toast("success", ok); refresh(); } catch (e: any) { toast("error", e.message); } };
  const scan = async () => { setScanning(true); try { const r = await api<{ added: number; website_status: string }>(`/creators/${id}/contacts/scan`, { method: "POST" }); toast("success", `Scan finished: ${r.added} new route(s). Website: ${titleCase(r.website_status)}`); refresh(); } catch (e: any) { toast("error", e.message); } finally { setScanning(false); } };
  const add = async () => { try { await api(`/creators/${id}/contacts`, { method: "POST", json: { kind: newKind, value: newVal } }); setAddOpen(false); setNewVal(""); toast("success", "Contact route added as Unverified"); refresh(); } catch (e: any) { toast("error", e.message); } };
  const del = async () => { try { await api(`/creators/${id}`, { method: "DELETE" }); toast("success", "Creator deleted"); setConfirmDel(false); onClose(); onChanged?.(); } catch (e: any) { toast("error", e.message); } };

  return (
    <>
      <Sheet open={!!id} onOpenChange={(o) => !o && onClose()} title={c?.title ?? "Creator profile"} description="Channel intelligence and public contact routes" width="max-w-[560px]">
        {error ? <ErrorState error={error} onRetry={() => mutate()} /> : !c ? <div className="space-y-4 p-5"><Skeleton className="h-16" /><Skeleton className="h-32" /><Skeleton className="h-40" /></div> : (
          <div className="space-y-6 p-5">
            <div className="flex items-center gap-4">
              <Avatar src={c.thumbnail_url} name={c.title} size={64} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-heading text-xl font-semibold">{c.title.replace(/ \(demo\)$/i, "")} {c.is_demo && <DemoTag />}</h3>
                <p className="truncate text-sm text-mute">{c.handle ?? c.youtube_channel_id}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5"><Badge tone="purple">{c.niche}</Badge><Badge tone="neutral">{flag(c.country)} {countryName(c.country)}</Badge><Badge tone={statusTone[c.activity]} dot>{titleCase(c.activity)}</Badge></div>
              </div>
              <ScoreRing score={c.qualification_score} size={56} />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[["Subscribers", compact(c.subscriber_count)], ["Videos", num(c.video_count)], ["Avg views", compact(c.avg_views)], ["Engagement", pct(c.engagement_rate)]].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-forest/15 bg-bg/50 p-3"><p className="label">{k}</p><p className="data mt-1 text-lg font-semibold">{v}</p></div>))}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><dt className="label">Total views</dt><dd className="data">{num(c.view_count)}</dd></div>
              <div><dt className="label">Last upload</dt><dd>{c.last_upload_at ? ago(c.last_upload_at) : "Unknown"}</dd></div>
              <div><dt className="label">Discovered</dt><dd>{dateLong(c.discovered_at)}</dd></div>
              <div><dt className="label">Type (heuristic)</dt><dd>{titleCase(c.creator_type)}</dd></div>
            </dl>

            {c.score_breakdown && (
              <section><h4 className="label mb-2">Why this score</h4>
                <div className="space-y-2">{Object.entries(c.score_breakdown).map(([k, v]) => { const max = { audience: 20, activity: 25, engagement: 20, contact: 25, relevance: 10 }[k] ?? 25; return (
                  <div key={k} className="flex items-center gap-3 text-xs"><span className="w-20 capitalize text-mute">{k}</span><div className="flex-1"><Progress label={`${k} score`} value={(v / max) * 100} tone="purple" /></div><span className="data w-10 text-right">{v}/{max}</span></div>); })}</div></section>
            )}

            <section>
              <div className="mb-2 flex items-center justify-between"><h4 className="label">Contact intelligence · {c.contacts?.length ?? 0} route(s)</h4>
                <div className="flex gap-2"><button className="btn-ghost btn-sm" onClick={scan} disabled={scanning || c.is_demo} title={c.is_demo ? "Demo records are not scanned" : "Re-scan channel description and public website"}><ScanSearch size={13} /> {scanning ? "Scanning…" : "Scan"}</button>
                  <button className="btn-ghost btn-sm" onClick={() => setAddOpen(true)}><Plus size={13} /> Add</button></div></div>
              {c.contacts?.length ? <ul className="space-y-2">{c.contacts.map((r) => <RouteRow key={r.id} r={r} onChanged={refresh} />)}</ul>
                : <p className="rounded-xl border border-dashed border-forest/25 p-4 text-center text-sm text-mute">No public contact route found. Nothing is guessed or generated.</p>}
              <p className="mt-2 text-[11px] leading-relaxed text-dim">Only publicly published information is collected. “Publicly published” means found on a public page — it does not mean the mailbox is verified or that you have consent to market to it.</p>
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              <label><span className="label mb-1.5 block">Campaign</span>
                <select className="field" value={c.campaign_id ?? ""} onChange={(e) => patch({ campaign_id: e.target.value || null }, "Campaign updated")}><option value="">— None —</option>{camps?.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
              <label><span className="label mb-1.5 block">Outreach status</span>
                <select className="field" value={c.outreach_status} onChange={(e) => patch({ outreach_status: e.target.value }, "Status updated")}>{["new", "contacted", "replied", "converted"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select></label>
            </section>

            {c.description && <section><h4 className="label mb-1.5">Channel description</h4><p className="max-h-40 overflow-y-auto whitespace-pre-line rounded-xl border border-forest/15 bg-bg/50 p-3 text-xs leading-relaxed text-mute">{c.description}</p></section>}

            <div className="flex flex-wrap gap-2 border-t border-forest/10 pt-4">
              {!c.is_demo && <a href={c.channel_url} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm"><ExternalLink size={13} /> Open on YouTube</a>}
              {c.website && !c.is_demo && <a href={c.website} target="_blank" rel="noopener noreferrer nofollow" className="btn-ghost btn-sm"><Globe size={13} /> Website</a>}
              <button className="btn-ghost btn-sm ml-auto !border-[#B5493A]/40 !text-[#A33A2A]" onClick={() => setConfirmDel(true)}><Trash2 size={13} /> Delete</button>
            </div>
          </div>
        )}
      </Sheet>
      <Modal open={addOpen} onOpenChange={setAddOpen} title="Add contact route" description="Manually added routes are always marked Unverified."
        footer={<><button className="btn-ghost btn-sm" onClick={() => setAddOpen(false)}>Cancel</button><button className="btn-primary !px-4 !py-2 !text-xs" disabled={!newVal.trim()} onClick={add}>Add route</button></>}>
        <div className="space-y-3">
          <label className="block"><span className="label mb-1.5 block">Type</span><select className="field" value={newKind} onChange={(e) => setNewKind(e.target.value as any)}><option value="email">Email</option><option value="website">Website</option><option value="contact_page">Contact page</option><option value="social">Social profile</option></select></label>
          <label className="block"><span className="label mb-1.5 block">{newKind === "email" ? "Email address" : "URL"}</span><input className="field" value={newVal} onChange={(e) => setNewVal(e.target.value)} placeholder={newKind === "email" ? "name@company.com" : "https://…"} autoFocus /></label>
        </div>
      </Modal>
      <Modal open={confirmDel} onOpenChange={setConfirmDel} title="Delete this creator?" description="Their contact routes are deleted too. They can be rediscovered later."
        footer={<><button className="btn-ghost btn-sm" onClick={() => setConfirmDel(false)}>Cancel</button><button className="btn-primary !bg-none !bg-[#B5493A] !px-4 !py-2 !text-xs" onClick={del}>Delete creator</button></>}><span /></Modal>
    </>
  );
}

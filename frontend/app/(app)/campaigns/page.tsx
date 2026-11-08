"use client";
import { Megaphone, Pencil, Plus, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, DemoTag, EmptyState, ErrorState, PageHeader, Panel, Progress, Skeleton, statusTone } from "@/components/ui/core";
import { Field, MultiSelect } from "@/components/ui/inputs";
import { Modal, useToast } from "@/components/ui/overlay";
import { api, useApi } from "@/lib/api";
import { COUNTRIES, NICHES, flag } from "@/lib/countries";
import { dateShort, titleCase } from "@/lib/format";
import type { Campaign } from "@/lib/types";

type Draft = { id?: string; name: string; description: string; status: Campaign["status"]; target_niche: string; target_countries: string[] };
const BLANK: Draft = { name: "", description: "", status: "draft", target_niche: "", target_countries: [] };

export default function Campaigns() {
  const toast = useToast();
  const { data, error, mutate } = useApi<Campaign[]>("/campaigns");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [del, setDel] = useState<Campaign | null>(null);
  const [touched, setTouched] = useState(false);
  const save = async () => {
    setTouched(true);
    if (!draft || !draft.name.trim()) return;
    const body = { name: draft.name.trim(), description: draft.description, status: draft.status, target_niche: draft.target_niche || null, target_countries: draft.target_countries };
    try { draft.id ? await api(`/campaigns/${draft.id}`, { method: "PUT", json: body }) : await api("/campaigns", { method: "POST", json: body }); toast("success", draft.id ? "Campaign updated" : "Campaign created"); setDraft(null); setTouched(false); mutate(); }
    catch (e: any) { toast("error", e.message); }
  };
  const remove = async () => { if (!del) return; try { await api(`/campaigns/${del.id}`, { method: "DELETE" }); toast("success", "Campaign deleted — its creators were kept and unassigned"); setDel(null); mutate(); } catch (e: any) { toast("error", e.message); } };
  const setStatus = async (c: Campaign, status: string) => { try { await api(`/campaigns/${c.id}`, { method: "PUT", json: { name: c.name, description: c.description, status, target_niche: c.target_niche, target_countries: c.target_countries } }); mutate(); } catch (e: any) { toast("error", e.message); } };

  return (
    <div>
      <PageHeader eyebrow="Organise outreach" title="Campaigns" sub="Group qualified creators into campaigns and track them through the outreach funnel. TubeLead organises your pipeline — it does not send email."
        actions={<button className="btn-primary !px-5 !py-2.5 !text-xs" onClick={() => { setDraft(BLANK); setTouched(false); }}><Plus size={15} /> New campaign</button>} />
      {error ? <Panel><ErrorState error={error} onRetry={() => mutate()} /></Panel> : !data ? <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-60" />)}</div> : data.length === 0 ? (
        <Panel><EmptyState icon={<Megaphone size={24} />} title="No campaigns yet" body="Create a campaign, then assign creators from the Lead Database (bulk select → Assign to campaign)." action={<button className="btn-primary" onClick={() => setDraft(BLANK)}>Create your first campaign</button>} /></Panel>) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {data.map((c) => { const funnel = [["Leads", c.leads, "bg-forest"], ["Contacted", c.contacted + c.replied + c.converted, "bg-sage"], ["Replied", c.replied + c.converted, "bg-terracotta"], ["Converted", c.converted, "bg-moss"]] as const; return (
            <Panel key={c.id} lift className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-heading text-base font-semibold">{c.name.replace(/^DEMO · /, "")} {c.is_demo && <DemoTag />}</h3><p className="mt-0.5 text-[11px] text-dim">Created {dateShort(c.created_at)}{c.target_niche ? ` · ${c.target_niche}` : ""}</p></div>
                <select aria-label={`Status of ${c.name}`} value={c.status} onChange={(e) => setStatus(c, e.target.value)} className="field !w-auto !py-1 text-xs"><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option></select></div>
              {c.description && <p className="mt-2 line-clamp-2 text-[13px] text-mute">{c.description.replace(/^DEMO · /, "")}</p>}
              <div className="mt-4 space-y-2">{funnel.map(([k, v, bg]) => <div key={k} className="flex items-center gap-3 text-xs"><span className="w-[72px] text-mute">{k}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/[0.06]"><div className={`h-2 rounded-full ${bg}`} style={{ width: `${c.leads ? (v / c.leads) * 100 : 0}%`, transition: "width .6s" }} /></div><span className="data w-8 text-right">{v}</span></div>)}</div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-bg/50 p-2"><p className="label">Avg score</p><p className="data mt-0.5 text-lg">{c.avg_score}</p></div><div className="rounded-lg bg-bg/50 p-2"><p className="label">Reply rate</p><p className="data mt-0.5 text-lg">{c.reply_rate}%</p></div><div className="rounded-lg bg-bg/50 p-2"><p className="label">Status</p><div className="mt-1.5"><Badge tone={statusTone[c.status]} dot>{titleCase(c.status)}</Badge></div></div></div>
              <div className="mt-4 flex items-center gap-2 border-t border-forest/10 pt-3">
                <Link href={`/lead-database?campaign_id=${c.id}`} className="btn-ghost btn-sm"><Users size={13} /> View {c.leads} lead{c.leads === 1 ? "" : "s"}</Link>
                <button className="btn-ghost btn-sm" onClick={() => { setDraft({ id: c.id, name: c.name, description: c.description, status: c.status, target_niche: c.target_niche ?? "", target_countries: c.target_countries }); setTouched(false); }}><Pencil size={13} /> Edit</button>
                <button aria-label={`Delete ${c.name}`} className="ml-auto rounded-lg p-2 text-mute hover:bg-[#B5493A]/15 hover:text-[#A33A2A]" onClick={() => setDel(c)}><Trash2 size={15} /></button></div>
            </Panel>); })}
        </div>)}

      <Modal open={!!draft} onOpenChange={(o) => !o && setDraft(null)} title={draft?.id ? "Edit campaign" : "New campaign"} footer={<><button className="btn-ghost btn-sm" onClick={() => setDraft(null)}>Cancel</button><button className="btn-primary !px-4 !py-2 !text-xs" onClick={save}>{draft?.id ? "Save changes" : "Create campaign"}</button></>}>
        {draft && <div className="space-y-3">
          <Field label="Name"><input className="field" autoFocus maxLength={160} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />{touched && !draft.name.trim() && <p role="alert" className="mt-1 text-[11px] text-[#A33A2A]">A campaign needs a name.</p>}</Field>
          <Field label="Description"><textarea className="field min-h-[72px]" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Status"><select className="field" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as any })}><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option></select></Field>
            <Field label="Target niche"><select className="field" value={draft.target_niche} onChange={(e) => setDraft({ ...draft, target_niche: e.target.value })}><option value="">Any</option>{NICHES.map((n) => <option key={n}>{n}</option>)}</select></Field></div>
          <Field label="Target countries"><MultiSelect label="Target countries" placeholder="Any country" options={COUNTRIES.map((c) => ({ value: c.code, label: `${flag(c.code)} ${c.name}` }))} value={draft.target_countries} onChange={(v) => setDraft({ ...draft, target_countries: v })} /></Field>
        </div>}
      </Modal>
      <Modal open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Delete campaign?" description="Creators assigned to it stay in your database and become unassigned." footer={<><button className="btn-ghost btn-sm" onClick={() => setDel(null)}>Cancel</button><button className="btn-primary !bg-none !bg-[#B5493A] !px-4 !py-2 !text-xs" onClick={remove}>Delete campaign</button></>}><span /></Modal>
    </div>
  );
}

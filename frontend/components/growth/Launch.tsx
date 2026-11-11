"use client";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Inbox, Loader2, PlugZap, RefreshCw, Rocket, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, EmptyState, StatCard } from "@/components/ui/core";
import { cn } from "@/components/ui/cn";
import { Field, Segmented } from "@/components/ui/inputs";
import { Modal, useToast } from "@/components/ui/overlay";
import { CheckPanel } from "@/components/studio/CheckPanel";
import { api, useApi } from "@/lib/api";
import { StepHeading } from "./steps";
import type { GrowthSession } from "./types";

interface Campaign { id: string; name: string; status: string; document_id: string; approval: any; metrics: Record<string, any>; error: string; launched_at: string | null;
  recipients: Record<string, number>; recipient_list: { email: string; eligibility: string; reason: string; provider_status: string; company: string }[] }
interface Connection { connected: boolean; status?: string; last_error?: string; list_id?: string; campaign_id?: string; sender_domain?: string; lists?: { id: string; name: string }[]; webhook_url?: string | null }

const CHECKLIST: [string, string][] = [["design", "Design approved"], ["content", "Content approved"], ["links", "Links checked"], ["personalisation", "Personalisation checked"],
  ["mobile", "Mobile preview checked"], ["technical", "Technical checks completed"], ["recipients", "Recipient eligibility checked"], ["permissions", "I confirm I may contact these recipients and will honour opt-outs"]];
const ELIG = { eligible: ["Eligible", "green"], suppressed: ["Suppressed", "red"], needs_consent: ["Needs consent", "amber"], unverified: ["Not verified", "neutral"] } as const;

function Card({ title, icon, children, done }: { title: string; icon: React.ReactNode; children: React.ReactNode; done?: boolean }) {
  return (
    <motion.section layout className="rounded-[20px] border border-line bg-panel p-5">
      <h3 className="mb-3 flex items-center gap-2 font-heading text-[16px] font-bold">{icon}{title}
        <AnimatePresence>{done && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 600, damping: 24 }} className="ml-auto grid h-6 w-6 place-items-center rounded-full bg-moss text-white"><Check size={13} strokeWidth={3} /></motion.span>}</AnimatePresence></h3>
      {children}
    </motion.section>
  );
}

export function ConnectionCard() {
  const toast = useToast();
  const { data: c, mutate } = useApi<Connection>("/outreach/connection");
  const [f, setF] = useState({ client_id: "", client_secret: "", list_id: "", campaign_id: "", sender_domain: "" });
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const save = async () => {
    setBusy(true);
    try { const r = await api<Connection>("/outreach/connection", { method: "PUT", json: { ...f, list_id: f.list_id || c?.list_id || "", campaign_id: f.campaign_id || c?.campaign_id || "", sender_domain: f.sender_domain || c?.sender_domain || "" } });
      mutate(r, { revalidate: false }); setEdit(false); toast(r.connected ? "success" : "error", r.connected ? "Snov.io connected" : r.last_error || "Couldn't connect"); }
    catch (e: any) { toast("error", e.message); } finally { setBusy(false); }
  };
  if (!c) return <div className="skeleton h-32 rounded-[20px]" />;
  return (
    <Card title="Sending account" icon={<PlugZap size={17} className="text-forest" />} done={c.connected && !!c.list_id && !!c.sender_domain}>
      {c.connected && !edit ? (
        <div className="space-y-2 text-[13px]">
          <p>Snov.io connected · list <strong>{c.lists?.find((l) => l.id === c.list_id)?.name ?? (c.list_id || "not chosen")}</strong> · sending domain <strong>{c.sender_domain || "not set"}</strong></p>
          {c.webhook_url && <p className="flex flex-wrap items-center gap-2 text-[12px] text-mute">Reply forwarding URL: <code className="rounded bg-bg2 px-1.5 py-0.5 text-[11px]">{c.webhook_url.slice(0, 48)}…</code>
            <button className="text-forest" onClick={() => navigator.clipboard.writeText(c.webhook_url!).then(() => toast("success", "Copied"), () => {})}><Copy size={12} /></button></p>}
          <button className="btn-ghost btn-sm" onClick={() => setEdit(true)}>Change</button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12.5px] text-mute">Campaigns are sent from <strong>your own</strong> Snov.io account. In Snov.io, create a list and a drip campaign whose email uses the custom fields <code>{"{{tl_subject}}"}</code> as the subject and <code>{"{{tl_html}}"}</code> as the body. TubeLead fills them with your approved, personalised email.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Snov.io API user ID"><input className="field" autoComplete="off" value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} /></Field>
            <Field label="Snov.io API secret"><input className="field" type="password" autoComplete="off" value={f.client_secret} onChange={(e) => setF({ ...f, client_secret: e.target.value })} /></Field>
            {c.lists && c.lists.length > 0 ? <Field label="List linked to your campaign"><select className="field" value={f.list_id || c.list_id || ""} onChange={(e) => setF({ ...f, list_id: e.target.value })}><option value="">Choose…</option>{c.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
              : <Field label="List ID"><input className="field" value={f.list_id} onChange={(e) => setF({ ...f, list_id: e.target.value })} /></Field>}
            <Field label="Campaign ID (for delivery figures)"><input className="field" value={f.campaign_id} onChange={(e) => setF({ ...f, campaign_id: e.target.value })} /></Field>
            <Field label="Your sending domain" hint="Used for SPF, DKIM and DMARC checks"><input className="field" placeholder="yourcompany.com" value={f.sender_domain} onChange={(e) => setF({ ...f, sender_domain: e.target.value })} /></Field>
          </div>
          {c.last_error && <p className="text-[12px] text-[#A33A2A]">{c.last_error}</p>}
          <button className="btn-primary btn-sm" disabled={busy || f.client_id.length < 4 || f.client_secret.length < 4} onClick={save}>{busy ? "Connecting…" : "Connect Snov.io"}</button>
          <p className="text-[11px] text-dim">Your secret is encrypted and never shown again.</p>
        </div>
      )}
    </Card>
  );
}

export function LaunchStep({ session, onSession }: { session: GrowthSession; onSession: () => void }) {
  const toast = useToast();
  const { data: camp, mutate } = useApi<Campaign>(session.campaign_id ? `/outreach/campaigns/${session.campaign_id}` : null);
  const [check, setCheck] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [consentText, setConsentText] = useState("");
  const create = async () => { setBusy("create"); try { await api("/outreach/campaigns", { method: "POST", json: { session_id: session.id } }); onSession(); } catch (e: any) { toast("error", e.message); } finally { setBusy(null); } };
  const call = async (path: string, body?: unknown, ok?: string) => {
    setBusy(path);
    try { const r = await api<Campaign>(`/outreach/campaigns/${camp!.id}/${path}`, { method: "POST", json: body ?? {} }); mutate(r, { revalidate: false }); if (ok) toast("success", ok); }
    catch (e: any) { toast("error", e.message); } finally { setBusy(null); }
  };
  if (!session.campaign_id) return (
    <div><StepHeading title="Launch your campaign" sub="Check the email, confirm who receives it and approve it. Nothing is sent until you do." />
      <button className="btn-primary" disabled={!!busy || !session.document_id} onClick={create}>{busy ? "Preparing…" : "Prepare campaign"}</button>
      {!session.document_id && <p className="mt-2 text-[12px] text-mute">Create the email in step 4 first.</p>}</div>);
  if (!camp) return <div className="skeleton h-64 rounded-[20px]" />;
  const all = CHECKLIST.every(([k]) => check[k]);
  const launched = camp.status === "launched";
  return (
    <div className="space-y-5">
      <StepHeading title={launched ? "Your campaign is live" : "Launch your campaign"} sub={launched ? "Delivery figures come from your sending provider. Replies appear in Replies." : "Check the email, confirm who receives it and approve it. Nothing is sent until you do."} />
      {!launched && <>
        <ConnectionCard />
        <Card title="Recipients" icon={<Inbox size={17} className="text-forest" />} done={camp.recipients.eligible > 0}>
          <div className="mb-3 flex flex-wrap gap-2">{Object.entries(ELIG).map(([k, [l, t]]) => <Badge key={k} tone={t as any} dot>{camp.recipients[k] ?? 0} {l.toLowerCase()}</Badge>)}</div>
          {camp.recipient_list.length === 0 && <p className="rounded-xl bg-bg2 p-3 text-[12.5px] text-mute">None of the selected prospects has a usable business email yet. Go back to Enrich and select prospects with a website, or add more prospects.</p>}
          {camp.recipient_list.length > 0 && <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line text-[12.5px]">{camp.recipient_list.map((r) => (
            <li key={r.email} className="flex flex-wrap items-center gap-2 px-3 py-2"><span className="font-medium">{r.email}</span><span className="text-mute">{r.company}</span>
              <Badge className="ml-auto" tone={(ELIG as any)[r.eligibility]?.[1] ?? "neutral"}>{(ELIG as any)[r.eligibility]?.[0] ?? r.eligibility}</Badge>{r.reason && <span className="w-full text-[11px] text-dim">{r.reason}</span>}</li>))}</ul>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-ghost btn-sm" onClick={() => call("recipients", { include_risky: true }, "Risky addresses included")}>Include risky addresses</button>
            {(camp.recipients.needs_consent ?? 0) > 0 && <button className="btn-ghost btn-sm" onClick={() => setConsent(true)}>Record consent…</button>}
          </div>
        </Card>
        <Card title="TubeLead Email Check" icon={<ShieldCheck size={17} className="text-forest" />}><CheckPanel docId={camp.document_id} hideTitle /></Card>
        <Card title="Final approval" icon={<Check size={17} className="text-forest" />} done={camp.status === "approved"}>
          {camp.status === "approved" ? <p className="text-[13px]">Approved {new Date(camp.approval.approved_at).toLocaleString("en-GB")} · readiness {camp.approval.readiness}/100{camp.approval.warnings?.length ? ` · ${camp.approval.warnings.length} warning(s) accepted` : ""}</p> : <>
            <ul className="grid gap-2 sm:grid-cols-2">{CHECKLIST.map(([k, l]) => (
              <li key={k}><label className={cn("flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-[13px] transition-colors", check[k] ? "border-forest bg-forest/5" : "border-line hover:border-forest/40")}>
                <input type="checkbox" className="mt-0.5 accent-[#7B3FF2]" checked={!!check[k]} onChange={(e) => setCheck({ ...check, [k]: e.target.checked })} />{l}</label></li>))}</ul>
            <button className="btn-primary mt-4" disabled={!all || !!busy} onClick={() => call("approve", { checklist: check }, "Campaign approved")}>{busy === "approve" ? "Approving…" : "Approve campaign"}</button></>}
        </Card>
        <div className="flex items-center justify-end gap-3">
          <p className="text-[12px] text-mute">{camp.status === "approved" ? `${camp.recipients.eligible} recipient(s) will be added to your Snov.io campaign.` : "Approve the campaign to enable launch."}</p>
          <motion.button whileTap={{ scale: 0.97 }} className="btn-primary !px-8" disabled={camp.status !== "approved" || !!busy} onClick={() => call("launch", {}, "Campaign launched")}>
            {busy === "launch" ? <><Loader2 size={15} className="animate-spin" /> Launching</> : <><Rocket size={15} /> Launch campaign</>}</motion.button>
        </div>
      </>}
      {(launched || camp.status === "failed") && (
        <Card title="Delivery" icon={<Rocket size={17} className="text-forest" />}>
          {camp.status === "failed" && <p className="mb-2 text-[13px] text-[#A33A2A]">Launch failed: {camp.error}</p>}
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{(["sent", "delivered", "bounced", "opened", "replied", "unsubscribed"] as const).map((k) => (
            <div key={k} className="rounded-xl border border-line p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-mute">{k}</p><p className="mt-1 font-display text-[22px] font-extrabold tabular-nums">{camp.metrics?.[k] ?? "—"}</p></div>))}</div>
          <p className="mt-2 text-[11px] text-dim">{camp.metrics?.fetched_at ? `From Snov.io, ${new Date(camp.metrics.fetched_at).toLocaleString("en-GB")}` : "Figures appear after the first refresh."}</p>
          <button className="btn-ghost btn-sm mt-2" disabled={!!busy} onClick={() => call("refresh")}><RefreshCw size={13} /> Refresh from Snov.io</button>
        </Card>)}
      <Modal open={consent} onOpenChange={setConsent} title="Record consent" description="Only add addresses whose owners have agreed to hear from you. TubeLead records that you confirmed this."
        footer={<><button className="btn-ghost btn-sm" onClick={() => setConsent(false)}>Cancel</button><button className="btn-primary btn-sm" onClick={async () => { await call("recipients", { consent_emails: consentText.split(/[\s,;]+/).filter((x) => x.includes("@")) }, "Consent recorded"); setConsent(false); }}>Save</button></>}>
        <textarea aria-label="Email addresses with consent" className="field min-h-[100px] text-xs" placeholder="one@example.com, two@example.com" value={consentText} onChange={(e) => setConsentText(e.target.value)} />
      </Modal>
    </div>
  );
}

// ---------------- replies
interface Reply { id: string; from_email: string; subject: string; body: string; classification: string; classified_by: string; suggested_response: string; response_status: string; received_at: string }
const CLASSES: [string, string, any][] = [["interested", "Interested", "green"], ["wants_information", "Wants information", "cyan"], ["meeting_requested", "Meeting requested", "green"],
  ["not_interested", "Not interested", "neutral"], ["out_of_office", "Out of office", "neutral"], ["unsubscribe", "Unsubscribe", "red"], ["other", "Other", "neutral"]];

export function ReplyInbox() {
  const toast = useToast();
  const [filter, setFilter] = useState("");
  const { data, mutate } = useApi<Reply[]>(`/outreach/replies${filter ? `?classification=${filter}` : ""}`, { refreshInterval: 30000 });
  const [open, setOpen] = useState<Reply | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ from_email: "", subject: "", body: "" });
  const patch = async (r: Reply, body: Record<string, string>) => { try { const n = await api<Reply>(`/outreach/replies/${r.id}`, { method: "PATCH", json: body }); setOpen(n); mutate(); } catch (e: any) { toast("error", e.message); } };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Filter replies" className="field !w-auto !py-1.5 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">All replies</option>{CLASSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <button className="btn-ghost btn-sm ml-auto" onClick={() => setAdding(true)}>Add a reply</button>
      </div>
      {!data ? <div className="skeleton h-40 rounded-2xl" /> : data.length === 0 ? <EmptyState icon={<Inbox size={22} />} title="No replies yet" body="Replies forwarded from Snov.io (or added by hand) are sorted here automatically." /> : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">{data.map((r) => { const c = CLASSES.find((x) => x[0] === r.classification);
          return <li key={r.id}><button className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-forest-50" onClick={() => setOpen(r)}>
            <div className="min-w-0 flex-1"><p className="truncate text-[13.5px] font-semibold">{r.from_email}</p><p className="truncate text-[12px] text-mute">{r.subject || r.body.slice(0, 80)}</p></div>
            <Badge tone={c?.[2]} dot>{c?.[1]}</Badge><span className="w-20 shrink-0 text-right text-[11px] text-dim">{new Date(r.received_at).toLocaleDateString("en-GB")}</span></button></li>; })}</ul>)}
      <Modal open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open?.from_email ?? ""} description={open ? `Sorted by ${open.classified_by === "ai" ? "your AI provider" : open.classified_by === "customer" ? "you" : "TubeLead rules"}` : ""}>
        {open && <div className="space-y-3 text-[13px]">
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-bg2 p-3">{open.body}</p>
          <Field label="Category"><select className="field" value={open.classification} onChange={(e) => patch(open, { classification: e.target.value })}>{CLASSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          {open.classification === "unsubscribe" && <p className="text-[12px] text-moss">Added to your suppression list. They won't be contacted again.</p>}
          {open.classification !== "unsubscribe" && <Field label="Suggested response" hint="Review and edit before you send it from your mailbox">
            <textarea className="field min-h-[110px]" value={open.suggested_response} placeholder={open.suggested_response ? "" : "Connect an AI provider in AI Connect for suggestions, or write your own."}
              onChange={(e) => setOpen({ ...open, suggested_response: e.target.value })} onBlur={() => patch(open, { suggested_response: open.suggested_response, response_status: open.suggested_response ? "draft" : "none" })} /></Field>}
          {open.suggested_response && <div className="flex gap-2">
            <button className="btn-primary btn-sm" onClick={() => patch(open, { response_status: "approved" })}>{open.response_status === "approved" ? "Approved" : "Approve response"}</button>
            <button className="btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(open.suggested_response).then(() => toast("success", "Copied. Paste it into your reply."), () => {})}><Copy size={13} /> Copy</button></div>}
          <p className="text-[11px] text-dim">TubeLead never sends replies on your behalf.</p>
        </div>}
      </Modal>
      <Modal open={adding} onOpenChange={setAdding} title="Add a reply" description="Paste a reply from your mailbox to sort it and draft a response."
        footer={<><button className="btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button><button className="btn-primary btn-sm" disabled={!f.from_email.includes("@") || !f.body.trim()} onClick={async () => { try { await api("/outreach/replies", { method: "POST", json: f }); setAdding(false); setF({ from_email: "", subject: "", body: "" }); mutate(); } catch (e: any) { toast("error", e.message); } }}>Add</button></>}>
        <div className="space-y-3"><Field label="From"><input className="field" type="email" value={f.from_email} onChange={(e) => setF({ ...f, from_email: e.target.value })} /></Field>
          <Field label="Subject"><input className="field" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
          <Field label="Message"><textarea className="field min-h-[120px]" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field></div>
      </Modal>
    </div>
  );
}

// ---------------- results
interface Results { discovered: { value: number }; contacts_found: { value: number }; provider: Record<string, number | null> & { note?: string | null }; replies: { value: number }; positive: { value: number; note: string };
  meetings: { value: number }; enquiries: { value: number }; sales: { value: number }; revenue_pence: { value: number }; entries: { id: string; kind: string; amount_pence: number; note: string; occurred_on: string }[] }

export function BusinessResults() {
  const toast = useToast();
  const { data, mutate } = useApi<Results>("/outreach/results");
  const [f, setF] = useState({ kind: "sale", amount: "", note: "" });
  if (!data) return <div className="skeleton h-64 rounded-2xl" />;
  const gbp = (p: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(p / 100);
  const add = async () => { try { await api("/outreach/results", { method: "POST", json: { kind: f.kind, amount_pence: Math.round(parseFloat(f.amount || "0") * 100), note: f.note } }); setF({ kind: "sale", amount: "", note: "" }); mutate(); toast("success", "Recorded"); } catch (e: any) { toast("error", e.message); } };
  const Src = ({ s }: { s: string }) => <span className="ml-1 rounded-full bg-bg2 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-dim">{s}</span>;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Prospects discovered" value={data.discovered.value} icon={<Inbox size={16} />} sub={<>TubeLead<Src s="actual" /></>} />
        <StatCard label="Contacts found" value={data.contacts_found.value} icon={<Inbox size={16} />} tone="cyan" sub={<>TubeLead<Src s="actual" /></>} />
        <StatCard label="Replies" value={data.replies.value} icon={<Inbox size={16} />} tone="green" sub={<>{data.positive.value} positive<Src s="classified" /></>} />
        <StatCard label="Revenue recorded" value={data.revenue_pence.value / 100} format={(n) => gbp(n * 100)} icon={<Inbox size={16} />} tone="magenta" sub={<>{data.sales.value} sale(s)<Src s="you entered" /></>} />
      </div>
      <section className="rounded-[20px] border border-line bg-panel p-5">
        <h3 className="mb-3 font-heading text-[15px] font-bold">Delivery <Src s="from your provider" /></h3>
        <div className="grid gap-3 sm:grid-cols-5">{(["sent", "delivered", "bounced", "replied", "unsubscribed"] as const).map((k) => <div key={k}><p className="text-[11px] uppercase tracking-wide text-mute">{k}</p><p className="font-display text-[22px] font-extrabold tabular-nums">{data.provider[k] ?? "—"}</p></div>)}</div>
        {data.provider.note && <p className="mt-2 text-[12px] text-mute">{data.provider.note}</p>}
      </section>
      <section className="rounded-[20px] border border-line bg-panel p-5">
        <h3 className="mb-1 font-heading text-[15px] font-bold">Meetings, enquiries and sales <Src s="you entered" /></h3>
        <p className="mb-3 text-[12px] text-mute">{data.positive.note} Record outcomes here as they happen.</p>
        <div className="grid gap-2 sm:grid-cols-[140px_140px_1fr_auto]">
          <select aria-label="Outcome" className="field" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="sale">Sale</option><option value="meeting">Meeting</option><option value="enquiry">Enquiry</option></select>
          <input aria-label="Amount in pounds" className="field" inputMode="decimal" placeholder="£ amount" disabled={f.kind !== "sale"} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <input aria-label="Note" className="field" placeholder="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          <button className="btn-primary btn-sm" onClick={add}>Record</button>
        </div>
        <ul className="mt-3 divide-y divide-line text-[13px]">{data.entries.map((e) => (
          <li key={e.id} className="flex items-center gap-3 py-2"><Badge tone={e.kind === "sale" ? "green" : "cyan"}>{e.kind}</Badge><span className="flex-1">{e.note || "—"}</span>{e.kind === "sale" && <span className="font-semibold tabular-nums">{gbp(e.amount_pence)}</span>}
            <span className="text-[11px] text-dim">{new Date(e.occurred_on).toLocaleDateString("en-GB")}</span>
            <button aria-label="Delete entry" className="rounded p-1 text-dim hover:text-[#A33A2A]" onClick={async () => { await api(`/outreach/results/${e.id}`, { method: "DELETE" }); mutate(); }}><Trash2 size={13} /></button></li>))}</ul>
      </section>
    </div>
  );
}

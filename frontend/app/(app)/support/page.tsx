"use client";
import { LifeBuoy, MessageSquare, Plus } from "lucide-react";
import { useState } from "react";
import { Badge, EmptyState, ErrorState, PageHeader, Panel, PanelHeader, Skeleton } from "@/components/ui/core";
import { Field } from "@/components/ui/inputs";
import { Modal, useToast } from "@/components/ui/overlay";
import { api, useApi } from "@/lib/api";
import { ago, dateLong } from "@/lib/format";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/support";

interface Ticket { ref: string; category: string; subject: string; status: string; created_at: string; updated_at: string | null; resolution: string;
  messages?: { author: "customer" | "staff"; body: string; created_at: string }[] }

const CATEGORIES = [["general", "General question"], ["technical", "Technical problem"], ["billing", "Billing"], ["refund", "Refund request"], ["cancellation", "Cancellation"], ["account", "Account"]] as const;

export default function SupportPage() {
  const { data, error, mutate } = useApi<Ticket[]>("/support/tickets");
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <div>
      <PageHeader eyebrow="Help" title="Help & Support" sub="Your requests to the TubeLead team. For quick answers, use the chat button in the corner."
        actions={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> New request</button>} />
      {error ? <Panel><ErrorState error={error} onRetry={() => mutate()} /></Panel> : !data ? <Skeleton className="h-40" /> : data.length === 0 ? (
        <Panel><EmptyState icon={<LifeBuoy size={24} />} title="No requests yet" body="When you send a request to the team, it appears here with its reference and every reply."
          action={<button className="btn-primary" onClick={() => setCreating(true)}>New request</button>} /></Panel>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Panel>
            <PanelHeader title="Your requests" icon={<MessageSquare size={16} />} />
            <ul className="divide-y divide-line pb-2">
              {data.map((t) => (
                <li key={t.ref}><button type="button" onClick={() => setOpen(t.ref)} aria-current={open === t.ref ? "true" : undefined}
                  className={`flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-forest-50 ${open === t.ref ? "bg-forest-50" : ""}`}>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{t.subject}</p><p className="data text-[11px] text-mute">{t.ref} · {ago(t.created_at)}</p></div>
                  <Badge tone={STATUS_TONE[t.status]} dot>{t.status === "waiting_customer" ? "Waiting for you" : STATUS_LABEL[t.status] ?? t.status}</Badge>
                </button></li>
              ))}
            </ul>
          </Panel>
          {open ? <TicketThread key={open} reference={open} onChange={() => mutate()} /> : <Panel><EmptyState title="Select a request" body="Choose a request to see the conversation and reply." /></Panel>}
        </div>
      )}
      <NewRequest open={creating} onClose={() => setCreating(false)} onCreated={(ref) => { setCreating(false); mutate(); setOpen(ref); }} />
    </div>
  );
}

function TicketThread({ reference, onChange }: { reference: string; onChange: () => void }) {
  const toast = useToast();
  const { data, error, mutate } = useApi<Ticket>(`/support/tickets/${reference}`);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  if (error) return <Panel><ErrorState error={error} onRetry={() => mutate()} /></Panel>;
  if (!data) return <Skeleton className="h-64" />;
  const reply = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await mutate(api<Ticket>(`/support/tickets/${reference}/reply`, { method: "POST", json: { body } }), { revalidate: false }); setBody(""); onChange(); }
    catch (err: any) { toast("error", err.message); } finally { setBusy(false); }
  };
  return (
    <Panel className="flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div><p className="font-heading text-base font-semibold">{data.subject}</p><p className="data mt-0.5 text-[11px] text-mute">{data.ref} · opened {dateLong(data.created_at)}</p></div>
        <Badge tone={STATUS_TONE[data.status]} dot>{data.status === "waiting_customer" ? "Waiting for you" : STATUS_LABEL[data.status] ?? data.status}</Badge>
      </div>
      <ol className="flex-1 space-y-3 px-5 py-4">
        {data.messages?.map((m, i) => (
          <li key={i} className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${m.author === "staff" ? "bg-forest-50" : "ml-auto bg-bg2"}`}>
            <p className="label mb-1 !text-[10px]">{m.author === "staff" ? "TubeLead team" : "You"} · {ago(m.created_at)}</p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ol>
      {data.status !== "closed" ? (
        <form onSubmit={reply} className="border-t border-line p-4">
          <label htmlFor="ticket-reply" className="sr-only">Reply</label>
          <textarea id="ticket-reply" className="field min-h-[80px]" placeholder="Write a reply…" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
          <div className="mt-2 flex justify-end"><button className="btn-primary btn-sm" disabled={busy || !body.trim()}>{busy ? "Sending…" : "Send reply"}</button></div>
        </form>
      ) : <p className="border-t border-line px-5 py-3 text-xs text-mute">This request is closed. Open a new one if you still need help.</p>}
    </Panel>
  );
}

function NewRequest({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (ref: string) => void }) {
  const toast = useToast();
  const [category, setCategory] = useState<string>("general");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api<{ ref: string }>("/support/tickets", { method: "POST", json: { category, subject, description } });
      toast("success", `Request sent. Your reference is ${r.ref}.`);
      setSubject(""); setDescription(""); setCategory("general");
      onCreated(r.ref);
    } catch (e: any) { toast("error", e.message); } finally { setBusy(false); }
  };
  const financial = ["billing", "refund", "cancellation", "account"].includes(category);
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="New request" description="A person on the TubeLead team will reply by email and here."
      footer={<><button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button><button className="btn-primary btn-sm" disabled={busy || subject.trim().length < 3 || description.trim().length < 10} onClick={submit}>{busy ? "Sending…" : "Send request"}</button></>}>
      <div className="space-y-3">
        <Field label="Topic"><select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Subject"><input className="field" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} /></Field>
        <Field label="Details" hint="At least 10 characters"><textarea className="field min-h-[110px]" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} /></Field>
        {financial && <p className="rounded-lg bg-bg2 p-2.5 text-[12px] text-mute">Billing, refund and cancellation requests are decided by a person. Sending this request doesn't change anything yet. You can also manage your plan yourself in Billing & Subscription.</p>}
      </div>
    </Modal>
  );
}

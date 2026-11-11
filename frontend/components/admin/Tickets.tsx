"use client";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Badge, ErrorState, Panel, Skeleton } from "@/components/ui/core";
import { Field, Segmented } from "@/components/ui/inputs";
import { Modal, Sheet, useToast } from "@/components/ui/overlay";
import { api, useApi } from "@/lib/api";
import { ago, dateLong } from "@/lib/format";
import { CATEGORY_LABEL, REFUND_TONE, STATUS_LABEL, STATUS_TONE } from "@/lib/support";
import { Row, Table, Td } from "./shared";

interface T { ref: string; category: string; subject: string; status: string; email: string; name: string; assigned_to: string | null; source: string; created_at: string;
  description?: string; resolution: string; messages?: { author: string; body: string; created_at: string }[]; refund_request?: { status: string; id: string } | null }

export function TicketsTab() {
  const [status, setStatus] = useState<"active" | "resolved" | "all">("active");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const qs = new URLSearchParams({ ...(status !== "all" && { status }), ...(category && { category }), ...(q.trim() && { q: q.trim() }) }).toString();
  const { data, error, mutate } = useApi<T[]>(`/admin/tickets${qs ? `?${qs}` : ""}`);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <Segmented label="Ticket status" value={status} onChange={setStatus} options={[{ value: "active", label: "Open" }, { value: "resolved", label: "Resolved" }, { value: "all", label: "All" }]} />
        <select aria-label="Category" className="field !w-auto !py-1.5 text-xs" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All topics</option>{Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input aria-label="Search tickets" className="field !w-auto min-w-0 flex-1 !py-1.5 text-xs" placeholder="Search reference, email or subject" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary btn-sm" onClick={() => setCreating(true)}><Plus size={14} /> New ticket</button>
      </div>
      {error ? <ErrorState error={error} onRetry={() => mutate()} /> : !data ? <Skeleton className="m-4 h-32" /> : (
        <Table head={["Reference", "Subject", "Topic", "From", "Status", "Opened"]} empty={data.length === 0}>
          {data.map((t) => (
            <Row key={t.ref} onClick={() => setOpen(t.ref)}>
              <Td className="data text-[12px]">{t.ref}</Td><Td className="max-w-[260px] truncate font-medium">{t.subject}</Td><Td>{CATEGORY_LABEL[t.category]}</Td>
              <Td className="max-w-[200px] truncate text-mute">{t.email || "—"}</Td><Td><Badge tone={STATUS_TONE[t.status]} dot>{STATUS_LABEL[t.status]}</Badge></Td><Td className="text-mute">{ago(t.created_at)}</Td>
            </Row>))}
        </Table>
      )}
      {open && <TicketSheet reference={open} onClose={() => setOpen(null)} onChange={() => mutate()} />}
      <NewTicket open={creating} onClose={() => setCreating(false)} onCreated={(ref) => { setCreating(false); mutate(); setOpen(ref); }} />
    </Panel>
  );
}

function TicketSheet({ reference, onClose, onChange }: { reference: string; onClose: () => void; onChange: () => void }) {
  const toast = useToast();
  const { data, mutate } = useApi<T>(`/admin/tickets/${reference}`);
  const { data: staff } = useApi<{ id: string; email: string; role: string }[]>("/admin/staff");
  const [reply, setReply] = useState("");
  const [after, setAfter] = useState("waiting_customer");
  const [resolution, setResolution] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const patch = async (body: Record<string, unknown>) => {
    try { await mutate(api<T>(`/admin/tickets/${reference}`, { method: "PATCH", json: body }), { revalidate: false }); onChange(); toast("success", "Ticket updated"); }
    catch (e: any) { toast("error", e.message); }
  };
  const send = async () => {
    setBusy(true);
    try { await mutate(api<T>(`/admin/tickets/${reference}/reply`, { method: "POST", json: { body: reply, status: after } }), { revalidate: false }); setReply(""); onChange(); toast("success", "Reply sent to the customer"); }
    catch (e: any) { toast("error", e.message); } finally { setBusy(false); }
  };
  return (
    <Sheet padded open onOpenChange={(o) => !o && onClose()} title={data ? data.subject : "Ticket"} description={data ? `${data.ref} · ${data.email || "no email"} · via ${data.source}` : ""} width="max-w-[640px]">
      {!data ? <Skeleton className="h-64" /> : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status"><select className="field" value={data.status} onChange={(e) => patch({ status: e.target.value })}>{Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Assigned to"><select className="field" value={data.assigned_to ?? ""} onChange={(e) => patch({ assigned_to: e.target.value })}>
              <option value="">Unassigned</option>{staff?.map((s) => <option key={s.id} value={s.id}>{s.email || s.id.slice(0, 8)} ({s.role})</option>)}</select></Field>
          </div>
          {data.refund_request && <p className="rounded-xl bg-bg2 p-3 text-[13px]">Linked refund request: <Badge tone={REFUND_TONE[data.refund_request.status]} dot>{data.refund_request.status}</Badge> <span className="text-mute">Decide it in the Refunds tab.</span></p>}
          <ol className="space-y-2.5">
            {data.messages?.map((m, i) => (
              <li key={i} className={`rounded-2xl px-3.5 py-2.5 text-[13.5px] ${m.author === "staff" ? "ml-8 bg-forest-50" : "mr-8 bg-bg2"}`}>
                <p className="label mb-1 !text-[10px]">{m.author === "staff" ? "Staff" : "Customer"} · {dateLong(m.created_at)}</p><p className="whitespace-pre-wrap">{m.body}</p>
              </li>))}
          </ol>
          <div className="space-y-2 rounded-2xl border border-line p-3">
            <label htmlFor="staff-reply" className="label block !text-[10px]">Reply to the customer (emailed)</label>
            <textarea id="staff-reply" className="field min-h-[96px]" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={5000} />
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Status after reply" className="field !w-auto !py-1.5 text-xs" value={after} onChange={(e) => setAfter(e.target.value)}>
                <option value="waiting_customer">Then: waiting for customer</option><option value="in_progress">Then: in progress</option><option value="resolved">Then: resolved</option>
              </select>
              <button className="btn-primary btn-sm ml-auto" disabled={busy || !reply.trim()} onClick={send}>{busy ? "Sending…" : "Send reply"}</button>
            </div>
          </div>
          <Field label="Resolution notes (internal)">
            <textarea className="field min-h-[70px]" value={resolution ?? data.resolution} onChange={(e) => setResolution(e.target.value)} maxLength={5000} />
          </Field>
          <button className="btn-ghost btn-sm" disabled={resolution === null} onClick={() => patch({ resolution: resolution ?? "" })}>Save notes</button>
        </div>
      )}
    </Sheet>
  );
}

function NewTicket({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (ref: string) => void }) {
  const toast = useToast();
  const [f, setF] = useState({ email: "", name: "", category: "general", subject: "", description: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    setBusy(true);
    try { const t = await api<T>("/admin/tickets", { method: "POST", json: f }); toast("success", `Ticket ${t.ref} created`); setF({ email: "", name: "", category: "general", subject: "", description: "" }); onCreated(t.ref); }
    catch (e: any) { toast("error", e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="New ticket" description="Record an enquiry received by phone or email. The customer gets a confirmation email."
      footer={<><button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button><button className="btn-primary btn-sm" disabled={busy || !f.email.includes("@") || f.subject.trim().length < 3 || f.description.trim().length < 3} onClick={submit}>Create</button></>}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Customer email"><input className="field" type="email" value={f.email} onChange={set("email")} /></Field><Field label="Name"><input className="field" value={f.name} onChange={set("name")} /></Field></div>
        <Field label="Topic"><select className="field" value={f.category} onChange={set("category")}>{Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Subject"><input className="field" value={f.subject} onChange={set("subject")} maxLength={200} /></Field>
        <Field label="Details"><textarea className="field min-h-[96px]" value={f.description} onChange={set("description")} maxLength={5000} /></Field>
      </div>
    </Modal>
  );
}

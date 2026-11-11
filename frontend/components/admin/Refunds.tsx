"use client";
import { ExternalLink, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Badge, EmptyState, ErrorState, Panel, Skeleton } from "@/components/ui/core";
import { Field, Segmented } from "@/components/ui/inputs";
import { Modal, useToast } from "@/components/ui/overlay";
import { api, useApi } from "@/lib/api";
import { ago, dateLong } from "@/lib/format";
import { money, REFUND_TONE } from "@/lib/support";
import type { Payment } from "./shared";

interface R { id: string; ticket_ref: string | null; email: string; reason: string; status: string; decided_at: string | null; decision_note: string;
  payment: Payment | null; payments?: Payment[]; refund_id: string | null; refund_amount: number | null; created_at: string }

export function RefundsTab() {
  const [status, setStatus] = useState<"pending" | "approved" | "all">("pending");
  const { data, error, mutate } = useApi<R[]>(`/admin/refunds${status === "all" ? "" : `?status=${status}`}`);
  const [decide, setDecide] = useState<{ r: R; decision: "approved" | "rejected" } | null>(null);
  const [execute, setExecute] = useState<R | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Refund status" value={status} onChange={setStatus} options={[{ value: "pending", label: "To review" }, { value: "approved", label: "Approved, not issued" }, { value: "all", label: "All" }]} />
        <p className="text-xs text-mute">Only admins can decide and issue refunds. The assistant can only file requests.</p>
      </div>
      {error ? <Panel><ErrorState error={error} onRetry={() => mutate()} /></Panel> : !data ? <Skeleton className="h-40" /> : data.length === 0 ? (
        <Panel><EmptyState icon={<RotateCcw size={24} />} title="No refund requests" body="Requests customers send through the assistant or the Support page appear here." /></Panel>
      ) : data.map((r) => (
        <Panel key={r.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="font-semibold">{r.email || "Unknown customer"} <span className="data text-[12px] font-normal text-mute">· {r.ticket_ref}</span></p><p className="text-[11px] text-mute">Requested {ago(r.created_at)}</p></div>
            <Badge tone={REFUND_TONE[r.status]} dot>{r.status}</Badge>
          </div>
          <p className="mt-3 whitespace-pre-wrap rounded-xl bg-bg2 p-3 text-[13.5px]">{r.reason}</p>
          <div className="mt-3 grid gap-3 text-[13px] sm:grid-cols-2">
            <div><p className="label mb-1 !text-[10px]">Linked payment</p>{r.payment ? (
              <p>{money(r.payment.amount, r.payment.currency)} on {dateLong(r.payment.created_at)}{r.payment.refunded_amount > 0 && <> · {money(r.payment.refunded_amount, r.payment.currency)} refunded</>}
                {r.payment.stripe_url && <a href={r.payment.stripe_url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-forest underline">Stripe <ExternalLink size={11} /></a>}</p>
            ) : <p className="text-mute">None found. Refund in the Stripe dashboard if needed.</p>}</div>
            {r.payments && r.payments.length > 1 && <div><p className="label mb-1 !text-[10px]">Recent payments</p><p className="text-mute">{r.payments.slice(0, 4).map((p) => money(p.amount, p.currency)).join(" · ")}</p></div>}
            {r.decided_at && <div><p className="label mb-1 !text-[10px]">Decision</p><p>{r.status} {dateLong(r.decided_at)}{r.decision_note && ` · ${r.decision_note}`}</p></div>}
            {r.refund_id && <div><p className="label mb-1 !text-[10px]">Issued</p><p className="data">{money(r.refund_amount ?? 0, r.payment?.currency)} · {r.refund_id}</p></div>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {r.status === "pending" && <>
              <button className="btn-primary btn-sm" onClick={() => setDecide({ r, decision: "approved" })}>Approve</button>
              <button className="btn-ghost btn-sm" onClick={() => setDecide({ r, decision: "rejected" })}>Reject</button></>}
            {r.status === "approved" && r.payment && <button className="btn-primary btn-sm" onClick={() => setExecute(r)}>Issue refund in Stripe…</button>}
          </div>
        </Panel>
      ))}
      {decide && <DecisionModal {...decide} onClose={() => setDecide(null)} onDone={() => { if (decide.decision === "approved") setStatus("approved"); setDecide(null); mutate(); }} />}
      {execute && <ExecuteModal r={execute} onClose={() => setExecute(null)} onDone={() => { setExecute(null); mutate(); }} />}
    </div>
  );
}

function DecisionModal({ r, decision, onClose, onDone }: { r: R; decision: "approved" | "rejected"; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await api(`/admin/refunds/${r.id}/decision`, { method: "POST", json: { decision, note } }); toast("success", `Request ${decision}. The customer has been emailed.`); onDone(); }
    catch (e: any) { toast("error", e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={decision === "approved" ? "Approve refund request" : "Reject refund request"}
      description={decision === "approved" ? "Approving records your decision and emails the customer. No money moves until you issue the refund." : "The customer is emailed that the request was declined."}
      footer={<><button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button><button className="btn-primary btn-sm" disabled={busy} onClick={submit}>{decision === "approved" ? "Approve" : "Reject"}</button></>}>
      <Field label="Note to the customer (optional)"><textarea className="field min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} /></Field>
    </Modal>
  );
}

function ExecuteModal({ r, onClose, onDone }: { r: R; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const p = r.payment!;
  const max = p.amount - p.refunded_amount;
  const [amount, setAmount] = useState((max / 100).toFixed(2));
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const phrase = `REFUND ${r.ticket_ref}`;
  const pence = Math.round(parseFloat(amount || "0") * 100);
  const submit = async () => {
    setBusy(true);
    try { await api(`/admin/refunds/${r.id}/execute`, { method: "POST", json: { confirm, amount: pence } }); toast("success", "Refund issued in Stripe"); onDone(); }
    catch (e: any) { toast("error", e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Issue refund" description={`This sends real money back through Stripe and cannot be undone. Up to ${money(max, p.currency)} can be refunded.`}
      footer={<><button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button><button className="btn-primary btn-sm !bg-none !bg-[#B5493A]" disabled={busy || confirm.trim().toUpperCase() !== phrase || pence <= 0 || pence > max} onClick={submit}>{busy ? "Issuing…" : "Issue refund"}</button></>}>
      <div className="space-y-3">
        <Field label={`Amount (${p.currency.toUpperCase()})`}><input className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label={`Type ${phrase} to confirm`}><input className="field data" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></Field>
      </div>
    </Modal>
  );
}

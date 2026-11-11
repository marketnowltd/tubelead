"use client";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { Badge, ErrorState, Panel, Skeleton } from "@/components/ui/core";
import { Field } from "@/components/ui/inputs";
import { Modal, Sheet, useToast } from "@/components/ui/overlay";
import { api, useApi } from "@/lib/api";
import { ago, dateLong } from "@/lib/format";
import { money, STATUS_LABEL } from "@/lib/support";
import { ACTION_LABEL, type Audit, type Payment, Row, Table, Td } from "./shared";

interface C { id: string; email: string; full_name: string; status: string; role: string; plan: string; subscription_status: string; created_at: string; last_login_at: string }
interface CD extends C { status_reason: string; subscription: Sub | null; payments: Payment[]; tickets: { ref: string; subject: string; status: string; created_at: string }[]; activity: Audit[] }
interface Sub { owner_id: string; email: string; plan: string; interval: string; status: string; cancel_at_period_end: boolean; renewal_date: string | null; last_payment_status: string | null; stripe_customer_url: string | null }

export function CustomersTab({ myRole }: { myRole: string }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const qs = new URLSearchParams({ ...(q.trim() && { q: q.trim() }), ...(status && { status }) }).toString();
  const { data, error, mutate } = useApi<C[]>(`/admin/customers${qs ? `?${qs}` : ""}`);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Panel>
      <div className="flex flex-wrap gap-3 border-b border-line px-4 py-3">
        <input aria-label="Search customers" className="field min-w-0 flex-1 !py-1.5 text-xs" placeholder="Search by email, name or user ID" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Account status" className="field !w-auto !py-1.5 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All accounts</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
      </div>
      {error ? <ErrorState error={error} onRetry={() => mutate()} /> : !data ? <Skeleton className="m-4 h-32" /> : (
        <Table head={["Customer", "Plan", "Account", "Joined", "Last seen"]} empty={data.length === 0}>
          {data.map((c) => (
            <Row key={c.id} onClick={() => setOpen(c.id)}>
              <Td><p className="font-medium">{c.email || c.id.slice(0, 8)}</p>{c.full_name && <p className="text-[11px] text-mute">{c.full_name}</p>}</Td>
              <Td>{c.plan} <span className="text-mute">· {c.subscription_status}</span></Td>
              <Td><Badge tone={c.status === "active" ? "green" : "red"} dot>{c.status}</Badge>{c.role !== "customer" && <Badge className="ml-1.5">{c.role}</Badge>}</Td>
              <Td className="text-mute">{ago(c.created_at)}</Td><Td className="text-mute">{ago(c.last_login_at)}</Td>
            </Row>))}
        </Table>
      )}
      {open && <CustomerSheet id={open} myRole={myRole} onClose={() => setOpen(null)} onChange={() => mutate()} />}
    </Panel>
  );
}

function CustomerSheet({ id, myRole, onClose, onChange }: { id: string; myRole: string; onClose: () => void; onChange: () => void }) {
  const toast = useToast();
  const { data, mutate } = useApi<CD>(`/admin/customers/${id}`);
  const [suspend, setSuspend] = useState(false);
  const [reason, setReason] = useState("");
  const setStatus = async (status: "active" | "suspended") => {
    try { await api(`/admin/customers/${id}/status`, { method: "POST", json: { status, reason } }); setSuspend(false); setReason(""); mutate(); onChange(); toast("success", status === "suspended" ? "Account suspended" : "Account reactivated"); }
    catch (e: any) { toast("error", e.message); }
  };
  const setRole = async (role: string) => {
    try { await api(`/admin/customers/${id}/role`, { method: "PATCH", json: { role } }); mutate(); onChange(); toast("success", "Role updated"); }
    catch (e: any) { toast("error", e.message); }
  };
  return (
    <Sheet padded open onOpenChange={(o) => !o && onClose()} title={data?.email || "Customer"} description={data ? `Joined ${dateLong(data.created_at)} · last seen ${ago(data.last_login_at)}` : ""} width="max-w-[640px]">
      {!data ? <Skeleton className="h-64" /> : (
        <div className="space-y-5 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={data.status === "active" ? "green" : "red"} dot>{data.status}</Badge>
            {data.status_reason && <span className="text-mute">Reason: {data.status_reason}</span>}
            {data.role !== "operator" && (data.status === "active"
              ? <button className="btn-ghost btn-sm ml-auto" onClick={() => setSuspend(true)}>Suspend account</button>
              : <button className="btn-primary btn-sm ml-auto" onClick={() => setStatus("active")}>Reactivate account</button>)}
          </div>
          {myRole === "operator" && data.role !== "operator" && (
            <Field label="Staff role" hint="Support: tickets and chats. Admin: everything except staff roles.">
              <select className="field" value={data.role} onChange={(e) => setRole(e.target.value)}><option value="customer">Customer</option><option value="support">Support</option><option value="admin">Admin</option></select>
            </Field>
          )}
          <section><p className="label mb-1.5 !text-[10px]">Subscription</p>{data.subscription ? (
            <p>{data.subscription.plan} ({data.subscription.interval}) · {data.subscription.status}{data.subscription.cancel_at_period_end && " · cancels at period end"}
              {data.subscription.renewal_date && ` · renews ${dateLong(data.subscription.renewal_date)}`}
              {data.subscription.stripe_customer_url && <a href={data.subscription.stripe_customer_url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-forest underline">Stripe <ExternalLink size={11} /></a>}</p>
          ) : <p className="text-mute">Free plan, never subscribed.</p>}</section>
          <section><p className="label mb-1.5 !text-[10px]">Payments</p>{data.payments.length ? <ul className="space-y-1">{data.payments.map((p) => <li key={p.id}>{money(p.amount, p.currency)} · {dateLong(p.created_at)}{p.refunded_amount > 0 && ` · ${money(p.refunded_amount, p.currency)} refunded`}</li>)}</ul> : <p className="text-mute">None.</p>}</section>
          <section><p className="label mb-1.5 !text-[10px]">Support requests</p>{data.tickets.length ? <ul className="space-y-1">{data.tickets.map((t) => <li key={t.ref}><span className="data">{t.ref}</span> · {t.subject} · {STATUS_LABEL[t.status]}</li>)}</ul> : <p className="text-mute">None.</p>}</section>
          <section><p className="label mb-1.5 !text-[10px]">Account activity</p>{data.activity.length ? <ul className="space-y-1">{data.activity.map((a) => <li key={a.id}>{ACTION_LABEL[a.action] ?? a.action} · <span className="text-mute">{ago(a.created_at)}</span></li>)}</ul> : <p className="text-mute">None.</p>}</section>
        </div>
      )}
      <Modal open={suspend} onOpenChange={setSuspend} title="Suspend this account?" description="They will be signed out of every feature until reactivated, and emailed about it."
        footer={<><button className="btn-ghost btn-sm" onClick={() => setSuspend(false)}>Cancel</button><button className="btn-primary btn-sm !bg-none !bg-[#B5493A]" onClick={() => setStatus("suspended")}>Suspend</button></>}>
        <Field label="Reason (included in the email)"><textarea className="field min-h-[70px]" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field>
      </Modal>
    </Sheet>
  );
}

export function SubscriptionsTab() {
  const [status, setStatus] = useState("");
  const { data, error, mutate } = useApi<Sub[]>(`/admin/subscriptions${status ? `?status=${status}` : ""}`);
  return (
    <Panel>
      <div className="border-b border-line px-4 py-3">
        <select aria-label="Subscription status" className="field !w-auto !py-1.5 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>{["active", "trialing", "past_due", "canceled", "unpaid"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
      </div>
      {error ? <ErrorState error={error} onRetry={() => mutate()} /> : !data ? <Skeleton className="m-4 h-32" /> : (
        <Table head={["Customer", "Plan", "Status", "Renewal", "Last payment", "Stripe"]} empty={data.length === 0}>
          {data.map((s) => (
            <Row key={s.owner_id}>
              <Td className="font-medium">{s.email || s.owner_id.slice(0, 8)}</Td><Td>{s.plan} <span className="text-mute">({s.interval})</span></Td>
              <Td><Badge tone={s.status === "active" || s.status === "trialing" ? "green" : s.status === "past_due" ? "amber" : "neutral"} dot>{s.status}</Badge>{s.cancel_at_period_end && <p className="mt-1 text-[11px] text-mute">Cancels at period end</p>}</Td>
              <Td className="text-mute">{s.renewal_date ? dateLong(s.renewal_date) : "—"}</Td><Td>{s.last_payment_status ?? "—"}</Td>
              <Td>{s.stripe_customer_url ? <a href={s.stripe_customer_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-forest underline">Open <ExternalLink size={11} /></a> : "—"}</Td>
            </Row>))}
        </Table>
      )}
    </Panel>
  );
}

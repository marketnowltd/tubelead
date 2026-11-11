"use client";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { useState } from "react";
import { Badge, ErrorState, Panel, PanelHeader, Skeleton } from "@/components/ui/core";
import { useToast } from "@/components/ui/overlay";
import { api, useApi } from "@/lib/api";
import { ago } from "@/lib/format";
import { ACTION_LABEL, type Audit, Row, Table, Td } from "./shared";

interface Sys { integrations: { name: string; configured: boolean; detail: string }[]; errors: { source: string; path: string; message: string; created_at: string }[];
  failed_jobs: { id: string; error: string | null; created_at: string }[]; emails: { template: string; to: string; status: string; attempts: number; error: string; created_at: string }[] }

export function SystemTab() {
  const toast = useToast();
  const { data, error, mutate } = useApi<Sys>("/admin/system");
  const [action, setAction] = useState("");
  const { data: audit } = useApi<Audit[]>(`/admin/audit${action ? `?action=${encodeURIComponent(action)}` : ""}`);
  if (error) return <Panel><ErrorState error={error} onRetry={() => mutate()} /></Panel>;
  if (!data) return <Skeleton className="h-64" />;
  const retry = async () => {
    try { const r = await api<{ sent: number }>("/admin/system/emails/retry", { method: "POST" }); toast("success", `${r.sent} email(s) sent`); mutate(); }
    catch (e: any) { toast("error", e.message); }
  };
  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader title="Integrations" sub="Set missing values as environment variables on the backend service." />
        <ul className="grid gap-x-6 gap-y-2.5 px-5 pb-5 sm:grid-cols-2">
          {data.integrations.map((i) => (
            <li key={i.name} className="flex items-start gap-2.5 text-[13px]">
              {i.configured ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-moss" /> : <CircleDashed size={16} className="mt-0.5 shrink-0 text-dim" />}
              <span><span className="font-medium">{i.name}</span>{!i.configured && <span className="block text-[11.5px] text-mute">Not configured · {i.detail}</span>}</span>
            </li>))}
        </ul>
      </Panel>
      <Panel>
        <PanelHeader title="Errors" sub="Server errors, failed webhooks, email and assistant failures" />
        <Table head={["When", "Source", "Where", "Message"]} empty={data.errors.length === 0}>
          {data.errors.map((e, i) => <Row key={i}><Td className="whitespace-nowrap text-mute">{ago(e.created_at)}</Td><Td><Badge>{e.source}</Badge></Td><Td className="data text-[12px]">{e.path || "—"}</Td><Td className="max-w-[420px] break-words text-[12.5px]">{e.message}</Td></Row>)}
        </Table>
      </Panel>
      <Panel>
        <PanelHeader title="Emails" action={<button className="btn-ghost btn-sm" onClick={retry}>Send queued now</button>} />
        <Table head={["When", "Template", "To", "Status", "Attempts"]} empty={data.emails.length === 0}>
          {data.emails.map((e, i) => (
            <Row key={i}><Td className="whitespace-nowrap text-mute">{ago(e.created_at)}</Td><Td>{e.template.replace(/_/g, " ")}</Td><Td>{e.to}</Td>
              <Td><Badge tone={e.status === "sent" ? "green" : e.status === "failed" ? "red" : e.status === "not_configured" ? "neutral" : "cyan"} dot>{e.status.replace("_", " ")}</Badge>{e.error && <p className="mt-1 max-w-[260px] text-[11px] text-mute">{e.error}</p>}</Td><Td>{e.attempts}</Td></Row>))}
        </Table>
      </Panel>
      {data.failed_jobs.length > 0 && (
        <Panel>
          <PanelHeader title="Failed discovery jobs" />
          <Table head={["When", "Job", "Error"]}>{data.failed_jobs.map((j) => <Row key={j.id}><Td className="text-mute">{ago(j.created_at)}</Td><Td className="data text-[12px]">{j.id.slice(0, 8)}</Td><Td>{j.error ?? "—"}</Td></Row>)}</Table>
        </Panel>
      )}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <p className="font-heading text-sm font-semibold">Audit log</p>
          <select aria-label="Filter audit log" className="field !w-auto !py-1.5 text-xs" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option><option value="refund">Refunds</option><option value="account">Accounts</option><option value="ticket">Tickets</option><option value="knowledge">Help articles</option><option value="chatbot">Assistant</option>
          </select>
        </div>
        <Table head={["When", "Action", "By", "Target"]} empty={!audit || audit.length === 0}>
          {audit?.map((a) => <Row key={a.id}><Td className="whitespace-nowrap text-mute">{ago(a.created_at)}</Td><Td>{ACTION_LABEL[a.action] ?? a.action}</Td><Td>{a.actor_type}{a.actor_id && <span className="data text-[11px] text-mute"> · {a.actor_id.slice(0, 8)}</span>}</Td><Td className="data text-[12px]">{a.target_id || "—"}</Td></Row>)}
        </Table>
      </Panel>
    </div>
  );
}

"use client";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { useState } from "react";
import { ErrorState, Panel, PanelHeader, Skeleton } from "@/components/ui/core";
import { Modal, useToast } from "@/components/ui/overlay";
import { api, useApi } from "@/lib/api";
import { Row, Table, Td } from "./shared";

interface Plan { label: string; price_monthly_gbp: number; price_annual_gbp: number; leads: number; team_seats: number; credits: Record<string, number> }
interface G {
  providers: { name: string; configured: boolean; requires: string[] }[]; usage: { kind: string; provider: string; units: number; cost_pence: number }[];
  month: { provider_cost_gbp: number; revenue_gbp: number; estimated_margin_gbp: number; note: string };
  discovery: { runs: number; completed: number; failed: number; prospects_found: number }; enrichment: { prospects_enriched: number; with_contact: number; success_rate: number | null };
  campaigns: { created: number; approved: number; launched: number; failed: number }; customers: ({ owner_id: string; email: string } & Record<string, any>)[]; plans: Record<string, Plan>;
}
const KINDS = ["discovery", "enrichment", "verification", "campaign_recipients", "storage_mb"] as const;
const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);

export function GrowthTab() {
  const toast = useToast();
  const { data, error, mutate } = useApi<G>("/admin/growth");
  const [edit, setEdit] = useState<[string, Plan] | null>(null);
  if (error) return <Panel><ErrorState error={error} onRetry={() => mutate()} /></Panel>;
  if (!data) return <Skeleton className="h-64" />;
  const save = async () => {
    if (!edit) return;
    const [id, p] = edit;
    try { await api(`/admin/plans/${id}`, { method: "PUT", json: { label: p.label, price_monthly_gbp: p.price_monthly_gbp, price_annual_gbp: p.price_annual_gbp, leads: p.leads, team_seats: p.team_seats, credits: p.credits } });
      toast("success", "Plan updated. Stripe price IDs are unchanged; update them in Stripe if you changed a price."); setEdit(null); mutate(); }
    catch (e: any) { toast("error", e.message); }
  };
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {([["Provider costs this month", data.month.provider_cost_gbp], ["Revenue this month", data.month.revenue_gbp], ["Estimated margin", data.month.estimated_margin_gbp]] as const).map(([l, v]) => (
          <Panel key={l} className="p-5"><p className="label !text-[10px]">{l}</p><p className="mt-1 font-display text-[28px] font-extrabold tabular-nums">{gbp(v)}</p></Panel>))}
      </div>
      <p className="-mt-3 text-[11.5px] text-dim">{data.month.note}</p>
      <Panel><PanelHeader title="API connections" />
        <ul className="grid gap-x-6 gap-y-2 px-5 pb-5 sm:grid-cols-2">{data.providers.map((p) => (
          <li key={p.name} className="flex items-start gap-2 text-[13px]">{p.configured ? <CheckCircle2 size={16} className="mt-0.5 text-moss" /> : <CircleDashed size={16} className="mt-0.5 text-dim" />}
            <span><span className="font-medium">{p.name}</span>{!p.configured && p.requires.length > 0 && <span className="block text-[11.5px] text-mute">Needs {p.requires.join(", ")}</span>}</span></li>))}</ul>
      </Panel>
      <div className="grid gap-4 md:grid-cols-3">
        <Panel className="p-5"><p className="font-semibold">Discovery</p><p className="mt-1 text-[13px] text-mute">{data.discovery.completed} of {data.discovery.runs} runs completed · {data.discovery.failed} failed · {data.discovery.prospects_found} prospects</p></Panel>
        <Panel className="p-5"><p className="font-semibold">Enrichment</p><p className="mt-1 text-[13px] text-mute">{data.enrichment.prospects_enriched} enriched · {data.enrichment.with_contact} with a contact{data.enrichment.success_rate !== null && ` · ${data.enrichment.success_rate}% success`}</p></Panel>
        <Panel className="p-5"><p className="font-semibold">Campaigns</p><p className="mt-1 text-[13px] text-mute">{data.campaigns.created} created · {data.campaigns.approved} approved · {data.campaigns.launched} launched · {data.campaigns.failed} failed</p></Panel>
      </div>
      <Panel><PanelHeader title="Credit usage this month" />
        <Table head={["Kind", "Provider", "Units", "Provider cost"]} empty={data.usage.length === 0}>
          {data.usage.map((u, i) => <Row key={i}><Td>{u.kind.replace("_", " ")}</Td><Td>{u.provider}</Td><Td className="tabular-nums">{u.units.toLocaleString()}</Td><Td className="tabular-nums">{gbp(u.cost_pence / 100)}</Td></Row>)}
        </Table>
      </Panel>
      <Panel><PanelHeader title="Customer usage this month" />
        <Table head={["Customer", "Discovery", "Enrichment", "Verification", "Recipients"]} empty={data.customers.length === 0}>
          {data.customers.map((c) => <Row key={c.owner_id}><Td>{c.email || c.owner_id.slice(0, 8)}</Td>{(["discovery", "enrichment", "verification", "campaign_recipients"] as const).map((k) => <Td key={k} className="tabular-nums">{c[k] ?? 0}</Td>)}</Row>)}
        </Table>
      </Panel>
      <Panel><PanelHeader title="Plans and allowances" sub="Changes apply within about 30 seconds. Monthly allowances reset on the 1st." />
        <Table head={["Plan", "Price", "Leads", "Discovery", "Enrichment", "Verification", "Recipients", "Storage", ""]}>
          {Object.entries(data.plans).filter(([id]) => id !== "operator").map(([id, p]) => (
            <Row key={id}><Td className="font-semibold">{p.label}</Td><Td>{gbp(p.price_monthly_gbp)}/mo</Td><Td className="tabular-nums">{p.leads.toLocaleString()}</Td>
              {KINDS.map((k) => <Td key={k} className="tabular-nums">{(p.credits?.[k] ?? 0).toLocaleString()}{k === "storage_mb" ? " MB" : ""}</Td>)}
              <Td><button className="btn-ghost btn-sm" onClick={() => setEdit([id, JSON.parse(JSON.stringify(p))])}>Edit</button></Td></Row>))}
        </Table>
      </Panel>
      <Modal open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={`Edit ${edit?.[1].label ?? ""} plan`} description="Prices shown on the site. Customers are only charged through Stripe Checkout with their agreement."
        footer={<><button className="btn-ghost btn-sm" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary btn-sm" onClick={save}>Save</button></>}>
        {edit && <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto">
          <label className="col-span-2 text-xs font-semibold">Name<input className="field mt-1" value={edit[1].label} onChange={(e) => setEdit([edit[0], { ...edit[1], label: e.target.value }])} /></label>
          {([["price_monthly_gbp", "Monthly price (£)"], ["price_annual_gbp", "Annual price (£)"], ["leads", "Leads"], ["team_seats", "Team members"]] as const).map(([k, l]) => (
            <label key={k} className="text-xs font-semibold">{l}<input className="field mt-1" type="number" min={0} step={k.startsWith("price") ? 0.01 : 1} value={edit[1][k]} onChange={(e) => setEdit([edit[0], { ...edit[1], [k]: Number(e.target.value) }])} /></label>))}
          {KINDS.map((k) => <label key={k} className="text-xs font-semibold">{k.replace("_", " ")}{k === "storage_mb" ? " (MB)" : ""}<input className="field mt-1" type="number" min={0} value={edit[1].credits?.[k] ?? 0}
            onChange={(e) => setEdit([edit[0], { ...edit[1], credits: { ...edit[1].credits, [k]: Number(e.target.value) } }])} /></label>)}
        </div>}
      </Modal>
    </div>
  );
}

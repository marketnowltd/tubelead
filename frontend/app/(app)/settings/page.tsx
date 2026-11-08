"use client";
import { ArrowRight, Crown } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { mutate as gm } from "swr";
import { ErrorState, PageHeader, Panel, PanelHeader, Progress, Skeleton } from "@/components/ui/core";
import { Field } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/overlay";
import { api, useApi } from "@/lib/api";
import { useDemo } from "@/lib/demo";
import type { Status } from "@/lib/types";

interface Settings { display_name: string; email: string; plan: string }

export default function SettingsPage() {
  const toast = useToast();
  const demo = useDemo();
  const { data, error, mutate } = useApi<Settings>("/settings");
  const { data: st } = useApi<Status>("/status");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) { setName(data.display_name); setEmail(data.email); } }, [data]);
  const emailBad = email !== "" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const save = async (body: object, ok: string) => { setSaving(true); try { await api("/settings", { method: "PUT", json: body }); toast("success", ok); await mutate(); gm("/status"); } catch (e: any) { toast("error", e.message); } finally { setSaving(false); } };
  return (
    <div>
      <PageHeader eyebrow="Account" title="Account Settings" sub="Profile, plan summary and system information." />
      {error ? <Panel><ErrorState error={error} onRetry={() => mutate()} /></Panel> : (
        <div className="space-y-6">
          <Panel><PanelHeader title="Profile" />
            {!data ? <Skeleton className="m-5 h-24" /> : (
              <form className="grid gap-4 px-5 pb-5 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (!emailBad && name.trim()) save({ display_name: name.trim(), email }, "Profile saved"); }}>
                <Field label="Display name"><input className="field" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} required /></Field>
                <Field label="Email"><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={emailBad} />{emailBad && <p role="alert" className="mt-1 text-[11px] text-[#A33A2A]">Enter a valid email address.</p>}</Field>
                <div className="md:col-span-2"><button className="btn-primary !px-5 !py-2.5 !text-xs" disabled={saving || emailBad || !name.trim()}>{saving ? "Saving…" : "Save profile"}</button></div>
              </form>)}</Panel>

          <Panel><PanelHeader title="Plan" icon={<Crown size={16} />} sub="Plans are managed in Billing & Subscription. Paid features unlock only after Stripe confirms your payment." />
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 pb-5">
              {st ? <div className="min-w-0 flex-1"><div className="mb-1.5 flex justify-between text-xs text-mute"><span><strong className="text-ink">{st.plan.label}</strong> · leads {st.plan.lead_period === "lifetime" ? "in trial" : "this month"}</span><span className="data">{st.plan.leads_used.toLocaleString()} / {st.plan.leads.toLocaleString()}</span></div><Progress label="Leads used" value={(st.plan.leads_used / st.plan.leads) * 100} /></div> : <Skeleton className="h-10 flex-1" />}
              <Link href="/billing" className="btn-primary btn-sm">Manage billing <ArrowRight size={13} /></Link>
            </div>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel><PanelHeader title="System" />{!st ? <Skeleton className="m-5 h-28" /> : (
              <dl className="grid grid-cols-2 gap-3 px-5 pb-5 text-sm">{[["Database", st.database], ["Auth mode", st.auth_mode], ["Environment", st.environment], ["YouTube API", st.youtube_configured ? "Configured" : "Not configured"], ["Redis", st.redis_configured ? "Connected" : "Not set"], ["n8n", st.n8n_configured ? "Configured" : "Not set"]].map(([k, v]) => <div key={k}><dt className="label">{k}</dt><dd className="mt-0.5 capitalize">{v}</dd></div>)}</dl>)}</Panel>
            <Panel><PanelHeader title="Demonstration data" sub="Fictional sample records, always labelled DEMO" />
              <div className="px-5 pb-5"><p className="mb-3 text-sm text-mute">{st ? `${st.demo_count} demo creators loaded · ${st.real_count} real` : "…"}</p>
                <div className="flex flex-wrap gap-2"><button className="btn-ghost btn-sm" onClick={demo.seed} disabled={demo.busy || (st?.demo_count ?? 0) > 0}>Load demo data</button><button className="btn-ghost btn-sm !border-[#B5493A]/40 !text-[#A33A2A]" onClick={demo.clear} disabled={demo.busy || !st?.demo_count}>Remove demo data</button></div></div></Panel>
          </div>
        </div>)}
    </div>
  );
}

"use client";
import { ArrowRight, Crown } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { mutate as gm } from "swr";
import { useRouter } from "next/navigation";
import { ErrorState, PageHeader, Panel, PanelHeader, Progress, Skeleton } from "@/components/ui/core";
import { Field } from "@/components/ui/inputs";
import { Modal, useToast } from "@/components/ui/overlay";
import { useAuth } from "@/lib/auth";
import { api, useApi } from "@/lib/api";
import { useDemo } from "@/lib/demo";
import type { Status } from "@/lib/types";

interface Settings { display_name: string; email: string; plan: string }

type ModReview = { id: string; name: string; company: string | null; role: string | null; rating: number; body: string; email: string | null; created_at: string; verified: boolean };

/** Operator only: approve or reject homepage reviews. Customers never see this panel (the API refuses them). */
function ReviewModeration() {
  const toast = useToast();
  const { data, error, mutate } = useApi<ModReview[]>("/admin/reviews?status=pending");
  if (error) return null; // not the operator, so nothing to show
  const act = async (r: ModReview, status: "approved" | "rejected", verified = false) => {
    try { await api(`/admin/reviews/${r.id}`, { method: "PATCH", json: { status, verified } }); toast("success", status === "approved" ? "Review published" : "Review rejected"); mutate(); }
    catch (e: any) { toast("error", e.message); }
  };
  return (
    <Panel><PanelHeader title="Reviews to check" sub="Nothing is published until you approve it. Mark a review as verified only after you have confirmed the customer." />
      {!data ? <Skeleton className="m-5 h-20" /> : data.length === 0 ? <p className="px-5 pb-5 text-sm text-mute">No reviews waiting.</p> : (
        <ul className="divide-y divide-line px-1 pb-2">
          {data.map((r) => (
            <li key={r.id} className="space-y-2 px-4 py-4">
              <p className="text-sm font-semibold">{r.name}{r.company ? ` · ${r.company}` : ""}{r.role ? ` · ${r.role}` : ""} <span className="font-normal text-mute">· {r.rating}/5</span></p>
              <p className="text-sm text-ink">&ldquo;{r.body}&rdquo;</p>
              <p className="data text-[11px] text-dim">Private email: {r.email || "not given"}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button className="btn-primary btn-sm" onClick={() => act(r, "approved", false)}>Publish</button>
                <button className="btn-ghost btn-sm" onClick={() => act(r, "approved", true)}>Publish as verified</button>
                <button className="btn-ghost btn-sm" onClick={() => act(r, "rejected")}>Reject</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

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
          <ReviewModeration />

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
          <DeleteAccount />
        </div>)}
    </div>
  );
}


/** Self-service account deletion. The server refuses while a paid subscription is still active. */
function DeleteAccount() {
  const toast = useToast();
  const router = useRouter();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await api("/me", { method: "DELETE", json: { confirm } });
      toast("success", "Your account has been deleted");
      await signOut();
      router.replace("/");
    } catch (e: any) { toast("error", e.message); setBusy(false); }
  };
  return (
    <Panel><PanelHeader title="Delete account" sub="Permanently removes your leads, searches, settings and sign-in. Cancel any paid plan first." />
      <div className="px-5 pb-5"><button className="btn-ghost btn-sm !border-[#B5493A]/40 !text-[#A33A2A]" onClick={() => setOpen(true)}>Delete my account…</button></div>
      <Modal open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirm(""); }} title="Delete your account?" description="This cannot be undone. Your support requests are kept, without your account attached, so the team can finish any open ones."
        footer={<><button className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary btn-sm !bg-none !bg-[#B5493A]" disabled={busy || confirm !== "DELETE"} onClick={run}>{busy ? "Deleting…" : "Delete account"}</button></>}>
        <Field label="Type DELETE to confirm"><input className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></Field>
      </Modal>
    </Panel>
  );
}

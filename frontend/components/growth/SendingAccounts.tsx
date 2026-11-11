"use client";
import { Loader2, Mail, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/core";
import { cn } from "@/components/ui/cn";
import { Field } from "@/components/ui/inputs";
import { Modal, useToast } from "@/components/ui/overlay";
import { api, useApi } from "@/lib/api";

export interface SendingAccount {
  id: string; provider: Provider; label: string; from_name: string; from_email: string; reply_to: string; host: string; port: number | null; security: string;
  username: string; domain: string; region: string; daily_limit: number; per_minute: number; is_default: boolean; status: string; last_error: string; has_secret: boolean;
}
type Provider = "smtp" | "sendgrid" | "mailgun" | "postmark" | "resend";
interface Preset { host: string; port: number; security: string; note: string }

const PROVIDERS: { id: Provider; name: string; hint: string; secret: string }[] = [
  { id: "smtp", name: "SMTP (Gmail, Outlook, Zoho, your host)", hint: "Any mailbox that allows SMTP sign-in", secret: "Password or app password" },
  { id: "sendgrid", name: "SendGrid", hint: "Your SendGrid account (API key with Mail Send)", secret: "API key" },
  { id: "mailgun", name: "Mailgun", hint: "Your Mailgun account and sending domain", secret: "Private API key" },
  { id: "postmark", name: "Postmark", hint: "Your Postmark server", secret: "Server API token" },
  { id: "resend", name: "Resend", hint: "Your own Resend account", secret: "API key" },
];
const NAME = Object.fromEntries(PROVIDERS.map((p) => [p.id, p.id === "smtp" ? "SMTP" : p.name])) as Record<Provider, string>;
const BLANK = { provider: "smtp" as Provider, label: "", from_name: "", from_email: "", reply_to: "", secret: "", host: "", port: 587, security: "starttls", username: "",
  domain: "", region: "us", daily_limit: 100, per_minute: 20, is_default: false };

/** The customer's own email services. TubeLead sends test emails and campaigns through these, never through its own provider. */
export function SendingAccounts({ selected, onSelect, compact }: { selected?: string | null; onSelect?: (id: string) => void; compact?: boolean }) {
  const toast = useToast();
  const { data, mutate } = useApi<{ accounts: SendingAccount[]; presets: Record<string, Preset> }>("/sending/accounts");
  const [form, setForm] = useState<typeof BLANK | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<SendingAccount | null>(null);

  const open = (a?: SendingAccount) => {
    setEditId(a?.id ?? null);
    setForm(a ? { ...BLANK, ...a, port: a.port ?? 587, secret: "", security: a.security || "starttls", region: a.region || "us", label: a.label === a.from_email ? "" : a.label } : { ...BLANK });
  };
  const save = async () => {
    if (!form) return;
    setBusy("save");
    try {
      const body = { ...form, secret: form.secret || null, port: Number(form.port), daily_limit: Number(form.daily_limit), per_minute: Number(form.per_minute) };
      const r = await api<SendingAccount>(editId ? `/sending/accounts/${editId}` : "/sending/accounts", { method: editId ? "PUT" : "POST", json: body });
      await mutate(); setForm(null);
      toast(r.status === "connected" ? "success" : "error", r.status === "connected" ? `Connected ${r.from_email}` : `Saved, but the connection failed: ${r.last_error}`);
      if (onSelect && r.status === "connected") onSelect(r.id);
    } catch (e: any) { toast("error", e.message); } finally { setBusy(null); }
  };
  const verify = async (a: SendingAccount) => {
    setBusy(a.id);
    try { const r = await api<SendingAccount>(`/sending/accounts/${a.id}/verify`, { method: "POST" }); await mutate(); toast(r.status === "connected" ? "success" : "error", r.status === "connected" ? "Connection works" : r.last_error); }
    catch (e: any) { toast("error", e.message); } finally { setBusy(null); }
  };
  const makeDefault = async (a: SendingAccount) => {
    try { await api(`/sending/accounts/${a.id}`, { method: "PUT", json: { ...a, port: a.port ?? 587, security: a.security || "starttls", region: a.region || "us", secret: null, is_default: true } }); await mutate(); }
    catch (e: any) { toast("error", e.message); }
  };
  const remove = async (a: SendingAccount) => {
    try { await api(`/sending/accounts/${a.id}`, { method: "DELETE" }); await mutate(); toast("success", "Removed"); } catch (e: any) { toast("error", e.message); } finally { setConfirmDel(null); }
  };
  const preset = (k: string) => { const p = data?.presets[k]; if (p && form) setForm({ ...form, host: p.host, port: p.port, security: p.security }); };
  const meta = form ? PROVIDERS.find((p) => p.id === form.provider)! : null;
  const presetNote = form?.provider === "smtp" ? Object.values(data?.presets ?? {}).find((p) => p.host === form.host)?.note : undefined;
  const valid = !!form && form.from_email.includes("@") && (editId || form.secret.length > 0) && (form.provider !== "smtp" || !!form.host) && (form.provider !== "mailgun" || !!form.domain);

  if (!data) return <div className="skeleton h-24 rounded-xl" />;
  return (
    <div className="space-y-3">
      {!compact && <p className="text-[12.5px] text-mute">Emails go out from <strong>your own</strong> email service, under your name and your provider's terms. TubeLead never sends your emails through its own account.</p>}
      {data.accounts.length === 0 ? (
        <p className="rounded-xl bg-bg2 p-3 text-[12.5px] text-mute">No email service connected yet. Connect your mailbox (SMTP) or your SendGrid, Mailgun, Postmark or Resend account.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line" role={onSelect ? "radiogroup" : undefined} aria-label={onSelect ? "Send from" : undefined}>
          {data.accounts.map((a) => (
            <li key={a.id} className={cn("flex flex-wrap items-center gap-2 px-3 py-2.5 text-[13px]", onSelect && selected === a.id && "bg-forest/5")}>
              {onSelect && <input type="radio" name="sending-account" aria-label={`Send from ${a.from_email}`} className="accent-[#7B3FF2]" checked={selected === a.id} onChange={() => onSelect(a.id)} disabled={a.status !== "connected"} />}
              <Mail size={14} className="text-forest" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{a.from_name ? `${a.from_name} <${a.from_email}>` : a.from_email}</p>
                <p className="truncate text-[11.5px] text-mute">{NAME[a.provider]}{a.provider === "smtp" && a.host ? ` · ${a.host}` : ""}{a.provider === "mailgun" && a.domain ? ` · ${a.domain}` : ""} · up to {a.daily_limit}/day, {a.per_minute}/min</p>
                {a.status === "error" && a.last_error && <p className="text-[11.5px] text-[#A33A2A]">{a.last_error}</p>}
              </div>
              {a.is_default && <Badge tone="cyan">Default</Badge>}
              <Badge tone={a.status === "connected" ? "green" : a.status === "error" ? "red" : "neutral"} dot>{a.status === "connected" ? "Connected" : a.status === "error" ? "Not working" : "Not tested"}</Badge>
              <div className="flex items-center gap-1">
                <button className="btn-ghost btn-sm" disabled={busy === a.id} onClick={() => verify(a)}>{busy === a.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Test</button>
                <button className="btn-ghost btn-sm" onClick={() => open(a)}>Edit</button>
                {!a.is_default && <button aria-label={`Make ${a.from_email} the default`} title="Make default" className="rounded p-1.5 text-dim hover:text-forest" onClick={() => makeDefault(a)}><Star size={13} /></button>}
                <button aria-label={`Remove ${a.from_email}`} className="rounded p-1.5 text-dim hover:text-[#A33A2A]" onClick={() => setConfirmDel(a)}><Trash2 size={13} /></button>
              </div>
            </li>))}
        </ul>)}
      <button className="btn-ghost btn-sm" onClick={() => open()}><Plus size={13} /> Connect your email service</button>

      <Modal open={!!form} onOpenChange={(o) => !o && setForm(null)} title={editId ? "Edit email service" : "Connect your email service"}
        description="TubeLead checks the connection without sending anything. Your password or key is encrypted and never shown again."
        footer={<><button className="btn-ghost btn-sm" onClick={() => setForm(null)}>Cancel</button>
          <button className="btn-primary btn-sm" disabled={!valid || busy === "save"} onClick={save}>{busy === "save" ? "Testing connection…" : editId ? "Save and test" : "Connect and test"}</button></>}>
        {form && meta && <div className="space-y-3">
          <Field label="Email service"><select className="field" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value as Provider })}>
            {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <p className="text-[11.5px] text-mute">{meta.hint}</p>
          {form.provider === "smtp" && <>
            <div className="flex flex-wrap gap-1.5">{Object.keys(data.presets).map((k) => <button key={k} type="button" className="btn-ghost btn-sm !py-1 capitalize" onClick={() => preset(k)}>{k === "outlook" ? "Outlook / Microsoft 365" : k === "gmail" ? "Gmail / Google Workspace" : "Zoho"}</button>)}</div>
            <div className="grid grid-cols-2 gap-3">
              <Field className="col-span-2" label="SMTP server"><input className="field" placeholder="smtp.yourhost.com" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} /></Field>
              <Field label="Port"><select className="field" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}>{[587, 465, 2525, 25].map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
              <Field label="Security"><select className="field" value={form.security} onChange={(e) => setForm({ ...form, security: e.target.value })}><option value="starttls">STARTTLS</option><option value="ssl">SSL/TLS</option><option value="none">None</option></select></Field>
            </div>
            <Field label="Username"><input className="field" autoComplete="off" placeholder="Usually your email address" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
            {presetNote && <p className="rounded-lg bg-bg2 p-2.5 text-[11.5px] text-mute">{presetNote}</p>}
          </>}
          {form.provider === "mailgun" && <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <Field label="Sending domain"><input className="field" placeholder="mg.yourcompany.com" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} /></Field>
            <Field label="Region"><select className="field" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}><option value="us">US</option><option value="eu">EU</option></select></Field></div>}
          <Field label={meta.secret} hint={editId ? "Leave blank to keep the saved one" : undefined}><input className="field" type="password" autoComplete="new-password" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From name"><input className="field" placeholder="Sam at Your Company" value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} /></Field>
            <Field label="From email"><input className="field" type="email" placeholder="sam@yourcompany.com" value={form.from_email} onChange={(e) => setForm({ ...form, from_email: e.target.value })} /></Field>
            <Field label="Reply-to (optional)"><input className="field" type="email" value={form.reply_to} onChange={(e) => setForm({ ...form, reply_to: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Per day"><input className="field" type="number" min={1} max={10000} value={form.daily_limit} onChange={(e) => setForm({ ...form, daily_limit: Number(e.target.value) })} /></Field>
              <Field label="Per minute"><input className="field" type="number" min={1} max={120} value={form.per_minute} onChange={(e) => setForm({ ...form, per_minute: Number(e.target.value) })} /></Field>
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="accent-[#7B3FF2]" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} /> Use this for test emails and new campaigns</label>
          <p className="text-[11px] text-dim">Check your provider's rules before sending to people who haven't signed up: some services don't allow cold outreach. Mailbox providers such as Gmail and Outlook limit how many emails you can send a day; keep the daily limit within yours.</p>
        </div>}
      </Modal>
      <Modal open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)} title="Remove this email service?" description={confirmDel ? `${confirmDel.from_email} will no longer be used to send. Its saved password or key is deleted.` : ""}
        footer={<><button className="btn-ghost btn-sm" onClick={() => setConfirmDel(null)}>Cancel</button><button className="btn-primary btn-sm !bg-[#A33A2A]" onClick={() => confirmDel && remove(confirmDel)}>Remove</button></>}>{null}</Modal>
    </div>
  );
}

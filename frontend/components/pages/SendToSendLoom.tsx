"use client";
import { AlertTriangle, CheckCircle2, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Creator } from "@/lib/types";
import { Modal, useToast } from "../ui/overlay";
import { Spinner } from "./Spinner";

/** Hand selected creators' *publicly published* business emails to SendLoom (served on this origin at /mail) as an audience list.
 *  Requires a SendLoom session (same origin => its cookie is sent). Compliance gates are enforced by SendLoom's API as well as here. */
const BASES = [
  ["consent", "Consent — they asked to hear from me"],
  ["soft_opt_in", "Soft opt-in — existing customers, similar products, opt-out offered"],
  ["legitimate_interests_b2b", "B2B legitimate interests — corporate subscribers only"],
] as const;
const csrf = () => document.cookie.split("; ").find((c) => c.startsWith("sl_csrf="))?.split("=")[1] ?? "";

export function SendToSendLoom({ open, ids, onClose }: { open: boolean; ids: string[]; onClose: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Creator[] | null>(null);
  const [name, setName] = useState("TubeLead audience");
  const [basis, setBasis] = useState("");
  const [decl, setDecl] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ msg: string; auth?: boolean } | null>(null);
  const [done, setDone] = useState<{ imported: number; list_name: string; suppressed: number; already_in_account: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setRows(null); setDone(null); setErr(null); setDecl(false);
    Promise.all(ids.slice(0, 200).map((id) => api<Creator>(`/creators/${id}`).catch(() => null))).then((r) => setRows(r.filter(Boolean) as Creator[]));
  }, [open, ids]);

  const real = rows?.filter((c) => !c.is_demo) ?? [];
  const usable = real.filter((c) => c.public_email);
  const demo = (rows?.length ?? 0) - real.length;

  const send = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/mail/api/contacts/bulk", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() },
        body: JSON.stringify({
          contacts: usable.map((c) => ({ email: c.public_email, company: c.title.slice(0, 200), evidence: `Public business email on ${c.channel_url} (found ${c.discovered_at.slice(0, 10)})` })),
          new_list_name: name, lawful_basis: basis, declare_lawful: decl, source: "tubelead",
          consent_evidence: "Business email published by the creator on their public YouTube channel; handed over from TubeLead.",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403 && /CSRF|sign in/i.test(JSON.stringify(body))) { setErr({ msg: "Sign in to SendLoom first (it has its own account), then try again.", auth: true }); return; }
      if (!res.ok) { setErr({ msg: typeof body.detail === "string" ? body.detail : body.detail?.message ?? `SendLoom returned an error (${res.status}).` }); return; }
      setDone(body); toast("success", `${body.imported} contact(s) added to “${body.list_name}” in SendLoom`);
    } catch { setErr({ msg: "Couldn't reach SendLoom. Is the email-marketing service running?" }); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Send to SendLoom" description="Create an email-marketing audience from the selected creators."
      footer={done ? <a className="btn-primary btn-sm" href="/mail/app/verify">Verify these contacts →</a> : <><button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button><button className="btn-primary btn-sm" disabled={busy || !usable.length || !basis || !decl || !name.trim()} onClick={send}>{busy ? <Spinner /> : `Add ${usable.length} to SendLoom`}</button></>}>
      {!rows ? <p className="flex items-center gap-2 text-sm text-mute"><Spinner /> Reading {ids.length} creator(s)…</p> : done ? (
        <div className="space-y-2 text-sm"><p className="flex items-center gap-2 text-moss"><CheckCircle2 size={16} /> Added to “{done.list_name}”.</p><p className="text-mute">{done.imported} new · {done.already_in_account} already in SendLoom · {done.suppressed} skipped (suppressed). Next, verify them so they can be emailed.</p></div>
      ) : (
        <div className="space-y-4 text-sm">
          <p><strong>{usable.length}</strong> of {rows.length} selected creator(s) publish a business email.{rows.length - usable.length - demo > 0 && <> {rows.length - usable.length - demo} have none and are skipped.</>}{demo > 0 && <> <span className="text-[#7F6226]">{demo} demo record(s) are fictional and skipped.</span></>}</p>
          {usable.length === 0 && <p className="flex items-center gap-2 text-[#7F6226]"><AlertTriangle size={15} /> None of the selected real creators has a public email, so there is nothing to send.</p>}
          <label className="block"><span className="label mb-1.5 block">Audience name</span><input className="field" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} /></label>
          <fieldset><legend className="label mb-1.5">Your lawful basis for emailing them *</legend><div className="space-y-1.5">{BASES.map(([v, l]) => <label key={v} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 ${basis === v ? "border-forest bg-forest/15" : "border-forest/20"}`}><input type="radio" name="basis" className="mt-1 accent-forest" checked={basis === v} onChange={() => setBasis(v)} />{l}</label>)}</div></fieldset>
          <p className="rounded-lg border border-[#C6A46B]/30 bg-[#C6A46B]/10 p-3 text-xs leading-relaxed text-[#7F6226]">Many creators are individuals or sole traders, who are <strong>individual subscribers</strong> under PECR and generally need <strong>consent</strong>. A public email address is not consent. You remain responsible for choosing a valid basis; SendLoom stores it with each contact and won’t send without one.</p>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 h-4 w-4 accent-forest" checked={decl} onChange={(e) => setDecl(e.target.checked)} /><span>I have the lawful basis above for every creator in this selection.</span></label>
          {err && <p role="alert" className="flex items-start gap-2 text-[#A33A2A]"><Mail size={15} className="mt-0.5 shrink-0" /><span>{err.msg} {err.auth && <><a className="underline" href="/mail/login?next=/app/upload">Sign in</a> or <a className="underline" href="/mail/register">create an account</a>.</>}</span></p>}
        </div>
      )}
    </Modal>
  );
}

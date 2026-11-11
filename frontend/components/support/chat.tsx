"use client";
/** Support conversation pieces shared by the TubeLead Helper: the API call (works signed in or as a visitor), the
 * visitor's conversation token in this browser, and the form that sends a request to a person on the team. */
import { useState } from "react";
import { getAuthClient } from "@/lib/auth";

export interface Msg { id: string; role: "user" | "assistant"; content: string; action?: string | null; category?: string | null; mode?: string | null; tour?: { id: string; title: string; path: string } | null }
const STORE = "tl.chat";
export const CATEGORY_LABEL: Record<string, string> = { refund: "Refund request", cancellation: "Cancellation request", billing: "Billing change", account: "Account request", general: "Question for the team", technical: "Technical problem" };

export async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  const token = (await getAuthClient()?.auth.getSession())?.data.session?.access_token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`/api${path}`, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const d = body?.detail;
    throw Object.assign(new Error(typeof d === "string" ? d : d?.message ?? (Array.isArray(d) ? "Please check the form." : "Something went wrong. Please try again.")), { status: res.status });
  }
  return body as T;
}

export function loadConv(): { id: string; token: string | null } | null {
  try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch { return null; }
}
export function saveConv(v: { id: string; token: string | null } | null) {
  try { v ? localStorage.setItem(STORE, JSON.stringify(v)) : localStorage.removeItem(STORE); } catch { /* storage blocked */ }
}

export function RequestForm({ category, conv, signedIn, onCancel, onDone }: {
  category: string; conv: { id: string; token: string | null } | null; signedIn: boolean; onCancel: () => void; onDone: (ref: string, reply: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const financial = ["refund", "cancellation", "billing", "account"].includes(category);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await call<{ ref: string }>("/support/tickets", { method: "POST", json: {
        category, subject: CATEGORY_LABEL[category] ?? "Support request", description: desc, email: email || undefined, conversation_id: conv?.id, token: conv?.token } });
      onDone(r.ref, `Thanks. Your request has been sent to the team. Your reference is ${r.ref}. ${financial ? "A person will review it and reply by email. Nothing has been approved or changed yet." : "They'll reply by email."}`);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-2.5 rounded-2xl border border-forest/20 bg-forest/[0.03] p-3.5">
      <p className="text-[12.5px] font-semibold text-ink">{CATEGORY_LABEL[category] ?? "Send to the team"}</p>
      {!signedIn && (
        <label className="block"><span className="label mb-1 block !text-[10px]">Your email</span>
          <input className="field !py-2 text-[13px]" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      )}
      <label className="block"><span className="label mb-1 block !text-[10px]">{financial ? "What would you like, and why?" : "How can we help?"}</span>
        <textarea className="field min-h-[84px] !py-2 text-[13px]" required minLength={10} maxLength={5000} value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
      {err && <p role="alert" className="text-[12px] text-[#A33A2A]">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || desc.trim().length < 10} className="btn-primary btn-sm !px-4 !py-2 !text-[11px]">{busy ? "Sending…" : "Send to the team"}</button>
        <button type="button" onClick={onCancel} className="btn-ghost btn-sm">Not now</button>
      </div>
    </form>
  );
}

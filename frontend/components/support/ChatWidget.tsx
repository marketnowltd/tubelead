"use client";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, LifeBuoy, MessageCircle, RotateCcw, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthClient } from "@/lib/auth";
import { cn } from "@/components/ui/cn";

interface Msg { id: string; role: "user" | "assistant"; content: string; action?: string | null; category?: string | null; mode?: string | null }
const STORE = "tl.chat";
const CATEGORY_LABEL: Record<string, string> = { refund: "Refund request", cancellation: "Cancellation request", billing: "Billing change", account: "Account request", general: "Question for the team", technical: "Technical problem" };

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
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

function load(): { id: string; token: string | null } | null {
  try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch { return null; }
}
function save(v: { id: string; token: string | null } | null) {
  try { v ? localStorage.setItem(STORE, JSON.stringify(v)) : localStorage.removeItem(STORE); } catch { /* storage blocked */ }
}

export function ChatWidget() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [conv, setConv] = useState<{ id: string; token: string | null } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<string | null>(null); // category for the request form
  const [signedIn, setSignedIn] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inApp = !["/", "/login", "/signup", "/privacy", "/terms"].includes(path);

  // Ask the server: it decides who is signed in (Supabase session, or the single local user in dev mode).
  useEffect(() => { if (open) call("/me").then(() => setSignedIn(true), () => setSignedIn(false)); }, [open]);

  useEffect(() => {
    if (!open || conv) return;
    const c = load();
    if (!c) return;
    call<{ messages: Msg[] }>(`/support/chat/${c.id}${c.token ? `?token=${encodeURIComponent(c.token)}` : ""}`)
      .then((h) => { setConv(c); setMsgs(h.messages); })
      .catch(() => save(null));
  }, [open, conv]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy, form]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 150); }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const send = useCallback(async (raw?: string) => {
    const message = (raw ?? text).trim();
    if (!message || busy) return;
    setErr(null); setText(""); setForm(null);
    const temp: Msg = { id: `tmp-${Date.now()}`, role: "user", content: message };
    setMsgs((m) => [...m, temp]);
    setBusy(true);
    try {
      const r = await call<{ conversation_id: string; token: string | null; message: Msg }>("/support/chat", { method: "POST", json: { message, conversation_id: conv?.id, token: conv?.token } });
      const next = conv ?? { id: r.conversation_id, token: r.token };
      if (!conv) { setConv(next); save(next); }
      setMsgs((m) => [...m, r.message]);
      if (r.message.action === "offer_ticket") setForm(r.message.category || "general");
    } catch (e: any) {
      setErr(e.status === 429 ? "You're sending messages quickly. Please wait a moment." : e.message);
      setMsgs((m) => m.filter((x) => x.id !== temp.id));
      setText(message);
    } finally { setBusy(false); }
  }, [text, busy, conv]);

  const reset = () => { save(null); setConv(null); setMsgs([]); setForm(null); setErr(null); };

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button key="fab" type="button" onClick={() => setOpen(true)} aria-label="Open help chat"
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.2 }}
            className={cn("fixed right-[max(16px,env(safe-area-inset-right))] z-[45] grid h-14 w-14 place-items-center rounded-full text-white shadow-[0_10px_28px_rgba(146,48,241,.38)] transition hover:-translate-y-0.5",
              inApp ? "bottom-[calc(72px+env(safe-area-inset-bottom))] lg:bottom-6" : "bottom-[max(20px,env(safe-area-inset-bottom))]")}
            style={{ background: "linear-gradient(135deg,#d32de5,#9a27f2 55%,#ff982e)" }}>
            <MessageCircle size={24} />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.section role="dialog" aria-label="TubeLead help" key="panel"
            initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.98 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={cn("fixed z-[60] flex flex-col overflow-hidden border border-line bg-panel shadow-pop",
              "inset-x-0 bottom-0 h-[min(640px,88dvh)] rounded-t-3xl sm:inset-x-auto sm:right-6 sm:h-[min(620px,calc(100dvh-48px))] sm:w-[400px] sm:rounded-3xl",
              inApp ? "sm:bottom-6" : "sm:bottom-6")}>
            <header className="flex items-center gap-3 border-b border-line px-4 py-3" style={{ background: "linear-gradient(105deg,rgba(211,45,229,.08),rgba(154,39,242,.08) 55%,rgba(255,152,46,.08))" }}>
              <span className="grid h-9 w-9 place-items-center rounded-full text-white" style={{ background: "linear-gradient(135deg,#d32de5,#9a27f2)" }}><LifeBuoy size={18} /></span>
              <div className="min-w-0 flex-1">
                <p className="font-heading text-[15px] font-bold leading-tight">TubeLead help</p>
                <p className="text-[11.5px] text-mute">Automated assistant · a person reviews anything it can't do</p>
              </div>
              {msgs.length > 0 && <button type="button" onClick={reset} aria-label="Start a new conversation" title="New conversation" className="rounded-lg p-2 text-mute hover:bg-ink/5 hover:text-ink"><RotateCcw size={16} /></button>}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close help chat" className="rounded-lg p-2 text-mute hover:bg-ink/5 hover:text-ink"><X size={18} /></button>
            </header>

            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
              {msgs.length === 0 && (
                <div className="space-y-3">
                  <p className="rounded-2xl rounded-tl-md bg-bg2 px-3.5 py-2.5 text-[13.5px] leading-relaxed">Hi! Ask me about TubeLead: finding leads, plans, exports or your account. I can't make billing changes or issue refunds, but I can pass those to the team.</p>
                  <div className="flex flex-wrap gap-2">
                    {["How do I find leads?", "What do the plans cost?", "Where do contact details come from?"].map((q) => (
                      <button key={q} type="button" onClick={() => send(q)} className="rounded-full border border-forest/25 px-3 py-1.5 text-[12px] font-semibold text-forest hover:bg-forest/5">{q}</button>
                    ))}
                  </div>
                </div>
              )}
              {msgs.map((m) => (
                <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <p className={cn("max-w-[85%] whitespace-pre-wrap px-3.5 py-2.5 text-[13.5px] leading-relaxed",
                    m.role === "user" ? "rounded-2xl rounded-tr-md bg-forest text-paper" : "rounded-2xl rounded-tl-md bg-bg2 text-ink")}>{m.content}</p>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start" aria-label="Assistant is typing">
                  <span className="flex gap-1 rounded-2xl rounded-tl-md bg-bg2 px-4 py-3.5">
                    {[0, 1, 2].map((i) => <motion.i key={i} className="h-1.5 w-1.5 rounded-full bg-mute" animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />)}
                  </span>
                </div>
              )}
              {form && <RequestForm category={form} conv={conv} signedIn={signedIn} onCancel={() => setForm(null)}
                onDone={(ref, reply) => { setForm(null); setMsgs((m) => [...m, { id: `t-${ref}`, role: "assistant", content: reply }]); }} />}
            </div>

            {err && <p role="alert" className="mx-4 mb-2 rounded-lg bg-[#B5493A]/10 px-3 py-2 text-[12.5px] text-[#A33A2A]">{err}</p>}
            <div className="border-t border-line p-3">
              <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2">
                <label htmlFor="tl-chat-input" className="sr-only">Your message</label>
                <textarea id="tl-chat-input" ref={inputRef} rows={1} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your question…"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  className="field max-h-28 min-h-[44px] flex-1 resize-none !py-2.5 text-[13.5px]" />
                <button type="submit" disabled={busy || !text.trim()} aria-label="Send message" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white transition disabled:opacity-40" style={{ background: "linear-gradient(135deg,#d32de5,#9a27f2)" }}><ArrowUp size={18} /></button>
              </form>
              <div className="mt-2 flex items-center justify-between text-[11px] text-dim">
                <button type="button" onClick={() => setForm("general")} className="font-semibold text-forest hover:underline">Talk to a person</button>
                <span>Conversations are kept for 180 days.</span>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}

function RequestForm({ category, conv, signedIn, onCancel, onDone }: {
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

"use client";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Compass, Lightbulb, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { call, loadConv, type Msg, RequestForm, saveConv } from "@/components/support/chat";
import { frameSrc, type Pose } from "./sprites";
import { Words } from "./Words";

export interface PageInfo { key: string | null; title: string; greeting: string; purpose: string; can_do: string[]; suggestions: string[]; tour: string | null; tour_title: string; signed_in: boolean }

export function HelperPanel({ open, onClose, page, path, journey, signedIn, tipsOff, onTips, onTour, onPose, reduced }: {
  open: boolean; onClose: () => void; page: PageInfo | null; path: string; journey: string[]; signedIn: boolean; tipsOff: boolean;
  onTips: (off: boolean) => void; onTour: (id: string, path?: string) => void; onPose: (p: Pose, ms?: number) => void; reduced: boolean;
}) {
  const [conv, setConv] = useState<{ id: string; token: string | null } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || conv) return;
    const c = loadConv();
    if (!c) return;
    call<{ messages: Msg[] }>(`/support/chat/${c.id}${c.token ? `?token=${encodeURIComponent(c.token)}` : ""}`)
      .then((h) => { setConv(c); setMsgs(h.messages); }).catch(() => saveConv(null));
  }, [open, conv]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reduced ? "auto" : "smooth" }); }, [msgs, busy, form, reduced]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 450); }, [open]);

  const send = useCallback(async (raw?: string) => {
    const message = (raw ?? text).trim();
    if (!message || busy) return;
    setErr(null); setText(""); setForm(null);
    const temp: Msg = { id: `tmp-${Date.now()}`, role: "user", content: message };
    setMsgs((m) => [...m, temp]);
    setBusy(true); onPose("thinking");
    try {
      const r = await call<{ conversation_id: string; token: string | null; message: Msg }>("/support/chat", { method: "POST",
        json: { message, conversation_id: conv?.id, token: conv?.token, context: { path, journey } } });
      const next = conv ?? { id: r.conversation_id, token: r.token };
      if (!conv) { setConv(next); saveConv(next); }
      setMsgs((m) => [...m, r.message]);
      if (r.message.action === "offer_ticket") { setForm(r.message.category || "general"); onPose("curious", 2200); }
      else onPose("explaining", 2600);
    } catch (e: any) {
      setErr(e.status === 429 ? "You're sending messages quickly. Please wait a moment." : e.message);
      setMsgs((m) => m.filter((x) => x.id !== temp.id)); setText(message); onPose(e.status === 429 ? "warning" : "error", 2200);
    } finally { setBusy(false); }
  }, [text, busy, conv, path, journey, onPose]);

  const reset = () => { saveConv(null); setConv(null); setMsgs([]); setForm(null); setErr(null); };
  const chips = (page?.suggestions?.length ? page.suggestions : ["How do I get started?", "What does TubeLead do?"]).filter((q) => !/explain this page/i.test(q));

  return (
    <AnimatePresence>
      {open && (
        <motion.section role="dialog" aria-label="TubeLead Helper" key="helper-panel" data-helper=""
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }} transition={{ type: "spring", stiffness: 380, damping: 34, delay: reduced ? 0 : 0.12 }}
          style={{ transformOrigin: "100% 100%" }}
          className={cn("helper-panel fixed z-[60] flex flex-col overflow-hidden",
            "inset-x-0 bottom-0 h-[min(640px,88dvh)] rounded-t-[28px] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[min(620px,calc(100dvh-48px))] sm:w-[400px] sm:rounded-[28px]")}>
          <header className="relative flex items-center gap-3 px-4 pb-3 pt-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[#1A0D2E] ring-2 ring-[#7A2DFF]/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={frameSrc("e_happy")} alt="" className="h-10 w-10 scale-[1.18] object-contain" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-heading text-[15.5px] font-bold leading-tight text-[#1A0D2E]">TubeLead Helper</p>
              <p className="truncate text-[11.5px] text-mute">{page?.key ? `Helping you with ${page.title}` : "Your guide to TubeLead"}</p>
            </div>
            <button type="button" onClick={() => onTips(!tipsOff)} aria-pressed={!tipsOff} title={tipsOff ? "Turn helpful tips on" : "Turn helpful tips off"}
              className={cn("rounded-lg p-2 transition hover:bg-[#7A2DFF]/10", tipsOff ? "text-dim" : "text-[#7A2DFF]")}>
              <Lightbulb size={16} /><span className="sr-only">Helpful tips</span>
            </button>
            {msgs.length > 0 && <button type="button" onClick={reset} aria-label="Start a new conversation" title="New conversation" className="rounded-lg p-2 text-mute hover:bg-[#7A2DFF]/10 hover:text-ink"><RotateCcw size={16} /></button>}
            <button type="button" onClick={onClose} aria-label="Close TubeLead Helper" className="rounded-lg p-2 text-mute hover:bg-[#7A2DFF]/10 hover:text-ink"><X size={18} /></button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 pb-4" aria-live="polite">
            {page && (
              <div className="helper-card rounded-2xl p-3.5">
                <p className="text-[13.5px] leading-relaxed text-[#1A0D2E]"><Words text={page.greeting} reduced={reduced} /></p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {page.tour && <button type="button" onClick={() => onTour(page.tour!)} className="helper-cta"><Compass size={14} /> Show me how</button>}
                  <button type="button" onClick={() => send("Can you explain this page?")} className="helper-chip">Explain this page</button>
                </div>
              </div>
            )}
            {msgs.length === 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {chips.map((q, n) => (
                  <motion.button key={q} type="button" onClick={() => send(q)} className="helper-chip"
                    initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + n * 0.06 }}>{q}</motion.button>
                ))}
              </div>
            )}
            {msgs.map((m) => (
              <motion.div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                <div className={cn("max-w-[86%] px-3.5 py-2.5 text-[13.5px] leading-relaxed",
                  m.role === "user" ? "rounded-2xl rounded-tr-md bg-[#7A2DFF] text-white" : "rounded-2xl rounded-tl-md bg-[#F3E9FF] text-[#1A0D2E]")}>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.tour && <button type="button" onClick={() => onTour(m.tour!.id, m.tour!.path)} className="helper-cta mt-2.5"><Compass size={14} /> Show me how</button>}
                </div>
              </motion.div>
            ))}
            {busy && (
              <div className="flex items-end gap-2" aria-label="The helper is thinking">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={frameSrc("chatting")} alt="" className="h-14 w-auto" />
                <span className="flex gap-1 rounded-2xl rounded-bl-md bg-[#F3E9FF] px-4 py-3.5">
                  {[0, 1, 2].map((i) => <motion.i key={i} className="h-1.5 w-1.5 rounded-full bg-[#7A2DFF]" animate={reduced ? undefined : { opacity: [0.3, 1, 0.3], y: [0, -2, 0] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />)}
                </span>
              </div>
            )}
            {form && <RequestForm category={form} conv={conv} signedIn={signedIn} onCancel={() => setForm(null)}
              onDone={(ref, reply) => { setForm(null); setMsgs((m) => [...m, { id: `t-${ref}`, role: "assistant", content: reply }]); onPose("done", 2200); }} />}
          </div>

          {err && <p role="alert" className="mx-4 mb-2 rounded-lg bg-[#E81F76]/10 px-3 py-2 text-[12.5px] text-[#A3134F]">{err}</p>}
          <div className="border-t border-[#7A2DFF]/10 p-3">
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2">
              <label htmlFor="tl-helper-input" className="sr-only">Your message</label>
              <textarea id="tl-helper-input" ref={inputRef} rows={1} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask me anything about TubeLead…"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                className="field max-h-28 min-h-[44px] flex-1 resize-none !rounded-2xl !py-2.5 text-[13.5px]" />
              <button type="submit" disabled={busy || !text.trim()} aria-label="Send message" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white shadow-[0_8px_20px_rgba(122,45,255,.35)] transition disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#7A2DFF,#E81F76)" }}><ArrowUp size={18} /></button>
            </form>
            <div className="mt-2 flex items-center justify-between text-[11px] text-dim">
              <button type="button" onClick={() => setForm("general")} className="font-semibold text-[#7A2DFF] hover:underline">Talk to a person</button>
              <span>Conversations are kept for 180 days.</span>
            </div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

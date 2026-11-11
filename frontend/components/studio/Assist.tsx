"use client";
import { AnimatePresence, motion } from "motion/react";
import { Check, Sparkles, Undo2, X } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import type { Doc } from "./model";
import { EmailFrame, renderDoc } from "./Preview";

export const QUICK: { action: string; label: string; ai?: boolean }[] = [
  { action: "professional", label: "Make it more professional" }, { action: "premium", label: "Make it more premium" },
  { action: "shorten", label: "Shorten the message", ai: true }, { action: "headline", label: "Improve the headline", ai: true },
  { action: "cta_copy", label: "Make the CTA stronger", ai: true }, { action: "readability", label: "Improve readability" },
  { action: "brand", label: "Apply my brand" }, { action: "mobile", label: "Optimise for mobile" },
];

/** Rule-based quick actions for the public demo (no account, no AI). */
async function demoAssist(doc: Doc, action: string): Promise<{ doc: Doc; notes: string[] }> {
  const d: Doc = JSON.parse(JSON.stringify(doc));
  if (action === "mobile") { d.sections.forEach((s) => (s.style.stackOnMobile = true)); }
  if (action === "premium") { d.settings.fontFamily = "Georgia"; d.settings.background = "#F6F4EF"; }
  return { doc: d, notes: ["Sample change for the demo. With an account, every quick action is available."] };
}

export function AssistPanel({ doc, selectedId, onApply, onUndo, demo }: { doc: Doc; selectedId?: string | null; onApply: (d: Doc) => void; onUndo: () => void; demo?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [proposal, setProposal] = useState<{ doc: Doc; notes: string[]; html: string; by?: string } | null>(null);
  const [applied, setApplied] = useState(false);
  const run = async (action: string, instruction = "") => {
    setBusy(action); setProposal(null); setApplied(false);
    try {
      const r = demo ? await demoAssist(doc, action) : await api<{ doc: Doc; notes: string[]; by: string }>("/studio/assist", { method: "POST", json: { doc, action, element_id: selectedId || undefined, instruction } });
      const out = await renderDoc(r.doc, "", "", { demo });
      setProposal({ ...r, html: out.html });
    } catch (e: any) { toast("error", e.message); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">{QUICK.map((q) => (
        <motion.button key={q.action} whileTap={{ scale: 0.96 }} type="button" disabled={!!busy} onClick={() => run(q.action)}
          className="rounded-full border border-forest/25 bg-panel px-3 py-1.5 text-[12px] font-semibold text-forest transition hover:border-forest hover:bg-forest/5 disabled:opacity-50">
          {busy === q.action ? "Working…" : q.label}{q.ai && <Sparkles size={10} className="ml-1 inline" />}</motion.button>))}</div>
      <form onSubmit={(e) => { e.preventDefault(); if (prompt.trim()) run("custom", prompt.trim()); }} className="space-y-1.5">
        <label htmlFor="assist-prompt" className="text-[11px] font-semibold uppercase tracking-wide text-mute">Ask for a change {selectedId ? "(selected element)" : "(whole email)"}</label>
        <div className="flex gap-1.5"><input id="assist-prompt" className="field !py-1.5 text-xs" maxLength={500} placeholder="e.g. Improve the wording without changing the meaning" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <button className="btn-primary btn-sm" disabled={!!busy || !prompt.trim()}><Sparkles size={13} /></button></div>
        <p className="text-[10.5px] text-dim"><Sparkles size={9} className="inline" /> Wording changes use the AI provider you connect in AI Connect. Facts, prices and {"{{fields}}"} are always kept.</p>
      </form>
      <AnimatePresence>
        {proposal && (
          <motion.div initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }} transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="space-y-2 rounded-2xl border border-forest/25 bg-forest/[0.03] p-3">
            <p className="text-[12px] font-semibold">Preview</p>
            {proposal.notes.map((n) => <p key={n} className="text-[12px] text-mute">{n}</p>)}
            <div className="max-h-72 overflow-auto rounded-lg"><EmailFrame html={proposal.html} width={375} title="Proposed change" /></div>
            <div className="flex gap-2">
              {!applied ? <>
                <button className="btn-primary btn-sm" onClick={() => { onApply(proposal.doc); setApplied(true); toast("success", "Applied. You can undo it."); }}><Check size={13} /> Apply</button>
                <button className="btn-ghost btn-sm" onClick={() => setProposal(null)}><X size={13} /> Discard</button>
              </> : <button className="btn-ghost btn-sm" onClick={() => { onUndo(); setApplied(false); setProposal(null); }}><Undo2 size={13} /> Undo</button>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

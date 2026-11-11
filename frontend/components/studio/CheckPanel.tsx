"use client";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2, Info, ShieldCheck, Sparkles, Wand2, XCircle } from "lucide-react";
import { useState } from "react";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import type { Doc } from "./model";
import { EmailFrame, renderDoc } from "./Preview";

export interface Finding { id: string; category: string; severity: "critical" | "warning" | "info"; message: string; element_id: string | null; fix: string | null }
export interface CheckResult { scores: Record<string, number>; readiness: number; can_launch: boolean; critical: number; headline: string; findings: Finding[]; safe_fixes: number; checked_at?: string; version?: number; sample?: boolean }

const CAT = { design: "Design quality", content: "Content quality", technical: "Technical compatibility", deliverability: "Deliverability readiness" } as const;

function Ring({ value, size = 92 }: { value: number; size?: number }) {
  const r = (size - 10) / 2, c = 2 * Math.PI * r;
  const color = value >= 80 ? "#14866B" : value >= 50 ? "#C6A46B" : "#B5493A";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Readiness ${value} out of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={8} />
      <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value / 100) }} transition={{ type: "spring", stiffness: 60, damping: 18 }} />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" className="fill-ink font-display text-[22px] font-extrabold">{value}</text>
    </svg>
  );
}

export function CheckPanel({ docId, demo, demoDoc, subject, onDocReplaced, onLocate, hideTitle }: {
  docId?: string; demo?: boolean; demoDoc?: Doc; subject?: string; onDocReplaced?: (doc: Doc, subject: string) => void; onLocate?: (elementId: string) => void; hideTitle?: boolean;
}) {
  const toast = useToast();
  const [res, setRes] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [compare, setCompare] = useState<{ before: string; after: string } | null>(null);
  const run = async () => {
    setBusy("check");
    try {
      if (demo && demoDoc) {
        const r = await fetch("/api/public/email/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc: demoDoc, subject: subject ?? "" }) });
        setRes(await r.json());
      } else setRes(await api<CheckResult>(`/studio/documents/${docId}/check`, { method: "POST" }));
    } catch (e: any) { toast("error", e.message); } finally { setBusy(null); }
  };
  const fix = async (findingId?: string) => {
    if (demo || !docId) { toast("info", "Fixes are available once you start your free trial."); return; }
    setBusy(findingId ?? "all");
    try {
      const r = await api<{ applied: number; before: Doc; after: Doc; document: { doc: Doc; subject: string } }>(`/studio/documents/${docId}/fix`, { method: "POST", json: { finding_id: findingId } });
      onDocReplaced?.(r.document.doc, r.document.subject);
      const [b, a] = await Promise.all([renderDoc(r.before, r.document.subject, ""), renderDoc(r.after, r.document.subject, "")]);
      setCompare({ before: b.html, after: a.html });
      toast("success", `${r.applied} fix${r.applied === 1 ? "" : "es"} applied. The previous version is saved.`);
      await run();
    } catch (e: any) { toast("error", e.message); } finally { setBusy(null); }
  };
  const icon = (s: Finding["severity"]) => s === "critical" ? <XCircle size={15} className="text-[#B5493A]" /> : s === "warning" ? <AlertTriangle size={15} className="text-gold-text" /> : <Info size={15} className="text-forest" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!hideTitle ? <div className="flex items-center gap-2"><ShieldCheck size={18} className="text-forest" /><p className="font-heading text-base font-bold tracking-tight">TubeLead Email Check</p>{res?.sample && <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold uppercase text-gold-text">Sample</span>}</div> : <span />}
        <div className="flex gap-2">
          {res && res.safe_fixes > 0 && <button className="btn-ghost btn-sm" disabled={!!busy} onClick={() => fix()}><Wand2 size={13} /> {busy === "all" ? "Fixing…" : "Fix all safe issues"}</button>}
          <button className="btn-primary btn-sm" disabled={!!busy} onClick={run}><Sparkles size={13} /> {busy === "check" ? "Checking…" : res ? "Check again" : "Run check"}</button>
        </div>
      </div>
      {!res ? <p className="text-sm text-mute">Inspects design, content, technical compatibility and deliverability. Critical issues must be fixed before a campaign can be approved.</p> : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-line bg-panel p-4">
            <Ring value={res.readiness} />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-semibold">{res.headline}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">{(Object.keys(CAT) as (keyof typeof CAT)[]).map((k) => (
                <div key={k}><div className="flex justify-between"><span className="text-mute">{CAT[k]}</span><span className="font-semibold tabular-nums">{res.scores[k]}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/10"><motion.div className="h-full rounded-full" style={{ background: res.scores[k] >= 80 ? "#14866B" : res.scores[k] >= 50 ? "#C6A46B" : "#B5493A" }}
                    initial={{ width: 0 }} animate={{ width: `${res.scores[k]}%` }} transition={{ type: "spring", stiffness: 70, damping: 18 }} /></div></div>))}</div>
              {!res.can_launch && <p className="text-[12px] font-semibold text-[#A33A2A]">{res.critical} critical issue{res.critical === 1 ? "" : "s"} must be fixed before launch.</p>}
            </div>
          </div>
          <ol className="space-y-2">
            <AnimatePresence initial={false}>
              {res.findings.map((f) => (
                <motion.li key={f.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                  className={cn("flex items-start gap-2.5 rounded-xl border p-3 text-[13px]", f.severity === "critical" ? "border-[#B5493A]/30 bg-[#B5493A]/5" : "border-line bg-panel")}>
                  <span className="mt-0.5">{icon(f.severity)}</span>
                  <div className="min-w-0 flex-1"><p>{f.message}</p><p className="mt-0.5 text-[11px] capitalize text-dim">{f.category}</p></div>
                  <div className="flex shrink-0 gap-1.5">
                    {f.element_id && onLocate && <button className="rounded-md px-2 py-1 text-[11px] font-semibold text-forest hover:bg-forest/5" onClick={() => onLocate(f.element_id!)}>Show</button>}
                    {f.fix && <button className="rounded-md bg-forest px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-paper disabled:opacity-50" disabled={!!busy} onClick={() => fix(f.id)}>{busy === f.id ? "…" : "Fix this"}</button>}
                  </div>
                </motion.li>))}
            </AnimatePresence>
          </ol>
          {res.findings.length === 0 && <p className="flex items-center gap-2 text-sm text-moss"><CheckCircle2 size={16} /> Nothing to improve.</p>}
          <p className="text-[11px] text-dim">Checks can't guarantee inbox placement. Wording, offers, prices and legal text are never changed automatically.</p>
        </motion.div>
      )}
      {compare && (
        <div className="space-y-2">
          <div className="flex items-center justify-between"><p className="text-sm font-semibold">Before and after</p><button className="text-xs text-mute hover:text-ink" onClick={() => setCompare(null)}>Hide</button></div>
          <div className="grid gap-3 md:grid-cols-2">
            <div><p className="label mb-1 !text-[10px]">Before</p><EmailFrame html={compare.before} width={375} title="Before fixes" /></div>
            <div><p className="label mb-1 !text-[10px]">After</p><EmailFrame html={compare.after} width={375} title="After fixes" /></div>
          </div>
        </div>
      )}
    </div>
  );
}

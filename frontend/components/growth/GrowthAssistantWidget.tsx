"use client";
import { motion } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/overlay";
import { api, useApi } from "@/lib/api";
import { ProgressIndicator } from "./ProgressIndicator";
import type { GrowthSession } from "./types";

const EXAMPLE = "I sell marketing services to restaurants in London…";

/** Compact dashboard entry point. Uses the same backend session as the full wizard (no separate workflow). */
export function GrowthAssistantWidget() {
  const router = useRouter();
  const toast = useToast();
  const { data: current } = useApi<GrowthSession | null>("/growth/sessions/current");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (t.split(/\s+/).length < 3) { toast("error", "Tell us a little more: what you sell and who you'd like to reach."); return; }
    setBusy(true);
    try { const s = await api<GrowthSession>("/growth/describe", { method: "POST", json: { description: t } }); router.push(`/growth?session=${s.id}`); }
    catch (err: any) { toast("error", err.message); setBusy(false); }
  };
  const resumable = current && current.step > 1;
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 30 }} aria-label="Growth Assistant"
      className="relative mb-6 overflow-hidden rounded-[22px] border border-forest/15 bg-panel p-5 shadow-card sm:p-6">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(192,45,240,.16),transparent_65%)]" />
      <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-forest"><Sparkles size={13} /> Growth Assistant
            <span className="ml-2 flex items-center gap-1 rounded-full bg-moss/10 px-2 py-0.5 text-[10px] font-bold tracking-normal text-moss normal-case"><i className="h-1.5 w-1.5 rounded-full bg-moss" />Ready</span></p>
          <h2 className="mt-2 font-display text-[24px] font-extrabold leading-tight tracking-tight sm:text-[28px]">Find your next customers.</h2>
          <p className="mt-1.5 max-w-md text-[14px] leading-relaxed text-mute">Tell us what you sell. We'll help you discover prospects, find contact opportunities and prepare your next campaign.</p>
        </div>
        <div className="space-y-3">
          <form onSubmit={start} className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="growth-widget" className="sr-only">What do you sell, and to whom?</label>
            <input id="growth-widget" className="field flex-1" maxLength={1000} placeholder="e.g. I sell marketing services to restaurants in London…" value={text} onChange={(e) => setText(e.target.value)} />
            <motion.button whileTap={{ scale: 0.97 }} className="btn-primary shrink-0 !px-6" disabled={busy}>{busy ? "Understanding…" : "Start growing"} <ArrowRight size={15} /></motion.button>
          </form>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-dim">
            <button type="button" className="hover:text-forest" onClick={() => setText(EXAMPLE.replace("…", "."))}>Example: “{EXAMPLE}”</button>
            {resumable && <button type="button" className="font-semibold text-forest hover:underline" onClick={() => router.push(`/growth?session=${current!.id}`)}>Resume “{current!.business.campaign_name || "your campaign"}” →</button>}
          </div>
          <ProgressIndicator step={resumable ? current!.step : 1} max={0} compact />
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-dim">Discover · Enrich · Create · Launch · Grow</p>
        </div>
      </div>
    </motion.section>
  );
}

"use client";
import { useReducedMotionSafe } from "@/components/ui/motion";
import { AnimatePresence, motion} from "motion/react";
import { ArrowLeft, LayoutTemplate, Plus, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { BusinessResults, LaunchStep, ReplyInbox } from "@/components/growth/Launch";
import { ProgressIndicator } from "@/components/growth/ProgressIndicator";
import { BusinessSetupStep, DiscoveryStep, EnrichmentStep, StepHeading } from "@/components/growth/steps";
import type { GrowthSession, Prospect } from "@/components/growth/types";
import { CreativeStudio } from "@/components/studio/CreativeStudio";
import { TemplatePicker, type Template } from "@/components/studio/Library";
import { PageHeader } from "@/components/ui/core";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/overlay";
import { api, useApi } from "@/lib/api";

function CreateStep({ session, onSession, onNext }: { session: GrowthSession; onSession: () => void; onNext: () => void }) {
  const toast = useToast();
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: prospects } = useApi<Prospect[]>(`/growth/sessions/${session.id}/prospects?filter=selected`);
  const create = async (template_id?: string) => {
    setBusy(true);
    try { await api("/studio/documents", { method: "POST", json: { session_id: session.id, template_id, name: session.business.campaign_name || "Campaign email" } }); onSession(); setPicker(false); }
    catch (e: any) { toast("error", e.message); } finally { setBusy(false); }
  };
  if (!session.document_id) return (
    <div>
      <StepHeading title="Create your email" sub="Start from a professional template or a blank page. You can switch between Easy and Pro editing at any time." />
      <div className="grid gap-3 sm:grid-cols-2">
        <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} className="rounded-[20px] border border-line bg-panel p-6 text-left shadow-card transition hover:border-forest" disabled={busy} onClick={() => setPicker(true)}>
          <LayoutTemplate className="mb-3 text-forest" /><p className="font-heading text-[16px] font-bold">Choose a template</p><p className="mt-1 text-[13px] text-mute">11 categories, from introductions to event invitations.</p></motion.button>
        <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} className="rounded-[20px] border border-line bg-panel p-6 text-left shadow-card transition hover:border-forest" disabled={busy} onClick={() => create()}>
          <Plus className="mb-3 text-forest" /><p className="font-heading text-[16px] font-bold">Start from scratch</p><p className="mt-1 text-[13px] text-mute">A blank email with a headline and a message.</p></motion.button>
      </div>
      <TemplatePicker open={picker} onClose={() => setPicker(false)} onPick={(t: Template) => create(t.id)} />
    </div>);
  return (
    <div>
      <StepHeading title="Creative Studio" sub="Design your email. Everything autosaves; switching editors never changes your design." />
      <CreativeStudio documentId={session.document_id} prospects={(prospects ?? []).map((p) => ({ id: p.id, name: p.name }))} onApprove={onNext} approveLabel="Continue to launch" />
    </div>
  );
}

function Wizard() {
  const router = useRouter();
  const params = useSearchParams();
  const reduce = useReducedMotionSafe();
  const sid = params.get("session");
  const { data: current, mutate: mutateCurrent } = useApi<GrowthSession | null>(sid ? null : "/growth/sessions/current");
  const id = sid ?? current?.id;
  const { data: session, mutate } = useApi<GrowthSession>(id ? `/growth/sessions/${id}` : null, {
    refreshInterval: (s) => (s && (["queued", "running"].includes(s.discovery.status ?? "") || ["queued", "running"].includes(s.enrichment.status ?? "")) ? 1200 : 0) });
  const [step, setStep] = useState<number | null>(null);
  const dir = useRef(1);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { if (session && step === null) setStep(session.step); }, [session, step]);
  const s = step ?? 1;
  const go = (n: number) => {
    dir.current = n >= s ? 1 : -1; setStep(n);
    if (session) api(`/growth/sessions/${session.id}/step`, { method: "PUT", json: { step: n } }).then(() => mutate()).catch(() => {});
    top.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  const fresh = () => { router.replace("/growth"); setStep(1); mutateCurrent(null, { revalidate: false }); };
  const variants = { enter: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * 48, filter: reduce ? "none" : "blur(4px)" }), center: { opacity: 1, x: 0, filter: "blur(0px)" },
    exit: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * -36, filter: reduce ? "none" : "blur(4px)" }) };
  return (
    <div ref={top} className="scroll-mt-24">
      <div className="mb-8 flex flex-wrap items-center gap-4 rounded-[20px] border border-line bg-panel/80 p-4 backdrop-blur">
        <div className="min-w-0 flex-1"><ProgressIndicator step={s} max={Math.max(session?.step ?? 1, s)} onGo={go} /></div>
        {session && <button className="btn-ghost btn-sm" onClick={fresh}><Plus size={13} /> New campaign</button>}
      </div>
      <AnimatePresence mode="wait" custom={dir.current} initial={false}>
        <motion.div key={s} custom={dir.current} variants={variants} initial="enter" animate="center" exit="exit" transition={{ type: "spring", stiffness: 260, damping: 30, mass: 0.9 }}>
          {s === 1 && <BusinessSetupStep session={step === 1 && !sid && !current ? null : session ?? null} onSession={(n) => { router.replace(`/growth?session=${n.id}`); mutate(n, { revalidate: false }); }} onNext={() => go(2)} />}
          {s === 2 && session && <DiscoveryStep session={session} onNext={() => go(3)} onRestart={() => go(1)} onChanged={() => mutate()} />}
          {s === 3 && session && <EnrichmentStep session={session} onNext={() => go(4)} onChanged={() => mutate()} />}
          {s === 4 && session && <CreateStep session={session} onSession={() => mutate()} onNext={() => go(5)} />}
          {s === 5 && session && <LaunchStep session={session} onSession={() => mutate()} />}
        </motion.div>
      </AnimatePresence>
      {s > 1 && <button className="mt-8 flex items-center gap-1.5 text-[13px] font-semibold text-mute hover:text-ink" onClick={() => go(s - 1)}><ArrowLeft size={14} /> Back</button>}
    </div>
  );
}

const TABS = [["assistant", "Assistant"], ["replies", "Replies"], ["results", "My business results"]] as const;

function GrowthPage() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (params.get("tab") as (typeof TABS)[number][0]) || "assistant";
  return (
    <div>
      <PageHeader eyebrow="Growth Assistant" title="Find your next customer." sub="Discover prospects, build your campaign and grow your business." />
      <div role="tablist" aria-label="Growth Assistant sections" className="relative mb-6 inline-flex rounded-full border border-line bg-panel p-1">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => router.replace(k === "assistant" ? `/growth${params.get("session") ? `?session=${params.get("session")}` : ""}` : `/growth?tab=${k}`, { scroll: false })}
            className={cn("relative z-10 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors", tab === k ? "text-paper" : "text-mute hover:text-ink")}>
            {tab === k && <motion.span layoutId="growth-tab" className="absolute inset-0 -z-10 rounded-full bg-forest" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}{l}</button>))}
      </div>
      {tab === "assistant" && <Wizard />}
      {tab === "replies" && <ReplyInbox />}
      {tab === "results" && <BusinessResults />}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="skeleton h-64 rounded-2xl" />}><GrowthPage /></Suspense>;
}

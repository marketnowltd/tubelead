"use client";
import { useReducedMotionSafe } from "@/components/ui/motion";
import { AnimatePresence, motion} from "motion/react";
import { ArrowLeft, ArrowRight, Check, Mail, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ProgressIndicator } from "@/components/growth/ProgressIndicator";
import { CreativeStudio } from "@/components/studio/CreativeStudio";
import type { Doc } from "@/components/studio/model";
import { cn } from "@/components/ui/cn";

/** Public interactive demo. Everything here is SAMPLE DATA: invented businesses, nothing searched, saved or sent. */
const SAMPLE_LEADS = [
  { name: "Sample: Olive & Ember", kind: "Independent restaurant", place: "Islington", score: 86, status: "Verified", evidence: ["Mentions “restaurant” in its description", "Takes online bookings", "Has a verified business email"] },
  { name: "Sample: The Copper Pot", kind: "Family bistro", place: "Hackney", score: 71, status: "Unverified", evidence: ["Mentions “bistro” in its description", "Publishes an email address on its website"] },
  { name: "Sample: Sakura Street", kind: "Ramen bar", place: "Soho", score: 58, status: "Risky", evidence: ["Mentions London", "Email could not be fully verified"] },
  { name: "Sample: Hearth Bakery", kind: "Bakery & café", place: "Peckham", score: 44, status: "Not found", evidence: ["Location matches", "No contact route found yet"] },
];
const AUDIENCES = ["Independent restaurants", "Cafés & bakeries", "Hotels & B&Bs", "Fitness studios"];
const STEP_TITLES = ["Describe your business", "Choose your audience", "Preview leads", "See an enriched profile", "Create a pitch & edit it", "See the results"];

function sampleDoc(product: string, audience: string): Doc {
  const id = () => Math.random().toString(16).slice(2, 12);
  const pad = (t: number, r: number, b: number, l: number) => ({ top: t, right: r, bottom: b, left: l });
  const ts = (size: number, weight: number, extra: Record<string, unknown> = {}) => ({ fontFamily: null, fontSize: size, mobileFontSize: null, fontWeight: weight, color: null, align: "left", lineHeight: size > 22 ? 1.2 : 1.55,
    letterSpacing: 0, decoration: "none", transform: "none", italic: false, paragraphSpacing: 0, padding: pad(0, 0, 12, 0), background: null, ...extra });
  return {
    version: 1,
    settings: { width: 600, background: "#F4F1FB", contentBackground: "#FFFFFF", fontFamily: "Helvetica", textColor: "#1B1433", linkColor: "#7B3FF2", radius: 16, preset: "modern",
      footer: "Sample email from the TubeLead demo. Nothing was sent.", fallbacks: { first_name: "there", last_name: "", company_name: "your restaurant", website: "", industry: "", business_location: "London", campaign_name: "" } },
    sections: [
      { id: id(), name: "Hero", kind: "hero", columns: [{ id: id(), width: 100, verticalAlign: "top", elements: [
        { id: id(), type: "heading", name: "Headline", content: `A fresh idea for {{company_name}}`, style: ts(30, 800, { color: "#FFFFFF", align: "center" }) },
        { id: id(), type: "text", name: "Intro", content: `${product} for ${audience.toLowerCase()} in {{business_location}}.`, style: ts(16, 400, { color: "#D9D2F0", align: "center" }) }] }],
        style: { background: "#1B1433", gradient: null, backgroundImage: null, padding: pad(40, 32, 32, 32), stackOnMobile: true } },
      { id: id(), name: "Message", kind: "content", columns: [{ id: id(), width: 100, verticalAlign: "top", elements: [
        { id: id(), type: "text", name: "Paragraph", content: "Hi {{first_name}},<br><br>We help places like {{company_name}} turn more website visitors into bookings. Could I show you two quick ideas?", style: ts(16, 400) },
        { id: id(), type: "button", name: "Button", label: "Book a 15-minute call", href: "https://example.com/book", style: { background: "#7B3FF2", gradient: null, color: "#FFFFFF", fontSize: 16, fontWeight: 700, fontFamily: null, radius: 999, paddingX: 28, paddingY: 14, align: "left", fullWidth: false, borderWidth: 0, borderColor: "#7B3FF2", padding: pad(8, 0, 16, 0) } }] }],
        style: { background: null, gradient: null, backgroundImage: null, padding: pad(28, 32, 20, 32), stackOnMobile: true } },
    ],
  } as unknown as Doc;
}

export default function DemoPage() {
  const reduce = useReducedMotionSafe();
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState(1);
  const [product, setProduct] = useState("Website design");
  const [audience, setAudience] = useState(AUDIENCES[0]);
  const [lead, setLead] = useState(0);
  const [doc, setDoc] = useState<Doc | null>(null);
  useEffect(() => { if (step === 5 && !doc) setDoc(sampleDoc(product, audience)); }, [step, doc, product, audience]);
  const go = (n: number) => { setDir(n > step ? 1 : -1); setStep(n); window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); };
  const variants = { enter: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * 40 }), center: { opacity: 1, x: 0 }, exit: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * -30 }) };
  const wizardStep = step <= 1 ? 1 : step <= 3 ? 2 : step === 4 ? 3 : step === 5 ? 4 : 5;
  return (
    <div className="bg-[#F8F4FF] pb-24 pt-10">
      <div className="mx-auto max-w-[1180px] pl-[max(20px,env(safe-area-inset-left,0px))] pr-[max(20px,env(safe-area-inset-right,0px))] sm:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div><p className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.18em] text-forest"><Sparkles size={13} /> Interactive demo
            <span className="rounded-full bg-gold/25 px-2 py-0.5 text-[10px] tracking-normal text-gold-text">Sample data</span></p>
            <h1 className="mt-2 font-display text-[clamp(2rem,4vw,3rem)] font-extrabold leading-tight tracking-tight">See what TubeLead can do.</h1>
            <p className="mt-1 text-[15px] text-mute">A guided, simulated campaign. Nothing is searched, saved or sent.</p></div>
          <Link href="/signup" className="btn-primary !px-6">Start your free trial <ArrowRight size={15} /></Link>
        </div>
        <div className="mb-6 rounded-[20px] border border-line bg-panel/80 p-4 backdrop-blur"><ProgressIndicator step={wizardStep} max={0} /></div>
        <p className="mb-4 text-[13px] font-semibold text-mute">Step {step} of 6 · {STEP_TITLES[step - 1]}</p>

        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div key={step} custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={{ type: "spring", stiffness: 260, damping: 30 }}>
            {step === 1 && <div className="max-w-2xl rounded-[20px] border border-line bg-panel p-6 shadow-card">
              <label htmlFor="demo-product" className="font-heading text-[18px] font-bold">What do you sell?</label>
              <input id="demo-product" className="field mt-3 text-[16px]" value={product} maxLength={80} onChange={(e) => setProduct(e.target.value)} />
              <button className="btn-primary mt-5" disabled={!product.trim()} onClick={() => go(2)}>Continue <ArrowRight size={15} /></button></div>}
            {step === 2 && <div className="max-w-2xl rounded-[20px] border border-line bg-panel p-6 shadow-card">
              <p className="font-heading text-[18px] font-bold">Who would you like to reach in London?</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">{AUDIENCES.map((a) => (
                <button key={a} type="button" onClick={() => setAudience(a)} className={cn("flex items-center justify-between rounded-xl border p-3 text-left text-[14px] font-semibold transition", audience === a ? "border-forest bg-forest/5 text-forest" : "border-line hover:border-forest/40")}>{a}{audience === a && <Check size={15} />}</button>))}</div>
              <button className="btn-primary mt-5" onClick={() => go(3)}>Find sample customers <ArrowRight size={15} /></button></div>}
            {step === 3 && <div>
              <ul className="grid gap-3 md:grid-cols-2">{SAMPLE_LEADS.map((l, i) => (
                <motion.li key={l.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 30, delay: i * 0.06 }}>
                  <button type="button" onClick={() => { setLead(i); go(4); }} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-panel p-4 text-left transition hover:-translate-y-0.5 hover:border-forest hover:shadow-card">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-forest/10 font-bold text-forest">{l.name.split(": ")[1].slice(0, 2).toUpperCase()}</span>
                    <span className="min-w-0 flex-1"><span className="block font-bold">{l.name}</span><span className="block text-[12px] text-mute">{l.kind} · {l.place}</span></span>
                    <span className="font-display text-[22px] font-extrabold tabular-nums">{l.score}</span></button></motion.li>))}</ul>
              <p className="mt-3 text-[12px] text-dim">These businesses are invented for the demo. Click one to see its profile.</p></div>}
            {step === 4 && <div className="max-w-2xl space-y-4 rounded-[20px] border border-line bg-panel p-6 shadow-card">
              <div className="flex items-center justify-between"><p className="font-heading text-[20px] font-bold">{SAMPLE_LEADS[lead].name}</p><span className="font-display text-[26px] font-extrabold">{SAMPLE_LEADS[lead].score}/100</span></div>
              <p className="text-mute">{SAMPLE_LEADS[lead].kind} · {SAMPLE_LEADS[lead].place}</p>
              <div><p className="mb-1.5 font-semibold">Why this lead?</p><ul className="space-y-1 text-[13px] text-mute">{SAMPLE_LEADS[lead].evidence.map((e) => <li key={e}>· {e}</li>)}</ul></div>
              <p className="flex items-center gap-2 rounded-xl bg-bg2 p-3 text-[13px]"><Mail size={14} /> hello@sample-business.example <span className="ml-auto rounded-full bg-moss/10 px-2 py-0.5 text-[11px] font-bold text-moss">{SAMPLE_LEADS[lead].status}</span></p>
              <button className="btn-primary" onClick={() => go(5)}>Create a pitch <ArrowRight size={15} /></button></div>}
            {step === 5 && doc && <div className="space-y-3">
              <p className="rounded-xl bg-forest/5 p-3 text-[13px]">Try it: click any text to edit it, switch to <strong>Pro Editor</strong> for layers and tools, then <strong>Run checks</strong>.</p>
              <CreativeStudio demo demoInitial={{ doc, subject: "A fresh idea for {{company_name}}" }} onApprove={() => go(6)} approveLabel="See sample results" /></div>}
            {step === 6 && <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{([["Prospects", 48], ["Contacts", 31], ["Sent", 31], ["Delivered", 30], ["Replies", 6], ["Meetings", 2]] as const).map(([l, v], i) => (
                <motion.div key={l} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 30, delay: i * 0.05 }} className="rounded-2xl border border-line bg-panel p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-mute">{l}</p><p className="mt-1 font-display text-[26px] font-extrabold tabular-nums">{v}</p></motion.div>))}</div>
              <p className="text-[12px] text-dim">Sample figures for illustration only. Real results depend on your offer, audience and sending provider, and are never estimated as sales.</p>
              <div className="rounded-[20px] border border-forest/20 bg-panel p-6 text-center shadow-card">
                <p className="font-display text-[24px] font-extrabold">Ready to find your real customers?</p>
                <Link href="/signup" className="btn-primary mt-4 !px-8">Start your free trial <ArrowRight size={15} /></Link></div></div>}
          </motion.div>
        </AnimatePresence>
        {step > 1 && <button className="mt-6 flex items-center gap-1.5 text-[13px] font-semibold text-mute hover:text-ink" onClick={() => go(step - 1)}><ArrowLeft size={14} /> Back</button>}
      </div>
    </div>
  );
}

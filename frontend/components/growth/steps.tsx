"use client";
import { useReducedMotionSafe } from "@/components/ui/motion";
import { AnimatePresence, motion} from "motion/react";
import { ArrowRight, Bookmark, BookmarkCheck, Check, CheckCircle2, CircleDashed, ExternalLink, Globe, Loader2, Mail, Search, Sparkles, X, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/core";
import { cn } from "@/components/ui/cn";
import { Segmented } from "@/components/ui/inputs";
import { Sheet, useToast } from "@/components/ui/overlay";
import { api, useApi } from "@/lib/api";
import { BREAKDOWN_LABEL, CLASS_LABEL, STATUS_LABEL, type Business, type GrowthSession, type Prospect } from "./types";

const spring = { type: "spring" as const, stiffness: 320, damping: 32 };
export const StepHeading = ({ title, sub }: { title: string; sub: string }) => (
  <div className="mb-6"><h2 className="font-display text-[26px] font-extrabold leading-tight tracking-tight sm:text-[32px]">{title}</h2><p className="mt-1.5 max-w-2xl text-[15px] text-mute">{sub}</p></div>
);

// ---------------- Step 1
const FIELDS: [keyof Business, string][] = [["campaign_name", "Campaign"], ["product", "Product"], ["audience", "Target"], ["location", "Location"], ["customer_type", "Customer type"], ["opportunity", "Opportunity"]];

export function BusinessSetupStep({ session, onSession, onNext }: { session: GrowthSession | null; onSession: (s: GrowthSession) => void; onNext: () => void }) {
  const toast = useToast();
  const reduce = useReducedMotionSafe();
  const [text, setText] = useState(session?.description ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [biz, setBiz] = useState<Business | null>(session?.business ?? null);
  useEffect(() => { if (session) { setBiz(session.business); setText(session.description); } }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const understand = async () => {
    setBusy("describe");
    try { const s = await api<GrowthSession>("/growth/describe", { method: "POST", json: { description: text, session_id: session?.id } }); onSession(s); setBiz(s.business); }
    catch (e: any) { toast("error", e.message); } finally { setBusy(null); }
  };
  const find = async () => {
    if (!session || !biz) return;
    setBusy("find");
    try {
      await api(`/growth/sessions/${session.id}/business`, { method: "PUT", json: biz });
      onSession(await api<GrowthSession>(`/growth/sessions/${session.id}/discover`, { method: "POST" })); onNext();
    } catch (e: any) { toast("error", e.message); } finally { setBusy(null); }
  };
  return (
    <div>
      <StepHeading title="Let’s find your next customers." sub="Tell us what your business offers and who you want to reach." />
      <form onSubmit={(e) => { e.preventDefault(); understand(); }} className="relative">
        <label htmlFor="biz-desc" className="sr-only">What you sell and who you want to reach</label>
        <textarea id="biz-desc" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="I sell website design services to independent restaurants in London."
          className="field min-h-[96px] resize-none pr-36 text-[16px] leading-relaxed" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); understand(); } }} />
        <button className="btn-primary absolute bottom-3 right-3 !py-2" disabled={!!busy || text.trim().split(/\s+/).length < 3}>
          {busy === "describe" ? <><Loader2 size={14} className="animate-spin" /> Understanding</> : <><Sparkles size={14} /> {biz ? "Update" : "Continue"}</>}</button>
      </form>
      <AnimatePresence>
        {biz && (
          <motion.div initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring} className="mt-6 rounded-[20px] border border-line bg-panel p-5 shadow-card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-forest">Your campaign summary</p>
              <span className="text-[11px] text-dim">{biz.interpreted_by === "ai" ? "Suggested by your AI provider" : "Read from your description"} · edit anything</span>
            </div>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {FIELDS.map(([k, label], i) => (
                <motion.div key={k} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.04 }} className={cn(k === "opportunity" && "sm:col-span-2")}>
                  <dt className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-mute">{label}</dt>
                  <dd>{k === "customer_type"
                    ? <select aria-label={label} className="mt-1 w-full rounded-lg border border-transparent bg-transparent py-1 font-semibold outline-none transition hover:border-line focus:border-forest" value={biz[k]} onChange={(e) => setBiz({ ...biz, [k]: e.target.value })}>
                      {["B2B", "B2C", "Creators"].map((o) => <option key={o}>{o}</option>)}</select>
                    : <input aria-label={label} className="mt-1 w-full rounded-lg border border-transparent bg-transparent px-0 py-1 font-semibold outline-none transition placeholder:font-normal placeholder:text-dim hover:border-line hover:px-2 focus:border-forest focus:px-2"
                      value={biz[k] as string} placeholder="Not stated" onChange={(e) => setBiz({ ...biz, [k]: e.target.value })} />}</dd>
                </motion.div>))}
            </dl>
            {biz.sources && <p className="mt-4 text-[12px] text-mute">We'll search: {biz.sources.join(" · ")}</p>}
            <div className="mt-5 flex justify-end"><motion.button whileTap={{ scale: 0.97 }} className="btn-primary !px-7" disabled={!!busy || !(biz.audience || biz.industry)} onClick={find}>
              {busy === "find" ? <><Loader2 size={15} className="animate-spin" /> Starting</> : <>Find my customers <ArrowRight size={15} /></>}</motion.button></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------- Prospect UI
const tone = { excellent: "green", good: "cyan", low: "neutral" } as const;
const contactTone = { verified: "green", risky: "amber", unverified: "neutral", not_found: "red" } as const;
const initials = (s: string) => s.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export function ProspectCard({ p, onToggle, onSave, onRemove, onOpen }: { p: Prospect; onToggle: () => void; onSave: () => void; onRemove: () => void; onOpen: () => void }) {
  return (
    <motion.li layout initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }} transition={spring}
      className={cn("group relative flex gap-3 rounded-2xl border bg-panel p-4 transition-[border-color,box-shadow] duration-300 hover:shadow-card", p.selected ? "border-forest shadow-[0_0_0_3px_rgba(123,63,242,.12)]" : "border-line")}>
      <button type="button" role="checkbox" aria-checked={p.selected} aria-label={`Select ${p.name}`} onClick={onToggle}
        className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors duration-200", p.selected ? "border-forest bg-forest text-paper" : "border-line hover:border-forest")}>
        <AnimatePresence>{p.selected && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 700, damping: 26 }}><Check size={12} strokeWidth={3.5} /></motion.span>}</AnimatePresence>
      </button>
      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-forest-100 to-bg2 font-heading text-[13px] font-extrabold text-forest">{initials(p.name)}</span>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="truncate text-[14px] font-bold">{p.name}</p>
        <p className="truncate text-[12px] text-mute">{[p.domain ?? p.platform, p.industry, p.audience_size ? `${p.audience_size.toLocaleString()} audience` : null].filter(Boolean).join(" · ")}</p>
        {p.description && <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-mute">{p.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={tone[p.classification]} dot>{CLASS_LABEL[p.classification]}</Badge>
          {p.contact_status && <Badge tone={contactTone[p.contact_status]}>{STATUS_LABEL[p.contact_status]}</Badge>}
          <span className="text-[11px] text-dim">via {p.sources.join(", ")}</span>
        </div>
      </button>
      <div className="flex shrink-0 flex-col items-end justify-between">
        <span className="font-display text-[22px] font-extrabold tabular-nums leading-none" aria-label={`Opportunity score ${p.score} out of 100`}>{p.score}<span className="text-[11px] font-semibold text-dim">/100</span></span>
        <div className="flex gap-0.5 opacity-70 transition group-hover:opacity-100">
          <button type="button" aria-label={p.saved ? "Unsave" : "Save lead"} onClick={onSave} className="rounded-md p-1.5 hover:bg-forest/10">{p.saved ? <BookmarkCheck size={15} className="text-forest" /> : <Bookmark size={15} />}</button>
          <button type="button" aria-label={`Remove ${p.name}`} onClick={onRemove} className="rounded-md p-1.5 hover:bg-[#B5493A]/15 hover:text-[#A33A2A]"><X size={15} /></button>
        </div>
      </div>
    </motion.li>
  );
}

export function ProspectProfile({ p, onClose }: { p: Prospect | null; onClose: () => void }) {
  return (
    <Sheet padded open={!!p} onOpenChange={(o) => !o && onClose()} title={p?.name ?? ""} description={p ? `${CLASS_LABEL[p.classification]} · ${p.score}/100` : ""} width="max-w-[560px]">
      {p && <div className="space-y-5 text-[13px]">
        <div className="flex flex-wrap gap-2">
          {p.website && <a href={p.website} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm"><Globe size={13} /> Website <ExternalLink size={11} /></a>}
          {p.source_url && p.source_url !== p.website && <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">Source <ExternalLink size={11} /></a>}
          {p.contact_page && <a href={p.contact_page} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">Contact page <ExternalLink size={11} /></a>}
        </div>
        {p.description && <p className="leading-relaxed text-mute">{p.description}</p>}
        <section>
          <h3 className="mb-2 font-heading text-[15px] font-bold">Why this lead?</h3>
          <ul className="space-y-2">{Object.entries(p.breakdown).map(([k, b]) => (
            <li key={k} className="rounded-xl border border-line p-3">
              <div className="flex items-center justify-between"><span className="font-semibold">{BREAKDOWN_LABEL[k] ?? k}</span>
                <span className="flex items-center gap-2"><Badge tone={b.basis === "fact" ? "green" : b.basis === "estimate" ? "amber" : "neutral"}>{b.basis === "fact" ? "Verified fact" : b.basis === "estimate" ? "Estimate" : "Unknown"}</Badge>
                  <span className="tabular-nums font-bold">{b.points}/{b.max}</span></span></div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/10"><motion.div className="h-full rounded-full bg-forest" initial={{ width: 0 }} animate={{ width: `${(b.points / b.max) * 100}%` }} transition={spring} /></div>
              <ul className="mt-2 space-y-0.5 text-[12px] text-mute">{b.evidence.map((e) => <li key={e}>· {e}</li>)}</ul>
            </li>))}</ul>
        </section>
        <section>
          <h3 className="mb-2 font-heading text-[15px] font-bold">Contacts</h3>
          {p.contacts.length === 0 ? <p className="text-mute">{p.enrichment_status === "done" ? "No public business email was found. Nothing is guessed." : "Not enriched yet."}</p> : (
            <ul className="space-y-2">{p.contacts.map((c) => (
              <li key={c.email} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-1.5 font-semibold"><Mail size={13} /> {c.email}</span><Badge tone={contactTone[c.status]} dot>{STATUS_LABEL[c.status]}</Badge></div>
                {(c.first_name || c.position) && <p className="mt-0.5 text-mute">{[c.first_name, c.last_name].filter(Boolean).join(" ")}{c.position && ` · ${c.position}`}</p>}
                <p className="mt-1 text-[11px] text-dim">Source: {c.source === "snov" ? "Snov.io" : c.source === "contact_page" ? "contact page" : "website"}{c.source_url && <> · <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="underline">{new URL(c.source_url).hostname}</a></>} · checked {new Date(c.checked_at).toLocaleDateString("en-GB")}
                  {c.personal && <span className="ml-1 font-semibold text-gold-text">· personal address: needs consent under PECR</span>}</p>
              </li>))}</ul>)}
        </section>
      </div>}
    </Sheet>
  );
}

function useProspects(sessionId: string | undefined, filter: string, refresh: number | false) {
  return useApi<Prospect[]>(sessionId ? `/growth/sessions/${sessionId}/prospects?filter=${filter}` : null, { refreshInterval: refresh || 0 });
}

function ProspectList({ session, filter, setFilter, live, onChanged }: { session: GrowthSession; filter: string; setFilter: (f: string) => void; live?: boolean; onChanged?: () => void }) {
  const toast = useToast();
  const { data, mutate } = useProspects(session.id, filter, live ? 1500 : false);
  const [open, setOpen] = useState<Prospect | null>(null);
  const patch = async (p: Prospect, body: Record<string, boolean>, msg?: string) => {
    mutate((list) => (list ?? []).map((x) => (x.id === p.id ? { ...x, ...body } : x)).filter((x) => !(body.removed && x.id === p.id)), { revalidate: false });
    try { await api(`/growth/prospects/${p.id}`, { method: "PATCH", json: body }); if (msg) toast("success", msg); onChanged?.(); } catch (e: any) { toast("error", e.message); mutate(); }
  };
  const all = data ?? [];
  const selectAll = async (v: boolean) => { mutate(all.map((x) => ({ ...x, selected: v })), { revalidate: false }); await api(`/growth/sessions/${session.id}/select`, { method: "POST", json: { ids: all.map((x) => x.id), selected: v } }); onChanged?.(); };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Filter prospects" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "excellent", label: "Excellent" }, { value: "good", label: "Good" }, { value: "selected", label: "Selected" }, { value: "saved", label: "Saved" }]} />
        <span className="ml-auto text-[12px] text-mute">{all.length} shown</span>
        {all.length > 0 && <button className="btn-ghost btn-sm" onClick={() => selectAll(!all.every((x) => x.selected))}>{all.every((x) => x.selected) ? "Clear selection" : "Select all shown"}</button>}
      </div>
      <ul className="grid gap-3 md:grid-cols-2"><AnimatePresence initial={false}>
        {all.map((p) => <ProspectCard key={p.id} p={p} onOpen={() => setOpen(p)} onToggle={() => patch(p, { selected: !p.selected })}
          onSave={() => patch(p, { saved: !p.saved }, p.saved ? undefined : "Lead saved")} onRemove={() => patch(p, { removed: true })} />)}
      </AnimatePresence></ul>
      {data && all.length === 0 && <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-mute">No prospects match this filter.</p>}
      <ProspectProfile p={open} onClose={() => setOpen(null)} />
    </div>
  );
}

// ---------------- Step 2
export function DiscoveryStep({ session, onNext, onRestart, onChanged }: { session: GrowthSession; onNext: () => void; onRestart: () => void; onChanged: () => void }) {
  const d = session.discovery;
  const [filter, setFilter] = useState("all");
  const running = d.status === "queued" || d.status === "running";
  const stages = d.stages ?? [];
  return (
    <div>
      <StepHeading title={running ? "Finding your customers…" : d.status === "failed" ? "Discovery didn't finish" : `${d.totals?.found ?? 0} prospects found`}
        sub={running ? `Searching for “${d.query ?? session.business.audience}”. This is live progress, not an animation.` : d.status === "done" ? "Select the prospects you'd like to contact, then enrich them." : (d.error ?? "")} />
      {(running || d.status === "failed") && (
        <ol className="mb-6 space-y-2 rounded-[20px] border border-line bg-panel p-5">
          {stages.map((s, i) => { const n = i + 1, done = (d.stage ?? 0) > n || d.status === "done", cur = d.stage === n && running;
            return <motion.li key={s} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: i * 0.03 }} className="flex items-center gap-3 text-[14px]">
              {done ? <CheckCircle2 size={17} className="text-moss" /> : cur ? <Loader2 size={17} className="animate-spin text-forest" /> : d.status === "failed" && (d.stage ?? 0) === n ? <XCircle size={17} className="text-[#B5493A]" /> : <CircleDashed size={17} className="text-dim" />}
              <span className={cn(done ? "text-ink" : cur ? "font-semibold text-ink" : "text-dim")}>{s}</span></motion.li>; })}
        </ol>)}
      {d.sources && d.sources.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">{d.sources.map((s) => (
          <span key={s.name} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px]", s.status === "ok" ? "border-moss/30 bg-moss/5 text-moss" : s.status === "searching" ? "border-line text-mute" : "border-[#B5493A]/30 text-[#A33A2A]")}
            title={s.message}>{s.status === "searching" ? <Loader2 size={11} className="animate-spin" /> : s.status === "ok" ? <Check size={11} /> : <X size={11} />}{s.name}{typeof s.count === "number" && ` · ${s.count}`}</span>))}</div>)}
      {d.status === "done" && <>
        {d.totals && <p className="mb-4 text-[13px] text-mute">{d.totals.excellent} excellent · {d.totals.good} good matches · {d.totals.duplicates_removed} duplicates removed</p>}
        <ProspectList session={session} filter={filter} setFilter={setFilter} onChanged={onChanged} />
        <div className="sticky bottom-4 z-20 mr-20 mt-6 flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel/90 p-3 shadow-pop backdrop-blur-xl">
          <span className="text-[13px]"><strong>{session.prospects.selected}</strong> selected</span>
          <button className="btn-primary" disabled={!session.prospects.selected} onClick={onNext}>Find contacts <ArrowRight size={15} /></button>
        </div>
      </>}
      {d.status === "failed" && <button className="btn-primary" onClick={onRestart}><Search size={15} /> Try again</button>}
    </div>
  );
}

// ---------------- Step 3
export function EnrichmentStep({ session, onNext, onChanged }: { session: GrowthSession; onNext: () => void; onChanged: () => void }) {
  const toast = useToast();
  const e = session.enrichment;
  const running = e.status === "queued" || e.status === "running";
  const [filter, setFilter] = useState("selected");
  const { data: credits } = useApi<Record<string, { label: string; used: number; allowance: number; remaining: number }>>("/growth/credits", { refreshInterval: running ? 2000 : 0 });
  const start = async () => { try { await api(`/growth/sessions/${session.id}/enrich`, { method: "POST" }); onChanged(); } catch (err: any) { toast("error", err.message); } };
  const pct = e.total ? Math.round(((e.done ?? 0) / e.total) * 100) : 0;
  return (
    <div>
      <StepHeading title={running ? "Finding contact details…" : e.status === "done" ? "Contacts found" : "Find contact details"}
        sub="We check each prospect's own website for published business emails, then verify them. Nothing is guessed or invented." />
      {!e.status && <div className="mb-6 rounded-[20px] border border-line bg-panel p-5">
        <p className="text-[14px]">Enrich <strong>{session.prospects.selected}</strong> selected prospect{session.prospects.selected === 1 ? "" : "s"}.</p>
        {credits && <p className="mt-1 text-[12px] text-mute">{credits.enrichment.remaining.toLocaleString()} enrichment and {credits.verification.remaining.toLocaleString()} verification credits left this month.</p>}
        <button className="btn-primary mt-4" onClick={start}><Sparkles size={15} /> Find contacts for {session.prospects.selected} prospect{session.prospects.selected === 1 ? "" : "s"}</button></div>}
      {e.status && <div className="mb-6 space-y-2 rounded-[20px] border border-line bg-panel p-5">
        <div className="flex justify-between text-[13px]"><span>{e.done ?? 0} of {e.total ?? 0} prospects</span><span className="tabular-nums text-mute">{pct}%</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-ink/10"><motion.div className="h-full rounded-full" style={{ background: "linear-gradient(90deg,#9235f5,#ff982e)" }} initial={false} animate={{ width: `${pct}%` }} transition={spring} /></div>
        <p className="text-[12px] text-mute">{e.snov === "configured" ? `Verification by Snov.io · ${e.credits_used?.enrichment ?? 0} enrichment and ${e.credits_used?.verification ?? 0} verification credits used` : "Checking public websites. Email verification switches on once TubeLead's Snov.io connection is set up."}</p>
        {e.snov_error && <p className="text-[12px] text-gold-text">{e.snov_error}</p>}
        {e.status === "failed" && <p className="text-[12px] text-[#A33A2A]">{e.error}</p>}
      </div>}
      {e.status && <ProspectList session={session} filter={filter} setFilter={setFilter} live={running} onChanged={onChanged} />}
      {e.status === "done" && <div className="sticky bottom-4 z-20 mr-20 mt-6 flex justify-end rounded-2xl border border-line bg-panel/90 p-3 shadow-pop backdrop-blur-xl">
        <button className="btn-primary" onClick={onNext}>Create your email <ArrowRight size={15} /></button></div>}
    </div>
  );
}

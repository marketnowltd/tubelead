"use client";
import { AlertTriangle, CalendarClock, Globe, Layers, Layers3, Lightbulb, Repeat, Rocket, Save, Search, Sparkles, Telescope, Wand2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { JobMonitor, isActiveJob } from "@/components/pages/JobMonitor";
import { Badge, EmptyState, PageHeader, Panel, PanelHeader } from "@/components/ui/core";
import { Field, MultiSelect, Segmented, Switch, TagInput } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/overlay";
import { cn } from "@/components/ui/cn";
import { ApiError, api, useApi } from "@/lib/api";
import { COUNTRIES, NICHES, REGIONS, flag, regionCodes } from "@/lib/countries";
import type { Job, Status } from "@/lib/types";

type UiMode = "standard" | "deep" | "multi_niche" | "worldwide" | "repeat" | "scheduled";
const MODES: { id: UiMode; label: string; icon: any; desc: string }[] = [
  { id: "standard", label: "Standard Search", icon: Search, desc: "One search per keyword and country. Fast and cheap on quota." },
  { id: "deep", label: "Deep Search", icon: Telescope, desc: "Expands keywords, uses two sort orders and two result pages." },
  { id: "multi_niche", label: "Multi-Niche Search", icon: Layers3, desc: "Crosses every niche with every keyword." },
  { id: "worldwide", label: "Worldwide Discovery", icon: Globe, desc: "Searches 14 major regions instead of your country list." },
  { id: "repeat", label: "Repeat Discovery", icon: Repeat, desc: "Re-queries with 4 sort orders to surface channels missed before." },
  { id: "scheduled", label: "Scheduled Discovery", icon: CalendarClock, desc: "Save this search and run it automatically on a schedule." },
];

interface Form {
  mode: UiMode; keywords: string[]; niches: string[]; countries: string[]; minSubs: number; maxSubs: number | ""; minEng: number;
  creatorType: "any" | "creator" | "brand"; activity: "any" | "active" | "recent" | "dormant"; limit: number;
  source: "channels" | "videos" | "topics"; seedVideos: string[];
  requireEmail: boolean; requireWebsite: boolean; maxQuota: number; schedule: "hourly" | "daily" | "weekly"; saveName: string;
}
const DEFAULTS: Form = { source: "channels", seedVideos: [], mode: "standard", keywords: [], niches: [], countries: [], minSubs: 1_000, maxSubs: 500_000, minEng: 0, creatorType: "creator", activity: "any", limit: 25, requireEmail: true, requireWebsite: false, maxQuota: 1500, schedule: "daily", saveName: "" };

function toParams(f: Form) {
  return {
    keywords: f.keywords, niches: f.niches, source: f.source, seed_videos: f.seedVideos, countries: f.mode === "worldwide" ? [] : f.countries,
    mode: f.mode === "scheduled" ? "standard" : f.mode, min_subscribers: f.minSubs, max_subscribers: f.maxSubs === "" ? null : f.maxSubs,
    min_engagement: f.minEng, creator_type: f.creatorType, activity: f.activity, limit: f.limit, require_email: f.requireEmail,
    require_website: f.requireWebsite, max_quota_units: f.maxQuota,
  };
}

function validate(f: Form): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.keywords.length && !f.niches.length && !f.seedVideos.length) e.keywords = "Add at least one keyword, niche or seed video.";
  if (f.mode === "multi_niche" && f.niches.length < 2) e.niches = "Multi-niche search needs at least two niches.";
  if (f.maxSubs !== "" && f.maxSubs < f.minSubs) e.maxSubs = "Maximum must be at least the minimum.";
  if (f.minSubs < 0) e.minSubs = "Cannot be negative.";
  if (!Number.isInteger(f.limit) || f.limit < 1 || f.limit > 500) e.limit = "Choose between 1 and 500 leads.";
  if (f.mode === "scheduled" && !f.saveName.trim()) e.saveName = "Name this scheduled search.";
  return e;
}

const SUB_PRESETS = [1_000, 10_000, 50_000, 100_000, 500_000, 1_000_000];
const fmtK = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : `${n / 1000}K`);
const Err = ({ m }: { m?: string }) => (m ? <p role="alert" className="mt-1 text-[11px] text-[#A33A2A]">{m}</p> : null);

export default function LeadGenerator() {
  const toast = useToast();
  const [f, setF] = useState<Form>(DEFAULTS);
  const [touched, setTouched] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notConfigured, setNotConfigured] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<{ search_operations: number; max_quota_units: number; capped_at: number } | null>(null);
  const { data: st } = useApi<Status>("/status", { refreshInterval: 15000 });
  const { data: recent, mutate: refreshRecent } = useApi<Job[]>("/jobs?limit=5");
  const [nl, setNl] = useState("");
  const [proposal, setProposal] = useState<{ source: string; criteria: Record<string, any>; dropped: string[]; note: string | null } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [ideas, setIdeas] = useState<{ source: string; keywords: string[]; note?: string } | null>(null);
  const [ideating, setIdeating] = useState(false);
  const interpret = async () => {
    if (nl.trim().length < 3) return;
    setParsing(true); setProposal(null);
    try { setProposal(await api("/ai/assistant/parse", { method: "POST", json: { text: nl.trim() } })); } catch (e: any) { toast("error", e.message); } finally { setParsing(false); }
  };
  const applyProposal = () => {
    if (!proposal) return; const c = proposal.criteria;
    setF((s) => ({ ...s, keywords: c.keywords ?? s.keywords, niches: c.niches ?? s.niches, countries: c.countries ?? s.countries,
      minSubs: c.min_subscribers ?? s.minSubs, maxSubs: c.max_subscribers ?? s.maxSubs, activity: c.activity ?? s.activity, creatorType: c.creator_type ?? s.creatorType,
      requireEmail: c.require_email ?? s.requireEmail, requireWebsite: c.require_website ?? s.requireWebsite, mode: (c.mode as UiMode) ?? s.mode }));
    setProposal(null); toast("success", "Criteria applied — review and edit them below before running.");
  };
  const suggest = async () => {
    const topic = f.keywords[0] || f.niches[0]; if (!topic) { toast("info", "Add a keyword or niche first."); return; }
    setIdeating(true);
    try { setIdeas(await api("/ai/keywords", { method: "POST", json: { topic } })); } catch (e: any) { toast("error", e.message); } finally { setIdeating(false); }
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const errors = useMemo(() => validate(f), [f]);

  // Resume monitoring a job that's still running (e.g. after reload) and load params handed over from Saved Searches.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("tl.loadParams");
      if (raw) {
        localStorage.removeItem("tl.loadParams");
        const p = JSON.parse(raw);
        setF({ ...DEFAULTS, source: p.source ?? "channels", seedVideos: p.seed_videos ?? [], mode: p.mode ?? "standard", keywords: p.keywords ?? [], niches: p.niches ?? [], countries: p.countries ?? [], minSubs: p.min_subscribers ?? 10_000,
          maxSubs: p.max_subscribers ?? "", minEng: p.min_engagement ?? 0, creatorType: p.creator_type ?? "any", activity: p.activity ?? "any", limit: p.limit ?? 25,
          requireEmail: !!p.require_email, requireWebsite: !!p.require_website, maxQuota: p.max_quota_units ?? 1500 });
        toast("info", "Saved search loaded into the generator");
      }
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!jobId && recent?.length && isActiveJob(recent[0]) && !recent[0].is_demo) setJobId(recent[0].id); }, [recent, jobId]);

  useEffect(() => {
    if (errors.keywords || errors.maxSubs || errors.limit) { setEstimate(null); return; }
    const t = setTimeout(() => api("/jobs/estimate", { method: "POST", json: toParams(f) }).then(setEstimate).catch(() => setEstimate(null)), 350);
    return () => clearTimeout(t);
  }, [f.keywords, f.niches, f.countries, f.mode, f.maxQuota]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleRegion = (r: (typeof REGIONS)[number]) => {
    const codes = regionCodes(r);
    const all = codes.every((c) => f.countries.includes(c));
    set("countries", all ? f.countries.filter((c) => !codes.includes(c)) : Array.from(new Set([...f.countries, ...codes])));
  };

  const submit = async () => {
    setTouched(true);
    if (Object.keys(errors).length) { toast("error", "Fix the highlighted fields first."); return; }
    setBusy(true); setNotConfigured(null);
    try {
      const body: any = { params: toParams(f) };
      if (f.mode === "scheduled") { body.schedule = f.schedule; body.save_as = f.saveName.trim(); }
      const job = await api<Job>("/jobs", { method: "POST", json: body });
      setJobId(job.id); refreshRecent();
      toast("success", f.mode === "scheduled" ? `Discovery started and scheduled ${f.schedule}` : "Discovery started — watch live progress on the right");
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "youtube_not_configured") setNotConfigured(err.message);
      toast("error", err.message);
    } finally { setBusy(false); }
  };

  const saveOnly = async () => {
    setTouched(true);
    if (errors.keywords || errors.maxSubs || errors.limit) { toast("error", "Fix the highlighted fields first."); return; }
    const name = window.prompt("Name this saved search");
    if (!name?.trim()) return;
    try { await api("/saved-searches", { method: "POST", json: { name: name.trim(), params: toParams(f), schedule: "none" } }); toast("success", "Saved — find it under Saved Searches"); }
    catch (e: any) { toast("error", e.message); }
  };

  const show = (k: string) => (touched ? errors[k] : undefined);
  return (
    <div>
      <PageHeader eyebrow="Core product" title="Lead Generator" sub="Configure a discovery run. It executes as a real background job against the official YouTube Data API — progress on the right is read from the job record, never simulated." />
      {(notConfigured || (st && !st.youtube_configured)) && (
        <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-[#C6A46B]/30 bg-[#C6A46B]/[0.07] p-4 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#6E5420]" />
          <div><p className="font-semibold text-[#6E5420]">Search is being prepared</p>
            <p className="mt-1 text-mute">Set <code className="data rounded bg-ink/10 px-1">YOUTUBE_API_KEY</code> in <code className="data rounded bg-ink/10 px-1">backend/.env</code> and restart the API. You can still configure and validate searches now. <Link href="/integrations" className="text-forest underline">Setup guide →</Link></p></div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Panel><PanelHeader title="Describe who you want" sub="Plain language in, editable criteria out. Nothing runs until you press Generate." icon={<Wand2 size={16} />} />
            <div className="space-y-3 px-5 pb-5">
              <form onSubmit={(e) => { e.preventDefault(); interpret(); }} className="flex flex-col gap-2 sm:flex-row">
                <input aria-label="Describe the creators you want" className="field !rounded-full" value={nl} maxLength={600} onChange={(e) => setNl(e.target.value)} placeholder="e.g. UK fitness creators with 10k–100k subscribers and a public email" />
                <button className="btn-primary btn-sm shrink-0" disabled={parsing || nl.trim().length < 3}><Sparkles size={13} /> {parsing ? "Reading…" : "Interpret"}</button>
              </form>
              {proposal && (
                <div role="status" className="rounded-xl border border-forest/25 bg-forest/5 p-3.5 text-sm">
                  <p className="flex flex-wrap items-center gap-2 text-xs"><Badge tone={proposal.source.startsWith("ai") ? "purple" : "neutral"}>{proposal.source.startsWith("ai") ? `AI · ${proposal.source.slice(3)}` : "Built-in rules (no AI provider needed)"}</Badge><span className="text-mute">Proposed criteria — review before applying</span></p>
                  {Object.keys(proposal.criteria).length === 0 ? <p className="mt-2 text-mute">I couldn’t extract any criteria from that. Try mentioning a topic, a country or a subscriber range.</p> : (
                    <dl className="mt-2.5 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">{Object.entries(proposal.criteria).map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="label !text-[10px]">{k.replace(/_/g, " ")}</dt><dd className="data text-[12.5px]">{Array.isArray(v) ? v.join(", ") : String(v)}</dd></div>)}</dl>)}
                  {proposal.dropped.length > 0 && <p className="mt-2 text-[11px] text-dim">Ignored invalid fields: {proposal.dropped.join(", ")}</p>}
                  {proposal.note && <p className="mt-2 text-[11px] text-dim">{proposal.note}</p>}
                  <div className="mt-3 flex gap-2"><button className="btn-primary btn-sm" onClick={applyProposal} disabled={Object.keys(proposal.criteria).length === 0}>Apply to form</button><button className="btn-ghost btn-sm" onClick={() => setProposal(null)}>Dismiss</button></div>
                </div>)}
            </div>
          </Panel>

          <Panel><PanelHeader title="Discovery mode" sub="How aggressively to search" />
            <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Discovery mode">
              {MODES.map((m) => { const I = m.icon, on = f.mode === m.id; return (
                <button key={m.id} role="radio" aria-checked={on} onClick={() => set("mode", m.id)}
                  className={cn("relative rounded-xl border p-3.5 text-left transition", on ? "border-forest bg-forest/15 shadow-lift" : "border-forest/15 bg-bg/40 hover:border-forest/50 hover:bg-forest-50")}>
                  <span className={cn("mb-2 grid h-8 w-8 place-items-center rounded-lg", on ? "bg-forest text-paper" : "bg-ink/5 text-forest")}><I size={16} /></span>
                  <span className="block font-heading text-[13px] font-semibold">{m.label}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-mute">{m.desc}</span>
                </button>); })}
            </div>
            {f.mode === "scheduled" && (
              <div className="grid gap-4 border-t border-forest/10 px-5 py-4 sm:grid-cols-2">
                <Field label="Schedule name"><input className="field" value={f.saveName} onChange={(e) => set("saveName", e.target.value)} placeholder="e.g. Weekly UK tech creators" maxLength={160} /><Err m={show("saveName")} /></Field>
                <Field label="Repeat" hint="Runs once now, then on this schedule while the API is running."><select className="field" value={f.schedule} onChange={(e) => set("schedule", e.target.value as Form["schedule"])}><option value="hourly">Every hour</option><option value="daily">Every day</option><option value="weekly">Every week</option></select></Field>
              </div>
            )}
          </Panel>

          <Panel><PanelHeader title="Search configuration" sub="What to look for" />
            <div className="grid gap-4 px-5 pb-5 md:grid-cols-2">
              <div className="md:col-span-2"><span className="label mb-1.5 block">Discovery source</span>
                <Segmented label="Discovery source" value={f.source} onChange={(v) => set("source", v)} options={[{ value: "channels", label: "Channel search" }, { value: "videos", label: "Video-based" }, { value: "topics", label: "Topic-based" }]} />
                <p className="mt-1.5 text-[11.5px] text-dim">{{ channels: "Search channels directly by keyword.", videos: "Search videos on the topic and collect the creators who made them.", topics: "Expand each keyword/niche into sub-topics (tips, how to, for beginners, review…)." }[f.source]}</p></div>
              <Field label="Keywords" className="md:col-span-2" hint="Press Enter or comma after each. Example: fpv drone, camera review"><TagInput label="Keywords" value={f.keywords} onChange={(v) => set("keywords", v)} placeholder="Add keywords…" /><Err m={show("keywords")} />
                <div className="mt-2 flex flex-wrap items-center gap-2"><button type="button" onClick={suggest} disabled={ideating} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-[11.5px] font-semibold hover:border-forest/40"><Lightbulb size={12} className="text-gold-text" />{ideating ? "Thinking…" : "Suggest related keywords"}</button>
                  {ideas?.keywords.map((k) => <button type="button" key={k} onClick={() => set("keywords", Array.from(new Set([...f.keywords, k])).slice(0, 20))} className="rounded-full bg-forest/10 px-2.5 py-1 text-[11.5px] font-semibold text-forest hover:bg-forest/20">+ {k}</button>)}</div>
                {ideas && <p className="mt-1 text-[11px] text-dim">{ideas.source.startsWith("ai") ? `Suggested by ${ideas.source.slice(3)} — review before adding.` : "Rule-based variations."} {ideas.note}</p>}</Field>
              <Field label="Similar to these videos (optional)" className="md:col-span-2" hint="Paste YouTube video links. TubeLead reads their titles and tags and finds creators covering the same ground."><TagInput label="Seed videos" value={f.seedVideos} onChange={(v) => set("seedVideos", v)} placeholder="https://youtube.com/watch?v=…" max={10} /></Field>
              <Field label="Niches"><MultiSelect label="Niches" placeholder="Select niches" options={NICHES.map((n) => ({ value: n, label: n }))} value={f.niches} onChange={(v) => set("niches", v)} /><Err m={show("niches")} /></Field>
              <Field label={f.mode === "worldwide" ? "Countries (ignored in worldwide mode)" : "Countries"}>
                <MultiSelect label="Countries" placeholder={f.mode === "worldwide" ? "Worldwide — 14 regions" : "Any country"} options={COUNTRIES.map((c) => ({ value: c.code, label: `${flag(c.code)} ${c.name}`, group: c.region }))} value={f.mode === "worldwide" ? [] : f.countries} onChange={(v) => set("countries", v)} />
              </Field>
              <div className="md:col-span-2"><span className="label mb-1.5 block">Regional targeting</span>
                <div className="flex flex-wrap gap-2">{REGIONS.map((r) => { const on = regionCodes(r).every((c) => f.countries.includes(c)); return (
                  <button key={r} type="button" aria-pressed={on} disabled={f.mode === "worldwide"} onClick={() => toggleRegion(r)} className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-40", on ? "border-forest bg-forest/25 text-forest" : "border-forest/20 text-mute hover:border-forest/60 hover:text-ink")}>{r}</button>); })}</div></div>
            </div>
          </Panel>

          <Panel><PanelHeader title="Qualification filters" sub="Only creators passing every filter are saved" />
            <div className="grid gap-4 px-5 pb-5 md:grid-cols-2">
              <Field label="Minimum subscribers"><input className="field data" type="number" min={0} value={f.minSubs} onChange={(e) => set("minSubs", Math.max(0, Number(e.target.value)))} />
                <div className="mt-1.5 flex flex-wrap gap-1.5">{SUB_PRESETS.map((n) => <button type="button" key={n} onClick={() => set("minSubs", n)} className={cn("rounded-md px-2 py-0.5 text-[11px] ring-1", f.minSubs === n ? "bg-forest/15 text-forest ring-forest" : "text-mute ring-ink/10 hover:text-ink")}>{fmtK(n)}</button>)}</div><Err m={show("minSubs")} /></Field>
              <Field label="Maximum subscribers" hint="Leave empty for no maximum"><input className="field data" type="number" min={0} value={f.maxSubs} placeholder="No maximum" onChange={(e) => set("maxSubs", e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))} />
                <div className="mt-1.5 flex flex-wrap gap-1.5">{SUB_PRESETS.slice(2).map((n) => <button type="button" key={n} onClick={() => set("maxSubs", n)} className={cn("rounded-md px-2 py-0.5 text-[11px] ring-1", f.maxSubs === n ? "bg-forest/15 text-forest ring-forest" : "text-mute ring-ink/10 hover:text-ink")}>{fmtK(n)}</button>)}</div><Err m={show("maxSubs")} /></Field>
              <Field label={`Engagement threshold — ${f.minEng.toFixed(1)}%`} hint="(likes + comments) ÷ views over recent videos. 0 = off. Channels with no readable data fail a non-zero threshold.">
                <input type="range" aria-label="Engagement threshold" min={0} max={10} step={0.5} value={f.minEng} onChange={(e) => set("minEng", Number(e.target.value))} className="w-full accent-forest" /></Field>
              <Field label="Number of leads requested"><input className="field data" type="number" min={1} max={500} value={f.limit} onChange={(e) => set("limit", Math.round(Number(e.target.value)))} /><Err m={show("limit")} /></Field>
              <div><span className="label mb-1.5 block">Creator type <span className="normal-case tracking-normal text-dim">(name heuristic)</span></span><Segmented label="Creator type" value={f.creatorType} onChange={(v) => set("creatorType", v)} options={[{ value: "any", label: "Any" }, { value: "creator", label: "Individual creator" }, { value: "brand", label: "Brand / media" }]} /></div>
              <div><span className="label mb-1.5 block">Channel activity</span><Segmented label="Channel activity" value={f.activity} onChange={(v) => set("activity", v)} options={[{ value: "any", label: "Any" }, { value: "active", label: "Active ≤30d" }, { value: "recent", label: "Recent ≤120d" }, { value: "dormant", label: "Dormant" }]} /></div>
              <Switch checked={f.requireEmail} onChange={(v) => set("requireEmail", v)} label="Business contact available" hint="Only keep channels with a publicly published email" />
              <Switch checked={f.requireWebsite} onChange={(v) => set("requireWebsite", v)} label="Public website available" hint="Only keep channels that link a website" />
              <Field label="Advanced · max API units for this job" hint="A search page costs 100 units. The job stops when the cap is reached." className="md:col-span-2"><input className="field data" type="number" min={100} max={10000} step={100} value={f.maxQuota} onChange={(e) => set("maxQuota", Math.min(10000, Math.max(100, Number(e.target.value))))} /></Field>
            </div>
          </Panel>

          <Panel glow className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm">
                {estimate ? (<><p className="font-semibold">{estimate.search_operations} search operation{estimate.search_operations === 1 ? "" : "s"} planned</p>
                  <p className="text-xs text-mute">Worst case <span className="data text-ink">{estimate.max_quota_units.toLocaleString()}</span> units · this job is capped at <span className="data text-ink">{estimate.capped_at.toLocaleString()}</span></p>
                  {estimate.capped_at < 100 + Math.min(f.limit * 2, 150) && <p role="alert" className="mt-1 text-xs text-[#6E5420]">The cap is too low: one search page costs 100 units, and enrichment needs ~2 per creator. Raise “max API units” under Qualification filters or the job will stop before it can qualify anyone.</p>}</>)
                  : <p className="text-mute">Add keywords or niches to preview the plan and quota cost.</p>}
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="btn-ghost" onClick={saveOnly}><Save size={15} /> Save search</button>
                <button className="btn-primary pill-forest !px-10 !py-4 !text-sm" onClick={submit} disabled={busy} aria-label="Generate leads"><Rocket size={18} /> {busy ? "Starting…" : "Generate Leads"}</button>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <Panel glow={!!jobId}>
            <PanelHeader title="Discovery progress" sub="Real job state, refreshed every 1.5 s" icon={<Layers size={16} />} />
            {jobId ? <JobMonitor jobId={jobId} compact /> : <EmptyState title="No job running" body="Press Generate Leads to start a background discovery. Counters here come straight from the job record." />}
          </Panel>
          {recent && recent.filter((j) => !j.is_demo).length > 0 && (
            <Panel><PanelHeader title="Recent runs" action={<Link href="/discovery-engine" className="text-xs font-semibold text-forest hover:underline">All jobs →</Link>} />
              <ul className="divide-y divide-line pb-2">{recent.filter((j) => !j.is_demo).slice(0, 4).map((j) => (
                <li key={j.id}><button onClick={() => setJobId(j.id)} className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left text-sm transition hover:bg-forest-50">
                  <span className="truncate">{[...(j.params.keywords ?? []), ...(j.params.niches ?? [])].slice(0, 3).join(", ") || "Discovery"}</span>
                  <span className="flex shrink-0 items-center gap-2"><span className="data text-xs text-mute">{j.qualified} leads</span><Badge tone={j.status === "completed" ? "green" : j.status === "failed" ? "red" : "cyan"}>{j.status}</Badge></span></button></li>))}</ul></Panel>
          )}
        </div>
      </div>
    </div>
  );
}

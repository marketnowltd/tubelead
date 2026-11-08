"use client";
import { ArrowRight, Check, Mail, Search, Wand2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "../ui/cn";
import { COUNTRY_NAME, NICHES, SAMPLE, k } from "@/lib/sample";
import { AvatarTile, ContactBadge, Reveal, SampleTag, ScoreDial, SectionHead } from "./bits";

/* ---------- Creator tile strip (marquee) ---------- */
export function CreatorStrip() {
  const row = [...SAMPLE, ...SAMPLE];
  return (
    <section aria-label="Sample creator types" className="border-y border-line bg-bg2/60 py-5">
      <div className="relative overflow-hidden" style={{ maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)" }}>
        <ul className="flex w-max animate-marquee gap-3 motion-reduce:animate-none">
          {row.map((c, i) => (
            <li key={i} aria-hidden={i >= SAMPLE.length} className="flex items-center gap-3 rounded-2xl border border-line bg-panel py-2 pl-2 pr-5">
              <AvatarTile c={c} size={42} />
              <div><p className="text-[13px] font-bold leading-tight">{c.name}</p><p className="text-[11px] text-mute">{c.niche} · <span className="data">{k(c.subs)}</span></p></div>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-center text-[11px] text-dim">Fictional sample creators, shown for illustration.</p>
    </section>
  );
}

/* ---------- 02 Interactive generator demo ---------- */
const SUBS = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000];
export function GeneratorDemo() {
  const [niche, setNiche] = useState<string>("Fitness");
  const [country, setCountry] = useState<string>("GB");
  const [min, setMin] = useState(1);   // index into SUBS
  const [max, setMax] = useState(6);
  const [email, setEmail] = useState(true);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<string | null>(null);

  const results = useMemo(() => SAMPLE.filter((c) =>
    (niche === "Any" || c.niche === niche) && (country === "Any" || c.country === country) &&
    c.subs >= SUBS[min] && c.subs <= SUBS[Math.max(max, min)] && (!email || c.contact === "publicly_published")).sort((a, b) => b.score - a.score), [niche, country, min, max, email]);
  // Same arithmetic the real engine uses for its preview: one 100-unit search per query (+1 per 50 channels, ~2 per candidate).
  const ops = (niche === "Any" ? 1 : 1) * (country === "Any" ? 1 : 1) + 1;
  const units = ops * 101 + 120;

  const interpret = () => {
    const t = text.toLowerCase();
    const n = NICHES.find((x) => t.includes(x.toLowerCase().split(" ")[0])) ?? null;
    const cc = Object.entries(COUNTRY_NAME).find(([c, name]) => t.includes(name.toLowerCase()) || t.includes(` ${c.toLowerCase()} `) || (c === "GB" && /\buk\b/.test(t)) || (c === "US" && /\busa?\b/.test(t)))?.[0] ?? null;
    if (n) setNiche(n); if (cc) setCountry(cc);
    setEmail(/email/.test(t));
    const m = t.match(/(\d+)\s*k?\s*(?:-|to|–)\s*(\d+)\s*k/);
    if (m) {
      const lo = SUBS.findIndex((s) => s >= +m[1] * 1000), hi = SUBS.map((s) => s <= +m[2] * 1000).lastIndexOf(true);
      if (lo >= 0) setMin(lo); if (hi >= 0) setMax(hi);
    }
    setParsed(`${n ?? "Any niche"} · ${cc ? COUNTRY_NAME[cc] : "Any country"}${/email/.test(t) ? " · public email" : ""}`);
  };

  return (
    <section id="demo" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <SectionHead n="01" eyebrow="Lead generator" title={<>Say who you want. <span className="italic-accent">Watch</span> the list take shape.</>} sub="Try the generator below. It works on a small set of fictional sample creators so you can feel the workflow before you sign up — the real engine runs the same criteria against live YouTube data." />
        <Reveal>
          <div className="panel grid overflow-hidden lg:grid-cols-[400px_1fr]">
            <div className="space-y-5 border-b border-line bg-bg2/50 p-5 sm:p-6 lg:border-b-0 lg:border-r">
              <form onSubmit={(e) => { e.preventDefault(); interpret(); }} className="space-y-2">
                <label htmlFor="nl" className="label flex items-center gap-1.5"><Wand2 size={12} /> Describe it in words</label>
                <div className="flex gap-2"><input id="nl" className="field !rounded-full" value={text} onChange={(e) => setText(e.target.value)} placeholder="UK tech creators, 10k–100k, with email" /><button className="btn-primary !px-4 !py-2 !text-[11px]">Parse</button></div>
                {parsed && <p className="text-[11.5px] text-moss" role="status">Understood: {parsed}. You can edit everything below before anything runs.</p>}
              </form>
              <div><p className="label mb-2">Niche</p>
                <div className="flex flex-wrap gap-1.5">{["Any", ...NICHES.slice(0, 6)].map((n) => <button key={n} aria-pressed={niche === n} onClick={() => setNiche(n)} className={cn("rounded-full border px-3 py-1.5 text-[12px] font-semibold transition", niche === n ? "border-forest bg-forest text-paper" : "border-line bg-panel text-mute hover:border-forest/40 hover:text-ink")}>{n}</button>)}</div></div>
              <div><p className="label mb-2">Country</p>
                <div className="flex flex-wrap gap-1.5">{["Any", ...Object.keys(COUNTRY_NAME)].map((c) => <button key={c} aria-pressed={country === c} onClick={() => setCountry(c)} className={cn("rounded-full border px-3 py-1.5 text-[12px] font-semibold transition", country === c ? "border-forest bg-forest text-paper" : "border-line bg-panel text-mute hover:border-forest/40 hover:text-ink")}>{c}</button>)}</div></div>
              <div className="grid grid-cols-2 gap-4">
                <label className="block"><span className="label mb-1.5 block">Min subscribers</span><input type="range" min={0} max={6} value={min} onChange={(e) => setMin(+e.target.value)} className="w-full accent-forest" aria-label="Minimum subscribers" /><span className="data text-[12px]">{k(SUBS[min])}</span></label>
                <label className="block"><span className="label mb-1.5 block">Max subscribers</span><input type="range" min={0} max={6} value={max} onChange={(e) => setMax(+e.target.value)} className="w-full accent-forest" aria-label="Maximum subscribers" /><span className="data text-[12px]">{k(SUBS[Math.max(max, min)])}</span></label>
              </div>
              <button role="switch" aria-checked={email} onClick={() => setEmail(!email)} className="flex w-full items-center justify-between rounded-xl border border-line bg-panel px-4 py-3 text-left text-[13px] font-semibold">
                <span className="flex items-center gap-2"><Mail size={15} className="text-forest" /> Require a publicly published email</span>
                <span className={cn("h-6 w-11 rounded-full p-0.5 transition", email ? "bg-forest" : "bg-ink/20")}><span className={cn("block h-5 w-5 rounded-full bg-paper transition", email && "translate-x-5")} /></span>
              </button>
              <div className="rounded-xl border border-dashed border-forest/30 bg-forest/5 p-3.5 text-[12.5px] text-mute">
                <p className="font-semibold text-ink">Estimated for a real run</p>
                <p className="data mt-1">{ops} search operations · ≈{units.toLocaleString()} YouTube units</p>
                <p className="mt-1 text-[11.5px]">Quota is shown before you start, and every job has a hard cap.</p>
              </div>
            </div>

            <div className="p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="font-heading text-lg font-bold" aria-live="polite"><span className="data">{results.length}</span> matching creator{results.length === 1 ? "" : "s"}</p><SampleTag />
              </div>
              {results.length === 0 ? (
                <div className="grid place-items-center rounded-2xl border border-dashed border-line py-16 text-center"><Search size={22} className="text-quiet" /><p className="mt-3 font-semibold">No sample creators match</p><p className="mt-1 max-w-xs text-sm text-mute">Widen the subscriber range or switch off the email requirement.</p></div>
              ) : (
                <ul className="space-y-2.5">
                  {results.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 rounded-2xl border border-line bg-panel px-3.5 py-3 transition hover:border-forest/30 hover:shadow-card">
                      <AvatarTile c={c} size={44} />
                      <div className="min-w-0 flex-1"><p className="truncate font-bold">{c.name}</p><p className="truncate text-[12px] text-mute">{c.niche} · {COUNTRY_NAME[c.country]} · <span className="data">{k(c.subs)}</span> subs · {c.engagement}% engagement</p></div>
                      <span className="hidden md:block"><ContactBadge kind={c.contact} /></span><ScoreDial score={c.score} size={42} />
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <p className="text-[12.5px] text-mute">Run these exact criteria on live YouTube data.</p>
                <Link href="/signup?next=/lead-generator" className="btn-primary btn-sm">Run it for real <ArrowRight size={13} /></Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- 03 How it works ---------- */
const STEPS = [
  ["Describe", "Type who you want, or set filters by hand: keywords, niches, countries, audience size, activity, contact route. The AI assistant turns plain language into criteria you review first."],
  ["Discover", "The engine expands your keywords, searches YouTube through the official API, removes duplicates and respects your quota. Pause, resume or cancel any run."],
  ["Qualify", "Every channel is scored against your criteria with a visible breakdown. Public descriptions and official websites are checked for business contact routes."],
  ["Connect", "Group the best leads into campaigns, export CSV, or hand them to SendLoom for outreach. You stay in control of every message."],
] as const;
export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 bg-bg2/60 py-24">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <SectionHead n="02" eyebrow="How it works" title={<>From a sentence to a <span className="italic-accent">qualified</span> list in four steps.</>} />
        <ol className="relative grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <div aria-hidden className="absolute left-0 right-0 top-[34px] hidden h-px bg-line lg:block" />
          {STEPS.map(([t, d], i) => (
            <Reveal key={t} delay={i * 0.08}>
              <li className="panel relative h-full p-6">
                <span className="data relative grid h-[68px] w-[68px] place-items-center rounded-full border border-line bg-bg text-xl font-semibold text-forest">0{i + 1}</span>
                <h3 className="mt-5 font-display text-xl font-extrabold tracking-tight">{t}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-mute">{d}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------- 04 Discovery capabilities ---------- */
export function Capabilities() {
  const caps = [
    ["Keyword expansion", "One seed becomes dozens of related searches, with optional AI suggestions you approve.", ["fitness", "home workouts", "calisthenics", "kettlebell basics"]],
    ["Video-based discovery", "Start from a video you admire. TubeLead finds creators covering the same ground.", ["youtube.com/watch?v=…"]],
    ["Topic-based discovery", "Expand a niche into sub-topics and sweep them in one run.", ["tips", "how to", "for beginners", "review"]],
    ["Multi-niche & worldwide", "Run several niches across many regions at once.", ["GB", "US", "DE", "BR", "JP", "IN"]],
  ];
  return (
    <section className="py-24">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <SectionHead n="03" eyebrow="Discovery capabilities" title={<>An engine built to <span className="italic-accent">finish</span> the job.</>} sub="Searching is the cheap part. Doing it at scale without waste is the hard part — so the engine is quota-aware, de-duplicated and observable." />
        <div className="grid gap-5 lg:grid-cols-12">
          {caps.map(([t, d, chips], i) => (
            <Reveal key={t as string} delay={i * 0.06} className={cn("lg:col-span-6")}>
              <div className="panel panel-lift h-full p-6"><h3 className="font-display text-xl font-extrabold tracking-tight">{t as string}</h3><p className="mt-2 text-[14.5px] text-mute">{d as string}</p>
                <div className="mt-5 flex flex-wrap gap-2">{(chips as string[]).map((c) => <span key={c} className="data rounded-full bg-bg2 px-3 py-1 text-[12px] text-ink ring-1 ring-line">{c}</span>)}</div></div>
            </Reveal>
          ))}
          <Reveal className="lg:col-span-7">
            <div className="panel h-full p-6"><h3 className="font-display text-xl font-extrabold tracking-tight">Dedupe & quota, visible</h3><p className="mt-2 text-[14.5px] text-mute">Every run reports exactly what happened — measured, never estimated after the fact.</p>
              <div className="mt-6 space-y-3">
                {[["Channels found", 1284, "bg-forest"], ["Unique", 971, "bg-forest-400"], ["Qualified", 214, "bg-terracotta"], ["Duplicates removed", 313, "bg-gold"]].map(([l, v, c]) => (
                  <div key={l as string}><div className="mb-1 flex justify-between text-[12.5px]"><span className="text-mute">{l as string}</span><span className="data font-semibold">{(v as number).toLocaleString()}</span></div><div className="h-2.5 rounded-full bg-ink/[0.07]"><div className={cn("h-full rounded-full", c as string)} style={{ width: `${((v as number) / 1284) * 100}%` }} /></div></div>))}
              </div><p className="mt-4 text-[11px] text-dim">Illustrative run.</p></div>
          </Reveal>
          <Reveal className="lg:col-span-5">
            <div className="h-full rounded-[18px] bg-forest p-6 text-paper"><h3 className="font-display text-xl font-extrabold tracking-tight">Controls you&rsquo;d expect from a real tool</h3>
              <ul className="mt-5 space-y-3 text-[14px]">{["Pause, resume and cancel any run", "Scheduled and repeating discovery", "Daily quota monitor with a protected reserve", "Graceful stop when quota is exhausted", "Full run history and logs"].map((x) => <li key={x} className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-gold" />{x}</li>)}</ul></div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

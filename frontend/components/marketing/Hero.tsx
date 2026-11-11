"use client";
import { motion } from "motion/react";
import { ArrowRight, Gauge, Layers, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { SAMPLE, k } from "@/lib/sample";
import { SEARCH_SOURCES } from "@/content/site";
import { SOURCE_LOGOS } from "@/content/logos";
import { AvatarTile, ContactBadge, ScoreDial, SampleTag } from "./bits";

const ROWS = [SAMPLE[0], SAMPLE[3], SAMPLE[10], SAMPLE[7]];
const QUERY = "UK fitness creators, 10K–100K subscribers, public email";

export function Hero() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grain opacity-60" aria-hidden />
      <div className="relative mx-auto grid max-w-[1240px] grid-cols-[minmax(0,1fr)] items-center gap-14 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:pb-24 lg:pt-16">
        <div>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="label mb-6 inline-flex max-w-full items-start gap-2 rounded-2xl border border-line bg-panel px-3.5 py-1.5 !text-[11px] leading-snug text-forest">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-moss" /> Official YouTube Data API · public business contacts only
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-[clamp(2.5rem,5.2vw,4.4rem)] font-extrabold leading-[0.98] tracking-[-0.045em] text-balance">
            Find Your Next <span className="italic-accent">100</span> Customers.
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.7 }} className="mt-6 max-w-xl text-[18px] leading-relaxed text-mute">
            Discover businesses, identify sales opportunities and uncover qualified prospects across the internet — all from one powerful platform.
          </motion.p>
          <motion.form initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }} onSubmit={(e) => { e.preventDefault(); const q = query.trim(); router.push(`/signup?next=${encodeURIComponent("/lead-generator" + (q ? `?q=${encodeURIComponent(q)}` : ""))}`); }}
            className="mt-9 flex max-w-xl flex-col gap-2.5 rounded-2xl border border-line bg-panel p-2 shadow-card sm:flex-row sm:items-center" role="search">
            <label className="flex min-w-0 flex-1 items-center gap-2.5 px-3"><Search size={18} className="shrink-0 text-forest" aria-hidden />
              <span className="sr-only">Search creators or niche</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. UK fitness creators with email" className="w-full min-w-0 bg-transparent py-2.5 text-[15px] outline-none placeholder:text-dim" /></label>
            <button className="btn-primary !px-6 !py-3 !text-[12px]">Start Finding Leads <ArrowRight size={14} /></button>
          </motion.form>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34 }} className="mt-5 flex flex-wrap items-center gap-3.5">
            <a href="#how" className="btn-ghost">Explore How It Works <ArrowRight size={15} /></a>
          </motion.div>
          <div className="mt-8" aria-label="Sources TubeLead searches">
            <p className="label mb-2.5 !text-[11px] text-dim">Searches across</p>
            <ul className="flex flex-wrap gap-2">
              {SEARCH_SOURCES.map((src) => {
                const logo = SOURCE_LOGOS[src.key];
                const live = src.status === "live";
                return (
                  <li key={src.name} title={src.detail} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-semibold ${live ? "border-moss/30 bg-panel text-ink" : "border-line bg-panel text-mute"}`}>
                    {logo && <svg role="img" aria-label={`${src.name} logo`} viewBox="0 0 24 24" className={`h-3.5 w-3.5 shrink-0 ${live ? "" : "opacity-50"}`}><path d={logo.path} fill={logo.hex} /></svg>}
                    {src.name}
                    {live ? <span className="rounded-full bg-moss/10 px-1.5 text-[9.5px] font-bold uppercase tracking-wider text-moss">Live</span> : <span className="text-[9.5px] font-bold uppercase tracking-wider text-dim">Soon</span>}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2.5 text-[12px] text-dim">Multi-source search is included from the Pro plan. Logos are trademarks of their owners; TubeLead is not affiliated with or endorsed by them.</p>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-8 gap-y-2 text-[13px] text-mute">
            {["25 free leads, no card", "Duplicates removed automatically", "Public contacts only"].map((t) => <li key={t} className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-terracotta" />{t}</li>)}
          </ul>
        </div>

        {/* Product preview */}
        <motion.div initial={{ opacity: 0, y: 30, rotate: 0 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="relative mx-auto w-full max-w-[560px]" aria-label="Product preview">
          <div className="absolute -inset-6 -z-10 rounded-[40px] bg-bg2" aria-hidden />
          <div className="panel overflow-hidden shadow-pop">
            <div className="flex items-center gap-1.5 border-b border-line bg-bg2/60 px-4 py-2.5">
              {["#E4DED2", "#E4DED2", "#E4DED2"].map((c, i) => <i key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />)}
              <span className="data ml-3 text-[11px] text-dim">tubelead.app / discover</span>
              <SampleTag className="ml-auto" />
            </div>
            <div className="space-y-3.5 p-4 sm:p-5">
              <div className="flex items-center gap-2 rounded-full border border-line bg-bg px-4 py-2.5">
                <Search size={16} className="shrink-0 text-forest" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink sm:text-sm">
                  {QUERY.split("").map((ch, i) => <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 + i * 0.022 }}>{ch}</motion.span>)}
                </span>
                <span className="rounded-full bg-forest px-3.5 py-1.5 text-[10.5px] font-bold uppercase tracking-wider text-paper">Search</span>
              </div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.2 }} className="flex flex-wrap gap-1.5 text-[11px]">
                {["GB", "10K–100K subs", "Public email", "Active · 30 days"].map((c) => <span key={c} className="rounded-full bg-forest/10 px-2.5 py-1 font-semibold text-forest">{c}</span>)}
                <span className="rounded-full bg-gold/20 px-2.5 py-1 font-semibold text-gold-text">Criteria parsed — review before running</span>
              </motion.div>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-panel">
                {ROWS.map((c, i) => (
                  <motion.li key={c.id} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 2.5 + i * 0.28 }} className="flex items-center gap-3 px-3.5 py-3">
                    <AvatarTile c={c} size={38} />
                    <div className="min-w-0 flex-1"><p className="truncate text-[13.5px] font-bold">{c.name}</p><p className="truncate text-[11.5px] text-mute">{c.niche} · {c.country} · <span className="data">{k(c.subs)}</span> subs</p></div>
                    <span className="hidden sm:block"><ContactBadge kind={c.contact} /></span>
                    <ScoreDial score={c.score} />
                  </motion.li>
                ))}
              </ul>
            </div>
          </div>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 3.4 }} className="panel absolute -bottom-9 -left-8 hidden w-48 p-3 shadow-pop sm:block animate-floaty">
            <p className="label flex items-center gap-1.5 !text-[10px]"><Layers size={12} className="text-terracotta-text" /> Duplicates</p>
            <p className="mt-1 font-display text-[15px] font-bold leading-snug">Removed automatically</p><p className="text-[11px] text-mute">every creator is saved once</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 3.6 }} className="panel absolute -right-3 -top-5 hidden w-44 p-3 shadow-pop sm:block">
            <p className="label flex items-center gap-1.5 !text-[10px]"><Gauge size={12} className="text-gold-text" /> Quota</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10"><div className="h-full w-[42%] rounded-full bg-forest" /></div>
            <p className="mt-1.5 text-[11px] text-mute">Each search has a limit</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 3.8 }} className="panel absolute -bottom-7 right-4 hidden p-3 shadow-pop sm:flex sm:items-center sm:gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-forest text-paper"><Sparkles size={15} /></span>
            <p className="text-[12px] font-semibold leading-tight">Pause or resume<br /><span className="font-normal text-mute">any search, any time</span></p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

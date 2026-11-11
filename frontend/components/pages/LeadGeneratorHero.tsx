"use client";
import { motion } from "motion/react";
import { Mail, Rocket, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useReducedMotionSafe } from "@/components/ui/motion";
import { SourceIcon } from "@/components/ui/SourceIcon";

const SOURCES = ["youtube", "applepodcasts", "bluesky", "mastodon", "dailymotion", "google", "brave", "reddit", "twitch", "vimeo"];

/** The dashboard's main action: start a Lead Generator search. Hands the keywords and count to /lead-generator. */
export function LeadGeneratorHero() {
  const router = useRouter();
  const reduced = useReducedMotionSafe();
  const [q, setQ] = useState("");
  const [n, setN] = useState(25);
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(q.trim() ? `/lead-generator?q=${encodeURIComponent(q.trim())}&n=${n}` : "/lead-generator");
  };
  return (
    <section aria-labelledby="lg-hero-title" className="lg-hero relative mb-6 overflow-hidden rounded-[26px] p-5 sm:p-7">
      <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:items-center">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#7A2DFF]"><Target size={14} /> Lead Generator</p>
          <h2 id="lg-hero-title" className="mt-2 font-display text-[26px] font-extrabold leading-[1.08] tracking-tight text-[#1A0D2E] sm:text-[32px]">
            Find creators who publish their email.
          </h2>
          <p className="mt-2 max-w-md text-[13.5px] text-mute">Every lead comes with an email address the creator published themselves, and how many you get is up to you.</p>
          <ul className="mt-3 flex flex-wrap items-center gap-2" aria-label="Sources searched">
            {SOURCES.map((s) => <li key={s}><SourceIcon source={s} size={16} /></li>)}
            <li className="text-[11px] text-dim">+ more</li>
          </ul>
        </div>
        <form onSubmit={go} className="flex flex-col gap-3 rounded-[20px] border border-white/80 bg-white/80 p-3 shadow-card backdrop-blur sm:flex-row sm:items-center">
          <label htmlFor="lg-hero-q" className="sr-only">What creators are you looking for?</label>
          <input id="lg-hero-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. UK fitness creators" maxLength={200}
            className="field min-w-0 flex-1 !border-transparent !bg-transparent !text-[15px] focus:!border-[#7A2DFF]/40" />
          <select aria-label="How many leads" value={n} onChange={(e) => setN(Number(e.target.value))} className="field !w-full sm:!w-[124px]">
            {[10, 25, 50, 100].map((x) => <option key={x} value={x}>{x} leads</option>)}
          </select>
          <motion.button type="submit" className="lg-launch group" whileTap={reduced ? undefined : { scale: 0.96 }}>
            <span className="lg-launch-shine" aria-hidden />
            <Rocket size={18} className="lg-launch-rocket" aria-hidden />
            <span>Find Leads</span>
          </motion.button>
        </form>
      </div>
      <p className="relative mt-3 flex items-center gap-1.5 text-[11.5px] text-dim"><Mail size={12} /> Only people with a published email are returned. Nothing is guessed.</p>
    </section>
  );
}

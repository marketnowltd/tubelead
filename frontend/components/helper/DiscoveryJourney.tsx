"use client";
/**
 * While a discovery runs, the TubeLead Helper flies his rocket from planet to planet. Each planet is a real stage of
 * the job, read from the job record (the same live data as the progress panel), so the rocket never runs ahead of the
 * search: it reaches the last planet only when the results are complete.
 */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useReducedMotionSafe } from "@/components/ui/motion";
import { useApi } from "@/lib/api";
import type { Job } from "@/lib/types";
import { frameSrc } from "./sprites";

interface Planet { key: string; name: string; colours: [string, string]; ring?: boolean }
const PLANETS: Planet[] = [
  { key: "launch", name: "Launch pad", colours: ["#B9A6FF", "#7A2DFF"] },
  { key: "search", name: "Planet Search", colours: ["#FF8A8A", "#E81F76"], ring: true },
  { key: "filter", name: "Planet Filter", colours: ["#FFD27A", "#FF7A00"] },
  { key: "contact", name: "Planet Contact", colours: ["#8FE3C8", "#1E9E7A"], ring: true },
  { key: "sources", name: "Planet Everywhere", colours: ["#9ED0FF", "#2E6BFF"] },
  { key: "home", name: "Results", colours: ["#FFE58A", "#FFC300"], ring: true },
];

const active = (j?: Job) => !!j && ["queued", "running", "paused", "cancelling"].includes(j.status);

/** Which planet the job has reached, and what is happening there, from the job record only. */
function stage(job: Job, othersBusy: boolean, multiSource: boolean): { at: number; lines: string[] } {
  const limit = Number(job.params?.limit ?? 0) || 0;
  if (job.status === "failed" || job.status === "cancelled")
    return { at: Math.max(1, job.channels_found ? (job.enrich_total ? 3 : 2) : 1), lines: [job.status === "failed" ? "The search stopped: " + (job.error ?? "an error occurred") : "The search was cancelled."] };
  if (job.status === "completed") {
    if (multiSource && othersBusy) return { at: 4, lines: ["YouTube is done. Now checking the other sources' profiles, feeds and websites for published emails."] };
    return { at: 5, lines: [`Discovery complete: ${job.qualified} of ${limit || job.qualified} leads, ${job.contact_routes_found} contact routes found.`] };
  }
  if (job.enrich_total > 0)
    return { at: 3, lines: [`Reading channel descriptions, websites and contact pages for published emails: ${job.enriched} of ${job.enrich_total}.`,
      `${job.qualified} of ${limit} leads so far.`] };
  if (job.unique_found > 0)
    return { at: 2, lines: [`Checking ${job.unique_found} new channels against your filters (size, activity, public email).`,
      `${job.qualified} qualified, ${job.rejected} didn't match.`] };
  if (job.queries_done > 0 || job.channels_found > 0 || job.status === "running")
    return { at: 1, lines: [`Searching YouTube with the official API: ${job.queries_done} of ${job.queries_total} searches.`, job.current_operation || ""] };
  return { at: 0, lines: [job.status === "paused" ? "Paused. Resume to continue the journey." : "Planning the search: turning your keywords into YouTube searches."] };
}

function Rocket({ flame }: { flame: boolean }) {
  return (
    <svg viewBox="0 0 64 96" className="h-full w-full overflow-visible" aria-hidden>
      <defs>
        <linearGradient id="tl-rk-body" x1="0" x2="1"><stop offset="0" stopColor="#F3E9FF" /><stop offset="1" stopColor="#FFFFFF" /></linearGradient>
        <linearGradient id="tl-rk-fin" x1="0" x2="1"><stop offset="0" stopColor="#7A2DFF" /><stop offset="1" stopColor="#E81F76" /></linearGradient>
        <radialGradient id="tl-rk-flame" cx="0.5" cy="0.2" r="0.8"><stop offset="0" stopColor="#FFF6C2" /><stop offset="0.45" stopColor="#FFC300" /><stop offset="1" stopColor="#FF7A00" stopOpacity="0" /></radialGradient>
      </defs>
      {flame && <ellipse cx="32" cy="88" rx="9" ry="14" fill="url(#tl-rk-flame)"><animate attributeName="ry" values="12;16;12" dur="0.25s" repeatCount="indefinite" /></ellipse>}
      <path d="M14 58 L4 78 L18 72 Z" fill="url(#tl-rk-fin)" /><path d="M50 58 L60 78 L46 72 Z" fill="url(#tl-rk-fin)" />
      <path d="M32 2 C50 16 52 46 46 74 L18 74 C12 46 14 16 32 2 Z" fill="url(#tl-rk-body)" stroke="#1A0D2E" strokeWidth="2.5" />
      <path d="M32 2 C40 8 45 16 47 24 L17 24 C19 16 24 8 32 2 Z" fill="url(#tl-rk-fin)" stroke="#1A0D2E" strokeWidth="2.5" />
      <rect x="24" y="72" width="16" height="6" rx="2" fill="#1A0D2E" />
      <circle cx="32" cy="42" r="12.5" fill="#1A0D2E" stroke="#7A2DFF" strokeWidth="3" />
    </svg>
  );
}

export function DiscoveryJourney({ jobId, othersBusy, multiSource }: { jobId: string; othersBusy: boolean; multiSource: boolean }) {
  const reduced = useReducedMotionSafe();
  const { data: job } = useApi<Job>(`/jobs/${jobId}`, { refreshInterval: (j) => (active(j) ? 1500 : 0) });
  const s = useMemo(() => (job ? stage(job, othersBusy, multiSource) : { at: 0, lines: ["Preparing for launch…"] }), [job, othersBusy, multiSource]);
  const planets = multiSource ? PLANETS : PLANETS.filter((p) => p.key !== "sources");
  const at = multiSource ? s.at : s.at >= 4 ? s.at - 1 : s.at;
  const last = planets.length - 1;
  const done = at === last;
  const [arrived, setArrived] = useState(at);
  useEffect(() => { const t = setTimeout(() => setArrived(at), reduced ? 0 : 900); return () => clearTimeout(t); }, [at, reduced]);
  const pct = (i: number) => 9 + (i / last) * 82;  // planet positions across the strip, in %

  return (
    <section aria-label="Discovery journey" className="relative overflow-hidden rounded-[22px] text-white shadow-pop"
      style={{ background: "radial-gradient(120% 140% at 0% 0%, #3B1A7A 0%, #1A0D2E 55%, #0E0720 100%)" }}>
      {/* stars */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {Array.from({ length: 28 }).map((_, i) => (
          <motion.i key={i} className="absolute block rounded-full bg-white" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, width: i % 5 ? 2 : 3, height: i % 5 ? 2 : 3 }}
            animate={reduced ? undefined : { opacity: [0.2, 0.9, 0.2] }} transition={{ duration: 2 + (i % 4), repeat: Infinity, delay: (i % 7) * 0.3 }} />
        ))}
      </div>
      <div className="relative px-4 pb-4 pt-3.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">Discovery journey</p>
          <p className="text-[11px] text-white/60">{planets[at]?.name}</p>
        </div>
        <div className="relative mt-2 h-[132px]">
          {/* path */}
          <div aria-hidden className="absolute left-[9%] right-[9%] top-[86px] border-t-2 border-dashed border-white/20" />
          <motion.div aria-hidden className="absolute left-[9%] top-[85px] h-[3px] rounded-full" style={{ background: "linear-gradient(90deg,#7A2DFF,#E81F76,#FF7A00,#FFC300)" }}
            initial={false} animate={{ width: `${pct(at) - 9}%` }} transition={reduced ? { duration: 0 } : { duration: 0.9, ease: [0.45, 0, 0.2, 1] }} />
          {/* planets */}
          {planets.map((p, i) => {
            const reached = i <= arrived;
            const here = i === arrived;
            return (
              <div key={p.key} className="absolute top-[64px] -translate-x-1/2" style={{ left: `${pct(i)}%` }}>
                <motion.div className="relative grid h-11 w-11 place-items-center" animate={here && !reduced ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                  transition={{ duration: 1.6, repeat: here && !reduced ? Infinity : 0 }}>
                  <span className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle at 32% 30%, ${p.colours[0]}, ${p.colours[1]} 70%)`,
                    boxShadow: reached ? `0 0 18px 2px ${p.colours[1]}99` : "none", filter: reached ? "none" : "grayscale(0.7) brightness(0.55)" }} />
                  {p.ring && <span className="absolute h-3 w-[64px] -rotate-12 rounded-[50%] border-2" style={{ borderColor: reached ? `${p.colours[0]}cc` : "#ffffff33" }} />}
                  {reached && i < arrived && <span className="relative text-[13px] font-black text-white drop-shadow">✓</span>}
                </motion.div>
              </div>
            );
          })}
          {/* the helper's rocket */}
          <motion.div className="absolute top-[2px] h-[78px] w-[52px] -translate-x-1/2" initial={false}
            animate={{ left: `${pct(at)}%`, x: done ? -30 : 0, y: done ? 10 : 0, rotate: at !== arrived ? 72 : 0 }}
            transition={reduced ? { duration: 0 } : { left: { duration: 0.9, ease: [0.45, 0, 0.2, 1] }, rotate: { duration: 0.35 }, y: { duration: 0.5 } }}>
            <motion.div className="relative h-full w-full" animate={reduced || done ? undefined : { y: [0, -4, 0] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}>
              <Rocket flame={!done} />
              {/* the helper in the porthole */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={frameSrc("e_happy")} alt="TubeLead Helper" className="absolute left-1/2 top-[31%] h-[24px] w-[24px] -translate-x-1/2 rounded-full object-cover" />
            </motion.div>
          </motion.div>
          <AnimatePresence>
            {done && !reduced && (
              <motion.div key="burst" className="pointer-events-none absolute top-[60px]" style={{ left: `${pct(last)}%` }} initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {["#7A2DFF", "#E81F76", "#FF7A00", "#FFC300", "#7A2DFF", "#E81F76"].map((c, n) => {
                  const a = (n / 6) * Math.PI * 2;
                  return <motion.i key={n} className="absolute block h-1.5 w-1.5 rounded-[2px]" style={{ background: c }}
                    initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos(a) * 34, y: Math.sin(a) * 26, opacity: 0 }} transition={{ duration: 1.1 }} />;
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {/* the planet tells you what's happening under the hood */}
        <div className="mt-1 min-h-[52px] rounded-2xl border border-white/10 bg-white/[0.07] px-3.5 py-2.5 backdrop-blur" aria-live="polite">
          <p className="text-[12.5px] font-semibold leading-snug">{planets[at]?.name}</p>
          {s.lines.filter(Boolean).map((l, i) => <p key={i} className="text-[12px] leading-snug text-white/75">{l}</p>)}
        </div>
      </div>
    </section>
  );
}

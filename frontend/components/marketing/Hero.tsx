"use client";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, BadgeCheck, BarChart3, Briefcase, Check, Cpu, Dumbbell, Gamepad2, GraduationCap, Leaf, Music, PlayCircle, Search } from "lucide-react";
import Link from "next/link";
import { SAMPLE, k } from "@/lib/sample";
import { SEARCH_SOURCES } from "@/content/site";
import { SOURCE_LOGOS } from "@/content/logos";
import { AvatarTile, SampleTag } from "./bits";

const ROWS = [SAMPLE[0], SAMPLE[3], SAMPLE[10]];
const QUERY = "UK fitness creators, 10K–100K subs";
const EASE = [0.22, 1, 0.36, 1] as const;
const GRADIENT = "linear-gradient(105deg,#d32de5 0%,#9a27f2 48%,#ff982e 100%)";
const next = (q?: string) => `/signup?next=${encodeURIComponent("/lead-generator" + (q ? `?q=${encodeURIComponent(q)}` : ""))}`;

const CATEGORIES = [
  { name: "Fitness", icon: Dumbbell }, { name: "Tech", icon: Cpu }, { name: "Lifestyle", icon: Leaf }, { name: "Gaming", icon: Gamepad2 },
  { name: "Business", icon: Briefcase }, { name: "Music", icon: Music }, { name: "Education", icon: GraduationCap },
];

const rise = (delay: number) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.7, ease: EASE } });

function Sparkline({ delay }: { delay: number }) {
  return (
    <svg viewBox="0 0 80 30" className="h-[5.9cqw] w-[15.4cqw] shrink-0" aria-hidden>
      <motion.path d="M2 26 C 14 24, 16 16, 28 18 S 44 8, 54 12 S 68 4, 78 3" fill="none" stroke="#19B87A" strokeWidth="2.4" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay, duration: 1.1, ease: "easeOut" }} />
    </svg>
  );
}

export function Hero() {
  const still = useReducedMotion();
  return (
    <>
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#fdfaff_0%,#f6edff_55%,#f8f4ff_100%)]">
        {/* drifting colour fields */}
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-48 h-[690px] w-[690px] rounded-full bg-[linear-gradient(135deg,rgba(119,70,245,.5),rgba(255,91,175,.28))] blur-[70px] motion-safe:animate-drift" />
        <div aria-hidden className="pointer-events-none absolute -bottom-64 right-[4%] h-[440px] w-[750px] rounded-full bg-[linear-gradient(90deg,rgba(243,72,210,.17),rgba(255,177,115,.3))] blur-[60px] motion-safe:animate-drift-slow" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_48%_55%,rgba(255,255,255,.6),transparent_35%)]" />

        <div className="relative mx-auto grid max-w-[1320px] grid-cols-[minmax(0,1fr)] items-center gap-10 py-12 pl-[max(20px,env(safe-area-inset-left,0px))] pr-[max(20px,env(safe-area-inset-right,0px))] sm:px-8 lg:grid-cols-[minmax(0,.96fr)_minmax(0,1.04fr)] lg:py-16">
          <div>
            <motion.p {...rise(0)} className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-forest/15 bg-white/90 px-4 py-2 text-[13.5px] font-semibold text-ink shadow-card">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" role="img" aria-label="YouTube logo"><path d={SOURCE_LOGOS.youtube.path} fill={SOURCE_LOGOS.youtube.hex} /></svg>
              Official YouTube Data API <Check size={15} strokeWidth={3} className="text-forest" aria-hidden />
            </motion.p>
            <motion.h1 {...rise(0.08)} className="font-display text-[clamp(2.3rem,4.3vw,3.8rem)] font-extrabold leading-[1] tracking-[-0.045em]">
              Discover the<br />
              <em className="bg-[linear-gradient(90deg,#f33b85,#9d29e9)] bg-clip-text pr-1 italic text-transparent">right</em> creators.<br />
              Without the<br />endless searching.
            </motion.h1>
            <motion.p {...rise(0.18)} className="mt-6 max-w-[560px] text-[18px] leading-relaxed text-mute">
              TubeLead helps you find, analyse and connect with YouTube creators at scale. Get real contacts, remove duplicates and discover high-value opportunities in minutes.
            </motion.p>
            <motion.div {...rise(0.28)} className="mt-9 flex flex-wrap items-center gap-4">
              <Link href={next()} className="group inline-flex items-center gap-3 rounded-full px-8 py-4 text-[15px] font-bold text-white shadow-[0_9px_22px_rgba(189,48,214,.28)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(189,48,214,.36)]" style={{ background: GRADIENT }}>
                Start Discovering <ArrowRight size={17} className="transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <a href="#how" className="inline-flex items-center gap-2.5 rounded-full border border-forest/40 bg-white/80 px-7 py-4 text-[15px] font-bold text-forest transition duration-300 hover:-translate-y-0.5 hover:border-forest hover:bg-white">
                <PlayCircle size={20} /> Explore the Platform
              </a>
            </motion.div>
            <motion.ul {...rise(0.38)} className="mt-8 flex flex-wrap gap-x-7 gap-y-2.5 text-[13.5px] font-medium text-ink">
              {["25 free leads, no card", "Duplicates removed automatically", "Bring your own AI key"].map((t) => (
                <li key={t} className="flex items-center gap-2"><span className="grid h-[19px] w-[19px] place-items-center rounded-full bg-[linear-gradient(120deg,#c02df0,#f06bd0)] text-white"><Check size={12} strokeWidth={3.5} /></span>{t}</li>
              ))}
            </motion.ul>
          </div>

          {/* Artwork with a live preview card over it */}
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 1, ease: EASE }} className="relative mx-auto w-full max-w-[760px] [container-type:inline-size]" aria-label="TubeLead creator discovery preview">
            <div className="relative aspect-[846/596] motion-safe:animate-floaty max-sm:mb-[12%]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/hero-art.webp" alt="Astronaut with a laptop on a purple planet" width={846} height={596} fetchPriority="high"
                className="absolute inset-0 h-full w-full select-none rounded-[28px] object-cover [mask-image:radial-gradient(ellipse_72%_74%_at_52%_48%,#000_58%,transparent_100%)]" draggable={false} />
              <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.9, ease: EASE }}
                className="absolute left-[26.5%] top-[13%] w-[71.5%] overflow-hidden max-sm:left-[3%] max-sm:top-[13%] max-sm:w-[94%] rounded-[3.2cqw] border border-white/80 bg-white/75 shadow-[0_2.5cqw_6cqw_rgba(96,45,170,.28)] backdrop-blur-xl">
                <div className="[container-type:inline-size]">
                <div className="flex items-center gap-[1.4cqw] border-b border-forest/10 bg-white/40 px-[3.64cqw] py-[2.52cqw]">
                  {["#ed31bd", "#ff8b2c", "#8d22f4"].map((c) => <i key={c} className="h-[2.1cqw] w-[2.1cqw] rounded-full" style={{ background: c }} />)}
                  <span className="data ml-[2.24cqw] text-[2.45cqw] text-mute">tubelead.app / discover</span>
                  <SampleTag className="ml-auto !px-[1.96cqw] !py-[0.7cqw] !text-[1.89cqw]" />
                </div>
                <div className="space-y-[2.52cqw] p-[3.64cqw]">
                  <div className="flex items-center gap-[1.96cqw] rounded-full border border-forest/15 bg-white px-[2.8cqw] py-[1.54cqw]">
                    <Search className="h-[3.36cqw] w-[3.36cqw] shrink-0 text-forest" />
                    <span className="min-w-0 flex-1 truncate text-[2.73cqw] font-medium text-ink">
                      {still ? QUERY : QUERY.split("").map((ch, i) => <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 + i * 0.03 }}>{ch}</motion.span>)}
                    </span>
                    <span className="rounded-full px-[3.36cqw] py-[1.4cqw] text-[2.38cqw] font-bold text-white" style={{ background: "linear-gradient(110deg,#9235f5,#b03cf0)" }}>Search</span>
                  </div>
                  <ul className="space-y-[1.68cqw]">
                    {ROWS.map((c, i) => (
                      <motion.li key={c.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 2.4 + i * 0.22, duration: 0.6, ease: EASE }}
                        className="flex items-center gap-[2.52cqw] rounded-[2.8cqw] bg-white/90 px-[2.8cqw] py-[3.22cqw] shadow-[0_0.56cqw_2.24cqw_rgba(96,45,170,.08)]">
                        <span className="[&>span]:!h-[9.24cqw] [&>span]:!w-[9.24cqw] [&>span]:!rounded-full [&>span]:!text-[2.8cqw]"><AvatarTile c={c} /></span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-[1.12cqw] truncate text-[2.87cqw] font-bold text-ink">{c.name}</p>
                          <p className="truncate text-[2.38cqw] text-mute"><span className="data">{k(c.subs)}</span> subscribers</p>
                        </div>
                        <span className="rounded-full bg-forest/10 px-[2.24cqw] py-[0.7cqw] text-[2.24cqw] font-semibold text-forest">{c.niche}</span>
                        <Sparkline delay={2.9 + i * 0.22} />
                      </motion.li>
                    ))}
                  </ul>
                </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Sources strip: what TubeLead actually searches */}
      <section aria-label="Sources TubeLead searches" className="bg-[#f8f4ff] pt-6">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.7, ease: EASE }}
          className="mx-auto max-w-[1320px] pl-[max(20px,env(safe-area-inset-left,0px))] pr-[max(20px,env(safe-area-inset-right,0px))] sm:px-8">
          <div className="flex flex-col gap-5 rounded-[26px] border border-white bg-white/80 px-6 py-6 shadow-card lg:flex-row lg:items-center lg:gap-8 lg:px-9">
            <p className="shrink-0 text-[16px] font-semibold leading-snug text-ink">Searches across the places<br className="hidden lg:block" /> creators publish</p>
            <span aria-hidden className="hidden h-11 w-px shrink-0 bg-forest/20 lg:block" />
            <ul className="flex flex-1 flex-wrap items-center gap-x-7 gap-y-3 lg:justify-between">
              {SEARCH_SOURCES.map((src, i) => {
                const logo = SOURCE_LOGOS[src.key];
                const live = src.status === "live";
                return (
                  <motion.li key={src.name} title={src.detail} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 + i * 0.07, duration: 0.5 }}
                    className="flex items-center gap-2 text-[15px] font-bold text-ink">
                    {logo && <svg role="img" aria-label={`${src.name} logo`} viewBox="0 0 24 24" className="h-6 w-6 shrink-0"><path d={logo.path} fill={logo.hex} /></svg>}
                    {src.name}
                    {live ? <span className="rounded-full bg-moss/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-moss">Live</span> : <span className="text-[9.5px] font-bold uppercase tracking-wider text-dim">Soon</span>}
                  </motion.li>
                );
              })}
            </ul>
          </div>
          <p className="mt-2.5 px-2 text-[11.5px] text-dim">Multi-source search is included from the Pro plan. Logos are trademarks of their owners; TubeLead is not affiliated with or endorsed by them.</p>
        </motion.div>
      </section>

      {/* Category shortcuts */}
      <section aria-label="Creator categories" className="bg-[#f8f4ff] pb-10 pt-5">
        <div className="mx-auto max-w-[1320px] pl-[max(20px,env(safe-area-inset-left,0px))] pr-[max(20px,env(safe-area-inset-right,0px))] sm:px-8">
          <motion.ul initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }} variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
            className="flex flex-wrap gap-3 rounded-[26px] border border-white bg-white/60 p-4">
            <motion.li variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}>
              <Link href={next()} className="inline-flex items-center gap-2.5 rounded-2xl px-5 py-3.5 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(167,50,225,.22)] transition duration-300 hover:-translate-y-0.5" style={{ background: "linear-gradient(105deg,#c02eea,#9230f1 55%,#ff9b32)" }}>
                <BarChart3 size={19} /> All Categories
              </Link>
            </motion.li>
            {CATEGORIES.map(({ name, icon: Icon }) => (
              <motion.li key={name} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}>
                <Link href={next(`${name} creators`)} className="inline-flex items-center gap-2.5 rounded-2xl bg-white px-5 py-3.5 text-[14px] font-bold text-ink shadow-card transition duration-300 hover:-translate-y-0.5 hover:shadow-pop">
                  <Icon size={19} className="text-forest" /> {name}
                </Link>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </section>
    </>
  );
}

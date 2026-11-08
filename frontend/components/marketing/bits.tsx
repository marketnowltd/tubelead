"use client";
import { motion, MotionConfig } from "framer-motion";
import { Check, Globe, Link2, Mail, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../ui/cn";
import { CONTACT_LABEL, initialsOf, type SampleCreator } from "@/lib/sample";

export const Motion = ({ children }: { children: ReactNode }) => <MotionConfig reducedMotion="user">{children}</MotionConfig>;

export function Reveal({ children, delay = 0, className, y = 22 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  return <motion.div className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}

export function SectionHead({ n, eyebrow, title, sub, center }: { n: string; eyebrow: string; title: ReactNode; sub?: string; center?: boolean }) {
  return (
    <div className={cn("mb-12 max-w-3xl", center && "mx-auto text-center")}>
      <p className={cn("label mb-4 flex items-center gap-3 text-forest", center && "justify-center")}><span className="data text-terracotta-text">{n}</span><span className="h-px w-10 bg-forest/30" />{eyebrow}</p>
      <h2 className="font-display text-[clamp(2rem,4.4vw,3.4rem)] font-extrabold leading-[1.04] tracking-[-0.035em] text-balance">{title}</h2>
      {sub && <p className="mt-5 text-[17px] leading-relaxed text-mute">{sub}</p>}
    </div>
  );
}

export function AvatarTile({ c, size = 40 }: { c: Pick<SampleCreator, "name" | "tone">; size?: number }) {
  return <span aria-hidden className="grid shrink-0 place-items-center rounded-xl font-heading font-extrabold text-paper" style={{ width: size, height: size, background: c.tone, fontSize: size * 0.34 }}>{initialsOf(c.name)}</span>;
}

export function ScoreDial({ score, size = 38 }: { score: number; size?: number }) {
  const r = size / 2 - 3.5, circ = 2 * Math.PI * r;
  const col = score >= 80 ? "#536A4B" : score >= 65 ? "#B89556" : "#8A8579";
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`Fit score ${score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} stroke="#E4DED2" strokeWidth="3.2" fill="none" /><circle cx={size / 2} cy={size / 2} r={r} stroke={col} strokeWidth="3.2" fill="none" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)} /></svg>
      <span className="data absolute text-[10.5px] font-semibold">{score}</span>
    </span>
  );
}

export function ContactBadge({ kind }: { kind: SampleCreator["contact"] }) {
  const map = {
    publicly_published: { I: Mail, cls: "bg-moss/10 text-moss ring-moss/25" },
    website: { I: Globe, cls: "bg-gold/20 text-gold-text ring-gold/40" },
    contact_form: { I: Link2, cls: "bg-sage/25 text-moss ring-moss/20" },
    none: { I: Minus, cls: "bg-ink/5 text-dim ring-ink/10" },
  }[kind];
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset", map.cls)}><map.I size={11} />{CONTACT_LABEL[kind]}</span>;
}

export const Tick = ({ on = true }: { on?: boolean }) => on ? <Check size={15} className="shrink-0 text-moss" /> : <Minus size={15} className="shrink-0 text-quiet" />;

export const SampleTag = ({ className }: { className?: string }) => <span className={cn("label inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 !text-[10px]", className)}><span className="h-1.5 w-1.5 rounded-full bg-gold" />Sample data</span>;

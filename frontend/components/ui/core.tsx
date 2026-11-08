"use client";
import { animate, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { initials } from "@/lib/format";
import { cn } from "./cn";

export function Panel({ children, className, glow, lift }: { children: ReactNode; className?: string; glow?: boolean; lift?: boolean }) {
  return <section className={cn("panel", glow && "gborder", lift && "panel-lift", className)}>{children}</section>;
}

export function PanelHeader({ title, sub, action, icon }: { title: string; sub?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div className="flex items-center gap-2.5">
        {icon && <span className="grid h-8 w-8 place-items-center rounded-lg bg-forest/15 text-forest ring-1 ring-forest/25">{icon}</span>}
        <div>
          <h3 className="font-heading text-[15px] font-semibold leading-tight">{title}</h3>
          {sub && <p className="mt-0.5 text-xs text-mute">{sub}</p>}
        </div>
      </div>
      {action}
    </header>
  );
}

const TONES = {
  purple: "bg-forest/10 text-forest ring-forest/25",
  cyan: "bg-sage/25 text-moss ring-moss/25",
  green: "bg-moss/10 text-moss ring-moss/25",
  magenta: "bg-terracotta/15 text-terracotta-text ring-terracotta/30",
  amber: "bg-gold/20 text-gold-text ring-gold/40",
  red: "bg-[#B5493A]/10 text-[#A33A2A] ring-[#B5493A]/30",
  neutral: "bg-ink/5 text-mute ring-ink/10",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
export const DemoTag = () => <Badge tone="amber" className="!px-1.5 !py-0 text-[10px] uppercase tracking-wider">Demo</Badge>;

export const statusTone: Record<string, Tone> = {
  published: "cyan", verified: "green", unverified: "amber", none: "neutral", active: "green", moderate: "amber", dormant: "red", unknown: "neutral",
  queued: "neutral", running: "cyan", completed: "green", failed: "red", cancelling: "amber", cancelled: "neutral",
  draft: "neutral", paused: "amber", new: "neutral", contacted: "cyan", replied: "purple", converted: "green",
};

export function Skeleton({ className }: { className?: string }) { return <div aria-hidden className={cn("skeleton h-4", className)} />; }

export function EmptyState({ title, body, action, icon }: { title: string; body?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-forest/10 text-forest ring-1 ring-forest/25">{icon ?? <Inbox size={24} />}</div>
      <h4 className="font-heading text-base font-semibold">{title}</h4>
      {body && <p className="max-w-md text-sm text-mute">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error | { message: string }; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#B5493A]/10 text-[#A33A2A] ring-1 ring-[#B5493A]/30"><AlertTriangle size={22} /></div>
      <p className="max-w-md text-sm text-mute">{error.message}</p>
      {onRetry && <button className="btn-ghost btn-sm" onClick={onRetry}><RefreshCw size={14} /> Retry</button>}
    </div>
  );
}

export function PageHeader({ title, sub, actions, eyebrow }: { title: string; sub?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="label mb-1.5 text-forest">{eyebrow}</p>}
        <h1 className="font-display text-[28px] font-bold leading-none tracking-tight sm:text-[34px]">{title}</h1>
        {sub && <p className="mt-2 max-w-2xl text-sm text-mute">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString("en"), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0); // never derive initial text from `reduce` (null on server, true on client) — avoids a hydration mismatch
  const prev = useRef(0);
  useEffect(() => {
    if (reduce) { setShown(value); return; }
    const c = animate(prev.current, value, { duration: 1.1, ease: "easeOut", onUpdate: setShown });
    prev.current = value;
    return () => c.stop();
  }, [value, reduce]);
  return <span className={className}>{format(shown)}</span>;
}

export function StatCard({ label, value, sub, icon, tone = "purple", format, loading }: {
  label: string; value: number; sub?: ReactNode; icon: ReactNode; tone?: "purple" | "cyan" | "green" | "magenta"; format?: (n: number) => string; loading?: boolean;
}) {
  const ring = { purple: "text-forest bg-forest/15 ring-forest/30", cyan: "text-moss bg-sage/10 ring-sage/30", green: "text-moss bg-moss/10 ring-moss/30", magenta: "text-terracotta-text bg-terracotta/10 ring-terracotta/30" }[tone];
  return (
    <Panel lift className="overflow-hidden p-4">
      <div className="flex items-start justify-between">
        <p className="label">{label}</p>
        <span className={cn("grid h-8 w-8 place-items-center rounded-lg ring-1", ring)}>{icon}</span>
      </div>
      {loading ? <Skeleton className="mt-3 h-8 w-24" /> : <CountUp value={value} format={format} className="data mt-2 block text-[28px] font-semibold leading-none" />}
      {sub && <p className="mt-2 text-xs text-mute">{sub}</p>}
    </Panel>
  );
}

export function Avatar({ src, name, size = 36, className }: { src?: string | null; name: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 50;
  if (src && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)}
      className={cn("shrink-0 rounded-full object-cover ring-1 ring-forest/40", className)} style={{ width: size, height: size }} />;
  }
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full font-heading text-xs font-bold text-paper ring-1 ring-forest/30", className)}
      style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${138 + hue} 28% 30%), hsl(${150 + hue} 24% 42%))`, fontSize: size * 0.34 }}>
      {initials(name)}
    </span>
  );
}

export function Progress({ value, tone = "purple", className, animated, label = "Progress" }: { value: number; tone?: "purple" | "cyan" | "green"; className?: string; animated?: boolean; label?: string }) {
  const bar = { purple: "from-forest to-forest-400", cyan: "from-sage to-forest-400", green: "from-moss to-sage" }[tone];
  const v = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} className={cn("relative h-2 overflow-hidden rounded-full bg-ink/[0.06]", className)}>
      <motion.div className={cn("h-full rounded-full bg-gradient-to-r", bar)} initial={false} animate={{ width: `${v}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
      {animated && <span className="absolute inset-y-0 left-0 w-1/3 animate-scan bg-gradient-to-r from-transparent via-paper/40 to-transparent" />}
    </div>
  );
}

export function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const r = size / 2 - 4, c = 2 * Math.PI * r;
  const color = score >= 75 ? "#536A4B" : score >= 50 ? "#B89556" : "#8A8579";
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`Qualification score ${score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(34,35,31,.10)" strokeWidth="3.5" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)}  />
      </svg>
      <span className="data absolute text-[11px] font-semibold">{score}</span>
    </span>
  );
}

export function DemoBanner({ count, onClear, busy }: { count: number; onClear: () => void; busy?: boolean }) {
  if (!count) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/15 px-4 py-2.5 text-sm">
      <p className="text-gold-text"><strong className="font-semibold">Demonstration data is loaded</strong> — {count} sample creators marked <DemoTag /> are fictional. Real discoveries appear alongside them.</p>
      <button className="btn-ghost btn-sm" onClick={onClear} disabled={busy}>Remove demo data</button>
    </div>
  );
}

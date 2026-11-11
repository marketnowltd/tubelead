"use client";
import { useReducedMotionSafe } from "@/components/ui/motion";
import { motion} from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { STEPS } from "./types";

export function ProgressIndicator({ step, max, onGo, compact }: { step: number; max: number; onGo?: (s: number) => void; compact?: boolean }) {
  const reduce = useReducedMotionSafe();
  return (
    <ol className="flex items-center gap-0" aria-label="Growth Assistant progress">
      {STEPS.map((label, i) => {
        const n = i + 1, done = n < step, current = n === step, reachable = n <= max && !!onGo;
        return (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <button type="button" disabled={!reachable} onClick={() => reachable && onGo?.(n)} aria-current={current ? "step" : undefined}
              className={cn("group flex items-center gap-2 rounded-full transition", reachable && "cursor-pointer", !compact && "pr-2")}>
              <motion.span layout className={cn("relative grid shrink-0 place-items-center rounded-full font-bold transition-colors duration-300", compact ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-[12px]",
                done ? "bg-forest text-paper" : current ? "bg-paper text-forest ring-2 ring-forest" : "bg-ink/[0.06] text-dim")}>
                {done ? <motion.span initial={reduce ? false : { scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 600, damping: 22 }}><Check size={compact ? 12 : 15} strokeWidth={3} /></motion.span> : n}
                {current && <motion.span aria-hidden className="absolute inset-0 rounded-full ring-2 ring-forest/40" animate={reduce ? { opacity: 0 } : { scale: [1, 1.35], opacity: [0.6, 0] }} transition={reduce ? { duration: 0 } : { duration: 1.8, repeat: Infinity, ease: "easeOut" }} />}
              </motion.span>
              {!compact && <span className={cn("hidden text-[12px] font-semibold sm:inline", current ? "text-ink" : done ? "text-forest" : "text-dim")}>{label}</span>}
            </button>
            {i < STEPS.length - 1 && (
              <span className={cn("relative mx-1.5 h-[2px] flex-1 overflow-hidden rounded-full bg-ink/[0.07]", compact ? "min-w-3" : "min-w-4")}>
                <motion.span className="absolute inset-y-0 left-0 rounded-full bg-forest" initial={false} animate={{ width: done ? "100%" : "0%" }} transition={{ type: "spring", stiffness: 120, damping: 24 }} />
              </span>)}
          </li>);
      })}
    </ol>
  );
}

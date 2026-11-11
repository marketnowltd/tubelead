"use client";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/components/ui/cn";
import type { Tour as TourDef } from "./tours";
import { Words } from "./Words";

export interface Box { left: number; top: number; width: number; height: number }
export type CardPos = { left: number; top?: number; bottom?: number; width: number };

const PAD = 8;

/** The walkthrough layer: dims the page, cuts a soft spotlight around the step's element, and shows the step card. */
export function TourLayer({ tour, step, rect, card, waiting, reduced, onPrev, onNext, onSkip, onExit }: {
  tour: TourDef; step: number; rect: Box | null; card: CardPos; waiting: boolean; reduced: boolean;
  onPrev: () => void; onNext: () => void; onSkip: () => void; onExit: () => void;
}) {
  const s = tour.steps[step];
  const last = step === tour.steps.length - 1;
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => { cardRef.current?.focus({ preventScroll: true }); }, [step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
      else if (e.key === "ArrowRight" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) onNext();
      else if (e.key === "ArrowLeft" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) && step > 0) onPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit, onNext, onPrev, step]);
  const t = reduced ? { duration: 0 } : { type: "spring" as const, stiffness: 260, damping: 32 };
  const hole = rect ? { x: rect.left - PAD, y: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 } : null;

  return (
    <div data-helper="" className="pointer-events-none fixed inset-0 z-[55]">
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <mask id="tl-spot">
            <rect width="100%" height="100%" fill="white" />
            {hole && <motion.rect rx={14} fill="black" initial={false} animate={hole} transition={t} />}
          </mask>
        </defs>
        <motion.rect width="100%" height="100%" fill="rgba(26,13,46,0.42)" mask="url(#tl-spot)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.35 }} />
      </svg>
      <AnimatePresence>
        {hole && (
          <motion.div key="ring" className="helper-ring absolute rounded-[14px]" initial={{ opacity: 0, left: hole.x, top: hole.y, width: hole.width, height: hole.height }} animate={{ opacity: 1, left: hole.x, top: hole.y, width: hole.width, height: hole.height }}
            exit={{ opacity: 0 }} transition={t} style={{ position: "absolute" }} />
        )}
      </AnimatePresence>
      <motion.div ref={cardRef} tabIndex={-1} role="dialog" aria-modal="false" aria-label={`${tour.title}: step ${step + 1} of ${tour.steps.length}`}
        className="helper-bubble pointer-events-auto absolute p-4 outline-none"
        style={{ left: card.left, top: card.top, bottom: card.bottom, width: card.width }}
        initial={reduced ? false : { opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }} key={step}>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#7A2DFF]">{tour.title}</span>
          <button type="button" onClick={onExit} aria-label="Exit tutorial" className="ml-auto -mr-1 -mt-1 rounded-lg p-1.5 text-mute hover:bg-[#7A2DFF]/10 hover:text-ink"><X size={15} /></button>
        </div>
        <h2 className="font-heading text-[16px] font-bold leading-snug text-[#1A0D2E]">{s.title}</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-[#3b2d55]"><Words text={s.body} reduced={reduced} /></p>
        {!rect && s.target && <p className="mt-1.5 text-[11.5px] text-dim">This part isn't on screen right now.</p>}
        {waiting && <p className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-[#7A2DFF]"><span className="helper-pulse h-2 w-2 rounded-full bg-[#E81F76]" /> Waiting for you…</p>}
        <div className="mt-3 flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${tour.steps.length}`} role="img">
          {tour.steps.map((_, n) => <span key={n} className={cn("h-1.5 rounded-full transition-all duration-300", n === step ? "w-5 bg-[#7A2DFF]" : n < step ? "w-1.5 bg-[#7A2DFF]/60" : "w-1.5 bg-[#7A2DFF]/20")} />)}
          <span className="ml-2 text-[11px] text-dim">Step {step + 1} of {tour.steps.length}</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          {!last && <button type="button" onClick={onSkip} className="text-[12px] font-semibold text-mute hover:text-ink">Skip tutorial</button>}
          <div className="ml-auto flex gap-2">
            {step > 0 && <button type="button" onClick={onPrev} className="helper-chip !px-3"><ChevronLeft size={14} /> Previous</button>}
            <button type="button" onClick={onNext} className="helper-cta">{last ? "Finish" : waiting ? "Skip this step" : "Next step"}{!last && <ChevronRight size={14} />}</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

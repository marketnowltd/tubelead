"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { ALL_FRAMES, type Facing, type Frame, frameMeta, frameSrc, type Pose, POSES } from "./sprites";

let preloaded = false;
const CORE: Frame[] = ["front", "front_blink", "side", "side_l", "wave", "wave_l", "f_excited", "f_helpful"];
/** The frames he needs straight away load first; the rest load when the browser is idle, so the page itself is
 * never slowed down (all frames together are about 1.2 MB). */
function preload() {
  if (preloaded || typeof window === "undefined") return;
  preloaded = true;
  const get = (f: Frame) => { const i = new Image(); i.decoding = "async"; i.src = frameSrc(f); };
  CORE.forEach(get);
  const rest = () => ALL_FRAMES.filter((f) => !CORE.includes(f) && !f.startsWith("e_")).forEach(get);
  const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: { timeout: number }) => void);
  if (ric) ric(rest, { timeout: 8000 }); else setTimeout(rest, 4000);
}

const BURST = ["#7A2DFF", "#E81F76", "#FF7A00", "#FFC300", "#7A2DFF", "#E81F76", "#FF7A00", "#FFC300"];

/** Draws the character for a pose, frame by frame, at a constant character height (`size` px).
 * The artwork is never stretched: every frame is shown at its own aspect ratio, anchored at the feet. */
export function Astronaut({ pose, facing = "right", size, reduced, glow, className }: {
  pose: Pose; facing?: Facing; size: number; reduced?: boolean; glow?: boolean; className?: string;
}) {
  const seq = POSES[pose];
  const frames = (facing === "left" && seq.left) || seq.frames;
  const [i, setI] = useState(0);
  const [blink, setBlink] = useState(false);
  useEffect(preload, []);
  useEffect(() => { setI(0); }, [pose, facing]);
  useEffect(() => {
    if (frames.length < 2 || reduced) return;
    const t = setInterval(() => setI((n) => (n + 1) % frames.length), seq.every ?? 600);
    return () => clearInterval(t);
  }, [frames, seq.every, reduced]);
  // Occasional blink in the idle pose (a real closed-eye frame, not a CSS squash).
  useEffect(() => {
    if (pose !== "idle") return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => { t = setTimeout(() => { setBlink(true); t = setTimeout(() => { setBlink(false); loop(); }, 140); }, 2600 + Math.random() * 3400); };
    loop();
    return () => clearTimeout(t);
  }, [pose]);

  const frame: Frame = pose === "idle" && blink ? "front_blink" : frames[Math.min(i, frames.length - 1)];
  const m = frameMeta(frame);
  const h = Math.round(m.h * m.k * size);
  const w = Math.round((m.w / m.h) * h);
  const style = useMemo(() => ({ width: w, height: h, filter: glow ? "drop-shadow(0 0 1.5px rgba(122,45,255,.9)) drop-shadow(0 6px 14px rgba(122,45,255,.38))" : "drop-shadow(0 8px 14px rgba(26,13,46,.18))" }), [w, h, glow]);

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={frameSrc(frame)} alt="" draggable={false} decoding="async"
        style={{ ...style, position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", maxWidth: "none", userSelect: "none", pointerEvents: "none" }} />
      <AnimatePresence>
        {pose === "celebrating" && !reduced && (
          <motion.div key="burst" className="pointer-events-none absolute left-1/2 top-[18%]" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {BURST.map((c, n) => {
              const a = (n / BURST.length) * Math.PI * 2;
              return <motion.i key={n} className="absolute block h-2 w-2 rounded-[2px]" style={{ background: c }}
                initial={{ x: 0, y: 0, scale: 0.4, rotate: 0, opacity: 1 }}
                animate={{ x: Math.cos(a) * size * 0.62, y: Math.sin(a) * size * 0.5 - size * 0.12, scale: 1, rotate: 180, opacity: [1, 1, 0] }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], repeat: 1, repeatDelay: 0.25 }} />;
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Remotion composition: the TubeLead Helper's rocket journey across the discovery stages.
 *
 * Timeline: each planet has a segment of HOVER frames (the rocket waits at that planet) followed by TRAVEL frames
 * (it flies to the next). The page drives the Player's frame from the live job (see DiscoveryJourney.tsx): it loops
 * a planet's HOVER window while that stage runs and plays the flight when the job moves on. Every ambient motion uses
 * a period that divides HOVER (60), so looping a HOVER window is seamless.
 */
import { AbsoluteFill, Easing, Img, interpolate, random, useCurrentFrame } from "remotion";

export const FPS = 30;
export const WIDTH = 800;   // a close "camera" that pans along the route (the panel it sits in is narrow)
export const HEIGHT = 380;
export const HOVER = 60;
export const TRAVEL = 48;
export const SEG = HOVER + TRAVEL;
const GAP = 300;          // world distance between planets
const EDGE = 170;         // world margin before the first and after the last planet
const PLANET_Y = 250;     // planet centre
const R = 52;             // planet radius
const SHIP = 1.5;         // rocket scale (drawn at 64 x 104)
const HOVER_Y = PLANET_Y - R - 104 * SHIP - 6;   // rocket top while waiting above a planet
const LAND_Y = PLANET_Y - R - 81 * SHIP + 4;     // rocket top when its base rests on the last planet
const TAU = Math.PI * 2;

export interface JourneyPlanet { key: string; name: string; colours: [string, string]; ring?: boolean }
export interface JourneyProps { planets: JourneyPlanet[]; helperSrc: string }

export const durationFor = (n: number) => (n - 1) * SEG + HOVER + 30; // the last planet: landing + 30 frames to settle
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const wave = (frame: number, period: number, phase = 0) => Math.sin(((frame % period) / period) * TAU + phase);
const planetX = (i: number) => EDGE + i * GAP;

/** Where the rocket is at a frame: world x/y, heading and whether it is flying. */
function rocketAt(frame: number, n: number) {
  const seg = Math.min(Math.floor(frame / SEG), n - 1);
  const local = frame - seg * SEG;
  const hoverY = HOVER_Y + wave(frame, 60) * 7;
  if (seg === n - 1) {
    // final planet: settle onto its surface, then rest
    const land = interpolate(local, [0, 24], [0, 1], { ...clamp, easing: Easing.bezier(0.22, 1, 0.36, 1) });
    return { x: planetX(seg), y: interpolate(land, [0, 1], [hoverY, LAND_Y]), rotate: 0, flying: false, landed: land >= 1, seg, local };
  }
  if (local < HOVER) return { x: planetX(seg), y: hoverY, rotate: wave(frame, 60, 1) * 3, flying: false, landed: false, seg, local };
  const t = interpolate(local, [HOVER, SEG], [0, 1], { ...clamp, easing: Easing.bezier(0.6, 0, 0.2, 1) });
  return {
    x: interpolate(t, [0, 1], [planetX(seg), planetX(seg + 1)]),
    y: hoverY - Math.sin(t * Math.PI) * 26,
    rotate: interpolate(t, [0, 0.18, 0.82, 1], [0, 68, 68, 0]),
    flying: true, landed: false, seg, local,
  };
}

function Stars({ cam, depth, count, seed, size }: { cam: number; depth: number; count: number; seed: string; size: number }) {
  const frame = useCurrentFrame();
  const span = WIDTH + 600;
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const x = (((random(`${seed}x${i}`) * span - cam * depth) % span) + span) % span - 200;
        return (
          <div key={i} style={{
            position: "absolute", left: x, top: random(`${seed}y${i}`) * HEIGHT, width: size, height: size, borderRadius: "50%", background: "#fff",
            opacity: 0.35 + 0.5 * (0.5 + 0.5 * wave(frame, [60, 30, 20][i % 3], random(`${seed}p${i}`) * TAU)),
            boxShadow: size > 2 ? "0 0 6px rgba(255,255,255,.8)" : undefined,
          }} />
        );
      })}
    </>
  );
}

function Planet({ p, i, reached, current }: { p: JourneyPlanet; i: number; reached: boolean; current: boolean }) {
  const frame = useCurrentFrame();
  const spin = ((frame % 60) / 60) * 80; // surface bands drift by one pattern width per 60 frames
  const glow = reached ? (current ? 26 + wave(frame, 60) * 8 : 18) : 0;
  const ring = (half: "back" | "front") => p.ring && (
    <div style={{
      position: "absolute", left: -R * 0.55, top: R - 11, width: R * 3.1, height: 22, borderRadius: "50%",
      border: `3px solid ${reached ? p.colours[0] : "rgba(255,255,255,.25)"}`, rotate: "-14deg",
      clipPath: half === "back" ? "inset(0 0 50% 0)" : "inset(50% 0 0 0)", zIndex: half === "back" ? 0 : 2, opacity: 0.9,
    }} />
  );
  return (
    <div style={{ position: "absolute", left: planetX(i) - R, top: PLANET_Y - R, width: R * 2, height: R * 2 }}>
      {ring("back")}
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden", zIndex: 1,
        background: `radial-gradient(circle at 30% 28%, ${p.colours[0]} 0%, ${p.colours[1]} 62%, #120822 100%)`,
        boxShadow: `0 0 ${glow}px ${glow / 3}px ${p.colours[1]}aa, inset -14px -16px 26px rgba(0,0,0,.45)`,
        filter: reached ? "none" : "grayscale(.75) brightness(.5)",
      }}>
        <div style={{
          position: "absolute", inset: 0, opacity: 0.22,
          backgroundImage: "repeating-linear-gradient(100deg, rgba(255,255,255,.9) 0 10px, transparent 10px 26px, rgba(0,0,0,.6) 26px 34px, transparent 34px 80px)",
          backgroundPosition: `${spin}px 0`,
        }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle at 70% 75%, transparent 45%, rgba(10,4,24,.55) 100%)" }} />
      </div>
      {ring("front")}
      <div style={{ position: "absolute", top: R * 2 + 10, left: -100, width: R * 2 + 200, textAlign: "center", fontFamily: "system-ui, sans-serif",
        fontSize: 24, fontWeight: 800, letterSpacing: 0.2, color: reached ? "#fff" : "rgba(255,255,255,.45)" }}>
        {reached && !current ? "✓ " : ""}{p.name}
      </div>
    </div>
  );
}

function RocketShip({ helperSrc, flying, frame }: { helperSrc: string; flying: boolean; frame: number }) {
  const flame = 1 + wave(frame, 6) * 0.12 + (flying ? 0.35 : 0);
  return (
    <div style={{ position: "relative", width: 64, height: 104 }}>
      {/* exhaust particles, drawn in the rocket's own frame so they always stream from the nozzle */}
      {Array.from({ length: 14 }).map((_, k) => {
        const age = ((frame + k * 2) % 30) / 30;
        const spread = (random(`ex${k}`) - 0.5) * 26 * age;
        return (
          <div key={k} style={{
            position: "absolute", left: 32 - 4 + spread, top: 92 + age * (flying ? 70 : 34), width: 8 - age * 5, height: 8 - age * 5, borderRadius: "50%",
            background: k % 3 ? "#FFC300" : "#FF7A00", opacity: (1 - age) * (flying ? 0.9 : 0.55), filter: "blur(.5px)",
          }} />
        );
      })}
      <div style={{ position: "absolute", left: 22, top: 84, width: 20, height: 34, borderRadius: "50% 50% 50% 50% / 30% 30% 70% 70%",
        background: "radial-gradient(circle at 50% 20%, #FFF6C2, #FFC300 45%, rgba(255,122,0,0) 75%)", scale: `1 ${flame}`, transformOrigin: "50% 0" }} />
      <svg viewBox="0 0 64 96" width={64} height={96} style={{ position: "absolute", top: 0, left: 0, overflow: "visible" }}>
        <defs>
          <linearGradient id="rk-body" x1="0" x2="1"><stop offset="0" stopColor="#E9DEFF" /><stop offset=".55" stopColor="#FFFFFF" /><stop offset="1" stopColor="#D6C7F7" /></linearGradient>
          <linearGradient id="rk-fin" x1="0" x2="1"><stop offset="0" stopColor="#7A2DFF" /><stop offset="1" stopColor="#E81F76" /></linearGradient>
        </defs>
        <path d="M14 58 L3 80 L19 73 Z" fill="url(#rk-fin)" stroke="#1A0D2E" strokeWidth="2" />
        <path d="M50 58 L61 80 L45 73 Z" fill="url(#rk-fin)" stroke="#1A0D2E" strokeWidth="2" />
        <path d="M32 2 C51 17 53 47 46 76 L18 76 C11 47 13 17 32 2 Z" fill="url(#rk-body)" stroke="#1A0D2E" strokeWidth="2.5" />
        <path d="M32 2 C41 8 46 16 48 25 L16 25 C18 16 23 8 32 2 Z" fill="url(#rk-fin)" stroke="#1A0D2E" strokeWidth="2.5" />
        <path d="M20 66 H44" stroke="#7A2DFF" strokeWidth="3" strokeLinecap="round" opacity=".6" />
        <rect x="23" y="74" width="18" height="7" rx="2" fill="#1A0D2E" />
        <circle cx="32" cy="43" r="13.5" fill="#1A0D2E" stroke="#7A2DFF" strokeWidth="3.5" />
      </svg>
      <Img src={helperSrc} style={{ position: "absolute", left: 32 - 13, top: 43 - 13, width: 26, height: 26, borderRadius: "50%", objectFit: "cover" }} />
      <div style={{ position: "absolute", left: 22, top: 32, width: 8, height: 5, borderRadius: "50%", background: "rgba(255,255,255,.55)", rotate: "-30deg" }} />
    </div>
  );
}

export function JourneyScene({ planets, helperSrc }: JourneyProps) {
  const frame = useCurrentFrame();
  const n = planets.length;
  const r = rocketAt(frame, n);
  const worldW = EDGE * 2 + (n - 1) * GAP;
  const cam = Math.max(0, Math.min(worldW - WIDTH, r.x - WIDTH * 0.45));
  const last = n - 1;
  const burst = r.seg === last ? r.local - 24 : -1;

  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "radial-gradient(120% 160% at 10% 0%, #3B1A7A 0%, #1A0D2E 52%, #08040F 100%)" }}>
      {/* nebulae */}
      <div style={{ position: "absolute", left: 120 - cam * 0.08, top: -120, width: 620, height: 420, borderRadius: "50%",
        background: "radial-gradient(closest-side, rgba(232,31,118,.28), transparent)", opacity: 0.8 + wave(frame, 60) * 0.1 }} />
      <div style={{ position: "absolute", left: 760 - cam * 0.12, top: 40, width: 700, height: 460, borderRadius: "50%",
        background: "radial-gradient(closest-side, rgba(122,45,255,.32), transparent)" }} />
      <Stars cam={cam} depth={0.12} count={46} seed="far" size={1.6} />
      <Stars cam={cam} depth={0.3} count={22} seed="mid" size={2.4} />
      <Stars cam={cam} depth={0.55} count={8} seed="near" size={3.2} />

      <AbsoluteFill style={{ translate: `${-cam}px 0px` }}>
        {/* the route: dashed path, and the travelled part in brand colours */}
        <div style={{ position: "absolute", left: planetX(0), top: PLANET_Y, width: planetX(last) - planetX(0), borderTop: "2px dashed rgba(255,255,255,.18)" }} />
        <div style={{ position: "absolute", left: planetX(0), top: PLANET_Y - 1, height: 4, borderRadius: 4, width: Math.max(0, r.x - planetX(0)),
          background: "linear-gradient(90deg,#7A2DFF,#E81F76,#FF7A00,#FFC300)", boxShadow: "0 0 12px rgba(232,31,118,.6)" }} />
        {planets.map((p, i) => (
          <Planet key={p.key} p={p} i={i} reached={i <= r.seg} current={i === r.seg && !r.flying} />
        ))}
        <div style={{ position: "absolute", left: r.x - 32 * SHIP, top: r.y, width: 64 * SHIP, height: 104 * SHIP, rotate: `${r.rotate}deg`, transformOrigin: "50% 60%" }}>
          <div style={{ scale: `${SHIP}`, transformOrigin: "0 0" }}><RocketShip helperSrc={helperSrc} flying={r.flying} frame={frame} /></div>
        </div>
        {/* arrival celebration at the last planet */}
        {burst >= 0 && burst < 40 && Array.from({ length: 18 }).map((_, k) => {
          const a = (k / 18) * TAU + random(`cf${k}`) * 0.3;
          const d = interpolate(burst, [0, 40], [0, 110 + random(`cd${k}`) * 50], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
          return <div key={k} style={{ position: "absolute", left: planetX(last) + Math.cos(a) * d, top: PLANET_Y - 20 + Math.sin(a) * d * 0.7 + burst * 0.6,
            width: 8, height: 8, borderRadius: 2, rotate: `${burst * 9 + k * 20}deg`, opacity: interpolate(burst, [24, 40], [1, 0], clamp),
            background: ["#7A2DFF", "#E81F76", "#FF7A00", "#FFC300"][k % 4] }} />;
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

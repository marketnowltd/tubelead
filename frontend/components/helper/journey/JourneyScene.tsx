/**
 * Remotion composition: the cinematic discovery journey. Space and planets are a WebGL shader (space.ts); the
 * spacecraft, scanners, creator signals, readouts and typography are frame-driven overlays. All numbers come from
 * the live job (props); nothing is invented. Timeline: intro → hold (Search) → travel → hold (Filter) → travel →
 * hold (Contact) → finale → hold (Complete). The page loops the current hold window (every motion is periodic in
 * HOLD, so loops are seamless) and plays forward when the job advances.
 */
import { useEffect, useRef } from "react";
import { AbsoluteFill, Easing, Img, interpolate, random, useCurrentFrame } from "remotion";
import { SpaceRenderer } from "./space";

export const FPS = 30, WIDTH = 960, HEIGHT = 440;
const INTRO = 90, HOLD = 480, TRAVEL = 90, FINALE = 120;
const H0 = INTRO, T01 = H0 + HOLD, H1 = T01 + TRAVEL, T12 = H1 + HOLD, H2 = T12 + TRAVEL, F = H2 + HOLD, H3 = F + FINALE;
export const DURATION = H3 + HOLD;
/** Loop window [start, end) for each stage the job can be in. */
export const HOLDS: [number, number][] = [[H0, T01], [H1, T12], [H2, F], [H3, DURATION]];
export const HOLD_LEN = HOLD;

export interface JourneyData {
  stage: number; failed: boolean; message: string; queriesDone: number; queriesTotal: number; found: number;
  qualified: number; rejected: number; duplicates: number; contacts: number; enriched: number; enrichTotal: number; limit: number;
}
export interface JourneyProps { data: JourneyData; helperSrc: string }

const PL: [number, number, number][] = [[0, 0, .3], [1.9, -.02, .36], [3.8, .02, .31]];
const STAGES = [
  ["01", "PLANET SEARCH", "Discovering potential creators."],
  ["02", "PLANET FILTER", "Analysing and qualifying creators."],
  ["03", "PLANET CONTACT", "Finding verified public contact information."],
  ["✓", "DISCOVERY COMPLETE", "Your leads are ready."],
];
const C = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const cine = Easing.bezier(.65, 0, .35, 1), out = Easing.bezier(.16, 1, .3, 1);
const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Camera, craft and stage position at a frame (world units: screen height = 1). */
function rig(f: number) {
  const ph = ((f % HOLD) / HOLD) * TAU;
  const hold = (k: number) => ({ cx: PL[k][0] - .2, cy: PL[k][1], z: 1.02 + .025 * Math.sin(ph), sx: PL[k][0] - .62, sy: PL[k][1] + .17 + .018 * Math.sin(ph * 2) });
  if (f < H0) {
    const t = interpolate(f, [0, H0], [0, 1], { ...C, easing: out });
    const h = hold(0);
    return { ...h, cx: lerp(-.9, h.cx, t), cy: lerp(.12, h.cy, t), z: lerp(.62, h.z, t), sx: lerp(-1.9, h.sx, t), sy: lerp(.4, h.sy, t), pos: 0, bank: lerp(8, 0, t), ph, orbit: -1 };
  }
  for (const [k, a] of [[0, T01], [1, T12]] as const) {
    if (f >= a && f < a + TRAVEL) {
      const t = interpolate(f, [a, a + TRAVEL], [0, 1], { ...C, easing: cine });
      const ts = interpolate(f, [a, a + TRAVEL * .85], [0, 1], { ...C, easing: Easing.bezier(.5, 0, .2, 1) });
      const A = hold(k), B = hold(k + 1);
      return { cx: lerp(A.cx, B.cx, t), cy: lerp(A.cy, B.cy, t) + .04 * Math.sin(Math.PI * t), z: lerp(A.z, B.z, t) - .3 * Math.sin(Math.PI * t),
        sx: lerp(A.sx, B.sx, ts), sy: lerp(A.sy, B.sy, ts) - .12 * Math.sin(Math.PI * ts), pos: k + t, bank: -10 * Math.sin(Math.PI * ts), ph, orbit: -1 };
    }
  }
  if (f >= F) {
    const t = interpolate(f, [F, H3], [0, 1], { ...C, easing: cine });
    const a = f >= H3 ? ph : lerp(Math.PI * .85, TAU, t);           // settle into one orbit per hold loop
    const ox = PL[2][0] + Math.cos(a) * .52, oy = PL[2][1] + Math.sin(a) * .16;
    const h = hold(2);
    return { cx: lerp(h.cx, PL[2][0] - .02, t), cy: PL[2][1], z: lerp(h.z, .86, t), sx: lerp(h.sx, ox, Math.min(1, t * 1.4)), sy: lerp(h.sy, oy, Math.min(1, t * 1.4)),
      pos: 2 + t, bank: 0, ph, orbit: a };
  }
  const k = f < T01 ? 0 : f < T12 ? 1 : 2;
  return { ...hold(k), pos: k, bank: 0, ph, orbit: -1 };
}

function Space({ r, lit, fail, done }: { r: ReturnType<typeof rig>; lit: [number, number, number]; fail: boolean; done: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const gl = useRef<SpaceRenderer | null>(null);
  const ok = useRef(true);
  useEffect(() => {
    gl.current = canvas.current ? SpaceRenderer.create(canvas.current) : null;
    ok.current = !!gl.current;
    return () => { gl.current?.dispose(); gl.current = null; };
  }, []);
  useEffect(() => {
    gl.current?.render({ phase: r.ph, cam: [r.cx, r.cy], zoom: r.z, planets: PL, lit, fail: fail ? 1 : 0, done });
  });
  return (
    <>
      <AbsoluteFill style={{ background: "radial-gradient(120% 140% at 20% 0%, #3B1A7A, #14082A 60%, #07030F)" }} />
      <canvas ref={canvas} width={WIDTH * 1.5} height={HEIGHT * 1.5} style={{ position: "absolute", inset: 0, width: WIDTH, height: HEIGHT }} />
    </>
  );
}

function Craft({ helperSrc, f, thrust, dim }: { helperSrc: string; f: number; thrust: number; dim: boolean }) {
  return (
    <svg width={150} height={70} viewBox="0 0 150 70" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="hull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset=".45" stopColor="#E7DDFB" /><stop offset="1" stopColor="#8E7BC4" /></linearGradient>
        <linearGradient id="trim" x1="0" x2="1"><stop offset="0" stopColor="#7A2DFF" /><stop offset="1" stopColor="#E81F76" /></linearGradient>
        <radialGradient id="glass" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#5B3BA8" stopOpacity=".2" /><stop offset="1" stopColor="#120726" stopOpacity=".75" /></radialGradient>
        <radialGradient id="fire" cx="1" cy=".5" r="1"><stop offset="0" stopColor="#FFF4C8" /><stop offset=".35" stopColor="#FFC300" /><stop offset=".7" stopColor="#FF7A00" stopOpacity=".6" /><stop offset="1" stopColor="#E81F76" stopOpacity="0" /></radialGradient>
      </defs>
      {/* engine plume and particles */}
      <ellipse cx={8 - thrust * 18} cy={38} rx={24 + thrust * 26 + Math.sin(f * 1.3) * 2} ry={7 + thrust * 3} fill="url(#fire)" opacity={dim ? .35 : .95} />
      {Array.from({ length: 10 }).map((_, i) => {
        const age = ((f + i * 3) % 30) / 30;
        return <circle key={i} cx={10 - age * (40 + thrust * 70)} cy={38 + (random(`e${i}`) - .5) * 14 * age} r={2.6 * (1 - age)} fill={i % 2 ? "#FFC300" : "#FF7A00"} opacity={(1 - age) * (dim ? .3 : .8)} />;
      })}
      {/* hull */}
      <path d="M18 30 C40 16 92 14 132 30 C142 34 142 42 132 46 C92 60 40 58 18 46 Z" fill="url(#hull)" stroke="#2A1650" strokeWidth="1.5" />
      <path d="M30 47 L14 64 L50 52 Z" fill="url(#trim)" /><path d="M30 29 L16 10 L50 24 Z" fill="url(#trim)" />
      <path d="M26 41 C60 47 104 46 134 40" stroke="url(#trim)" strokeWidth="3" fill="none" />
      <rect x="10" y="32" width="12" height="12" rx="3" fill="#2A1650" /><rect x="12" y="34" width="8" height="8" rx="2" fill="#FFB347" opacity={dim ? .3 : .9} />
      {/* cockpit with the TubeLead Helper */}
      <ellipse cx="92" cy="30" rx="22" ry="14" fill="#160A2C" />
      <foreignObject x="72" y="14" width="40" height="32"><Img src={helperSrc} style={{ width: 40, height: 32, objectFit: "contain" }} /></foreignObject>
      <ellipse cx="92" cy="30" rx="22" ry="14" fill="url(#glass)" stroke="#C9B6FF" strokeWidth="1.2" />
      <path d="M78 23 C84 18 94 17 101 19" stroke="#fff" strokeOpacity=".7" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="132" cy="37" r="2" fill="#E81F76" opacity={.5 + .5 * Math.sin(f / 4.77)} />
    </svg>
  );
}

const Chip = ({ label, value, tone = "#C9B6FF" }: { label: string; value: string; tone?: string }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 18, padding: "7px 12px", borderRadius: 12, background: "rgba(26,13,46,.55)",
    border: "1px solid rgba(201,182,255,.22)", backdropFilter: "blur(6px)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "#fff", minWidth: 190 }}>
    <span style={{ color: "rgba(255,255,255,.6)", letterSpacing: 1 }}>{label}</span><span style={{ color: tone, fontWeight: 600 }}>{value}</span>
  </div>
);

export function JourneyScene({ data, helperSrc }: JourneyProps) {
  const f = useCurrentFrame();
  const r = rig(f);
  const toScreen = (x: number, y: number) => [WIDTH / 2 + (x - r.cx) * r.z * HEIGHT, HEIGHT / 2 - (y - r.cy) * r.z * HEIGHT] as const;
  const P = PL.map((p) => { const [x, y] = toScreen(p[0], p[1]); return { x, y, rad: p[2] * r.z * HEIGHT }; });
  const [sx, sy] = toScreen(r.sx, r.sy);
  const behind = r.orbit >= 0 && Math.sin(r.orbit) > 0;          // far side of the orbit: behind the planet
  const done = interpolate(f, [F, H3], [0, 1], C);
  const lit: [number, number, number] = [Math.min(1, Math.max(.15, 1 - Math.abs(r.pos - 0) * .6)), interpolate(r.pos, [.4, 1], [.1, 1], C), interpolate(r.pos, [1.4, 2], [.1, 1], C)];
  const vis = (k: number) => interpolate(r.pos, [k - .5, k - .15, k + .35, k + .7], [0, 1, 1, 0], C);   // overlay strength per stage
  const stageIdx = Math.min(3, Math.round(r.pos));
  const ph = r.ph, d = data;
  const nFound = Math.min(42, Math.ceil(Math.sqrt(d.found) * 4));
  const nUnique = Math.min(42, Math.ceil(Math.sqrt(d.qualified + d.rejected) * 4));
  const rejFrac = d.qualified + d.rejected ? d.rejected / (d.qualified + d.rejected) : 0;
  const nContact = Math.min(28, Math.ceil(Math.sqrt(d.contacts) * 4));
  const thrust = Math.abs(r.bank) / 10 + (r.orbit >= 0 ? .3 : 0);

  return (
    <AbsoluteFill style={{ overflow: "hidden", fontFamily: "'Manrope Variable', system-ui, sans-serif" }}>
      <Space r={r} lit={lit} fail={d.failed} done={done} />
      <svg width={WIDTH} height={HEIGHT} style={{ position: "absolute", inset: 0 }}>
        {/* 01 search: orbital scanner sweep, discovered creators appear as points of light */}
        <g opacity={vis(0)}>
          <circle cx={P[0].x} cy={P[0].y} r={P[0].rad * 1.32} fill="none" stroke="rgba(255,180,230,.35)" strokeWidth={1} strokeDasharray="2 7" />
          <g style={{ rotate: `${(ph * 180) / Math.PI * 2}deg`, transformOrigin: `${P[0].x}px ${P[0].y}px` }}>
            <path d={`M${P[0].x} ${P[0].y} L${P[0].x + P[0].rad * 1.32} ${P[0].y} A${P[0].rad * 1.32} ${P[0].rad * 1.32} 0 0 0 ${P[0].x + P[0].rad * 1.32 * Math.cos(.7)} ${P[0].y - P[0].rad * 1.32 * Math.sin(.7)} Z`}
              fill="rgba(232,31,118,.16)" />
            <line x1={P[0].x} y1={P[0].y} x2={P[0].x + P[0].rad * 1.32} y2={P[0].y} stroke="rgba(255,200,235,.8)" strokeWidth={1.2} />
          </g>
          {Array.from({ length: nFound }).map((_, i) => {
            const a = random(`s${i}`) * TAU, rr = P[0].rad * (1.08 + random(`sr${i}`) * .55);
            return <circle key={i} cx={P[0].x + Math.cos(a) * rr} cy={P[0].y + Math.sin(a) * rr * .8} r={2.2} fill="#FFE1F1" opacity={.55 + .45 * Math.sin(ph * 2 + i)} />;
          })}
        </g>
        {/* 02 filter: scanning ring with orbiting creator signals; unsuitable ones fade, qualified ones stay lit */}
        <g opacity={vis(1)}>
          <ellipse cx={P[1].x} cy={P[1].y} rx={P[1].rad * 1.45} ry={P[1].rad * .42} fill="none" stroke="rgba(255,195,0,.45)" strokeWidth={1.4} />
          <ellipse cx={P[1].x} cy={P[1].y} rx={P[1].rad * 1.62} ry={P[1].rad * .5} fill="none" stroke="rgba(255,255,255,.12)" strokeDasharray="1 9" />
          {Array.from({ length: nUnique }).map((_, i) => {
            const a = (i / Math.max(1, nUnique)) * TAU + ph, rejected = i < Math.round(nUnique * rejFrac);
            const x = P[1].x + Math.cos(a) * P[1].rad * 1.45, y = P[1].y + Math.sin(a) * P[1].rad * .42;
            const front = Math.sin(a) > 0 || Math.abs(x - P[1].x) > P[1].rad;
            return front && <circle key={i} cx={x} cy={y} r={rejected ? 2 : 3.2} fill={rejected ? "#8C7FA8" : "#FFD27A"} opacity={rejected ? .25 : .95} />;
          })}
        </g>
        {/* 03 contact: a beam from the craft, contact signals light up on the planet */}
        <g opacity={vis(2)}>
          <defs><linearGradient id="beam" x1="0" x2="1"><stop offset="0" stopColor="#7A2DFF" stopOpacity=".1" /><stop offset="1" stopColor="#8FF5D2" stopOpacity=".85" /></linearGradient></defs>
          {d.enrichTotal > 0 && <>
            <line x1={sx + 130} y1={sy + 38} x2={P[2].x - P[2].rad * .7} y2={P[2].y} stroke="url(#beam)" strokeWidth={3} />
            <circle cx={lerp(sx + 130, P[2].x - P[2].rad * .7, ((f % 60) / 60))} cy={lerp(sy + 38, P[2].y, ((f % 60) / 60))} r={4} fill="#CFFFEF" />
          </>}
          {Array.from({ length: nContact }).map((_, i) => {
            const a = random(`c${i}`) * TAU, rr = P[2].rad * (.35 + random(`cr${i}`) * .55);
            const x = P[2].x + Math.cos(a) * rr, y = P[2].y + Math.sin(a) * rr;
            return <g key={i}><circle cx={x} cy={y} r={2.6} fill="#9CFFD9" /><circle cx={x} cy={y} r={2.6 + 7 * ((f / 40 + random(`cp${i}`)) % 1)} fill="none" stroke="#9CFFD9" opacity={1 - ((f / 40 + random(`cp${i}`)) % 1)} /></g>;
          })}
        </g>
      </svg>

      {/* the spacecraft (behind the planet on the far side of its orbit) */}
      <div style={{ position: "absolute", left: sx, top: sy, rotate: `${r.bank}deg`, scale: `${Math.max(.75, r.z) * (behind ? .82 : 1)}`, opacity: behind ? .35 : 1,
        filter: "drop-shadow(0 10px 18px rgba(0,0,0,.45)) drop-shadow(0 0 14px rgba(232,31,118,.25))" }}>
        <Craft helperSrc={helperSrc} f={f} thrust={Math.min(1, thrust)} dim={d.failed} />
      </div>

      {/* stage typography */}
      {STAGES.map(([n, t, s], k) => {
        const o = stageIdx === k ? interpolate(Math.abs(r.pos - k), [0, .35], [1, 0], C) : 0;
        return o > 0 && (
          <div key={t} style={{ position: "absolute", left: 34, top: 28, opacity: o, translate: `0 ${(1 - o) * 10}px` }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "#FFB3D9", letterSpacing: 3 }}>{n} / 03</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: 4, marginTop: 4 }}>{d.failed ? "SEARCH INTERRUPTED" : t}</div>
            <div style={{ fontSize: 15, color: "rgba(255,255,255,.72)", marginTop: 4 }}>{d.failed ? "Nothing was marked complete. You can run the search again." : s}</div>
          </div>
        );
      })}

      {/* live readouts, beside the active planet */}
      <div style={{ position: "absolute", right: 30, bottom: 30, display: "flex", flexDirection: "column", gap: 8 }}>
        {stageIdx === 0 && <><Chip label="SEARCHES" value={`${d.queriesDone} / ${d.queriesTotal || "…"}`} /><Chip label="CREATORS SEEN" value={String(d.found)} tone="#FFB3D9" /></>}
        {stageIdx === 1 && <><Chip label="QUALIFIED" value={`${d.qualified} / ${d.limit}`} tone="#FFD27A" /><Chip label="FILTERED OUT" value={String(d.rejected)} tone="#B9AED0" />
          <Chip label="DUPLICATES" value={String(d.duplicates)} /><Chip label="MATCH RATE" value={`${d.qualified + d.rejected ? Math.round((d.qualified / (d.qualified + d.rejected)) * 100) : 0}%`} tone="#FFD27A" /></>}
        {stageIdx === 2 && <><Chip label="READING" value={`${d.enriched} / ${d.enrichTotal}`} tone="#9CFFD9" /><Chip label="CONTACT ROUTES" value={String(d.contacts)} tone="#9CFFD9" /></>}
        {stageIdx === 3 && <><Chip label="LEADS" value={`${d.qualified} / ${d.limit}`} tone="#FFD27A" /><Chip label="CONTACT ROUTES" value={String(d.contacts)} tone="#9CFFD9" /></>}
      </div>

      {/* completion: a light sweep and a check */}
      {f >= F && (
        <div style={{ position: "absolute", left: 34, bottom: 34, display: "flex", alignItems: "center", gap: 12, opacity: interpolate(f, [F + 40, F + 80], [0, 1], C) }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, display: "grid", placeItems: "center", color: "#fff", fontWeight: 900, fontSize: 20,
            background: d.qualified ? "linear-gradient(135deg,#7A2DFF,#E81F76 60%,#FF7A00)" : "linear-gradient(135deg,#8C6A2E,#C6A46B)",
            scale: `${interpolate(f, [F + 40, F + 70], [.6, 1], { ...C, easing: Easing.bezier(.34, 1.56, .64, 1) })}` }}>{d.qualified ? "✓" : "!"}</div>
          <div style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>{d.qualified ? `${d.qualified} leads with contact routes` : "No creators matched these filters"}</div>
        </div>
      )}
      <AbsoluteFill style={{ pointerEvents: "none", opacity: f >= F ? interpolate(f, [F + 20, F + 70, F + 110], [0, .35, 0], C) : 0,
        background: "linear-gradient(105deg, transparent 30%, rgba(255,240,220,.5) 50%, transparent 70%)", translate: `${interpolate(f, [F + 20, F + 110], [-60, 60], C)}% 0` }} />
    </AbsoluteFill>
  );
}

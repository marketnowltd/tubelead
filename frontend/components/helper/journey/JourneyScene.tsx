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
  const hold = (k: number) => ({ cx: PL[k][0] - .32, cy: PL[k][1] + .02, z: 1.32 + .025 * Math.sin(ph), sx: PL[k][0] - .78, sy: PL[k][1] + .02 + .018 * Math.sin(ph * 2) });
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

/** Storyboard spacecraft: a sleek violet-and-white jet with a long engine light trail. */
function Jet({ f, thrust, dim }: { f: number; thrust: number; dim: boolean }) {
  const trail = 140 + thrust * 260;
  return (
    <svg width={170} height={60} viewBox="0 0 170 60" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="jt" x1="1" x2="0"><stop offset="0" stopColor="#FFE7B0" /><stop offset=".25" stopColor="#FF7A00" /><stop offset=".7" stopColor="#E81F76" stopOpacity=".5" /><stop offset="1" stopColor="#7A2DFF" stopOpacity="0" /></linearGradient>
        <linearGradient id="jh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset=".5" stopColor="#DCD0F7" /><stop offset="1" stopColor="#6E58A8" /></linearGradient>
        <linearGradient id="jv" x1="0" x2="1"><stop offset="0" stopColor="#7A2DFF" /><stop offset="1" stopColor="#E81F76" /></linearGradient>
        <radialGradient id="jc" cx=".4" cy=".35" r=".8"><stop offset="0" stopColor="#B9E6FF" /><stop offset=".55" stopColor="#3B2A8C" /><stop offset="1" stopColor="#120726" /></radialGradient>
      </defs>
      <path d={`M20 30 L${20 - trail} ${24 - thrust * 3} L${20 - trail} ${36 + thrust * 3} Z`} fill="url(#jt)" opacity={dim ? .25 : .9} />
      <ellipse cx={18} cy={30} rx={9 + Math.sin(f * 1.7) * 1.5} ry={5} fill="#FFE7B0" opacity={dim ? .3 : 1} />
      <path d="M22 24 C60 14 120 16 166 30 C120 44 60 46 22 36 Z" fill="url(#jh)" stroke="#2A1650" strokeWidth="1.2" />
      <path d="M58 22 L34 4 L78 20 Z" fill="url(#jv)" /><path d="M58 38 L34 56 L78 40 Z" fill="url(#jv)" />
      <path d="M40 32 C80 37 120 36 160 31" stroke="url(#jv)" strokeWidth="2.4" fill="none" />
      <path d="M96 22 C110 18 132 20 146 27 C132 27 112 27 96 26 Z" fill="url(#jc)" stroke="#C9B6FF" strokeWidth=".8" />
      <circle cx="164" cy="30" r="1.8" fill="#FF5FA8" opacity={.5 + .5 * Math.sin(f / 4.77)} />
    </svg>
  );
}

const glass: React.CSSProperties = { background: "linear-gradient(135deg, rgba(40,18,80,.78), rgba(22,10,46,.72))", border: "1px solid rgba(201,182,255,.28)",
  borderRadius: 16, backdropFilter: "blur(8px)", boxShadow: "0 18px 40px -18px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.08)", color: "#fff" };
const mono = "'IBM Plex Mono', monospace";

function Card({ o, x, y, icon, title, sub, w = 300 }: { o: number; x: number; y: number; icon: React.ReactNode; title: string; sub: string; w?: number }) {
  return o > .01 ? (
    <div style={{ ...glass, position: "absolute", left: x, top: y, width: w, padding: "12px 16px", display: "flex", gap: 12, alignItems: "center", opacity: o, translate: `${(1 - o) * -14}px 0` }}>
      <div style={{ width: 38, height: 38, borderRadius: 19, border: "1.5px solid rgba(255,179,217,.7)", display: "grid", placeItems: "center", fontSize: 18 }}>{icon}</div>
      <div><div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div><div style={{ fontSize: 12.5, color: "rgba(255,255,255,.7)" }}>{sub}</div></div>
    </div>
  ) : null;
}

function Checklist({ o, x, y, items, done }: { o: number; x: number; y: number; items: string[]; done: number }) {
  return o > .01 ? (
    <div style={{ position: "absolute", left: x, top: y, display: "flex", flexDirection: "column", gap: 7, opacity: o }}>
      {items.map((it, i) => (
        <div key={it} style={{ ...glass, borderRadius: 10, width: 176, padding: "7px 12px", display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 700 }}>
          <span>{it}</span><span style={{ color: i < done ? "#7CF0B4" : "rgba(255,255,255,.45)" }}>{i < done ? "✓" : "•••"}</span>
        </div>
      ))}
    </div>
  ) : null;
}

function BigStat({ o, x, y, top, value, label }: { o: number; x: number; y: number; top: string; value: string; label: string }) {
  return o > .01 ? (
    <div style={{ ...glass, position: "absolute", left: x, top: y, width: 168, padding: "14px 10px", textAlign: "center", opacity: o, scale: `${.94 + .06 * o}` }}>
      <div style={{ width: 30, height: 30, margin: "0 auto", borderRadius: 15, border: "2px solid #7CF0B4", color: "#7CF0B4", display: "grid", placeItems: "center", fontWeight: 900 }}>✓</div>
      <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>{top}</div>
      <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,.72)" }}>{label}</div>
    </div>
  ) : null;
}

export function JourneyScene({ data, helperSrc }: JourneyProps) {
  const f = useCurrentFrame();
  const r = rig(f);
  const d = data;
  const toScreen = (x: number, y: number) => [WIDTH / 2 + (x - r.cx) * r.z * HEIGHT, HEIGHT / 2 - (y - r.cy) * r.z * HEIGHT] as const;
  const P = PL.map((p) => { const [x, y] = toScreen(p[0], p[1]); return { x, y, rad: p[2] * r.z * HEIGHT }; });
  const [sx, sy] = toScreen(r.sx, r.sy);
  const behind = r.orbit >= 0 && Math.sin(r.orbit) > 0;
  const done = interpolate(f, [F, H3], [0, 1], C);
  const lit: [number, number, number] = [interpolate(r.pos, [-.6, 0], [.2, 1], C), interpolate(r.pos, [.4, 1], [.1, 1], C), interpolate(r.pos, [1.4, 2], [.1, 1], C)];
  const at = (k: number) => interpolate(r.pos, [k - .35, k - .05, k + .1, k + .35], [0, 1, 1, 0], C);       // overlays for a stage hold
  const leaving = (a: number) => interpolate(f, [a, a + 12, a + TRAVEL * .6, a + TRAVEL * .85], [0, 1, 1, 0], C); // "complete" cards on departure
  const intro = interpolate(f, [0, 15, 60, 82], [0, 1, 1, 0], C);
  const ph = r.ph;
  const analysed = d.qualified + d.rejected;
  const rate = analysed ? Math.round((d.qualified / analysed) * 100) : 0;
  const nFound = Math.min(18, Math.ceil(Math.sqrt(d.found) * 2.5));
  const nFilter = Math.min(14, Math.ceil(Math.sqrt(analysed) * 2.5));
  const rejCount = Math.round(nFilter * (analysed ? d.rejected / analysed : 0));
  const nContact = Math.min(16, Math.ceil(Math.sqrt(d.contacts) * 3));
  const thrust = Math.min(1, Math.abs(r.bank) / 10 + (r.orbit >= 0 ? .25 : 0));
  const initialising = d.queriesDone === 0 && d.found === 0;
  const node = (k: number, i: number, spread = .85) => {
    const a = random(`n${k}-${i}`) * TAU, rr = P[k].rad * Math.sqrt(random(`r${k}-${i}`)) * spread;
    return [P[k].x + Math.cos(a) * rr, P[k].y + Math.sin(a) * rr * .9] as const;
  };

  return (
    <AbsoluteFill style={{ overflow: "hidden", fontFamily: "'Manrope Variable', system-ui, sans-serif" }}>
      <Space r={r} lit={lit} fail={d.failed} done={done} />

      <svg width={WIDTH} height={HEIGHT} style={{ position: "absolute", inset: 0 }}>
        {/* search: scanning rings and a growing network of discovered creators */}
        <g opacity={Math.max(at(0), leaving(T01))}>
          {[1.18, 1.34].map((k, i) => <ellipse key={k} cx={P[0].x} cy={P[0].y} rx={P[0].rad * k * 1.25} ry={P[0].rad * k * .34} fill="none" stroke={i ? "rgba(255,255,255,.18)" : "rgba(255,120,200,.55)"} strokeWidth={1.4}
            style={{ rotate: "-12deg", transformOrigin: `${P[0].x}px ${P[0].y}px` }} strokeDasharray={i ? "2 8" : undefined} strokeDashoffset={-ph * 40} />)}
          {Array.from({ length: nFound }).map((_, i) => {
            const [x, y] = node(0, i), [x2, y2] = node(0, (i * 7 + 3) % Math.max(1, nFound));
            return <g key={i}><line x1={x} y1={y} x2={x2} y2={y2} stroke="rgba(255,150,210,.35)" strokeWidth={1} />
              <circle cx={x} cy={y} r={7} fill="rgba(232,31,118,.35)" stroke="#FFB3D9" strokeWidth={1.4} /><circle cx={x} cy={y} r={2.4} fill="#fff" opacity={.6 + .4 * Math.sin(ph * 3 + i)} /></g>;
          })}
        </g>
        {/* filter: creator markers on the orange planet; unsuitable ones are crossed out and fade */}
        <g opacity={Math.max(at(1), leaving(T12))}>
          <ellipse cx={P[1].x} cy={P[1].y} rx={P[1].rad * 1.5} ry={P[1].rad * .4} fill="none" stroke="rgba(255,195,0,.5)" strokeWidth={1.6} style={{ rotate: "-10deg", transformOrigin: `${P[1].x}px ${P[1].y}px` }} />
          {Array.from({ length: nFilter }).map((_, i) => {
            const [x, y] = node(1, i), rej = i < rejCount;
            return <g key={i} opacity={rej ? .5 : 1}><circle cx={x} cy={y} r={11} fill={rej ? "rgba(60,30,40,.5)" : "rgba(255,122,0,.3)"} stroke={rej ? "#C77" : "#FFD27A"} strokeWidth={1.6} />
              {rej ? <path d={`M${x - 4} ${y - 4} L${x + 4} ${y + 4} M${x + 4} ${y - 4} L${x - 4} ${y + 4}`} stroke="#F99" strokeWidth={1.6} />
                : <circle cx={x} cy={y - 2} r={3} fill="#FFE7B0" />}</g>;
          })}
        </g>
        {/* contact: signals and connection lines from the ship */}
        <g opacity={Math.max(at(2), interpolate(f, [F, F + 60], [1, 0], C))}>
          {Array.from({ length: nContact }).map((_, i) => {
            const [x, y] = node(2, i, .9), pulse = (f / 45 + random(`cp${i}`)) % 1;
            return <g key={i}><line x1={sx + 150} y1={sy + 30} x2={x} y2={y} stroke="rgba(124,240,180,.18)" strokeWidth={1} />
              <circle cx={x} cy={y} r={4} fill="#9CFFD9" /><circle cx={x} cy={y} r={4 + 10 * pulse} fill="none" stroke="#9CFFD9" opacity={1 - pulse} /></g>;
          })}
        </g>
      </svg>

      {/* the jet (on the far side of its final orbit it passes behind the planet) */}
      <div style={{ position: "absolute", left: sx, top: sy, rotate: `${r.bank}deg`, scale: `${Math.max(.75, r.z) * (behind ? .8 : 1)}`, opacity: behind ? .3 : interpolate(f, [8, 30], [0, 1], C),
        filter: "drop-shadow(0 8px 14px rgba(0,0,0,.45))" }}>
        <Jet f={f} thrust={thrust} dim={d.failed} />
      </div>

      {/* 01 launch intro: brand reveal */}
      {intro > .01 && (
        <AbsoluteFill style={{ display: "grid", placeItems: "center", opacity: intro, scale: `${interpolate(f, [0, 82], [.94, 1.04], C)}` }}>
          <div style={{ textAlign: "center", color: "#fff" }}>
            <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: -1 }}>Tube<span style={{ background: "linear-gradient(90deg,#FF5FA8,#FF7A00)", WebkitBackgroundClip: "text", color: "transparent" }}>Lead</span></div>
            <div style={{ fontSize: 13, letterSpacing: 5, marginTop: 6, color: "rgba(255,255,255,.8)" }}>LEAD GENERATOR · DISCOVERY SYSTEM</div>
          </div>
        </AbsoluteFill>
      )}

      {/* 02 mission initiation / 03 planet search */}
      {initialising && f > 60 && !d.failed && (
        <div style={{ ...glass, position: "absolute", left: WIDTH / 2 - 170, top: 40, width: 340, padding: "14px 18px", display: "flex", gap: 14, alignItems: "center", opacity: at(0) }}>
          <Img src={helperSrc} style={{ width: 40, height: 40, objectFit: "contain" }} />
          <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 16 }}>Initialising Discovery…</div>
            <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,.15)", marginTop: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${d.queriesTotal ? (d.queriesDone / d.queriesTotal) * 100 : 6}%`, background: "linear-gradient(90deg,#7A2DFF,#E81F76)" }} /></div></div>
        </div>
      )}
      <Card o={initialising ? 0 : at(0)} x={26} y={24} icon="◎" title={d.failed ? "Search interrupted" : "Planet Search"} sub={d.failed ? "Nothing was marked complete. Run it again." : "Discovering potential creators…"} />
      {!initialising && at(0) > .01 && (
        <div style={{ ...glass, position: "absolute", right: 26, bottom: 26, width: 150, padding: "12px", textAlign: "center", opacity: at(0) }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.75)" }}>Scanning…</div>
          <div style={{ fontSize: 30, fontWeight: 800 }}>{d.found.toLocaleString()}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,.75)" }}>Channels</div>
        </div>
      )}
      {/* 04 search complete */}
      <BigStat o={leaving(T01)} x={WIDTH - 200} y={HEIGHT / 2 - 90} top="Search Complete" value={d.found.toLocaleString()} label="Creators Found" />

      {/* 06–07 planet filter */}
      <Card o={at(1)} x={26} y={24} icon="⦿" title={d.failed ? "Search interrupted" : "Planet Filter"} sub="Analysing and qualifying creators…" />
      <Checklist o={at(1)} x={WIDTH - 202} y={30} items={["Activity", "Audience", "Niche Match", "Public Email", "Duplicates"]} done={Math.floor((d.found ? analysed / d.found : 0) * 5)} />
      {at(1) > .01 && (
        <svg width={170} height={170} style={{ position: "absolute", left: 30, top: HEIGHT - 196, opacity: at(1) }}>
          <circle cx={85} cy={85} r={66} fill="rgba(26,13,46,.55)" stroke="rgba(255,255,255,.12)" strokeWidth={10} />
          <circle cx={85} cy={85} r={66} fill="none" stroke="url(#rg)" strokeWidth={10} strokeLinecap="round" strokeDasharray={`${(rate / 100) * 414.7} 414.7`} style={{ rotate: "-90deg", transformOrigin: "85px 85px" }} />
          <defs><linearGradient id="rg"><stop offset="0" stopColor="#E81F76" /><stop offset="1" stopColor="#7A2DFF" /></linearGradient></defs>
          <text x={85} y={88} textAnchor="middle" fill="#fff" fontSize={36} fontWeight={800}>{rate}%</text>
          <text x={85} y={112} textAnchor="middle" fill="rgba(255,255,255,.75)" fontSize={14} fontWeight={600}>Qualified</text>
        </svg>
      )}
      {/* 08 filter complete */}
      <BigStat o={leaving(T12)} x={WIDTH - 200} y={HEIGHT / 2 - 90} top="Filter Complete" value={String(d.qualified)} label="Qualified Leads" />

      {/* 10 planet contact */}
      <Card o={at(2)} x={26} y={24} icon="◉" title={d.failed ? "Search interrupted" : "Planet Contact"} sub="Finding verified contact information…" />
      <Checklist o={at(2)} x={WIDTH - 202} y={HEIGHT - 190} items={["Email", "Website", "Social Links", "Contact Pages"]} done={Math.floor((d.enrichTotal ? d.enriched / d.enrichTotal : 0) * 4)} />

      {/* 11 finalising results */}
      {f >= F && f < H3 + 30 && (
        <div style={{ position: "absolute", right: 26, top: 40, display: "flex", flexDirection: "column", gap: 8, opacity: interpolate(f, [F, F + 25, H3, H3 + 30], [0, 1, 1, 0], C) }}>
          {[[d.qualified, "Qualified Leads"], [d.contacts, "Contact Routes"], [d.duplicates, "Duplicates"]].map(([v, l]) => (
            <div key={l} style={{ ...glass, borderRadius: 10, width: 170, padding: "8px 12px" }}><div style={{ fontSize: 20, fontWeight: 800, fontFamily: mono }}>{v}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,.72)" }}>{l}</div></div>
          ))}
        </div>
      )}
      {/* 12 discovery complete, with the mascot */}
      {f >= H3 && (
        <>
          <div style={{ ...glass, position: "absolute", left: WIDTH / 2 - 210, top: HEIGHT / 2 - 64, width: 300, padding: "16px", textAlign: "center",
            opacity: interpolate(f, [H3, H3 + 25], [0, 1], C), scale: `${interpolate(f, [H3, H3 + 25], [.94, 1], { ...C, easing: out })}` }}>
            <div style={{ width: 40, height: 40, margin: "0 auto", borderRadius: 20, border: "2px solid #7CF0B4", color: "#7CF0B4", display: "grid", placeItems: "center", fontWeight: 900, fontSize: 20 }}>{d.qualified ? "✓" : "!"}</div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{d.qualified ? "Discovery Complete" : "No Matches Yet"}</div>
            <div style={{ fontSize: 16, color: "rgba(255,255,255,.85)" }}>{d.qualified ? <><b>{d.qualified}</b> Qualified Leads</> : "Try broader keywords"}</div>
          </div>
          {d.qualified > 0 && <Img src={helperSrc.replace("e_happy", "thumbsup")} style={{ position: "absolute", right: 40, bottom: 10, height: 210,
            opacity: interpolate(f, [H3 + 10, H3 + 35], [0, 1], C), translate: `0 ${interpolate(f, [H3 + 10, H3 + 40], [30, 0], { ...C, easing: out })}px` }} />}
        </>
      )}
    </AbsoluteFill>
  );
}

"use client";
/**
 * The product story as a Remotion composition, in four scenes: find leads → send the campaign → the creator opens the
 * email → a sale comes in. Phones get a portrait composition so the text stays readable. The step tabs below follow
 * the player's frame, and GSAP handles the scroll entrance and the call-to-action button.
 */
import { Player, type PlayerRef } from "@remotion/player";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

const C = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const out = Easing.bezier(.16, 1, .3, 1);
const INK = "#1A0D2E", VIOLET = "#7A2DFF", PINK = "#E81F76", ORANGE = "#FF7A00";
const GRAD = `linear-gradient(110deg,${VIOLET},${PINK},${ORANGE})`;
const SCENE = 120, FADE = 14, TOTAL = SCENE * 4;
const STEPS = ["Find leads", "Send campaign", "Email opened", "Sale made"];
const ROWS = [["Sam's Home Fitness", "sam@samfit.example"], ["Lift With Priya", "priya@liftwith.example"], ["Coach Dan Runs", "dan@coachdan.example"], ["Core & Calm Yoga", "hello@corecalm.example"]];
const SOURCES = ["YouTube", "Google", "Podcasts", "Twitch", "Bluesky", "Vimeo"];

type P = { portrait: boolean };
const glass = { background: "rgba(255,255,255,.92)", borderRadius: 22, border: "1px solid rgba(122,45,255,.16)", boxShadow: "0 30px 70px -30px rgba(122,45,255,.55)" } as const;

/** One scene: slides and fades in, then lifts away, so each step hands over to the next. */
function Scene({ i, children }: { i: number; children: (f: number) => React.ReactNode }) {
  const f = useCurrentFrame() - i * SCENE;
  if (f < -1 || f > SCENE + FADE) return null;
  const a = interpolate(f, [0, FADE], [0, 1], { ...C, easing: out });
  const b = i === 3 ? 0 : interpolate(f, [SCENE, SCENE + FADE], [0, 1], { ...C, easing: Easing.in(Easing.cubic) });
  return (
    <AbsoluteFill style={{ opacity: a * (1 - b), transform: `translateY(${(1 - a) * 46 - b * 40}px) scale(${.96 + a * .04 - b * .03})`, filter: `blur(${(1 - a) * 8 + b * 8}px)` }}>
      {children(f)}
    </AbsoluteFill>
  );
}

function Cursor({ x, y, tap }: { x: number; y: number; tap: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, zIndex: 5 }}>
      <div style={{ position: "absolute", left: -22, top: -22, width: 44, height: 44, borderRadius: 99, border: `3px solid ${VIOLET}`, opacity: tap * (1 - tap) * 3, scale: `${.5 + tap * 1.3}` }} />
      <svg width="30" height="30" viewBox="0 0 24 24" style={{ scale: `${1 - Math.sin(tap * Math.PI) * .18}`, filter: "drop-shadow(0 4px 6px rgba(26,13,46,.35))" }}>
        <path d="M4 2l15 9-6.5 1.6L9.6 19z" fill={INK} stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Find({ f, portrait }: { f: number } & P) {
  const k = portrait ? 1.3 : 1;
  const typed = "UK fitness creators".slice(0, Math.floor(interpolate(f, [8, 34], [0, 19], C)));
  const press = interpolate(f, [38, 42, 46], [1, .93, 1], C);
  const prog = interpolate(f, [46, 78], [0, 100], { ...C, easing: Easing.bezier(.4, 0, .2, 1) });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 * k, height: "100%", justifyContent: "center" }}>
      <div style={{ ...glass, padding: 16 * k, display: "flex", gap: 12, alignItems: "center", flexDirection: portrait ? "column" : "row" }}>
        <div style={{ flex: 1, alignSelf: "stretch", fontSize: 24 * k, padding: `${13 * k}px 18px`, borderRadius: 14, border: "2px solid #E5D9FF", background: "#fff" }}>{typed}<span style={{ opacity: f % 24 < 12 ? 1 : 0, color: VIOLET }}>|</span></div>
        <div style={{ scale: `${press}`, alignSelf: "stretch", textAlign: "center", padding: `${15 * k}px 30px`, borderRadius: 999, color: "#fff", fontWeight: 800, fontSize: 21 * k, background: GRAD, boxShadow: `0 14px 30px -12px ${PINK}` }}>Find Leads</div>
      </div>
      <div style={{ opacity: interpolate(f, [44, 52], [0, 1], C) }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18 * k, fontWeight: 800 }}>
          <span>{prog < 100 ? "Searching 18 sources" : "25 leads with published emails"}</span><span style={{ color: VIOLET, fontVariantNumeric: "tabular-nums" }}>{Math.round(prog)}%</span>
        </div>
        <div style={{ height: 10 * k, borderRadius: 9, background: "#EEE6FF", marginTop: 8, overflow: "hidden" }}><div style={{ height: "100%", width: `${prog}%`, borderRadius: 9, background: GRAD }} /></div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {SOURCES.map((s, i) => {
            const on = interpolate(prog, [i * 15, i * 15 + 14], [0, 1], C);
            return <span key={s} style={{ fontSize: 14 * k, fontWeight: 700, padding: `${5 * k}px ${12 * k}px`, borderRadius: 99, background: on > .5 ? INK : "#fff", color: on > .5 ? "#fff" : "#8B7BA8", border: "1px solid #E5D9FF", scale: `${1 + Math.sin(on * Math.PI) * .12}` }}>{on > .99 ? "✓ " : ""}{s}</span>;
          })}
        </div>
      </div>
      <div style={{ ...glass, padding: `${6 * k}px 20px` }}>
        {ROWS.slice(0, portrait ? 3 : 4).map(([n, e], i, all) => {
          const o = interpolate(f, [80 + i * 6, 94 + i * 6], [0, 1], { ...C, easing: out });
          return <div key={n} style={{ display: "flex", flexDirection: portrait ? "column" : "row", justifyContent: "space-between", gap: 2, padding: `${11 * k}px 0`, borderBottom: i < all.length - 1 ? "1px solid #F1EAFF" : "none", opacity: o, translate: `${(1 - o) * -24}px 0`, fontSize: 19 * k }}>
            <b>{n}</b><span style={{ color: VIOLET, fontWeight: 700 }}>{e}</span></div>;
        })}
      </div>
    </div>
  );
}

function Send({ f, portrait, w, h }: { f: number; w: number; h: number } & P) {
  const k = portrait ? 1.3 : 1;
  const subject = "Quick idea for your channel".slice(0, Math.floor(interpolate(f, [18, 44], [0, 27], C)));
  const press = interpolate(f, [70, 74, 78], [1, .93, 1], C);
  const sent = Math.round(interpolate(f, [78, 108], [0, 25], C));
  const line = (i: number, wd: string) => <div key={i} style={{ height: 11 * k, width: wd, borderRadius: 9, background: "#E9E0FA", scale: `${interpolate(f, [40 + i * 5, 54 + i * 5], [0, 1], { ...C, easing: out })} 1`, transformOrigin: "left" }} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "center" }}>
      <div style={{ ...glass, padding: 24 * k, display: "flex", flexDirection: "column", gap: 14 * k }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 17 * k, color: "#8B7BA8", fontWeight: 700 }}>To
          <span style={{ padding: `${5 * k}px ${12 * k}px`, borderRadius: 99, background: "#F1EAFF", color: VIOLET }}>25 fitness creators</span>
          {!portrait && <span style={{ marginLeft: "auto", fontSize: 14 }}>Sent from your own Gmail</span>}
        </div>
        <div style={{ fontSize: 25 * k, fontWeight: 800, borderBottom: "1px solid #F1EAFF", paddingBottom: 12 * k, minHeight: 34 * k }}>{subject}<span style={{ opacity: f > 18 && f < 48 ? 1 : 0, color: VIOLET }}>|</span></div>
        <div style={{ fontSize: 19 * k, opacity: interpolate(f, [38, 46], [0, 1], C) }}>Hi <b style={{ color: PINK, background: "#FFE9F2", padding: "1px 8px", borderRadius: 7 }}>{"{first name}"}</b>, loved your latest video.</div>
        {[["96%"], ["88%"], ["62%"]].map(([wd], i) => line(i, wd))}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 6 * k }}>
          <div style={{ scale: `${press}`, padding: `${14 * k}px ${28 * k}px`, borderRadius: 999, color: "#fff", fontWeight: 800, fontSize: 20 * k, background: GRAD, boxShadow: `0 14px 30px -12px ${PINK}` }}>Send campaign</div>
          <div style={{ fontSize: 19 * k, fontWeight: 800, opacity: interpolate(f, [78, 84], [0, 1], C), fontVariantNumeric: "tabular-nums" }}><span style={{ color: VIOLET }}>{sent}</span> / 25 sent</div>
        </div>
      </div>
      {Array.from({ length: 7 }, (_, i) => {
        const t = interpolate(f, [78 + i * 4, 108 + i * 4], [0, 1], { ...C, easing: Easing.bezier(.5, 0, .2, 1) });
        if (t <= 0 || t >= 1) return null;
        return <div key={i} style={{ position: "absolute", left: w * .28 + t * w * (.5 + i * .04), top: h * .7 - Math.sin(t * Math.PI) * (140 + i * 26) - t * h * .5, fontSize: 30 * k, opacity: 1 - t * t, rotate: `${-18 + t * 30}deg` }}>✉️</div>;
      })}
      <Cursor x={interpolate(f, [52, 70], [w * .7, portrait ? w * .28 : w * .17], { ...C, easing: out })} y={interpolate(f, [52, 70], [h * .2, h * (portrait ? .7 : .76)], { ...C, easing: out })} tap={interpolate(f, [70, 80], [0, 1], C)} />
    </div>
  );
}

function Open({ f, portrait, w, h }: { f: number; w: number; h: number } & P) {
  const k = portrait ? 1.3 : 1;
  const { fps } = useVideoConfig();
  const drop = spring({ frame: f - 8, fps, config: { damping: 13, stiffness: 120 } });
  const open = interpolate(f, [44, 62], [0, 1], { ...C, easing: out });
  const press = interpolate(f, [92, 96, 100], [1, .93, 1], C);
  const mw = portrait ? w * .86 : w * .56;
  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center" }}>
      <div style={{ width: mw, position: "relative" }}>
        <div style={{ ...glass, padding: 16 * k, display: "flex", gap: 14, alignItems: "center", translate: `0 ${(1 - drop) * -h * .5}px`, opacity: 1 - open, scale: `${1 - open * .08}`, position: open > 0 ? "absolute" : "relative", inset: open > 0 ? "0 0 auto 0" : undefined }}>
          <div style={{ width: 50 * k, height: 50 * k, borderRadius: 14, background: GRAD, display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 20 * k }}>YB</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14 * k, color: "#8B7BA8", fontWeight: 700 }}>Sam&apos;s inbox · now</div>
            <div style={{ fontSize: 19 * k, fontWeight: 800 }}>Quick idea for your channel</div>
          </div>
          <span style={{ width: 12 * k, height: 12 * k, borderRadius: 99, background: PINK }} />
        </div>
        <div style={{ ...glass, padding: 26 * k, opacity: open, scale: `${.9 + open * .1}`, transformOrigin: "top", display: "flex", flexDirection: "column", gap: 13 * k }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 * k, fontWeight: 800 }}><span style={{ color: "#8B7BA8" }}>From Your Brand</span><span style={{ color: "#12A150", background: "#E6F8EE", padding: `${3 * k}px ${10 * k}px`, borderRadius: 99 }}>● Opened</span></div>
          <div style={{ fontSize: 24 * k, fontWeight: 800 }}>Quick idea for your channel</div>
          <div style={{ fontSize: 18 * k, lineHeight: 1.45, color: "#4B3F63" }}>Hi Sam, loved your latest video. We make resistance bands your viewers would love, with 20% off for your audience.</div>
          <div style={{ scale: `${press}`, alignSelf: "flex-start", padding: `${13 * k}px ${26 * k}px`, borderRadius: 999, color: "#fff", fontWeight: 800, fontSize: 19 * k, background: INK }}>View the offer →</div>
        </div>
      </div>
      <Cursor x={interpolate(f, [24, 42, 74, 92], [w * .85, w * .5, w * .5, (w - mw) / 2 + 90 * k], { ...C, easing: out })} y={interpolate(f, [24, 42, 74, 92], [h * .85, h * .46, h * .46, h * (portrait ? .66 : .74)], { ...C, easing: out })} tap={f < 70 ? interpolate(f, [42, 52], [0, 1], C) : interpolate(f, [92, 102], [0, 1], C)} />
    </div>
  );
}

function Sale({ f, portrait }: { f: number } & P) {
  const k = portrait ? 1.3 : 1;
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f - 6, fps, config: { damping: 11, stiffness: 140 } });
  const tick = interpolate(f, [16, 34], [60, 0], { ...C, easing: out });
  const amount = interpolate(f, [22, 50], [0, 49], { ...C, easing: out });
  const stats: [string, number][] = [["Leads found", 25], ["Emails sent", 25], ["Opened", 14], ["Sales", 3]];
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 * k, textAlign: "center" }}>
      {Array.from({ length: 16 }, (_, i) => {
        const t = interpolate(f, [14, 60], [0, 1], { ...C, easing: out }), a = (i / 16) * Math.PI * 2;
        return <span key={i} style={{ position: "absolute", left: "50%", top: portrait ? "30%" : "28%", width: 10 * k, height: 10 * k, borderRadius: i % 2 ? 99 : 3, background: [VIOLET, PINK, ORANGE][i % 3], translate: `${Math.cos(a) * t * (170 + (i % 4) * 36) * k}px ${Math.sin(a) * t * (120 + (i % 3) * 30) * k + t * t * 60}px`, opacity: (1 - t) * (f > 14 ? 1 : 0), rotate: `${t * 240}deg` }} />;
      })}
      <div style={{ width: 92 * k, height: 92 * k, borderRadius: 99, background: GRAD, display: "grid", placeItems: "center", scale: `${pop}`, boxShadow: `0 24px 50px -18px ${PINK}` }}>
        <svg width={46 * k} height={46 * k} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="60" strokeDashoffset={tick} /></svg>
      </div>
      <div style={{ opacity: interpolate(f, [18, 30], [0, 1], C) }}>
        <div style={{ fontSize: 17 * k, fontWeight: 800, color: "#8B7BA8", letterSpacing: ".12em" }}>NEW ORDER</div>
        <div style={{ fontSize: 62 * k, fontWeight: 800, letterSpacing: "-.03em", fontVariantNumeric: "tabular-nums", background: GRAD, WebkitBackgroundClip: "text", color: "transparent", lineHeight: 1.1 }}>£{amount.toFixed(2)}</div>
        <div style={{ fontSize: 18 * k, fontWeight: 700 }}>from Sam&apos;s Home Fitness</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${portrait ? 2 : 4}, 1fr)`, gap: 12 * k, width: "100%" }}>
        {stats.map(([l, n], i) => {
          const o = interpolate(f, [48 + i * 7, 62 + i * 7], [0, 1], { ...C, easing: out });
          return <div key={l} style={{ ...glass, padding: `${14 * k}px 8px`, opacity: o, translate: `0 ${(1 - o) * 22}px` }}>
            <div style={{ fontSize: 34 * k, fontWeight: 800, color: i === 3 ? PINK : INK, fontVariantNumeric: "tabular-nums" }}>{Math.round(n * o)}</div>
            <div style={{ fontSize: 14 * k, fontWeight: 700, color: "#8B7BA8" }}>{l}</div></div>;
        })}
      </div>
    </div>
  );
}

function Demo({ portrait }: P) {
  const f = useCurrentFrame();
  const { width: w, height: h } = useVideoConfig();
  const pad = portrait ? 44 : 56, top = portrait ? 96 : 84;
  const iw = w - pad * 2, ih = h - top - pad;
  const step = Math.min(3, Math.floor(f / SCENE));
  return (
    <AbsoluteFill style={{ background: "#F7F1FF", fontFamily: "'Manrope Variable',system-ui,sans-serif", color: INK, overflow: "hidden" }}>
      {[[VIOLET, .12, .2], [PINK, .85, .25], [ORANGE, .6, .95]].map(([c, x, y], i) => (
        <div key={i} style={{ position: "absolute", width: w * .7, height: w * .7, borderRadius: "50%", background: c as string, opacity: .2, filter: "blur(110px)",
          left: (x as number) * w - w * .35 + Math.sin(f / 70 + i * 2) * 50, top: (y as number) * h - w * .35 + Math.cos(f / 85 + i) * 40 }} />
      ))}
      <div style={{ position: "absolute", left: pad, right: pad, top: portrait ? 36 : 30, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: portrait ? 22 : 17, fontWeight: 800, color: "#fff", background: INK, borderRadius: 99, padding: portrait ? "8px 18px" : "6px 15px" }}>{step + 1} / 4</span>
        <span style={{ fontSize: portrait ? 26 : 20, fontWeight: 800 }}>{STEPS[step]}</span>
        <div style={{ flex: 1, height: 5, borderRadius: 9, background: "rgba(122,45,255,.15)", overflow: "hidden" }}><div style={{ height: "100%", width: `${(f / TOTAL) * 100}%`, background: GRAD }} /></div>
      </div>
      <div style={{ position: "absolute", left: pad, top, width: iw, height: ih }}>
        <Scene i={0}>{(x) => <Find f={x} portrait={portrait} />}</Scene>
        <Scene i={1}>{(x) => <Send f={x} portrait={portrait} w={iw} h={ih} />}</Scene>
        <Scene i={2}>{(x) => <Open f={x} portrait={portrait} w={iw} h={ih} />}</Scene>
        <Scene i={3}>{(x) => <Sale f={x} portrait={portrait} />}</Scene>
      </div>
    </AbsoluteFill>
  );
}

export function ProductDemo() {
  const root = useRef<HTMLElement>(null);
  const player = useRef<PlayerRef>(null);
  const [portrait, setPortrait] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const mq = matchMedia("(max-width: 640px)");
    const on = () => setPortrait(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const on = (e: { detail: { frame: number } }) => setStep(Math.min(3, Math.floor(e.detail.frame / SCENE)));
    p.addEventListener("frameupdate", on);
    return () => p.removeEventListener("frameupdate", on);
  }, [portrait]);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let kill = () => {};
    (async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);
      const ctx = gsap.context(() => {
        gsap.fromTo(".pd-stage", { y: 60, scale: .93, rotateX: 10 }, { y: 0, scale: 1, rotateX: 0, ease: "none", scrollTrigger: { trigger: ".pd-stage", start: "top 95%", end: "top 45%", scrub: .6 } });
        gsap.fromTo(".pd-step", { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: .6, stagger: .08, ease: "power3.out", clearProps: "transform", scrollTrigger: { trigger: ".pd-steps", start: "top 92%" } });
        gsap.to(".pd-shine", { xPercent: 320, duration: 1.1, ease: "power2.inOut", repeat: -1, repeatDelay: 2.2 });
        gsap.to(".pd-cta", { scale: 1.035, duration: 1.1, ease: "sine.inOut", yoyo: true, repeat: -1 });
      }, root);
      kill = () => ctx.revert();
    })();
    return () => kill();
  }, []);

  const [cw, ch] = portrait ? [720, 1000] : [1100, 600];
  return (
    <section ref={root} id="demo-video" aria-label="How TubeLead works" className="mx-auto max-w-[1100px] px-5 py-16">
      <p className="label mb-2 text-center text-forest">The whole journey in 16 seconds</p>
      <h2 className="mb-6 text-center font-display text-[32px] font-extrabold tracking-tight">From a niche to a sale.</h2>
      <div style={{ perspective: 1400 }}>
        <div className="pd-stage overflow-hidden rounded-[24px] shadow-pop" style={{ transformOrigin: "50% 100%" }}>
          <Player key={portrait ? "p" : "l"} ref={player} component={Demo} inputProps={{ portrait }} durationInFrames={TOTAL} fps={30} compositionWidth={cw} compositionHeight={ch}
            style={{ width: "100%", aspectRatio: `${cw} / ${ch}` }} autoPlay loop controls={false} numberOfSharedAudioTags={0} acknowledgeRemotionLicense />
        </div>
      </div>
      <div className="pd-steps mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((s, i) => (
          <button key={s} type="button" onClick={() => { player.current?.seekTo(i * SCENE); player.current?.play(); }} aria-current={step === i ? "step" : undefined}
            className={"pd-step rounded-2xl border px-3 py-3 text-left text-[13.5px] font-bold transition-colors duration-300 " + (step === i ? "border-transparent bg-ink text-white shadow-pop" : "border-forest/15 bg-white/80 text-ink hover:border-forest/40")}>
            <span className={"mr-2 font-mono text-[11px] " + (step === i ? "text-white/60" : "text-forest")}>0{i + 1}</span>{s}
          </button>
        ))}
      </div>
      <div className="mt-7 flex flex-col items-center gap-2">
        <Link href={`/signup?next=${encodeURIComponent("/lead-generator")}`}
          className="pd-cta relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-[linear-gradient(110deg,#7A2DFF,#E81F76,#FF7A00)] px-8 py-4 text-[16px] font-extrabold text-white shadow-pop">
          <span aria-hidden className="pd-shine pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/35 blur-md" />
          Find my first 25 leads free <span aria-hidden>→</span>
        </Link>
        <p className="text-center text-xs text-dim">Illustration with sample data. Results depend on your offer.</p>
      </div>
    </section>
  );
}

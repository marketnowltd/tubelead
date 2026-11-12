"use client";
/** Remotion: how one lead is found. Sources → profile → website → email → your list. Loops. */
import { Player } from "@remotion/player";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { SourceIcon } from "@/components/ui/SourceIcon";

const C = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(.16, 1, .3, 1);
const SRC = ["youtube", "applepodcasts", "bluesky", "serp_google", "dailymotion", "mastodon"];
const STEPS = [["Searched", "18 sources at once"], ["Profile read", "bio, feed, channel"], ["Website checked", "site & contact page"], ["Email found", "published by the creator"], ["Added to your list", "ready to export"]];

function Scene() {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "radial-gradient(120% 140% at 0% 0%, #2A1458, #12082A 70%)", fontFamily: "'Manrope Variable',system-ui,sans-serif", color: "#fff", padding: 44 }}>
      <div style={{ display: "flex", gap: 14 }}>
        {SRC.map((s, i) => {
          const o = interpolate(f, [i * 5, i * 5 + 15], [0, 1], { ...C, easing: ease });
          return <div key={s} style={{ width: 64, height: 64, borderRadius: 18, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", display: "grid", placeItems: "center",
            opacity: o, translate: `0 ${(1 - o) * 20}px`, boxShadow: f > 40 + i * 4 && f < 70 + i * 4 ? "0 0 22px rgba(232,31,118,.7)" : "none" }}><SourceIcon source={s} size={30} /></div>;
        })}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 42 }}>
        {STEPS.map(([t, s], i) => {
          const start = 50 + i * 30, o = interpolate(f, [start, start + 18], [0, 1], { ...C, easing: ease });
          const done = f > start + 22;
          return <div key={t} style={{ flex: 1, padding: 18, borderRadius: 18, opacity: .25 + .75 * o, scale: `${.94 + .06 * o}`,
            background: done ? "linear-gradient(135deg,rgba(122,45,255,.55),rgba(232,31,118,.45))" : "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)" }}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{done ? "✓" : i + 1}</div>
            <div style={{ fontSize: 19, fontWeight: 800, marginTop: 6 }}>{t}</div>
            <div style={{ fontSize: 14, opacity: .75, marginTop: 4 }}>{s}</div>
          </div>;
        })}
      </div>
      <div style={{ marginTop: 34, display: "flex", alignItems: "center", gap: 16, opacity: interpolate(f, [190, 210], [0, 1], C), translate: `0 ${interpolate(f, [190, 215], [16, 0], { ...C, easing: ease })}px` }}>
        <div style={{ padding: "14px 22px", borderRadius: 16, background: "#fff", color: "#1A0D2E", fontSize: 20, fontWeight: 700 }}>Chef Ana Cooks · <span style={{ color: "#7A2DFF" }}>bookings@anacooks.example</span></div>
        <div style={{ fontSize: 16, opacity: .8 }}>Sample lead</div>
      </div>
    </AbsoluteFill>
  );
}

export function LeadJourney() {
  return (
    <section id="reviews" aria-label="How a lead is found" className="mx-auto max-w-[1180px] px-5 py-20">
      <p className="label mb-2 text-center text-forest" data-gsap="rise">Behind every lead</p>
      <h2 className="mb-3 text-center font-display text-[34px] font-extrabold tracking-tight" data-gsap="rise">From 18 sources to one verified email</h2>
      <p className="mx-auto mb-8 max-w-xl text-center text-mute" data-gsap="rise">Only addresses creators publish themselves. Nothing is guessed, and nothing is scraped from private places.</p>
      <div className="overflow-hidden rounded-[26px] shadow-pop" data-gsap="rise">
        <Player component={Scene} durationInFrames={300} fps={30} compositionWidth={1180} compositionHeight={460} style={{ width: "100%" }}
          autoPlay loop controls={false} numberOfSharedAudioTags={0} acknowledgeRemotionLicense />
      </div>
    </section>
  );
}

"use client";
/** Remotion: the live discovery percentage and every source being searched. The page drives the numbers; Remotion
 * drives the ambient motion (looping). */
import { Player } from "@remotion/player";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { SourceIcon, SOURCE_LABEL } from "@/components/ui/SourceIcon";

export const SOURCES = ["youtube", "serp_google", "serp_bing", "serp_duckduckgo", "serp_brave", "serp_yahoo", "google", "applepodcasts", "twitch", "bluesky", "mastodon", "dailymotion", "vimeo", "reddit", "musicbrainz"];
const TAU = Math.PI * 2;

interface P { pct: number; done: boolean; phase: number; status: string }

function Scene({ pct, done, phase }: P) {
  const f = useCurrentFrame();
  const r = 118, c = TAU * r;
  const shown = Math.round(pct);
  const pulse = 1 + Math.sin((f / 30) * TAU) * .025;
  // each source lights up in turn while searching; all ticked when done
  const active = done ? -1 : Math.floor(f / 8) % SOURCES.length;
  return (
    <AbsoluteFill style={{ background: "radial-gradient(120% 140% at 50% 0%, #2A1458, #12082A 70%)", fontFamily: "'Manrope Variable',system-ui,sans-serif", color: "#fff" }}>
      {/* ring */}
      <div style={{ position: "absolute", left: 40, top: 30, width: 300, height: 300 }}>
        <svg viewBox="0 0 300 300" width={300} height={300} style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7A2DFF" /><stop offset=".55" stopColor="#E81F76" /><stop offset="1" stopColor="#FF7A00" /></linearGradient>
            <filter id="glow"><feGaussianBlur stdDeviation="6" /></filter>
          </defs>
          <circle cx="150" cy="150" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="22" />
          <circle cx="150" cy="150" r={r} fill="none" stroke="url(#pg)" strokeWidth="22" strokeLinecap="round" filter="url(#glow)" opacity=".7"
            strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ rotate: "-90deg", transformOrigin: "150px 150px" }} />
          <circle cx="150" cy="150" r={r} fill="none" stroke="url(#pg)" strokeWidth="22" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ rotate: "-90deg", transformOrigin: "150px 150px" }} />
          {/* spark riding the head of the ring */}
          {!done && (() => { const a = (pct / 100) * TAU - Math.PI / 2; return <circle cx={150 + Math.cos(a) * r} cy={150 + Math.sin(a) * r} r={9 + Math.sin(f / 3) * 2} fill="#FFE7B0" filter="url(#glow)" />; })()}
          {/* orbiting particles */}
          {Array.from({ length: 10 }).map((_, i) => {
            const a = (f / 90) * TAU + (i / 10) * TAU;
            return <circle key={i} cx={150 + Math.cos(a) * 146} cy={150 + Math.sin(a) * 146} r={2.4} fill={["#7A2DFF", "#E81F76", "#FF7A00", "#FFC300"][i % 4]} opacity={.6} />;
          })}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
          <div>
            <div style={{ fontSize: 76, fontWeight: 900, letterSpacing: -3, lineHeight: 1, scale: `${done ? interpolate(f % 60, [0, 10, 30], [1.08, 1, 1]) : pulse}`,
              background: "linear-gradient(135deg,#fff,#FFD6EC 60%,#FFC300)", WebkitBackgroundClip: "text", color: "transparent" }}>{shown}%</div>
            <div style={{ marginTop: 6, fontSize: 15, fontWeight: 800, letterSpacing: 4, color: done ? "#7CF0B4" : "#FFB3D9" }}>{done ? "COMPLETE" : "SEARCHING"}</div>
          </div>
        </div>
      </div>
      {/* sources grid */}
      <div style={{ position: "absolute", left: 380, top: 34, right: 30 }}>
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 3, color: "rgba(255,255,255,.7)", marginBottom: 12 }}>{done ? "ALL SOURCES SEARCHED" : "SEARCHING EVERY SOURCE"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9 }}>
          {SOURCES.map((s, i) => {
            const isOn = i === active || (!done && (i + 4) % SOURCES.length === active);
            const ticked = done || phase > 1;
            return (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 12, fontSize: 14, fontWeight: 700,
                background: isOn ? "linear-gradient(135deg,rgba(122,45,255,.55),rgba(232,31,118,.4))" : "rgba(255,255,255,.06)",
                border: `1px solid ${isOn ? "rgba(255,179,217,.7)" : "rgba(255,255,255,.12)"}`, boxShadow: isOn ? "0 0 18px rgba(232,31,118,.55)" : "none" }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: "#fff", display: "grid", placeItems: "center" }}><SourceIcon source={s} size={15} /></div>
                <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{SOURCE_LABEL[s] ?? s}</span>
                <span style={{ color: ticked ? "#7CF0B4" : isOn ? "#FFE7B0" : "rgba(255,255,255,.35)" }}>{ticked ? "✓" : isOn ? "●" : "…"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

export function ProgressScene({ pct, done, phase, status }: P) {
  return (
    <div className="overflow-hidden rounded-[22px] shadow-pop" role="img" aria-label={`Discovery ${Math.round(pct)}% ${done ? "complete" : "in progress"}`}>
      <Player component={Scene} inputProps={{ pct, done, phase, status }} durationInFrames={240} fps={30} compositionWidth={960} compositionHeight={360}
        style={{ width: "100%" }} autoPlay loop controls={false} numberOfSharedAudioTags={0} acknowledgeRemotionLicense />
    </div>
  );
}

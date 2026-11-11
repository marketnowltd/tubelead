"use client";
/** A short product demo as a Remotion composition: type a niche → search runs → leads with emails → export. */
import { Player } from "@remotion/player";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

const C = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(.16, 1, .3, 1);
const ROWS = [["Sam's Home Fitness", "sam@samfit.example"], ["Budget Travel Diaries", "hello@budgettravel.example"], ["Chef Ana Cooks", "bookings@anacooks.example"], ["Tech in 10", "team@techin10.example"]];

function Demo() {
  const f = useCurrentFrame();
  const typed = "UK fitness creators".slice(0, Math.floor(interpolate(f, [10, 55], [0, 19], C)));
  const press = interpolate(f, [62, 66, 70], [1, .94, 1], C);
  const prog = interpolate(f, [72, 140], [0, 100], { ...C, easing: Easing.bezier(.4, 0, .2, 1) });
  const card = { background: "#fff", borderRadius: 18, boxShadow: "0 20px 50px -25px rgba(122,45,255,.5)", border: "1px solid rgba(122,45,255,.15)" };
  return (
    <AbsoluteFill style={{ background: "linear-gradient(135deg,#F7F1FF,#FFF3E9)", fontFamily: "'Manrope Variable',system-ui,sans-serif", padding: 40, color: "#1A0D2E" }}>
      <div style={{ ...card, padding: 18, display: "flex", gap: 14, alignItems: "center" }}>
        <div style={{ flex: 1, fontSize: 26, padding: "14px 18px", borderRadius: 12, border: "2px solid #E5D9FF" }}>{typed}<span style={{ opacity: f % 30 < 15 ? 1 : 0 }}>|</span></div>
        <div style={{ scale: `${press}`, padding: "16px 30px", borderRadius: 999, color: "#fff", fontWeight: 800, fontSize: 22, background: "linear-gradient(110deg,#7A2DFF,#E81F76,#FF7A00)" }}>Find Leads 🚀</div>
      </div>
      <div style={{ marginTop: 22, opacity: interpolate(f, [70, 80], [0, 1], C) }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{prog < 100 ? `Searching 18 sources… ${Math.round(prog)}%` : "✓ 25 leads with published emails"}</div>
        <div style={{ height: 10, borderRadius: 5, background: "#EEE6FF", marginTop: 8 }}><div style={{ height: "100%", width: `${prog}%`, borderRadius: 5, background: "linear-gradient(90deg,#7A2DFF,#E81F76)" }} /></div>
      </div>
      <div style={{ ...card, marginTop: 22, padding: "8px 20px" }}>
        {ROWS.map(([n, e], i) => {
          const o = interpolate(f, [145 + i * 8, 160 + i * 8], [0, 1], { ...C, easing: ease });
          return <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: i < 3 ? "1px solid #F1EAFF" : "none", opacity: o, translate: `0 ${(1 - o) * 14}px`, fontSize: 20 }}>
            <b>{n}</b><span style={{ color: "#7A2DFF", fontWeight: 600 }}>{e}</span></div>;
        })}
      </div>
      <div style={{ position: "absolute", right: 40, bottom: 34, opacity: interpolate(f, [200, 215], [0, 1], C), scale: `${interpolate(f, [200, 215], [.9, 1], { ...C, easing: ease })}`,
        padding: "14px 26px", borderRadius: 999, background: "#1A0D2E", color: "#fff", fontWeight: 800, fontSize: 20 }}>⬇ Export Lead & Email CSV</div>
    </AbsoluteFill>
  );
}

export function ProductDemo() {
  return (
    <section id="demo-video" aria-label="How TubeLead works" className="mx-auto max-w-[1100px] px-5 py-16">
      <p className="label mb-2 text-center text-forest">See it in 10 seconds</p>
      <h2 className="mb-6 text-center font-display text-[32px] font-extrabold tracking-tight">Type a niche. Get leads with emails.</h2>
      <div className="overflow-hidden rounded-[24px] shadow-pop">
        <Player component={Demo} durationInFrames={270} fps={30} compositionWidth={1100} compositionHeight={560} style={{ width: "100%" }}
          autoPlay loop controls={false} numberOfSharedAudioTags={0} acknowledgeRemotionLicense />
      </div>
      <p className="mt-3 text-center text-xs text-dim">Illustration with sample data.</p>
    </section>
  );
}

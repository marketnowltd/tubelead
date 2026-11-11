"use client";
/**
 * While a discovery runs, the TubeLead Helper flies his rocket from planet to planet. Each planet is a real stage of
 * the job, read from the job record (the same live data as the progress panel), so the rocket never runs ahead of the
 * search: it reaches the last planet only when the results are complete.
 *
 * The scene is a Remotion composition (journey/JourneyScene.tsx) shown with Remotion's <Player>. Its frame is driven
 * here: while a stage runs, the rocket loops at that planet; when the job moves on, it flies to the next planet
 * (faster when it is more than one stage behind). With reduced motion it simply appears at the current planet.
 */
import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useMemo, useRef } from "react";
import { useReducedMotionSafe } from "@/components/ui/motion";
import { useApi } from "@/lib/api";
import type { Job } from "@/lib/types";
import { FPS, HEIGHT, HOVER, JourneyScene, type JourneyPlanet, SEG, WIDTH, durationFor } from "./journey/JourneyScene";
import { frameSrc } from "./sprites";

const PLANETS: JourneyPlanet[] = [
  { key: "launch", name: "Launch pad", colours: ["#B9A6FF", "#7A2DFF"] },
  { key: "search", name: "Planet Search", colours: ["#FF8A8A", "#E81F76"], ring: true },
  { key: "filter", name: "Planet Filter", colours: ["#FFD27A", "#FF7A00"] },
  { key: "contact", name: "Planet Contact", colours: ["#8FE3C8", "#1E9E7A"], ring: true },
  { key: "sources", name: "Planet Everywhere", colours: ["#9ED0FF", "#2E6BFF"] },
  { key: "home", name: "Results", colours: ["#FFE58A", "#FFC300"], ring: true },
];

const active = (j?: Job) => !!j && ["queued", "running", "paused", "cancelling"].includes(j.status);

/** Which planet the job has reached, and what is happening there, from the job record only. */
function stage(job: Job, othersBusy: boolean, multiSource: boolean): { at: number; lines: string[] } {
  const limit = Number(job.params?.limit ?? 0) || 0;
  if (job.status === "failed" || job.status === "cancelled")
    return { at: Math.max(1, job.channels_found ? (job.enrich_total ? 3 : 2) : 1), lines: [job.status === "failed" ? "The search stopped: " + (job.error ?? "an error occurred") : "The search was cancelled."] };
  if (job.status === "completed") {
    if (multiSource && othersBusy) return { at: 4, lines: ["YouTube is done. Now checking the other sources' profiles, feeds and websites for published emails."] };
    return { at: 5, lines: [`Discovery complete: ${job.qualified} of ${limit || job.qualified} leads, ${job.contact_routes_found} contact routes found.`] };
  }
  if (job.enrich_total > 0)
    return { at: 3, lines: [`Reading channel descriptions, websites and contact pages for published emails: ${job.enriched} of ${job.enrich_total}.`,
      `${job.qualified} of ${limit} leads so far.`] };
  if (job.unique_found > 0)
    return { at: 2, lines: [`Checking ${job.unique_found} new channels against your filters (size, activity, public email).`,
      `${job.qualified} qualified, ${job.rejected} didn't match.`] };
  if (job.queries_done > 0 || job.channels_found > 0 || job.status === "running")
    return { at: 1, lines: [`Searching YouTube with the official API: ${job.queries_done} of ${job.queries_total} searches.`, job.current_operation || ""] };
  return { at: 0, lines: [job.status === "paused" ? "Paused. Resume to continue the journey." : "Planning the search: turning your keywords into YouTube searches."] };
}

export function DiscoveryJourney({ jobId, othersBusy, multiSource }: { jobId: string; othersBusy: boolean; multiSource: boolean }) {
  const reduced = useReducedMotionSafe();
  const { data: job } = useApi<Job>(`/jobs/${jobId}`, { refreshInterval: (j) => (active(j) ? 1500 : 0) });
  const s = useMemo(() => (job ? stage(job, othersBusy, multiSource) : { at: 0, lines: ["Preparing for launch…"] }), [job, othersBusy, multiSource]);
  const planets = useMemo(() => (multiSource ? PLANETS : PLANETS.filter((p) => p.key !== "sources")), [multiSource]);
  const at = multiSource ? s.at : s.at >= 4 ? s.at - 1 : s.at;
  const last = planets.length - 1;
  const duration = durationFor(planets.length);
  const inputProps = useMemo(() => ({ planets, helperSrc: frameSrc("e_happy") }), [planets]);
  const player = useRef<PlayerRef>(null);
  const frame = useRef(0);
  const target = useRef(at);
  target.current = at;

  // Drive the scene's frame from the job's stage.
  useEffect(() => {
    const seek = (f: number) => player.current?.seekTo(Math.max(0, Math.min(duration - 1, Math.floor(f))));
    if (reduced) {
      frame.current = at === last ? duration - 1 : at * SEG;
      seek(frame.current);
      return;
    }
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const step = ((now - prev) / 1000) * FPS;
      prev = now;
      let f = frame.current;
      const cur = Math.min(Math.floor(f / SEG), last);
      const want = target.current;
      if (cur < want) {
        f = Math.max(f, cur * SEG + HOVER) + step * (want - cur > 1 ? 2 : 1); // set off now, faster when behind
      } else if (cur === last) {
        f = Math.min(f + step, duration - 1); // land, then rest
      } else {
        f += step;
        const end = cur * SEG + HOVER;
        if (f >= end) f = cur * SEG + ((f - end) % HOVER); // wait at this planet, seamlessly
      }
      frame.current = f;
      seek(f);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, duration, last, at]);

  return (
    <section aria-label="Discovery journey" className="relative overflow-hidden rounded-[22px] bg-[#1A0D2E] text-white shadow-pop">
      <div className="pointer-events-none">
        <Player ref={player} component={JourneyScene} inputProps={inputProps} durationInFrames={duration} fps={FPS}
          compositionWidth={WIDTH} compositionHeight={HEIGHT} style={{ width: "100%", aspectRatio: `${WIDTH} / ${HEIGHT}` }}
          controls={false} autoPlay={false} loop={false} clickToPlay={false} doubleClickToFullscreen={false} spaceKeyToPlayOrPause={false}
          numberOfSharedAudioTags={0} acknowledgeRemotionLicense />
      </div>
      <div className="px-4 pb-4">
        <div className="-mt-1 rounded-2xl border border-white/10 bg-white/[0.07] px-3.5 py-2.5 backdrop-blur" aria-live="polite">
          <p className="text-[12.5px] font-semibold leading-snug">{planets[at]?.name}</p>
          {s.lines.filter(Boolean).map((l, i) => <p key={i} className="text-[12px] leading-snug text-white/75">{l}</p>)}
        </div>
      </div>
    </section>
  );
}

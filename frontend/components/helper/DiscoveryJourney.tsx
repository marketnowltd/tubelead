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
import { DURATION, FPS, HEIGHT, HOLD_LEN, HOLDS, type JourneyData, JourneyScene, WIDTH } from "./journey/JourneyScene";
import { frameSrc } from "./sprites";


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
  // journey stages: 0 search, 1 filter, 2 contact (including other sources), 3 complete
  const at = s.at <= 1 ? 0 : s.at === 2 ? 1 : s.at <= 4 ? 2 : 3;
  const failed = !!job && (job.status === "failed" || job.status === "cancelled");
  const data: JourneyData = useMemo(() => ({
    stage: at, failed, message: s.lines[0] ?? "", queriesDone: job?.queries_done ?? 0, queriesTotal: job?.queries_total ?? 0,
    found: job?.unique_found ?? 0, qualified: job?.qualified ?? 0, rejected: job?.rejected ?? 0, duplicates: job?.duplicates_removed ?? 0,
    contacts: job?.contact_routes_found ?? 0, enriched: job?.enriched ?? 0, enrichTotal: job?.enrich_total ?? 0, limit: Number(job?.params?.limit ?? 0),
  }), [job, at, failed, s.lines]);
  const inputProps = useMemo(() => ({ data, helperSrc: frameSrc("e_happy") }), [data]);
  const player = useRef<PlayerRef>(null);
  const frame = useRef(0);
  const target = useRef(at);
  target.current = at;

  useEffect(() => {
    const seek = (f: number) => player.current?.seekTo(Math.max(0, Math.min(DURATION - 1, Math.floor(f))));
    if (reduced) { frame.current = HOLDS[at][0] + 20; seek(frame.current); return; }
    let raf = 0, prev = performance.now();
    const tick = (now: number) => {
      const step = ((now - prev) / 1000) * FPS;
      prev = now;
      let f = frame.current;
      const want = target.current, [a, b] = HOLDS[want];
      if (f < a) f = Math.min(a, f + step * (f < HOLDS[Math.max(0, want - 1)][1] - 1 ? 3.5 : 1.4)); // fly on; faster when behind
      else { f += step; if (f >= b) f = a + ((f - b) % HOLD_LEN); }                                  // stay with this stage
      frame.current = f;
      seek(f);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, at]);

  return (
    <section aria-label="Discovery journey" className="journey-card relative overflow-hidden rounded-[24px] text-white">
      <div className="pointer-events-none">
        <Player ref={player} component={JourneyScene} inputProps={inputProps} durationInFrames={DURATION} fps={FPS}
          compositionWidth={WIDTH} compositionHeight={HEIGHT} style={{ width: "100%", aspectRatio: `${WIDTH} / ${HEIGHT}` }}
          controls={false} autoPlay={false} loop={false} clickToPlay={false} doubleClickToFullscreen={false} spaceKeyToPlayOrPause={false}
          numberOfSharedAudioTags={0} acknowledgeRemotionLicense />
      </div>
      <div className="journey-info" aria-live="polite">
        <span className={"journey-dot" + (failed ? " is-failed" : at === 3 ? " is-done" : "")} aria-hidden />
        <div className="min-w-0">
          {s.lines.filter(Boolean).map((l, i) => <p key={i} className={i ? "text-[12.5px] text-white/65" : "text-[13.5px] font-semibold"}>{l}</p>)}
        </div>
      </div>
    </section>
  );
}

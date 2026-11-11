/** The TubeLead Helper's animation states, built from frames cut from the official character sheet
 * (docs/brand/tubelead-helper-*.png → scripts/helper_assets.py → public/helper/*.webp). */
import meta from "./sprites.json";

export type Frame = keyof typeof meta;
export type Pose =
  | "idle" | "flying" | "rising" | "hovering" | "greeting" | "thinking" | "searching" | "curious" | "excited" | "idea" | "pointing"
  | "explaining" | "helpful" | "celebrating" | "success" | "done" | "love" | "sleeping" | "loading" | "surprised" | "winking"
  | "confident" | "happy" | "error" | "warning";
export type Facing = "left" | "right";

export const frameSrc = (f: Frame) => `/helper/${f}.webp`;
export const frameMeta = (f: Frame) => meta[f];

interface Seq { frames: Frame[]; left?: Frame[]; every?: number }
/** Frame sequences per state. `left` frames are mirrored poses with the chest logo kept the right way round. */
export const POSES: Record<Pose, Seq> = {
  idle: { frames: ["front"] },                                   // + blinking, see Astronaut
  happy: { frames: ["f_happy"] },
  flying: { frames: ["dash"], left: ["dash_l"] },               // speed lines trail behind him
  rising: { frames: ["jetpack"], left: ["jetpack_l"] },         // jetpack flames for mostly upward flights
  hovering: { frames: ["hover"], left: ["hover_l"] },
  greeting: { frames: ["wave"], left: ["wave_l"] },
  thinking: { frames: ["thinking", "f_search"], every: 1300 },
  searching: { frames: ["magnifier", "f_search"], every: 900 },
  curious: { frames: ["f_curious"] },
  excited: { frames: ["f_excited"] },
  idea: { frames: ["idea"] },
  pointing: { frames: ["point"], left: ["point_l"] },
  explaining: { frames: ["present", "explain"], left: ["present_l", "explain_l"], every: 1000 },
  helpful: { frames: ["sparkle"] },
  celebrating: { frames: ["celebrate", "sparkle"], every: 450 },
  success: { frames: ["thumbsup"], left: ["thumbsup_l"] },
  done: { frames: ["f_check"] },
  love: { frames: ["f_love"] },
  sleeping: { frames: ["sleeping"] },
  loading: { frames: ["f_loading"] },
  surprised: { frames: ["f_surprised"] },
  winking: { frames: ["f_winking"] },
  confident: { frames: ["crossed"] },
  error: { frames: ["f_error"] },
  warning: { frames: ["f_warning"] },
};

export const ALL_FRAMES = Object.keys(meta) as Frame[];

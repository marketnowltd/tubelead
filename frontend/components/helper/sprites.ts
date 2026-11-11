/** The TubeLead Helper's animation states, built from frames cut from the official character sheet
 * (docs/brand/tubelead-helper-character-sheet.png → scripts/helper_assets.py → public/helper/*.webp). */
import meta from "./sprites.json";

export type Frame = keyof typeof meta;
export type Pose =
  | "idle" | "flying" | "greeting" | "thinking" | "curious" | "excited" | "pointing" | "explaining" | "helpful"
  | "celebrating" | "success" | "sleeping" | "loading" | "surprised" | "winking" | "confident" | "happy";
export type Facing = "left" | "right";

export const frameSrc = (f: Frame) => `/helper/${f}.webp`;
export const frameMeta = (f: Frame) => meta[f];

interface Seq { frames: Frame[]; left?: Frame[]; every?: number }
/** Frame sequences per state. `left` frames are mirrored poses with the chest logo kept the right way round. */
export const POSES: Record<Pose, Seq> = {
  idle: { frames: ["front"] },                                   // + blinking, see Astronaut
  happy: { frames: ["f_happy"] },
  flying: { frames: ["side"], left: ["side_l"] },
  greeting: { frames: ["wave"], left: ["wave_l"] },
  thinking: { frames: ["f_thinking", "f_curious"], every: 1600 },
  curious: { frames: ["f_curious"] },
  excited: { frames: ["f_excited"] },
  pointing: { frames: ["point"], left: ["point_l"] },
  explaining: { frames: ["present", "explain"], left: ["present_l", "explain_l"], every: 900 },
  helpful: { frames: ["f_helpful"] },
  celebrating: { frames: ["f_excited", "f_happy"], every: 260 },
  success: { frames: ["hero"] },
  sleeping: { frames: ["sleeping"] },
  loading: { frames: ["f_loading"] },
  surprised: { frames: ["f_surprised"] },
  winking: { frames: ["f_winking"] },
  confident: { frames: ["f_confident"] },
};

export const ALL_FRAMES = Object.keys(meta) as Frame[];

"use client";
import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/** Reduced-motion preference that is `false` during server rendering and the first client render, so the markup
 * always matches for hydration; it then switches to the user's real setting. */
export function useReducedMotionSafe(): boolean {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? !!reduce : false;
}

"use client";
import { motion } from "motion/react";

/** Text that appears word by word. Screen readers get the whole sentence at once. */
export function Words({ text, reduced, delay = 0 }: { text: string; reduced?: boolean; delay?: number }) {
  if (reduced) return <>{text}</>;
  const words = text.split(" ");
  return (
    <span aria-label={text} role="text">
      {words.map((w, i) => (
        <motion.span key={`${i}-${w}`} aria-hidden className="inline-block whitespace-pre"
          initial={{ opacity: 0, y: 4, filter: "blur(3px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ delay: delay + i * 0.028, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>{w + (i < words.length - 1 ? " " : "")}</motion.span>
      ))}
    </span>
  );
}

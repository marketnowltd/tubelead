"use client";
import { useReducedMotionSafe } from "@/components/ui/motion";
import { motion} from "motion/react";
import type { ReactNode } from "react";

export default function Template({ children }: { children: ReactNode }) {
  const reduce = useReducedMotionSafe();
  return (
    <motion.div initial={{ opacity: 0, y: 14, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: reduce ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

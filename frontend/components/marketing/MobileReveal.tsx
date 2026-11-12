"use client";
/** Phone-only GSAP motion for the homepage: source rows stagger, sections ease up
 * as they scroll in. Does nothing on wider screens or with reduced motion. */
import { useEffect } from "react";

export function MobileReveal() {
  useEffect(() => {
    if (!matchMedia("(max-width: 640px)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let kill = () => {};
    (async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);
      const ctx = gsap.context(() => {
        gsap.utils.toArray<HTMLElement>(".tl-home section:not(:first-of-type) h2").forEach((el) =>
          gsap.from(el, { y: 26, opacity: 0, duration: .7, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 88%" } }));
      });
      kill = () => ctx.revert();
    })();
    return () => kill();
  }, []);
  return null;
}

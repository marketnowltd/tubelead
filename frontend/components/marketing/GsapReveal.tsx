"use client";
/** GSAP scroll reveals for the pricing and reviews sections (skipped with reduced motion). */
import { useEffect } from "react";

export function GsapReveal() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let kill = () => {};
    (async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);
      const ctx = gsap.context(() => {
        gsap.utils.toArray<HTMLElement>("#reviews .grid > *").forEach((el, i) => {   // reviews: gentle floating
          gsap.to(el, { y: -6, duration: 2.4 + (i % 3) * .4, ease: "sine.inOut", yoyo: true, repeat: -1, delay: i * .2 });
        });
        gsap.utils.toArray<HTMLElement>("#pricing .grid > div").forEach((el) => {
          el.addEventListener("mouseenter", () => gsap.to(el, { y: -10, scale: 1.02, duration: .35, ease: "power3.out" }));
          el.addEventListener("mouseleave", () => gsap.to(el, { y: 0, scale: 1, duration: .35, ease: "power3.out" }));
        });
      });
      kill = () => ctx.revert();
    })();
    return () => kill();
  }, []);
  return null;
}

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
        gsap.utils.toArray<HTMLElement>("[data-gsap=rise], #how h2, #capabilities h2, #faq h2").forEach((el) => {
          gsap.from(el, { y: 36, opacity: 0, duration: .9, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 85%" } });
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

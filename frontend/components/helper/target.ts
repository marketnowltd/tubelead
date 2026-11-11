import type { Target } from "./tours";

const visible = (el: Element | null): el is HTMLElement => {
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const s = getComputedStyle(el);
  return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
};
const first = (els: Iterable<Element>) => { for (const e of els) if (visible(e)) return e as HTMLElement; return null; };
const name = (el: Element) => (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
const outsideHelper = (el: Element) => !el.closest("[data-helper]");

/** Finds the element a walkthrough step points at, or null when it isn't on screen. */
export function findTarget(t: Target): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (t.css) return first(Array.from(document.querySelectorAll(t.css)).filter(outsideHelper));
  if (t.link) return first(Array.from(document.querySelectorAll(`a[href="${t.link}"]`)).filter(outsideHelper));
  if (t.label) {
    const byAria = Array.from(document.querySelectorAll(`[aria-label="${t.label}"]`)).filter(outsideHelper);
    // a labelled control is easier to see together with its visible label
    return first(byAria.map((e) => (e.closest("label") as Element) || e));
  }
  if (t.button) return first(Array.from(document.querySelectorAll("button, a.btn-primary, a.btn-ghost")).filter((b) => outsideHelper(b) && t.button!.test(name(b))));
  if (t.panel) {
    const heads = Array.from(document.querySelectorAll("section.panel h3, section h2, section h3")).filter((h) => outsideHelper(h) && name(h) === t.panel);
    return first(heads.map((h) => h.closest("section") ?? h));
  }
  return null;
}

export function waitForTarget(t: Target, timeout = 2500): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      const el = findTarget(t);
      if (el || performance.now() - start > timeout) return resolve(el);
      setTimeout(tick, 120);
    };
    tick();
  });
}

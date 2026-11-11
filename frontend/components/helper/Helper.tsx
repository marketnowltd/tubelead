"use client";
/**
 * The TubeLead Helper: the astronaut who lives in the corner of every page.
 *
 * - Dock: a floating, blinking astronaut button in the bottom-right corner (above the mobile tab bar).
 * - Quick help: speech bubbles beside him (first-visit greeting, first time on a page, reactions to finished work).
 * - Full assistant: he flies out, the panel opens, and he introduces himself; conversation is the guarded support
 *   assistant with the current page as context.
 * - Walkthroughs: he flies to each highlighted element and points at it while a step card explains it.
 * Movement is spring/keyframe animation of his position; his look is frame-by-frame artwork (see sprites.ts).
 * Reduced motion: no flying, bobbing or word-by-word text; he simply appears in place.
 */
import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";
import { X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { call } from "@/components/support/chat";
import { getAuthClient } from "@/lib/auth";
import { useReducedMotionSafe } from "@/components/ui/motion";
import { Astronaut } from "./Astronaut";
import { HelperPanel, type PageInfo } from "./Panel";
import { loadGuide, pageFor } from "./pages";
import { useHelperProgress } from "./progress";
import type { Facing, Pose } from "./sprites";
import { waitForTarget } from "./target";
import { type Box, type CardPos, TourLayer } from "./Tour";
import { TOURS } from "./tours";
import { Words } from "./Words";

const MARKETING = ["/", "/login", "/signup", "/privacy", "/terms", "/demo"];
const SLEEP_AFTER = 120_000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface Bubble { id: number; text: string; actions?: { label: string; run?: () => void; primary?: boolean }[]; ttl?: number }

function useViewport() {
  const [vp, setVp] = useState({ w: 1280, h: 800 });
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return vp;
}

export function Helper() {
  const path = usePathname() || "/";
  const router = useRouter();
  const reduced = useReducedMotionSafe();
  const vp = useViewport();
  const inApp = !MARKETING.includes(path);
  const size = vp.w < 640 ? 78 : 100;           // character height in px
  const W = Math.round(size * 0.86), H = size;  // his box
  const tabBar = inApp && vp.w < 1024;          // the mobile tab bar sits at the bottom of app pages

  const [mounted, setMounted] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const { progress, ready, update } = useHelperProgress(signedIn);
  const [page, setPage] = useState<PageInfo | null>(null);
  const [pose, setPoseState] = useState<Pose>("idle");
  const [facing, setFacing] = useState<Facing>("left");
  const [open, setOpen] = useState(false);
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [badge, setBadge] = useState(false);
  const [tour, setTour] = useState<{ id: string; step: number } | null>(null);
  const [rect, setRect] = useState<Box | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [flying, setFlying] = useState(false);
  const x = useMotionValue(-400), y = useMotionValue(-400), rot = useMotionValue(0);
  const flight = useRef(0);
  const poseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const basePose = useRef<Pose>("idle");
  const lastActive = useRef(Date.now());
  const lastTip = useRef(0);
  const pendingTour = useRef<string | null>(null);
  const journey = useRef<string[]>([]);
  const docked = !open && !tour;

  useEffect(() => setMounted(true), []);
  // the server decides who is signed in (Supabase session, or the single local user in dev mode): asked once, then again
  // only when the sign-in state changes
  useEffect(() => {
    const check = () => call("/me").then(() => setSignedIn(true), () => setSignedIn(false));
    check();
    const sub = getAuthClient()?.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN" || ev === "SIGNED_OUT") check(); });
    return () => sub?.data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    journey.current = [...journey.current.filter((p) => p !== path), path].slice(-10);
    let live = true;
    loadGuide().then((g) => live && setPage(pageFor(g, path))).catch(() => live && setPage(null));
    return () => { live = false; };
  }, [path]);

  // ---------------- pose and movement
  const setPose = useCallback((p: Pose, ms?: number) => {
    clearTimeout(poseTimer.current);
    setPoseState(p);
    if (ms) poseTimer.current = setTimeout(() => setPoseState(basePose.current), ms);
  }, []);
  const setBase = useCallback((p: Pose) => { basePose.current = p; setPose(p); }, [setPose]);

  const dockAt = useCallback(() => ({
    x: vp.w - W - Math.max(14, vp.w < 640 ? 10 : 22),
    y: vp.h - H - (tabBar ? 78 : vp.w < 640 ? 12 : 18),
  }), [vp.w, vp.h, W, H, tabBar]);

  const fly = useCallback(async (tx: number, ty: number, arrive: Pose, face?: Facing) => {
    const id = ++flight.current;
    tx = clamp(tx, 4, vp.w - W - 4); ty = clamp(ty, 4, vp.h - H - 4);
    const dx = tx - x.get(), dy = ty - y.get(), dist = Math.hypot(dx, dy);
    if (reduced || dist < 6 || x.get() < -100) {
      x.set(tx); y.set(ty);
      if (face) setFacing(face);
      setBase(arrive);
      return;
    }
    setFlying(true);
    setFacing(dx < 0 ? "left" : "right");
    setPose("flying");
    const dur = Math.min(1.05, 0.42 + dist / 1500);
    const lift = Math.min(70, dist * 0.14);
    await Promise.all([
      animate(x, tx, { duration: dur, ease: [0.5, 0, 0.18, 1] }),
      animate(y, [y.get(), Math.min(y.get(), ty) - lift, ty], { duration: dur, ease: [0.4, 0, 0.2, 1], times: [0, 0.45, 1] }),
      animate(rot, [0, dx < 0 ? -9 : 9, 0], { duration: dur, times: [0, 0.4, 1] }),
    ]);
    if (id !== flight.current) return;
    setFlying(false);
    if (face) setFacing(face);
    setBase(arrive);
  }, [vp.w, vp.h, W, H, reduced, x, y, rot, setBase, setPose]);

  // keep him in his corner when the window changes size
  useEffect(() => {
    if (!mounted || !docked || flying) return;
    const d = dockAt();
    x.set(d.x); y.set(d.y);
  }, [mounted, docked, flying, dockAt, x, y]);

  // ---------------- quick help bubbles
  // another dialog (a modal on the page) is open: tips wait until it closes, so he never talks over it
  const otherDialog = () => Array.from(document.querySelectorAll('[role="dialog"],[role="alertdialog"]')).some((d) => !d.closest("[data-helper]"));
  const say = useCallback((b: Omit<Bubble, "id">, p: Pose = "greeting") => {
    const show = (tries: number) => {
      if (otherDialog() && tries < 75) { setTimeout(() => show(tries + 1), 800); return; }
      setBubble({ ...b, id: Date.now() });
      setPose(p, 2600);
    };
    show(0);
  }, [setPose]);
  useEffect(() => {
    if (!bubble?.ttl) return;
    const t = setTimeout(() => { setBubble((cur) => (cur?.id === bubble.id ? null : cur)); setBadge(true); }, bubble.ttl);
    return () => clearTimeout(t);
  }, [bubble]);

  // ---------------- panel
  const panelPerch = useCallback(() => {
    if (vp.w < 640) { const sheet = Math.min(640, vp.h * 0.88); return { x: vp.w / 2 - W / 2, y: vp.h - sheet - H + 18, face: "right" as Facing }; }
    const ph = Math.min(620, vp.h - 48);
    return { x: vp.w - 24 - 400 - W + 14, y: vp.h - 24 - ph + 6, face: "right" as Facing };
  }, [vp.w, vp.h, W, H]);

  // and on the panel's corner while it is open
  useEffect(() => {
    if (!open || flying) return;
    const p = panelPerch();
    x.set(clamp(p.x, 4, vp.w - W - 4)); y.set(clamp(p.y, 4, vp.h - H - 4));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp.w, vp.h]);

  const openPanel = useCallback(async () => {
    setBubble(null); setBadge(false);
    lastActive.current = Date.now();
    setPose("excited");
    await wait(reduced ? 0 : 200);
    setOpen(true);
    const p = panelPerch();
    await fly(p.x, p.y, "greeting", p.face);
    setPose("greeting", 1500);
    basePose.current = "helpful";
  }, [panelPerch, fly, setPose, reduced]);

  const closePanel = useCallback(() => {
    setOpen(false);
    const d = dockAt();
    fly(d.x, d.y, "idle", "left");
  }, [dockAt, fly]);

  // ---------------- walkthroughs
  const startTour = useCallback((id: string, at?: string) => {
    const t = TOURS[id];
    if (!t) return;
    setOpen(false); setBubble(null);
    const target = at || t.path;
    if (target !== path) { pendingTour.current = id; router.push(target); return; }
    setTour({ id, step: 0 });
  }, [path, router]);
  useEffect(() => {
    const id = pendingTour.current;
    if (id && TOURS[id]?.path === path) {
      pendingTour.current = null;
      const t = setTimeout(() => setTour({ id, step: 0 }), 700);
      return () => clearTimeout(t);
    }
  }, [path]);

  const endTour = useCallback((how: "done" | "skipped" | "exit") => {
    const id = tour?.id;
    setTour(null); setRect(null); setWaiting(false);
    if (id) update((p) => ({ ...p, intro_done: true, [how === "done" ? "tours_done" : "tours_skipped"]: [...(how === "done" ? p.tours_done : p.tours_skipped), id] }));
    const d = dockAt();
    fly(d.x, d.y, how === "done" ? "celebrating" : "idle", "left").then(() => { if (how === "done") setPose("success", 1800); basePose.current = "idle"; });
    if (how === "done" && !reduced) setTimeout(() => setPose("idle"), 3200);
  }, [tour, update, dockAt, fly, setPose, reduced]);

  const current = tour ? TOURS[tour.id] : null;
  const step = current && tour ? current.steps[tour.step] : null;
  const next = useCallback(() => setTour((t) => {
    if (!t) return t;
    if (t.step >= TOURS[t.id].steps.length - 1) { setTimeout(() => endTour("done"), 0); return t; }
    return { ...t, step: t.step + 1 };
  }), [endTour]);
  const prev = useCallback(() => setTour((t) => (t && t.step > 0 ? { ...t, step: t.step - 1 } : t)), []);

  // place him beside the element and keep the spotlight on it while the page scrolls
  const card: CardPos = (() => {
    const cw = Math.min(340, vp.w - 32);
    if (!rect) return { left: (vp.w - cw) / 2, top: clamp(vp.h * 0.5 - 60, 70, vp.h - 260), width: cw };
    const left = clamp(rect.left, 16, vp.w - cw - 16);
    if (rect.top + rect.height + 14 + 230 < vp.h) return { left, top: rect.top + rect.height + 14, width: cw };
    if (rect.top - 14 - 230 > 0) return { left, bottom: vp.h - rect.top + 14, width: cw };
    return { left, bottom: 16, width: cw };
  })();

  useEffect(() => {
    if (!tour || !step) return;
    let cancelled = false;
    let el: HTMLElement | null = null;
    let raf = 0;
    let cleanupClick = () => {};
    let relayout: ReturnType<typeof setInterval> | undefined;
    let last: Box | null = null;
    const measure = () => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const b = { left: r.left, top: r.top, width: r.width, height: Math.min(r.height, vp.h - 32) };
      setRect((prev) => (prev && Math.abs(prev.left - b.left) < 1 && Math.abs(prev.top - b.top) < 1 && Math.abs(prev.width - b.width) < 1 && Math.abs(prev.height - b.height) < 1 ? prev : b));
      return b;
    };
    const beside = (b: Box): { x: number; y: number; face: Facing; pose?: Pose } => {
      const cy = clamp(b.top + Math.min(b.height, 140) / 2 - H * 0.55, 6, vp.h - H - 6);
      if (b.left - W - 6 >= 6) return { x: b.left - W - 4, y: cy, face: "right" };
      if (b.left + b.width + 6 + W <= vp.w - 6) return { x: b.left + b.width + 4, y: cy, face: "left" };
      const above = b.top - H - 8 >= 6;
      return { x: clamp(b.left + 16, 6, vp.w - W - 6), y: above ? b.top - H - 2 : Math.min(b.top + b.height + 2, vp.h - H - 6), face: "right", pose: "explaining" };
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const before = last;
        const b = measure();
        if (!b || (before && Math.abs(before.left - b.left) < 1 && Math.abs(before.top - b.top) < 1)) return;
        last = b;
        const p = beside(b);
        x.set(p.x); y.set(p.y);
      });
    };
    (async () => {
      setWaiting(false);
      el = step.target ? await waitForTarget(step.target, 1800) : null;
      if (cancelled) return;
      if (el) {
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
        await wait(reduced ? 30 : 450);
        if (cancelled) return;
        const b = measure()!;
        last = b;
        const p = beside(b);
        await fly(p.x, p.y, step.pose ?? p.pose ?? "pointing", p.face);
      } else {
        setRect(null);
        const cw = Math.min(340, vp.w - 32);
        const top = clamp(vp.h * 0.5 - 60, 70, vp.h - 260);
        await fly((vp.w - cw) / 2 - W * 0.25, top - H + 12, step.pose ?? "explaining", "right");
      }
      if (cancelled) return;
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onScroll);
      relayout = setInterval(onScroll, 450); // the page can change size without scrolling (content loading, a chip added)
      if (el && step.waitFor === "click") {
        setWaiting(true);
        const target = el;
        const onClick = () => { setWaiting(false); setPose("excited", 900); setTimeout(() => !cancelled && next(), 500); };
        target.addEventListener("click", onClick, { once: true });
        cleanupClick = () => target.removeEventListener("click", onClick);
      }
    })();
    return () => {
      cancelled = true; cancelAnimationFrame(raf); cleanupClick(); clearInterval(relayout);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour?.id, tour?.step, vp.w, vp.h]);

  // ---------------- proactive help (once each, never during a tour or with the panel open)
  useEffect(() => {
    if (!mounted || !ready || !page || open || tour || pendingTour.current) return;
    const key = page.key ?? path;
    const t = setTimeout(() => {
      if (bubble || Date.now() - lastTip.current < 30_000) return;
      if (!progress.intro_done) {
        lastTip.current = Date.now();
        const id = page.tour ?? (inApp ? "welcome" : "home");
        say({ text: inApp ? "Hey! I'm your TubeLead helper. Want me to show you around?" : page.greeting, ttl: 16000,
          actions: [{ label: inApp ? "Show me around" : "Show me", primary: true, run: () => startTour(id) }, { label: "Not now" }] });
        update((p) => ({ ...p, intro_done: true, pages_seen: [...p.pages_seen, key] }));
        return;
      }
      if (!progress.pages_seen.includes(key)) {
        update((p) => ({ ...p, pages_seen: [...p.pages_seen, key] }));
        if (progress.tips_off || !page.tour || progress.tours_done.includes(page.tour) || progress.tours_skipped.includes(page.tour)) return;
        lastTip.current = Date.now();
        say({ text: "First time here? Let me explain how this works.", ttl: 14000,
          actions: [{ label: "Show me how", primary: true, run: () => startTour(page.tour!) }, { label: "No thanks" }] }, "curious");
      }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, ready, page, open, tour, progress.intro_done]);

  // reactions to finished work, sent by the pages (search completed) and by the API client (campaign created)
  useEffect(() => {
    const onHelper = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (tour) return;
      if (d.type === "search_completed") {
        setPose("celebrating", 2600);
        if (!progress.tips_off && !open) say({ text: `Great work! Your search found ${d.found ?? "new"} creator${d.found === 1 ? "" : "s"}. Here's what you can do next.`, ttl: 15000,
          actions: [{ label: "Review them", primary: true, run: () => router.push(d.jobId ? `/lead-database?job_id=${d.jobId}` : "/lead-database") }, { label: "Later" }] }, "celebrating");
      }
    };
    const onApi = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (tour || d.method !== "POST") return;
      if (/^\/campaigns\/?$/.test(d.path)) {
        setPose("success", 2400);
        if (!progress.tips_off && !open) say({ text: "Campaign created! Next, add creators to it from the Lead Database.", ttl: 12000,
          actions: [{ label: "Open Lead Database", primary: true, run: () => router.push("/lead-database") }, { label: "Later" }] }, "success");
      }
    };
    window.addEventListener("tubelead:helper", onHelper);
    window.addEventListener("tubelead:api", onApi);
    return () => { window.removeEventListener("tubelead:helper", onHelper); window.removeEventListener("tubelead:api", onApi); };
  }, [tour, open, progress.tips_off, say, setPose, router]);

  // ---------------- dozing off when nobody is around
  useEffect(() => {
    const wake = () => {
      lastActive.current = Date.now();
      if (basePose.current === "sleeping") { basePose.current = "idle"; setPose("surprised", 700); }
    };
    const evs = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    evs.forEach((ev) => window.addEventListener(ev, wake, { passive: true }));
    const t = setInterval(() => {
      if (docked && !bubble && Date.now() - lastActive.current > SLEEP_AFTER && basePose.current === "idle") setBase("sleeping");
    }, 10_000);
    return () => { evs.forEach((ev) => window.removeEventListener(ev, wake)); clearInterval(t); };
  }, [docked, bubble, setPose, setBase]);

  if (!mounted) return null;
  const bubbleLeft = x.get() > vp.w / 2;

  return (
    <>
      <HelperPanel open={open} onClose={closePanel} page={page} path={path} journey={journey.current} signedIn={signedIn} tipsOff={progress.tips_off}
        onTips={(off) => update((p) => ({ ...p, tips_off: off }))} onTour={startTour} onPose={setPose} reduced={reduced} />

      {current && tour && <TourLayer tour={current} step={tour.step} rect={rect} card={card} waiting={waiting} reduced={reduced}
        onPrev={prev} onNext={next} onSkip={() => endTour("skipped")} onExit={() => endTour("exit")} />}

      <motion.div data-helper="" className={"fixed left-0 top-0 " + (docked && !flying ? "z-[45]" : "z-[61]")} style={{ x, y, width: W, height: H }}>
        <button type="button" onClick={() => (open ? closePanel() : tour ? undefined : openPanel())}
          aria-label={open ? "Close TubeLead Helper" : "Open TubeLead Helper"} aria-expanded={open} tabIndex={tour ? -1 : 0}
          className={"helper-dock peer absolute inset-0 rounded-[28px] outline-none" + (docked ? " is-docked" : "")}>
          {docked && badge && <span className="absolute right-1 top-1 z-10 h-3 w-3 rounded-full border-2 border-white bg-[#E81F76]" aria-label="New tip" />}
        </button>
        <motion.div className="helper-visual pointer-events-none h-full w-full" style={{ rotate: rot }}
          animate={reduced || flying ? { y: 0 } : { y: pose === "sleeping" ? [0, 2, 0] : [0, docked ? -5 : -8, 0] }}
          transition={reduced || flying ? { duration: 0.2 } : { duration: pose === "sleeping" ? 3.6 : 2.6, repeat: Infinity, ease: "easeInOut" }}>
          <Astronaut pose={pose} facing={facing} size={size} reduced={reduced} glow={docked} className="helper-art" />
        </motion.div>
        <AnimatePresence>
          {bubble && docked && (
            <motion.div key={bubble.id} role="status" className={"helper-bubble absolute bottom-[58%] w-[min(290px,calc(100vw-120px))] p-3.5 " + (bubbleLeft ? "right-[92%] origin-bottom-right" : "left-[92%] origin-bottom-left")}
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 6 }}
              transition={{ type: "spring", stiffness: 480, damping: 30 }}>
              <button type="button" onClick={() => setBubble(null)} aria-label="Dismiss tip" className="absolute right-1.5 top-1.5 rounded-md p-1 text-mute hover:bg-[#7A2DFF]/10"><X size={13} /></button>
              <p className="pr-4 text-[13.5px] leading-snug text-[#1A0D2E]"><Words text={bubble.text} reduced={reduced} /></p>
              {bubble.actions && <div className="mt-2.5 flex flex-wrap gap-2">{bubble.actions.map((a) => (
                <button key={a.label} type="button" className={a.primary ? "helper-cta" : "helper-chip"} onClick={() => { setBubble(null); setBadge(false); a.run?.(); }}>{a.label}</button>))}</div>}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

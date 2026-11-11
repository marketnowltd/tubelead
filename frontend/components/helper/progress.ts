"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { call } from "@/components/support/chat";

export interface Progress { intro_done: boolean; tips_off: boolean; pages_seen: string[]; tours_done: string[]; tours_skipped: string[] }
const EMPTY: Progress = { intro_done: false, tips_off: false, pages_seen: [], tours_done: [], tours_skipped: [] };
const KEY = "tl.helper";

const read = (): Progress => { try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return EMPTY; } };
const write = (p: Progress) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage blocked */ } };
const union = (a: string[], b: string[]) => Array.from(new Set([...a, ...b])).slice(0, 60);
const merge = (a: Progress, b: Progress): Progress => ({
  intro_done: a.intro_done || b.intro_done, tips_off: a.tips_off || b.tips_off, pages_seen: union(a.pages_seen, b.pages_seen),
  tours_done: union(a.tours_done, b.tours_done), tours_skipped: union(a.tours_skipped, b.tours_skipped),
});

/** Onboarding progress: what the helper has already shown. Kept in this browser, and for signed-in customers also on
 * their account (so it follows them to other devices). `ready` is false until it has been read. */
export function useHelperProgress(signedIn: boolean) {
  const [p, setP] = useState<Progress>(EMPTY);
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(p);

  useEffect(() => {
    const local = read();
    setP(local); latest.current = local;
    if (!signedIn) { setReady(true); return; }
    call<Progress>("/helper/progress").then((server) => {
      const m = merge(local, server); setP(m); latest.current = m; write(m);
      // progress made in this browser that never reached the account (e.g. the page closed first) is sent now
      if (JSON.stringify(merge(server, EMPTY)) !== JSON.stringify(m)) call("/helper/progress", { method: "PUT", json: m }).catch(() => {});
    })
      .catch(() => { /* keep the local copy */ }).finally(() => setReady(true));
  }, [signedIn]);

  // send any unsaved change when the page is hidden or closed
  useEffect(() => {
    if (!signedIn) return;
    const flush = () => {
      if (!timer.current) return;
      clearTimeout(timer.current); timer.current = undefined;
      call("/helper/progress", { method: "PUT", json: latest.current, keepalive: true }).catch(() => {});
    };
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", onVis); };
  }, [signedIn]);

  const update = useCallback((fn: (p: Progress) => Progress) => {
    const next = fn(latest.current);
    latest.current = next;
    setP(next); write(next);
    if (signedIn) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { timer.current = undefined; call("/helper/progress", { method: "PUT", json: latest.current }).catch(() => {}); }, 400);
    }
  }, [signedIn]);

  return { progress: p, ready, update };
}

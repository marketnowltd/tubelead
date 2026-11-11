"use client";
import { call } from "@/components/support/chat";
import type { PageInfo } from "./Panel";

/** The helper's page guide (from the server, the single source), loaded once per browser session. Pages are then
 * matched here, so moving around the site makes no extra requests. */
interface Guide { pages: Record<string, PageInfo>; fallback: PageInfo }
const KEY = "tl.helper.pages.v1";
let mem: Guide | null = null;
let pending: Promise<Guide> | null = null;

export function loadGuide(): Promise<Guide> {
  if (mem) return Promise.resolve(mem);
  try {
    const cached = sessionStorage.getItem(KEY);
    if (cached) { mem = JSON.parse(cached); return Promise.resolve(mem!); }
  } catch { /* storage blocked */ }
  return (pending ??= call<Guide>("/helper/pages").then((g) => {
    mem = g;
    try { sessionStorage.setItem(KEY, JSON.stringify(g)); } catch { /* ignore */ }
    return g;
  }).finally(() => { pending = null; }));
}

export function pageFor(g: Guide, path: string): PageInfo {
  const p = path.split("?")[0].split("#")[0].replace(/\/$/, "") || "/";
  if (g.pages[p]) return g.pages[p];
  const key = Object.keys(g.pages).filter((k) => k !== "/" && (p === k || p.startsWith(k + "/"))).sort((a, b) => b.length - a.length)[0];
  return key ? g.pages[key] : g.fallback;
}

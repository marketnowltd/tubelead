"use client";
import useSWR, { SWRConfiguration } from "swr";

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public detail?: any) { super(message); }
}

let tokenProvider: (() => Promise<string | null>) | null = null;
export const setTokenProvider = (fn: (() => Promise<string | null>) | null) => { tokenProvider = fn; };

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  const token = tokenProvider ? await tokenProvider() : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  } catch {
    throw new ApiError("Cannot reach the TubeLead API. Is the backend running?", 0, "network");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* non-JSON error page from proxy */ }
  if (!res.ok) {
    const d = body?.detail;
    const msg = typeof d === "string" ? d : d?.message ?? (Array.isArray(d) ? d.map((e: any) => `${e.loc?.slice(-1)}: ${e.msg}`).join("; ") : null)
      ?? (res.status >= 500 ? "The server hit an error. Check that the backend is running." : `Request failed (${res.status})`);
    if (res.status === 402 && d?.code === "paywall" && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("tubelead:paywall", { detail: d }));
    throw new ApiError(msg, res.status, d?.code, d);
  }
  return body as T;
}

export function useApi<T = any>(path: string | null, opts: SWRConfiguration = {}) {
  return useSWR<T, ApiError>(path, (p: string) => api<T>(p), { revalidateOnFocus: false, shouldRetryOnError: false, keepPreviousData: true, ...opts });
}

export function qs(params: Record<string, unknown>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, String(x)));
    else u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

/** Download an authenticated file (CSV export) via fetch so the bearer token is attached. */
export async function downloadFile(path: string, fallbackName: string) {
  const token = tokenProvider ? await tokenProvider() : null;
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    let d: any = null;
    try { d = (await res.json())?.detail; } catch { /* not json */ }
    if (res.status === 402 && d?.code === "paywall") window.dispatchEvent(new CustomEvent("tubelead:paywall", { detail: d }));
    throw new ApiError(d?.message ?? `Export failed (${res.status})`, res.status, d?.code, d);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

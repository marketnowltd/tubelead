"use client";
import { useState } from "react";
import { mutate } from "swr";
import { api } from "./api";
import { useToast } from "@/components/ui/overlay";

/** Seed / clear clearly-labelled demonstration data, then revalidate every cached query. */
export function useDemo() {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); await mutate(() => true, undefined, { revalidate: true }); toast("success", ok); }
    catch (e: any) { toast("error", e.message); }
    finally { setBusy(false); }
  };
  return {
    busy,
    seed: () => run(() => api("/demo/seed", { method: "POST" }), "Demonstration data loaded (clearly marked DEMO)"),
    clear: () => run(() => api("/demo", { method: "DELETE" }), "Demonstration data removed"),
  };
}

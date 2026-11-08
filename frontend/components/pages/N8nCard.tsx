"use client";
import { Send } from "lucide-react";
import { useEffect, useState } from "react";
import { api, useApi } from "@/lib/api";
import type { Integration } from "@/lib/types";
import { Badge } from "../ui/core";
import { useToast } from "../ui/overlay";

export function N8nConfig({ onSaved }: { onSaved?: () => void }) {
  const toast = useToast();
  const { data, mutate } = useApi<Integration[]>("/integrations");
  const n8n = data?.find((i) => i.id === "n8n");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (n8n?.connected && n8n.detail.startsWith("http")) setUrl(n8n.detail); }, [n8n]);
  const save = async () => { setBusy(true); try { await api("/integrations/n8n", { method: "PUT", json: { url } }); toast("success", url ? "Webhook saved" : "Webhook removed"); mutate(); onSaved?.(); } catch (e: any) { toast("error", e.message); } finally { setBusy(false); } };
  const test = async () => { setBusy(true); try { const r = await api<{ ok: boolean; status_code: number }>("/integrations/n8n/test", { method: "POST" }); toast(r.ok ? "success" : "error", r.ok ? `Webhook responded ${r.status_code}` : `Webhook returned HTTP ${r.status_code}`); } catch (e: any) { toast("error", e.message); } finally { setBusy(false); } };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><Badge tone={n8n?.connected ? "green" : "neutral"} dot>{n8n?.connected ? "Webhook configured" : "Not configured"}</Badge></div>
      <label className="block"><span className="label mb-1.5 block">n8n Webhook URL</span><input className="field data text-xs" inputMode="url" placeholder="https://your-n8n.example.com/webhook/tubelead" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="n8n webhook URL" /></label>
      <div className="flex flex-wrap gap-2"><button className="btn-primary !px-4 !py-2 !text-xs" onClick={save} disabled={busy}>Save</button><button className="btn-ghost btn-sm" onClick={test} disabled={busy || !n8n?.connected}><Send size={13} /> Send test event</button></div>
    </div>
  );
}

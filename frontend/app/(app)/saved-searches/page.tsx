"use client";
import { CalendarClock, Play, Search, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, EmptyState, ErrorState, PageHeader, Panel, Skeleton } from "@/components/ui/core";
import { Modal, useToast } from "@/components/ui/overlay";
import { api, useApi } from "@/lib/api";
import { countryName } from "@/lib/countries";
import { ago, compact, dateLong, titleCase } from "@/lib/format";
import type { SavedSearch } from "@/lib/types";

const summary = (p: Record<string, any>) => [
  p.keywords?.length ? `“${p.keywords.slice(0, 3).join(", ")}${p.keywords.length > 3 ? "…" : ""}”` : null,
  p.niches?.length ? p.niches.join(" · ") : null,
  p.mode === "worldwide" ? "Worldwide" : p.countries?.length ? p.countries.slice(0, 4).map(countryName).join(", ") + (p.countries.length > 4 ? ` +${p.countries.length - 4}` : "") : null,
  `${compact(p.min_subscribers ?? 0)}${p.max_subscribers ? `–${compact(p.max_subscribers)}` : "+"} subs`, `${p.limit ?? 25} leads`,
].filter(Boolean).join("  ·  ");

export default function SavedSearches() {
  const router = useRouter();
  const toast = useToast();
  const { data, error, mutate } = useApi<SavedSearch[]>("/saved-searches");
  const [del, setDel] = useState<SavedSearch | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (s: SavedSearch) => { setBusy(s.id); try { await api(`/saved-searches/${s.id}/run`, { method: "POST" }); toast("success", `“${s.name}” started`); mutate(); router.push("/discovery-engine"); } catch (e: any) { toast("error", e.message); } finally { setBusy(null); } };
  const setSchedule = async (s: SavedSearch, schedule: string) => { try { await api(`/saved-searches/${s.id}`, { method: "PATCH", json: { schedule } }); toast("success", schedule === "none" ? "Schedule removed" : `Scheduled ${schedule}`); mutate(); } catch (e: any) { toast("error", e.message); } };
  const load = (s: SavedSearch) => { try { localStorage.setItem("tl.loadParams", JSON.stringify(s.params)); } catch { /* ignore */ } router.push("/lead-generator"); };
  const remove = async () => { if (!del) return; try { await api(`/saved-searches/${del.id}`, { method: "DELETE" }); toast("success", "Saved search deleted"); setDel(null); mutate(); } catch (e: any) { toast("error", e.message); } };

  return (
    <div>
      <PageHeader eyebrow="Reusable discovery" title="Saved Searches" sub="Re-run a proven search in one click, or put it on a schedule. Create new ones from the Lead Generator." />
      {error ? <Panel><ErrorState error={error} onRetry={() => mutate()} /></Panel> : !data ? <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-44" />)}</div> : data.length === 0 ? (
        <Panel><EmptyState icon={<Search size={24} />} title="No saved searches yet" body="Configure a search in the Lead Generator and press “Save search”, or choose Scheduled Discovery." action={<button className="btn-primary" onClick={() => router.push("/lead-generator")}>Open Lead Generator</button>} /></Panel>) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {data.map((s) => (
            <Panel key={s.id} lift className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3"><h3 className="font-heading text-base font-semibold">{s.name}</h3><Badge tone={s.schedule === "none" ? "neutral" : "cyan"} dot>{s.schedule === "none" ? "Manual" : titleCase(s.schedule)}</Badge></div>
              <p className="mt-2 flex-1 text-[13px] leading-relaxed text-mute">{summary(s.params)}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]"><div><dt className="label">Mode</dt><dd className="mt-0.5">{titleCase(s.params.mode ?? "standard")}</dd></div><div><dt className="label">Runs</dt><dd className="data mt-0.5">{s.run_count}</dd></div><div><dt className="label">Last run</dt><dd className="mt-0.5">{s.last_run_at ? ago(s.last_run_at) : "Never"}</dd></div></dl>
              {s.next_run_at && <p className="mt-2 flex items-center gap-1.5 text-[11px] text-moss"><CalendarClock size={12} /> Next run {dateLong(s.next_run_at)}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-forest/10 pt-3">
                <button className="btn-primary pill-green btn-sm" disabled={busy === s.id} onClick={() => run(s)}><Play size={13} /> {busy === s.id ? "Starting…" : "Run now"}</button>
                <button className="btn-ghost btn-sm" onClick={() => load(s)}><Upload size={13} /> Edit in generator</button>
                <select aria-label={`Schedule for ${s.name}`} className="field !w-auto !py-1.5 text-xs" value={s.schedule} onChange={(e) => setSchedule(s, e.target.value)}><option value="none">Manual</option><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select>
                <button aria-label={`Delete ${s.name}`} className="ml-auto rounded-lg p-2 text-mute hover:bg-[#B5493A]/15 hover:text-[#A33A2A]" onClick={() => setDel(s)}><Trash2 size={15} /></button>
              </div>
            </Panel>))}
        </div>)}
      <Modal open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Delete saved search?" description={del ? `“${del.name}” and its schedule will be removed. Creators it already found are kept.` : ""}
        footer={<><button className="btn-ghost btn-sm" onClick={() => setDel(null)}>Cancel</button><button className="btn-primary !bg-none !bg-[#B5493A] !px-4 !py-2 !text-xs" onClick={remove}>Delete</button></>}><span /></Modal>
    </div>
  );
}

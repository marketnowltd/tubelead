"use client";
import { Download, ExternalLink, Globe, Search } from "lucide-react";
import { useState } from "react";
import { Badge, EmptyState, ErrorState, PageHeader, Panel, Skeleton } from "@/components/ui/core";
import { useToast } from "@/components/ui/overlay";
import { api, useApi } from "@/lib/api";

interface ProviderInfo { name: string; label: string; configured: boolean; requires: string[] }
interface ProviderSummary { provider: string; status: "ok" | "not_configured" | "failed"; message: string; count: number }
interface Lead {
  creator_name: string; sources: string[]; source_url: string | null; youtube_url: string | null;
  snippet: string | null; verification_status: "verified" | "unverified"; evidence: string[];
  website?: string | null; audience_size?: number | null; emails?: { email: string; source: string; source_url: string | null }[];
}
interface SearchResult { query: string; providers: ProviderSummary[]; leads: Lead[]; duplicates_merged: number; verified_count: number; with_email?: number }

const statusTone = { ok: "green", not_configured: "neutral", failed: "red" } as const;
const statusLabel = { ok: "Returned results", not_configured: "Awaiting configuration", failed: "Did not respond" } as const;

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
/** Results as a CSV file, built in the browser from what the search returned. */
function downloadCsv(r: SearchResult, label: (n: string) => string) {
  const rows = [["Name", "Email", "Email found on", "Found on", "Followers", "Website", "Profile"]];
  for (const l of r.leads) rows.push([l.creator_name, (l.emails ?? []).map((e) => e.email).join("; "), (l.emails ?? []).map((e) => e.source).join("; "),
    l.sources.map(label).join("; "), l.audience_size ?? "", l.website ?? "", l.source_url ?? ""].map(String));
  const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `tubelead-${r.query.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function SearchEverywhere() {
  const toast = useToast();
  const providers = useApi<ProviderInfo[]>("/search-everywhere/providers");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [onlyEmail, setOnlyEmail] = useState(false);
  const label = (n: string) => providers.data?.find((p) => p.name === n)?.label ?? n;

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (query.length < 3) { toast("error", "Enter at least 3 characters."); return; }
    setBusy(true);
    try {
      setResult(await api<SearchResult>("/search-everywhere", { method: "POST", json: { query } }));
    } catch (err: any) {
      toast("error", err.message);
    } finally {
      setBusy(false);
    }
  };

  const anyConfigured = providers.data?.some((p) => p.configured) ?? false;

  return (
    <div>
      <PageHeader eyebrow="One search, every source" title="Search Everywhere" sub="Runs the same search across each connected source at once. Sources that are not set up say so; nothing is filled in with made-up results." />

      <form onSubmit={run} className="mb-5 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="se-query">Search query</label>
        <input id="se-query" className="field flex-1" placeholder="e.g. home workout coach for busy parents" value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} />
        <button className="btn-primary pill-green" disabled={busy || !anyConfigured}><Search size={15} /> {busy ? "Searching…" : "Search everywhere"}</button>
      </form>

      <Panel className="mb-5 p-5">
        <h2 className="font-heading text-sm font-semibold">Sources</h2>
        {providers.error ? <ErrorState error={providers.error} onRetry={() => providers.mutate()} /> : !providers.data ? <Skeleton className="mt-3 h-16" /> : (
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {providers.data.map((p) => (
              <li key={p.name} className="rounded-xl border border-forest/10 p-3">
                <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{p.label}</span><Badge tone={p.configured ? "green" : "neutral"} dot>{p.configured ? "Connected" : "Not connected"}</Badge></div>
                {!p.configured && <p className="mt-1.5 text-[12px] leading-relaxed text-mute">Needs {p.requires.join(", ")} on the server.</p>}
              </li>
            ))}
          </ul>
        )}
        {providers.data && !anyConfigured && <p className="mt-3 text-[12px] text-mute">Search is available once at least one source is connected.</p>}
      </Panel>

      {!result ? (
        <Panel><EmptyState icon={<Globe size={24} />} title="Search across every connected source" body="Each source reports its own status, so you can see what was searched and what was not." /></Panel>
      ) : (
        <div className="space-y-5">
          <Panel className="p-5">
            <h2 className="font-heading text-sm font-semibold">What happened for “{result.query}”</h2>
            <ul className="mt-3 grid gap-2 md:grid-cols-3">
              {result.providers.map((p) => (
                <li key={p.provider} className="text-[13px]">
                  <Badge tone={statusTone[p.status]} dot>{statusLabel[p.status]}</Badge>
                  <p className="mt-1 text-mute">{p.message}</p>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-[12px] text-mute">{result.leads.length} people found · <strong className="text-ink">{result.with_email ?? 0} with a published email</strong> · {result.verified_count} confirmed by their platform · {result.duplicates_merged} duplicates merged</p>
              <label className="ml-auto flex items-center gap-2 text-[12px] font-semibold"><input type="checkbox" className="accent-[#7B3FF2]" checked={onlyEmail} onChange={(e) => setOnlyEmail(e.target.checked)} /> Only with an email</label>
              <button type="button" className="btn-ghost btn-sm" onClick={() => downloadCsv(result, label)} disabled={!result.leads.length}><Download size={13} /> Download CSV</button>
            </div>
          </Panel>

          {result.leads.length === 0 ? (
            <Panel><EmptyState icon={<Search size={24} />} title="No results" body="Try different words, or connect another source." /></Panel>
          ) : (
            <Panel className="overflow-x-auto p-0">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="text-[11px] uppercase tracking-wide text-mute"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Found on</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Links</th></tr></thead>
                <tbody>
                  {result.leads.filter((l) => !onlyEmail || l.emails?.length).map((l, i) => (
                    <tr key={`${l.creator_name}-${i}`} className="border-t border-forest/10 align-top">
                      <td className="px-4 py-3"><div className="font-medium">{l.creator_name}</div>{l.snippet && <p className="mt-0.5 line-clamp-2 text-mute">{l.snippet}</p>}</td>
                      <td className="px-4 py-3">{l.emails?.length ? <ul className="space-y-1">{l.emails.slice(0, 3).map((e) => (
                        <li key={e.email}><a className="font-medium text-forest underline" href={`mailto:${e.email}`}>{e.email}</a>
                          <span className="block text-[11px] text-dim">{e.source_url ? <a className="underline" href={e.source_url} target="_blank" rel="noopener noreferrer">{e.source}</a> : e.source}</span></li>))}</ul>
                        : <span className="text-[12px] text-dim">None published</span>}</td>
                      <td className="px-4 py-3">{l.sources.map(label).join(", ")}{l.audience_size ? <span className="block text-[11px] text-dim">{l.audience_size.toLocaleString()} followers</span> : null}</td>
                      <td className="px-4 py-3"><Badge tone={l.verification_status === "verified" ? "green" : "neutral"} dot>{l.verification_status === "verified" ? "Confirmed by platform API" : "Unverified web result"}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {l.youtube_url && <a className="inline-flex items-center gap-1 text-forest underline" href={l.youtube_url} target="_blank" rel="noopener noreferrer">YouTube <ExternalLink size={11} /></a>}
                          {l.website && <a className="inline-flex items-center gap-1 text-forest underline" href={l.website} target="_blank" rel="noopener noreferrer">Website <ExternalLink size={11} /></a>}
                          {l.source_url && <a className="inline-flex items-center gap-1 text-forest underline" href={l.source_url} target="_blank" rel="noopener noreferrer">Source <ExternalLink size={11} /></a>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

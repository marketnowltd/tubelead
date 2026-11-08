"use client";
import { GitCompare, Globe2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { CountryBars } from "@/components/charts/lazy";
import { WorldMap } from "@/components/map/lazy";
import { CreatorDrawer } from "@/components/pages/CreatorDrawer";
import { Avatar, Badge, DemoBanner, EmptyState, ErrorState, PageHeader, Panel, PanelHeader, ScoreRing, Skeleton, statusTone } from "@/components/ui/core";
import { Segmented } from "@/components/ui/inputs";
import { cn } from "@/components/ui/cn";
import { qs, useApi } from "@/lib/api";
import { REGIONS, countryByCode, countryName, flag } from "@/lib/countries";
import { useDemo } from "@/lib/demo";
import { compact, titleCase } from "@/lib/format";
import type { Creator, Overview, Paged, Status } from "@/lib/types";

export default function CreatorIntelligence() {
  const demo = useDemo();
  const { data: o, error, mutate } = useApi<Overview>("/analytics/overview");
  const { data: st } = useApi<Status>("/status");
  const [sel, setSel] = useState<string[]>([]);
  const [region, setRegion] = useState<"All" | (typeof REGIONS)[number]>("All");
  const [view, setView] = useState<"count" | "score">("count");
  const [open, setOpen] = useState<string | null>(null);
  const focus = sel[sel.length - 1];
  const { data: top } = useApi<Paged<Creator>>(sel.length ? `/creators${qs({ country: sel, sort: "score", order: "desc", page_size: 8 })}` : null);

  const rows = useMemo(() => (o?.countries ?? []).filter((c) => region === "All" || countryByCode(c.country)?.region === region), [o, region]);
  const mapData = rows.map((c) => ({ country: c.country, count: view === "count" ? c.count : c.avg_score, avg_score: c.avg_score, extra: view === "score" ? `${c.count} creators` : undefined }));
  const total = rows.reduce((s, r) => s + r.count, 0);
  const toggle = (code: string) => setSel((s) => (s.includes(code) ? s.filter((x) => x !== code) : [...s.slice(-3), code]));
  const compare = sel.map((c) => rows.find((r) => r.country === c) ?? { country: c, count: 0, avg_score: 0 });

  return (
    <div>
      <PageHeader eyebrow="Global intelligence" title="Creator Intelligence" sub="Where your discovered creators live. Click up to four countries to compare them and drill into their top creators." />
      <DemoBanner count={st?.demo_count ?? 0} onClear={demo.clear} busy={demo.busy} />
      {error ? <Panel><ErrorState error={error} onRetry={() => mutate()} /></Panel> : (
        <div className="space-y-6">
          <Panel>
            <PanelHeader title="Global discovery map" icon={<Globe2 size={16} />} sub="Scroll or pinch to zoom · drag to pan · click a country to compare"
              action={<div className="flex flex-wrap gap-2"><Segmented label="Map metric" value={view} onChange={setView} options={[{ value: "count", label: "Creators" }, { value: "score", label: "Avg score" }]} /></div>} />
            <div className="flex flex-wrap gap-2 px-5 pb-3">
              {(["All", ...REGIONS] as const).map((r) => <button key={r} aria-pressed={region === r} onClick={() => setRegion(r)} className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition", region === r ? "border-forest bg-forest/25 text-forest" : "border-forest/20 text-mute hover:text-ink")}>{r}</button>)}
            </div>
            <div className="px-4 pb-4">{o ? <WorldMap height={500} data={mapData} selected={sel} onSelect={toggle} /> : <div className="skeleton h-[500px]" />}</div>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel><PanelHeader title="Country comparison" icon={<GitCompare size={16} />} sub={sel.length ? `${sel.length} selected` : "Select countries on the map or table"} action={sel.length > 0 && <button className="btn-ghost btn-sm" onClick={() => setSel([])}><X size={12} /> Clear</button>} />
              {compare.length < 2 ? <EmptyState title="Pick two or more countries" body="Click countries on the map or rows in the table to compare creator counts, share and average score." /> : (
                <div className="overflow-x-auto px-5 pb-5"><table className="w-full text-sm"><thead><tr className="text-left"><th className="label py-2">Metric</th>{compare.map((c) => <th key={c.country} className="label py-2 text-right">{flag(c.country)} {c.country}</th>)}</tr></thead>
                  <tbody className="divide-y divide-line">
                    <tr><td className="py-2 text-mute">Creators</td>{compare.map((c) => <td key={c.country} className="data py-2 text-right">{c.count}</td>)}</tr>
                    <tr><td className="py-2 text-mute">Share of total</td>{compare.map((c) => <td key={c.country} className="data py-2 text-right">{total ? ((c.count / total) * 100).toFixed(1) : 0}%</td>)}</tr>
                    <tr><td className="py-2 text-mute">Avg. score</td>{compare.map((c) => <td key={c.country} className="data py-2 text-right">{c.avg_score}</td>)}</tr>
                  </tbody></table></div>)}
            </Panel>
            <Panel><PanelHeader title="Top countries" sub={region === "All" ? "By creators discovered" : region} /><div className="px-3 pb-4">{o ? <CountryBars data={rows} /> : <Skeleton className="m-4 h-56" />}</div></Panel>
          </div>

          {sel.length > 0 && focus && (
            <Panel glow><PanelHeader title={`Top creators · ${sel.map((c) => `${flag(c)} ${countryName(c)}`).join(", ")}`} sub="Highest qualification score first" />
              {!top ? <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div> : top.items.length === 0 ? <EmptyState title="No creators in these countries yet" /> : (
                <ul className="grid gap-px bg-forest/10 sm:grid-cols-2">{top.items.map((c) => (
                  <li key={c.id} className="bg-[#FFFDF8]"><button className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-forest/10" onClick={() => setOpen(c.id)}>
                    <Avatar src={c.thumbnail_url} name={c.title} size={40} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{c.title.replace(/ \(demo\)$/i, "")}</p><p className="text-[11px] text-dim">{c.niche} · {compact(c.subscriber_count)} subs · {titleCase(c.activity)}</p></div>
                    <Badge tone={statusTone[c.verification_status]}>{c.public_email ? "Email" : "No email"}</Badge><ScoreRing score={c.qualification_score} size={38} /></button></li>))}</ul>)}
            </Panel>)}

          <Panel><PanelHeader title="All countries" sub="Text alternative to the map" />
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-y border-forest/15 bg-bg/40"><tr>{["Country", "Region", "Creators", "Share", "Avg score"].map((h) => <th key={h} scope="col" className="label px-5 py-2.5 text-left">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">{rows.map((r) => (
                <tr key={r.country} onClick={() => toggle(r.country)} className={cn("cursor-pointer transition hover:bg-forest/10", sel.includes(r.country) && "bg-forest/15")}>
                  <td className="px-5 py-2.5">{flag(r.country)} {countryName(r.country)}</td><td className="px-5 text-mute">{countryByCode(r.country)?.region ?? "—"}</td><td className="data px-5">{r.count}</td><td className="data px-5">{total ? ((r.count / total) * 100).toFixed(1) : 0}%</td><td className="data px-5">{r.avg_score}</td></tr>))}
                {rows.length === 0 && <tr><td colSpan={5}><EmptyState title="No geographic data yet" body="Countries appear once discovered channels declare one." /></td></tr>}</tbody></table></div>
          </Panel>
        </div>
      )}
      <CreatorDrawer id={open} onClose={() => setOpen(null)} />
    </div>
  );
}

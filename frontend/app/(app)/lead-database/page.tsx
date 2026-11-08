"use client";
import { ArrowDown, ArrowUp, ArrowUpDown, BookmarkPlus, Download, ExternalLink, Filter, Globe, Mail, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { CreatorDrawer, verificationLabel } from "@/components/pages/CreatorDrawer";
import { Avatar, Badge, DemoBanner, DemoTag, EmptyState, ErrorState, PageHeader, Panel, ScoreRing, Skeleton, statusTone } from "@/components/ui/core";
import { cn } from "@/components/ui/cn";
import { MultiSelect } from "@/components/ui/inputs";
import { Modal, useToast } from "@/components/ui/overlay";
import { api, downloadFile, qs, useApi } from "@/lib/api";
import { COUNTRIES, NICHES, countryName, flag } from "@/lib/countries";
import { useDemo } from "@/lib/demo";
import { ago, compact, pct, titleCase } from "@/lib/format";
import type { Campaign, Creator, Paged, SavedView, Status } from "@/lib/types";

interface F { q: string; niche: string[]; country: string[]; verification: string[]; activity: string[]; outreach: string[]; campaign_id: string; min_subs: string; max_subs: string; min_score: string; has_email: string; has_website: string; demo: string; job_id: string }
const EMPTY: F = { q: "", niche: [], country: [], verification: [], activity: [], outreach: [], campaign_id: "", min_subs: "", max_subs: "", min_score: "", has_email: "", has_website: "", demo: "all", job_id: "" };
const triBool = (v: string) => (v === "yes" ? true : v === "no" ? false : undefined);

function SortHead({ label, k, sort, order, onSort, className }: { label: string; k: string; sort: string; order: string; onSort: (k: string) => void; className?: string }) {
  const on = sort === k;
  return (
    <th scope="col" aria-sort={on ? (order === "asc" ? "ascending" : "descending") : "none"} className={cn("whitespace-nowrap px-3 py-3 text-left", className)}>
      <button onClick={() => onSort(k)} className={cn("label inline-flex items-center gap-1 transition hover:text-ink", on && "!text-forest")}>{label}{on ? (order === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={11} className="opacity-40" />}</button>
    </th>
  );
}

function Database() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const demo = useDemo();
  const [f, setF] = useState<F>(() => ({ ...EMPTY, q: sp.get("q") ?? "", country: sp.getAll("country"), campaign_id: sp.get("campaign_id") ?? "", job_id: sp.get("job_id") ?? "" }));
  const [qDraft, setQDraft] = useState(f.q);
  const [sort, setSort] = useState("discovered_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(!!(sp.get("country") || sp.get("campaign_id") || sp.get("job_id")));
  const [confirmDel, setConfirmDel] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState("");

  useEffect(() => { const t = setTimeout(() => { setF((s) => (s.q === qDraft ? s : { ...s, q: qDraft })); setPage(1); }, 300); return () => clearTimeout(t); }, [qDraft]);

  const apiFilters = useMemo(() => ({ q: f.q, niche: f.niche, country: f.country, verification: f.verification, activity: f.activity, outreach: f.outreach, campaign_id: f.campaign_id, job_id: f.job_id,
    min_subs: f.min_subs, max_subs: f.max_subs, min_score: f.min_score, has_email: triBool(f.has_email), has_website: triBool(f.has_website), demo: f.demo === "all" ? undefined : f.demo }), [f]);
  const key = `/creators${qs({ ...apiFilters, sort, order, page, page_size: pageSize })}`;
  const { data, error, isLoading, mutate } = useApi<Paged<Creator>>(key);
  const { data: st } = useApi<Status>("/status");
  const { data: camps } = useApi<Campaign[]>("/campaigns");
  const { data: views, mutate: mutateViews } = useApi<SavedView[]>("/views");
  const { data: facets } = useApi<{ niches: { value: string; count: number }[]; countries: { value: string; count: number }[] }>("/creators/facets");

  const set = <K extends keyof F>(k: K, v: F[K]) => { setF((s) => ({ ...s, [k]: v })); setPage(1); setSel(new Set()); };
  const activeCount = Object.entries(f).filter(([k, v]) => k !== "q" && (Array.isArray(v) ? v.length : v && v !== "all")).length;
  const onSort = (k: string) => { if (sort === k) setOrder(order === "asc" ? "desc" : "asc"); else { setSort(k); setOrder(k === "title" ? "asc" : "desc"); } setPage(1); };
  const items = data?.items ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const allOn = items.length > 0 && items.every((i) => sel.has(i.id));
  const toggleAll = () => setSel((s) => { const n = new Set(s); items.forEach((i) => (allOn ? n.delete(i.id) : n.add(i.id))); return n; });
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const bulk = async (body: object, ok: string) => { try { const r = await api<{ affected: number }>("/creators/bulk", { method: "POST", json: { ids: [...sel], ...body } }); toast("success", `${ok} (${r.affected})`); setSel(new Set()); mutate(); } catch (e: any) { toast("error", e.message); } };
  const exportCsv = async () => { try { await downloadFile(`/creators/export.csv${qs({ ...apiFilters, ids: [...sel] })}`, "tubelead-export.csv"); toast("success", sel.size ? `Exported ${sel.size} selected` : "Exported all matching records"); } catch (e: any) { toast("error", e.message); } };
  const applyView = (id: string) => { const v = views?.find((x) => x.id === id); if (v) { setF({ ...EMPTY, ...v.filters }); setQDraft(v.filters.q ?? ""); setPage(1); toast("info", `View “${v.name}” applied`); } };
  const saveView = async () => { try { await api("/views", { method: "POST", json: { name: viewName.trim(), filters: f } }); setSaveOpen(false); setViewName(""); mutateViews(); toast("success", "View saved"); } catch (e: any) { toast("error", e.message); } };
  const delView = async (id: string) => { await api(`/views/${id}`, { method: "DELETE" }); mutateViews(); toast("success", "View deleted"); };

  const EmailCell = ({ c }: { c: Creator }) => c.public_email
    ? <div className="max-w-[190px]"><p className="data truncate text-xs" title={c.public_email}>{c.public_email}</p><Badge tone={statusTone[c.email_status ?? "published"]} className="mt-1">{c.email_status === "verified" ? "Verified" : "Published"}</Badge></div>
    : <span className="text-xs text-dim">{c.contact_count ? `${c.contact_count} other route(s)` : "—"}</span>;

  return (
    <div>
      <PageHeader eyebrow="Creator intelligence database" title="Lead Database" sub="Every discovered creator, deduplicated by YouTube channel ID. Click any row for the full profile and contact routes."
        actions={<><button className="btn-ghost pill-blue btn-sm" onClick={exportCsv}><Download size={14} /> Export {sel.size ? `${sel.size} selected` : "CSV"}</button></>} />
      <DemoBanner count={st?.demo_count ?? 0} onClear={demo.clear} busy={demo.busy} />
      {f.job_id && <div className="mb-4 flex items-center gap-2 text-sm"><Badge tone="cyan">Showing one discovery job</Badge><button className="text-xs text-forest underline" onClick={() => { set("job_id", ""); router.replace("/lead-database"); }}>Show all</button></div>}

      <Panel className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" /><input className="field !pl-9" aria-label="Search creators" placeholder="Search name, handle or niche…" value={qDraft} onChange={(e) => setQDraft(e.target.value)} /></div>
          <select aria-label="Sort by" className="field !w-auto" value={`${sort}:${order}`} onChange={(e) => { const [s, o] = e.target.value.split(":"); setSort(s); setOrder(o as any); setPage(1); }}>
            <option value="discovered_at:desc">Newest first</option><option value="score:desc">Highest score</option><option value="subscribers:desc">Most subscribers</option><option value="subscribers:asc">Fewest subscribers</option><option value="engagement:desc">Best engagement</option><option value="title:asc">Name A–Z</option>
          </select>
          <button className={cn("btn-ghost btn-sm", showFilters && "!border-forest !bg-forest/25")} aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}><Filter size={14} /> Filters{activeCount > 0 && <span className="data ml-1 rounded-full bg-terracotta px-1.5 text-[10px] text-paper">{activeCount}</span>}</button>
          <select aria-label="Saved views" className="field !w-auto" value="" onChange={(e) => e.target.value && applyView(e.target.value)}><option value="">Saved views{views?.length ? ` (${views.length})` : ""}</option>{views?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
          <button className="btn-ghost btn-sm" onClick={() => setSaveOpen(true)}><BookmarkPlus size={14} /> Save view</button>
        </div>
        {showFilters && (
          <div className="mt-4 grid gap-3 border-t border-forest/10 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><span className="label mb-1.5 block">Niche</span><MultiSelect label="Niche filter" placeholder="Any niche" options={(facets?.niches.length ? facets.niches.map((n) => ({ value: n.value, label: n.value, meta: String(n.count) })) : NICHES.map((n) => ({ value: n, label: n })))} value={f.niche} onChange={(v) => set("niche", v)} /></div>
            <div><span className="label mb-1.5 block">Country</span><MultiSelect label="Country filter" placeholder="Any country" options={COUNTRIES.map((c) => ({ value: c.code, label: `${flag(c.code)} ${c.name}`, meta: String(facets?.countries.find((x) => x.value === c.code)?.count ?? "") }))} value={f.country} onChange={(v) => set("country", v)} /></div>
            <div><span className="label mb-1.5 block">Contact status</span><MultiSelect searchable={false} label="Verification filter" placeholder="Any" options={[{ value: "verified", label: "Verified" }, { value: "published", label: "Email published" }, { value: "unverified", label: "Unverified routes" }, { value: "none", label: "No route" }]} value={f.verification} onChange={(v) => set("verification", v)} /></div>
            <div><span className="label mb-1.5 block">Activity</span><MultiSelect searchable={false} label="Activity filter" placeholder="Any" options={["active", "moderate", "dormant", "unknown"].map((a) => ({ value: a, label: titleCase(a) }))} value={f.activity} onChange={(v) => set("activity", v)} /></div>
            <div><span className="label mb-1.5 block">Outreach</span><MultiSelect searchable={false} label="Outreach filter" placeholder="Any" options={["new", "contacted", "replied", "converted"].map((a) => ({ value: a, label: titleCase(a) }))} value={f.outreach} onChange={(v) => set("outreach", v)} /></div>
            <label><span className="label mb-1.5 block">Campaign</span><select className="field" value={f.campaign_id} onChange={(e) => set("campaign_id", e.target.value)}><option value="">Any</option><option value="none">Unassigned</option>{camps?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label><span className="label mb-1.5 block">Min subscribers</span><input className="field data" type="number" min={0} value={f.min_subs} onChange={(e) => set("min_subs", e.target.value)} /></label>
            <label><span className="label mb-1.5 block">Max subscribers</span><input className="field data" type="number" min={0} value={f.max_subs} onChange={(e) => set("max_subs", e.target.value)} /></label>
            <label><span className="label mb-1.5 block">Min score</span><input className="field data" type="number" min={0} max={100} value={f.min_score} onChange={(e) => set("min_score", e.target.value)} /></label>
            <label><span className="label mb-1.5 block">Public email</span><select className="field" value={f.has_email} onChange={(e) => set("has_email", e.target.value)}><option value="">Any</option><option value="yes">Has email</option><option value="no">No email</option></select></label>
            <label><span className="label mb-1.5 block">Website</span><select className="field" value={f.has_website} onChange={(e) => set("has_website", e.target.value)}><option value="">Any</option><option value="yes">Has website</option><option value="no">No website</option></select></label>
            <label><span className="label mb-1.5 block">Demo data</span><select className="field" value={f.demo} onChange={(e) => set("demo", e.target.value)}><option value="all">Show all</option><option value="hide">Hide demo</option><option value="only">Only demo</option></select></label>
            <div className="flex items-end"><button className="btn-ghost btn-sm w-full" onClick={() => { setF(EMPTY); setQDraft(""); setPage(1); }}><X size={13} /> Clear all filters</button></div>
          </div>
        )}
      </Panel>

      {sel.size > 0 && (
        <div className="panel gborder sticky top-[84px] z-20 mb-4 flex flex-wrap items-center gap-3 px-4 py-3" role="region" aria-label="Bulk actions">
          <span className="data text-sm font-semibold">{sel.size} selected</span>
          <select aria-label="Assign to campaign" className="field !w-auto !py-1.5 text-xs" value="" onChange={(e) => e.target.value && bulk({ action: "assign_campaign", campaign_id: e.target.value }, "Assigned to campaign")}><option value="">Assign to campaign…</option>{camps?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select aria-label="Set outreach status" className="field !w-auto !py-1.5 text-xs" value="" onChange={(e) => e.target.value && bulk({ action: "set_outreach", outreach_status: e.target.value }, "Status updated")}><option value="">Set outreach status…</option>{["new", "contacted", "replied", "converted"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select>
          <button className="btn-ghost btn-sm" onClick={() => bulk({ action: "unassign_campaign" }, "Removed from campaigns")}>Unassign</button>
          <button className="btn-ghost btn-sm" onClick={exportCsv}><Download size={13} /> Export</button>
          <button className="btn-ghost btn-sm !border-[#B5493A]/40 !text-[#A33A2A]" onClick={() => setConfirmDel(true)}><Trash2 size={13} /> Delete</button>
          <button className="ml-auto text-xs text-mute hover:text-ink" onClick={() => setSel(new Set())}>Clear selection</button>
        </div>
      )}

      <Panel className="overflow-hidden">
        {error ? <ErrorState error={error} onRetry={() => mutate()} /> : (
          <>
            {/* desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1080px] text-sm">
                <caption className="sr-only">Discovered creators</caption>
                <thead className="border-b border-forest/15 bg-bg/40"><tr>
                  <th scope="col" className="w-10 px-3"><input type="checkbox" aria-label="Select all on this page" checked={allOn} onChange={toggleAll} className="h-4 w-4 accent-forest" /></th>
                  <SortHead label="Channel" k="title" {...{ sort, order, onSort }} />
                  <SortHead label="Subscribers" k="subscribers" {...{ sort, order, onSort }} />
                  <SortHead label="Videos" k="videos" {...{ sort, order, onSort }} />
                  <th scope="col" className="label px-3 py-3 text-left">Country</th><th scope="col" className="label px-3 py-3 text-left">Niche</th>
                  <SortHead label="Engagement" k="engagement" {...{ sort, order, onSort }} />
                  <th scope="col" className="label px-3 py-3 text-left">Activity</th><th scope="col" className="label px-3 py-3 text-left">Public email</th>
                  <SortHead label="Score" k="score" {...{ sort, order, onSort }} /><th scope="col" className="label px-3 py-3 text-left">Verification</th><th scope="col" className="label px-3 py-3 text-left">Campaign</th>
                  <SortHead label="Discovered" k="discovered_at" {...{ sort, order, onSort }} />
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {isLoading && !data && Array.from({ length: 8 }).map((_, i) => <tr key={i}><td colSpan={13} className="px-3 py-3"><Skeleton className="h-9 w-full" /></td></tr>)}
                  {items.map((c) => (
                    <tr key={c.id} className={cn("group cursor-pointer transition hover:bg-forest-50", sel.has(c.id) && "bg-forest/10")} onClick={() => setOpen(c.id)}>
                      <td className="px-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${c.title}`} checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 accent-forest" /></td>
                      <td className="px-3 py-2.5"><div className="flex items-center gap-3"><Avatar src={c.thumbnail_url} name={c.title} size={36} />
                        <div className="min-w-0"><button className="block max-w-[210px] truncate text-left font-semibold hover:text-forest" onClick={(e) => { e.stopPropagation(); setOpen(c.id); }}>{c.title.replace(/ \(demo\)$/i, "")}</button>
                          <div className="flex items-center gap-1.5 text-[11px] text-dim"><span className="max-w-[110px] truncate">{c.handle ?? ""}</span>{c.website && <span className="inline-flex items-center gap-0.5 text-moss" title={`Website: ${titleCase(c.website_status)}`}><Globe size={10} />web</span>}{c.is_demo ? <DemoTag /> : <a href={c.channel_url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${c.title} on YouTube`} onClick={(e) => e.stopPropagation()} className="hover:text-moss"><ExternalLink size={11} /></a>}</div></div></div></td>
                      <td className="data px-3">{compact(c.subscriber_count)}</td><td className="data px-3 text-mute">{c.video_count.toLocaleString()}</td>
                      <td className="whitespace-nowrap px-3" title={countryName(c.country)}>{flag(c.country)} <span className="text-xs text-mute">{c.country ?? "—"}</span></td>
                      <td className="px-3"><Badge tone="purple">{c.niche}</Badge></td><td className="data px-3">{pct(c.engagement_rate)}</td>
                      <td className="px-3"><Badge tone={statusTone[c.activity]} dot>{titleCase(c.activity)}</Badge></td>
                      <td className="px-3"><EmailCell c={c} /></td>
                      <td className="px-3"><ScoreRing score={c.qualification_score} size={38} /></td>
                      <td className="px-3"><Badge tone={statusTone[c.verification_status]} dot>{verificationLabel[c.verification_status]}</Badge></td>
                      <td className="px-3 text-xs text-mute"><span className="block max-w-[130px] truncate">{c.campaign_name ?? "—"}</span></td>
                      <td className="whitespace-nowrap px-3 text-xs text-mute">{ago(c.discovered_at)}</td>
                    </tr>))}
                </tbody>
              </table>
            </div>

            {/* mobile / tablet cards */}
            <ul className="divide-y divide-line lg:hidden">
              {isLoading && !data && Array.from({ length: 5 }).map((_, i) => <li key={i} className="p-4"><Skeleton className="h-20 w-full" /></li>)}
              {items.map((c) => (
                <li key={c.id} className={cn("p-4", sel.has(c.id) && "bg-forest/10")}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" aria-label={`Select ${c.title}`} checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="mt-3 h-5 w-5 accent-forest" />
                    <button className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={() => setOpen(c.id)}>
                      <Avatar src={c.thumbnail_url} name={c.title} size={44} />
                      <div className="min-w-0 flex-1"><p className="truncate font-semibold">{c.title.replace(/ \(demo\)$/i, "")} {c.is_demo && <DemoTag />}</p><p className="truncate text-xs text-dim">{c.handle} · {flag(c.country)} {c.country ?? "—"} · {c.niche}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5"><Badge tone="neutral">{compact(c.subscriber_count)} subs</Badge><Badge tone="neutral">{pct(c.engagement_rate)} eng.</Badge><Badge tone={statusTone[c.activity]} dot>{titleCase(c.activity)}</Badge><Badge tone={statusTone[c.verification_status]} dot>{verificationLabel[c.verification_status]}</Badge></div>
                        {c.public_email && <p className="data mt-2 flex items-center gap-1.5 truncate text-xs text-mute"><Mail size={12} />{c.public_email}</p>}</div>
                      <ScoreRing score={c.qualification_score} size={40} />
                    </button>
                  </div>
                </li>))}
            </ul>

            {data && items.length === 0 && (
              <EmptyState icon={<ShieldCheck size={24} />} title={activeCount || f.q ? "No creators match these filters" : "No creators yet"}
                body={activeCount || f.q ? "Loosen or clear the filters to see more." : "Run a discovery from the Lead Generator, or load demonstration data to explore."}
                action={activeCount || f.q ? <button className="btn-ghost btn-sm" onClick={() => { setF(EMPTY); setQDraft(""); }}>Clear filters</button> : <button className="btn-ghost btn-sm" onClick={demo.seed} disabled={demo.busy}>Load demo data</button>} />
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-forest/15 px-4 py-3 text-xs text-mute">
              <span className="data">{data ? `${((page - 1) * pageSize + (items.length ? 1 : 0)).toLocaleString()}–${((page - 1) * pageSize + items.length).toLocaleString()} of ${data.total.toLocaleString()}` : "…"}</span>
              <span className="hidden text-dim md:inline">Duplicate protection: one record per YouTube channel ID (database-enforced).</span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5">Rows <select aria-label="Rows per page" className="field !w-auto !py-1 text-xs" value={pageSize} onChange={(e) => { setPageSize(+e.target.value); setPage(1); }}>{[10, 25, 50, 100].map((n) => <option key={n}>{n}</option>)}</select></label>
                <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
                <span className="data">{page} / {pages}</span>
                <button className="btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            </div>
          </>
        )}
      </Panel>

      {views && views.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-mute"><span className="label">Saved views</span>
          {views.map((v) => <span key={v.id} className="inline-flex items-center gap-1 rounded-full border border-forest/25 bg-forest/10 pl-3 pr-1 py-0.5"><button onClick={() => applyView(v.id)} className="hover:text-ink">{v.name}</button><button aria-label={`Delete view ${v.name}`} onClick={() => delView(v.id)} className="rounded-full p-1 hover:bg-ink/[0.06]"><X size={11} /></button></span>)}</div>
      )}
      <CreatorDrawer id={open} onClose={() => setOpen(null)} onChanged={() => mutate()} />
      <Modal open={saveOpen} onOpenChange={setSaveOpen} title="Save current view" description="Stores your search text and every filter." footer={<><button className="btn-ghost btn-sm" onClick={() => setSaveOpen(false)}>Cancel</button><button className="btn-primary !px-4 !py-2 !text-xs" disabled={!viewName.trim()} onClick={saveView}>Save view</button></>}>
        <input className="field" autoFocus placeholder="e.g. UK tech with email" maxLength={120} value={viewName} onChange={(e) => setViewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && viewName.trim() && saveView()} aria-label="View name" /></Modal>
      <Modal open={confirmDel} onOpenChange={setConfirmDel} title={`Delete ${sel.size} creator${sel.size === 1 ? "" : "s"}?`} description="This also deletes their contact routes."
        footer={<><button className="btn-ghost btn-sm" onClick={() => setConfirmDel(false)}>Cancel</button><button className="btn-primary !bg-none !bg-[#B5493A] !px-4 !py-2 !text-xs" onClick={() => { setConfirmDel(false); bulk({ action: "delete" }, "Deleted"); }}>Delete</button></>}><span /></Modal>
    </div>
  );
}

export default function Page() { return <Suspense fallback={<Skeleton className="h-96 w-full" />}><Database /></Suspense>; }

"use client";
import { Copy, Globe, Info, Link2, Mail, ScanSearch, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { RouteRow, routeStatusLabel } from "@/components/pages/CreatorDrawer";
import { Avatar, Badge, DemoTag, EmptyState, ErrorState, PageHeader, Panel, PanelHeader, Progress, Skeleton, StatCard, statusTone } from "@/components/ui/core";
import { cn } from "@/components/ui/cn";
import { MultiSelect } from "@/components/ui/inputs";
import { useToast } from "@/components/ui/overlay";
import { api, qs, useApi } from "@/lib/api";
import { ago, titleCase } from "@/lib/format";
import type { ContactRoute, Creator, Paged } from "@/lib/types";

type RoutePage = Paged<ContactRoute> & { email_summary: { published: number; unverified: number; verified: number } };

export default function ContactFinder() {
  const toast = useToast();
  const [kind, setKind] = useState<string[]>([]);
  const [status, setStatus] = useState<string[]>([]);
  const [source, setSource] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pick, setPick] = useState("");
  const [scanning, setScanning] = useState(false);
  const { data, error, mutate } = useApi<RoutePage>(`/contacts${qs({ kind, status, source, q, page, page_size: 20 })}`);
  const { data: cands } = useApi<Paged<Creator>>("/creators?demo=hide&page_size=100&sort=title&order=asc");
  const pages = data ? Math.max(1, Math.ceil(data.total / 20)) : 1;
  const scan = async () => { if (!pick) return; setScanning(true); try { const r = await api<{ added: number; website_status: string }>(`/creators/${pick}/contacts/scan`, { method: "POST" }); toast("success", `Scan complete: ${r.added} new route(s) · website ${titleCase(r.website_status)}`); mutate(); } catch (e: any) { toast("error", e.message); } finally { setScanning(false); } };
  const copy = async (v: string) => { try { await navigator.clipboard.writeText(v); toast("success", "Copied"); } catch { toast("error", "Copy blocked by the browser"); } };
  const sum = data?.email_summary;
  const { data: cs } = useApi<{ total: number; primary: Record<string, number>; any: Record<string, number> }>("/contacts/status-summary");

  return (
    <div>
      <PageHeader eyebrow="Contact intelligence" title="Contact Finder" sub="Legitimate, publicly published business contact routes — from channel descriptions, creators' own websites and their public contact pages. Nothing is guessed, scraped from private sources or invented." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Publicly published" value={sum?.published ?? 0} icon={<Mail size={16} />} tone="cyan" loading={!data} sub="Emails found on a public page" />
        <StatCard label="Unverified" value={sum?.unverified ?? 0} icon={<Info size={16} />} tone="magenta" loading={!data} sub="Added manually, unchecked" />
        <StatCard label="Verified deliverable" value={sum?.verified ?? 0} icon={<ShieldCheck size={16} />} tone="green" loading={!data} sub="Mailbox-level verification" />
        <StatCard label="All routes" value={data?.total ?? 0} icon={<Link2 size={16} />} loading={!data} sub="Email · website · social" />
      </div>

      <Panel className="mb-6"><PanelHeader title="Creators by contact status" icon={<ShieldCheck size={16} />} sub="Separate statuses, never merged. Each creator is counted once, under its strongest status." />
        <div className="grid grid-cols-2 gap-3 px-5 pb-5 md:grid-cols-3 xl:grid-cols-6">
          {([["deliverability_checked", "Deliverability checked", "green", "Public email whose domain passed a DNS/MX check"], ["publicly_published", "Publicly published", "cyan", "Email the creator published on a public page"], ["unverified", "Unverified", "amber", "Added manually; nothing checked"], ["website", "Website only", "neutral", "Official website, no email found"], ["contact_form", "Contact form", "neutral", "A public contact page"], ["none", "No public route", "neutral", "Nothing published"]] as const).map(([k, label, tone, hint]) => (
            <div key={k} className="rounded-xl border border-line bg-bg p-3"><Badge tone={tone as any} dot>{label}</Badge><p className="data mt-2 text-2xl font-semibold">{cs ? cs.primary[k].toLocaleString() : "…"}</p><p className="mt-1 text-[11px] leading-snug text-dim">{hint}</p></div>))}
        </div></Panel>

      <div className="mb-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel><PanelHeader title="Scan a creator" icon={<ScanSearch size={16} />} sub="Re-reads the channel description and the creator's public website and contact page (robots.txt respected)." />
          <div className="flex flex-wrap items-end gap-3 px-5 pb-5">
            <label className="min-w-[220px] flex-1"><span className="label mb-1.5 block">Creator</span><select className="field" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Creator to scan"><option value="">Select a discovered creator…</option>{cands?.items.map((c) => <option key={c.id} value={c.id}>{c.title} · {c.contact_count} route(s)</option>)}</select></label>
            <button className="btn-primary !px-5 !py-2.5 !text-xs" disabled={!pick || scanning} onClick={scan}>{scanning ? "Scanning…" : "Run contact scan"}</button>
            {cands && cands.items.length === 0 && <p className="w-full text-xs text-dim">Real creators appear here after a discovery run. Demonstration records are never scanned.</p>}
          </div></Panel>
        <Panel className="p-5"><h3 className="font-heading text-sm font-semibold">What the trust levels mean</h3>
          <dl className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed text-mute">
            <div><dt className="flex items-center gap-2 text-ink"><Badge tone="cyan" dot>Publicly published</Badge></dt><dd className="mt-1">Seen on a public page. It exists; that does not prove it is deliverable.</dd></div>
            <div><dt className="flex items-center gap-2 text-ink"><Badge tone="amber" dot>Unverified</Badge></dt><dd className="mt-1">Entered by you, or a non-email route. No evidence checked.</dd></div>
            <div><dt className="flex items-center gap-2 text-ink"><Badge tone="green" dot>Verified deliverable</Badge></dt><dd className="mt-1">Reserved for mailbox-level verification by a provider. Not yet integrated, so nothing is auto-marked verified.</dd></div></dl></Panel>
      </div>

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 border-b border-forest/10 p-4">
          <label className="min-w-[200px] flex-1"><span className="label mb-1.5 block">Search</span><input className="field" aria-label="Search contact routes" placeholder="Email, URL or creator…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          <div className="w-44"><span className="label mb-1.5 block">Type</span><MultiSelect searchable={false} label="Route type" placeholder="All" options={[{ value: "email", label: "Email" }, { value: "website", label: "Website" }, { value: "contact_page", label: "Contact page" }, { value: "social", label: "Social" }]} value={kind} onChange={(v) => { setKind(v); setPage(1); }} /></div>
          <div className="w-44"><span className="label mb-1.5 block">Trust</span><MultiSelect searchable={false} label="Trust level" placeholder="All" options={Object.entries(routeStatusLabel).map(([value, label]) => ({ value, label }))} value={status} onChange={(v) => { setStatus(v); setPage(1); }} /></div>
          <div className="w-44"><span className="label mb-1.5 block">Source</span><MultiSelect searchable={false} label="Source" placeholder="All" options={["channel_description", "website", "contact_page", "manual"].map((s) => ({ value: s, label: titleCase(s) }))} value={source} onChange={(v) => { setSource(v); setPage(1); }} /></div>
        </div>
        {error ? <ErrorState error={error} onRetry={() => mutate()} /> : !data ? <div className="space-y-2 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div> : data.items.length === 0 ? <EmptyState icon={<Mail size={24} />} title="No contact routes found" body="Run a discovery with “Business contact available” enabled, or scan a creator above." /> : (
          <>
            <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[960px] text-sm"><thead className="border-b border-forest/15 bg-bg/40"><tr>{["Contact", "Creator", "Source", "Discovered", "Status", "Website", "Confidence", ""].map((h) => <th key={h} scope="col" className="label px-4 py-3 text-left">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">{data.items.map((r) => (
                <tr key={r.id} className="transition hover:bg-forest-50">
                  <td className="max-w-[260px] px-4 py-3"><div className="flex items-center gap-2">{r.kind === "email" ? <Mail size={14} className="shrink-0 text-forest" /> : r.kind === "social" ? <Link2 size={14} className="shrink-0 text-forest" /> : <Globe size={14} className="shrink-0 text-forest" />}
                    {r.kind === "email" ? <span className="data truncate text-xs">{r.value}</span> : <a href={r.value} target="_blank" rel="noopener noreferrer nofollow" className="data truncate text-xs text-moss hover:underline">{r.value}</a>}{r.is_demo && <DemoTag />}</div></td>
                  <td className="px-4"><div className="flex items-center gap-2"><Avatar src={r.creator?.thumbnail_url} name={r.creator?.title ?? "?"} size={26} /><span className="max-w-[150px] truncate text-xs">{r.creator?.title.replace(/ \(demo\)$/i, "")}</span></div></td>
                  <td className="px-4 text-xs text-mute">{titleCase(r.source)}</td><td className="whitespace-nowrap px-4 text-xs text-mute">{ago(r.discovered_at)}</td>
                  <td className="px-4"><Badge tone={statusTone[r.status]} dot>{routeStatusLabel[r.status]}</Badge></td>
                  <td className="px-4 text-xs">{r.website_status ? <Badge tone={r.website_status === "ok" ? "green" : "neutral"}>{titleCase(r.website_status)}</Badge> : <span className="text-dim">—</span>}</td>
                  <td className="px-4"><div className="flex items-center gap-2"><div className="w-16"><Progress label="Contact confidence" value={r.confidence * 100} tone={r.confidence > 0.8 ? "green" : "purple"} /></div><span className="data text-xs">{Math.round(r.confidence * 100)}%</span></div></td>
                  <td className="px-4 text-right"><button aria-label="Copy value" onClick={() => copy(r.value)} className="rounded-lg p-1.5 text-mute hover:bg-ink/[0.06] hover:text-ink"><Copy size={14} /></button></td>
                </tr>))}</tbody></table></div>
            <ul className="space-y-2 p-3 lg:hidden">{data.items.map((r) => <RouteRow key={r.id} r={r} showCreator />)}</ul>
            <div className="flex items-center justify-between border-t border-forest/15 px-4 py-3 text-xs text-mute"><span className="data">{data.total.toLocaleString()} route(s)</span><div className="flex items-center gap-2"><button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button><span className="data">{page} / {pages}</span><button className="btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div></div>
          </>)}
      </Panel>
      <p className={cn("mt-4 max-w-3xl text-xs leading-relaxed text-dim")}>Compliance note: a publicly listed business address is not consent. Before any outreach, follow the rules that apply to you and the recipient — e.g. UK PECR &amp; UK GDPR, EU GDPR/ePrivacy, US CAN-SPAM — including identifying yourself, honouring opt-outs and keeping a lawful basis. This is operational guidance, not legal advice.</p>
    </div>
  );
}

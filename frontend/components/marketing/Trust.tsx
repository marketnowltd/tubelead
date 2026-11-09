"use client";
import { CheckCircle2, Mail, Send, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cn } from "../ui/cn";
import { AWARDS, CUSTOMERS, INDUSTRIES, SEARCH_SOURCES, STRENGTHS } from "@/content/site";
import { Reveal, SectionHead } from "./bits";

type Review = { id: string; name: string; company: string | null; role: string | null; rating: number; body: string; verified: boolean; photo_url: string | null; date: string };
type PublicStats = { businesses_discovered: number | null; countries_covered: number | null; creators_with_public_email: number | null; leads_enriched: number | null; search_success_rate: number | null; search_sources: number };

/* ---------- 2. Search sources ---------- */
export function SearchSources() {
  return (
    <section aria-label="Search sources" className="border-y border-line bg-panel/70 py-7">
      <div className="mx-auto flex max-w-[1240px] flex-col items-center gap-4 px-5 sm:px-8 lg:flex-row lg:justify-between">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-dim">Where TubeLead finds creators</p>
        <ul className="flex flex-wrap justify-center gap-3">
          {SEARCH_SOURCES.map((s) => (
            <li key={s.name} className="flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3 shadow-card">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-forest/10 text-forest"><Send size={16} /></span>
              <span className="text-left">
                <span className="block text-[13.5px] font-bold">{s.name}</span>
                <span className="block text-[11.5px] text-mute">{s.detail}</span>
              </span>
              <span className={cn("ml-2 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider", s.status === "live" ? "bg-moss/10 text-moss" : "bg-ink/5 text-dim")}>{s.status === "live" ? "Live" : "Planned"}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- 3. Trusted businesses / industries ---------- */
export function TrustedBusinesses() {
  const hasCustomers = CUSTOMERS.length > 0;
  return (
    <section id="trusted" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <SectionHead n="02" eyebrow={hasCustomers ? "Trusted by ambitious businesses" : "Discover businesses across industries"}
          title={hasCustomers ? <>Teams that find their next customers with TubeLead.</> : <>Creators in every industry that buys online.</>}
          sub={hasCustomers ? "Companies that have agreed to be named." : "TubeLead finds creators who influence buyers in these industries. Customer names appear here only once they have agreed in writing."} />
        {hasCustomers ? (
          <ul className="grid grid-cols-2 items-center gap-6 sm:grid-cols-3 lg:grid-cols-6">
            {CUSTOMERS.map((c) => (
              <li key={c.name} className="flex h-20 items-center justify-center rounded-2xl border border-line bg-panel p-4 shadow-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.logo} alt={c.name} className="max-h-10 w-auto object-contain" loading="lazy" />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {INDUSTRIES.map((i, k) => (
              <Reveal key={i.name} delay={k * 0.04}>
                <li className="panel panel-lift h-full p-5">
                  <p className="font-display text-[17px] font-extrabold tracking-tight">{i.name}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-mute">{i.example}</p>
                </li>
              </Reveal>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ---------- 7. Reviews ---------- */
function Stars({ n }: { n: number }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((k) => <Star key={k} size={15} className={k <= n ? "fill-gold text-gold" : "text-line"} />)}
    </span>
  );
}

export function Reviews() {
  const { data } = useApi<{ reviews: Review[]; count: number; average_rating: number | null }>("/public/reviews");
  const list = data?.reviews ?? [];
  return (
    <section id="reviews" className="scroll-mt-20 bg-panel/60 py-24">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <SectionHead n="05" eyebrow="Reviews" title={<>What businesses are saying about TubeLead</>}
          sub="Reviews appear here after they have been checked. Verified reviews are marked once we have confirmed the customer." />
        {list.length === 0 ? (
          <>
          <ul className="grid gap-5 md:grid-cols-3" aria-label="Review placeholders">
            {[0, 1, 2].map((k) => (
              <li key={k} className="panel flex h-full flex-col gap-4 p-6">
                <div className="flex gap-1" aria-hidden>{[0, 1, 2, 3, 4].map((s) => <Star key={s} size={15} className="text-line" />)}</div>
                <div className="flex-1 space-y-2" aria-hidden><div className="h-3 w-full rounded bg-bg2" /><div className="h-3 w-11/12 rounded bg-bg2" /><div className="h-3 w-8/12 rounded bg-bg2" /></div>
                <p className="border-t border-line pt-4 text-[12.5px] text-dim">A published customer review appears here, once it has been checked.</p>
              </li>
            ))}
          </ul>
          <div className="panel mt-5 flex flex-col items-start gap-4 p-7 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-display text-xl font-extrabold tracking-tight">No published reviews yet.</p>
              <p className="mt-1.5 max-w-xl text-[14.5px] leading-relaxed text-mute">We only publish reviews from real customers, after they have been checked. If you use TubeLead, tell us how it went below.</p>
            </div>
            <a href="#review-form" className="btn-ghost btn-sm shrink-0">Share your experience</a>
          </div>
          </>
        ) : (
          <>
            {data?.average_rating && <p className="mb-6 flex items-center gap-2 text-sm text-mute"><Stars n={Math.round(data.average_rating)} /> <span className="data font-semibold text-ink">{data.average_rating}</span> average from {data.count} reviews</p>}
            <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {list.map((r) => (
                <li key={r.id} className="panel flex h-full flex-col p-6">
                  <Stars n={r.rating} />
                  <p className="mt-4 flex-1 text-[15px] leading-relaxed text-ink">&ldquo;{r.body}&rdquo;</p>
                  <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
                    {r.photo_url ? <img src={r.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" loading="lazy" /> : <span aria-hidden className="grid h-10 w-10 place-items-center rounded-full bg-forest/10 font-heading text-sm font-bold text-forest">{r.name.slice(0, 1)}</span>}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-bold">{r.name}{r.verified && <span className="inline-flex items-center gap-1 rounded-full bg-moss/10 px-2 py-0.5 text-[10.5px] font-bold text-moss"><CheckCircle2 size={11} /> Verified customer</span>}</p>
                      <p className="text-[12.5px] text-mute">{[r.role, r.company].filter(Boolean).join(", ") || "Customer"} · {new Date(r.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <ReviewForm />
      </div>
    </section>
  );
}

function ReviewForm() {
  const [form, setForm] = useState({ name: "", company: "", role: "", rating: 5, body: "", email: "" });
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setStatus(null);
    try {
      const r = await api<{ message: string }>("/public/reviews", { method: "POST", json: { ...form, company: form.company || null, role: form.role || null, email: form.email || null } });
      setStatus({ ok: true, text: r.message });
      setForm({ name: "", company: "", role: "", rating: 5, body: "", email: "" });
    } catch (err: any) { setStatus({ ok: false, text: err.message || "Could not send your review. Please try again." }); }
    finally { setBusy(false); }
  };
  return (
    <div id="review-form" className="scroll-mt-24 mx-auto mt-12 max-w-2xl panel p-6 sm:p-8">
      <p className="label mb-2 flex items-center gap-2"><Mail size={12} /> Share your experience</p>
      <h3 className="font-display text-2xl font-extrabold tracking-tight">Tell us how TubeLead helped</h3>
      <p className="mt-1.5 text-[13.5px] text-mute">Your review is checked before it appears. Your email is kept private and never published.</p>
      <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="label mb-1.5 block">Your name</span><input required minLength={2} maxLength={120} className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="block"><span className="label mb-1.5 block">Company (optional)</span><input maxLength={160} className="field" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></label>
        <label className="block"><span className="label mb-1.5 block">Your role (optional)</span><input maxLength={120} className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></label>
        <label className="block"><span className="label mb-1.5 block">Rating</span>
          <select className="field" value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} stars</option>)}</select></label>
        <label className="block sm:col-span-2"><span className="label mb-1.5 block">Your review</span><textarea required minLength={20} maxLength={1500} rows={4} className="field" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="What did you find, and what did it help you do?" /></label>
        <label className="block sm:col-span-2"><span className="label mb-1.5 block">Email (private, for checking only)</span><input type="email" maxLength={255} className="field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={busy}>{busy ? "Sending…" : "Send review"}</button>
          {status && <p role="status" className={cn("text-sm", status.ok ? "text-moss" : "text-[#A33A2A]")}>{status.text}</p>}
        </div>
      </form>
    </div>
  );
}

/* ---------- 8. Verified statistics ---------- */
export function Statistics() {
  const { data } = useApi<PublicStats>("/public/stats", { refreshInterval: 60000 });
  const tiles: { label: string; value: number | null; fmt?: (n: number) => string; capability: string }[] = [
    { label: "Businesses discovered", value: data?.businesses_discovered ?? null, capability: "Every creator is saved once, with no duplicates." },
    { label: "Countries covered", value: data?.countries_covered ?? null, capability: "Search by country, or worldwide." },
    { label: "Creators with a public email", value: data?.creators_with_public_email ?? null, capability: "Only emails the creator published." },
    { label: "Search success rate", value: data?.search_success_rate ?? null, fmt: (n) => `${n}%`, capability: "Share of completed searches that finished." },
  ];
  return (
    <section id="stats" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <SectionHead n="06" eyebrow="Verified statistics" title={<>Numbers from the platform, not from a brochure.</>}
          sub="Each figure is counted from stored records. A figure appears once there is enough data behind it. Until then, the capability is shown instead." />
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((t) => (
            <li key={t.label} className="panel p-6">
              <p className="label">{t.label}</p>
              {t.value !== null ? (
                <p className="data mt-3 text-[40px] font-semibold leading-none">{t.fmt ? t.fmt(t.value) : t.value.toLocaleString("en-GB")}</p>
              ) : (
                <p className="mt-3 font-display text-[17px] font-bold leading-snug">{t.capability}</p>
              )}
              {t.value !== null && <p className="mt-2 text-[12px] text-dim">{t.capability}</p>}
            </li>
          ))}
        </ul>
        {data && <p className="mt-5 text-[12px] text-dim">Search sources: {data.search_sources} (YouTube Data API v3). Updated every minute.</p>}
      </div>
    </section>
  );
}

/* ---------- 9. Awards & recognition ---------- */
export function Recognition() {
  return (
    <section id="awards" className="scroll-mt-20 bg-panel/60 py-24">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <SectionHead n="07" eyebrow="Recognition" title={<>Built to raise the standard of lead discovery.</>}
          sub={AWARDS.length > 0 ? "Recognition we have received." : "Awards appear here when they are real. Until then, these are what the product does."} />
        {AWARDS.length > 0 ? (
          <ul className="grid gap-5 md:grid-cols-3">
            {AWARDS.map((a) => (
              <li key={a.title + a.year} className="panel p-6">
                <p className="font-display text-lg font-extrabold tracking-tight">{a.title}</p>
                <p className="mt-1 text-[13px] text-mute">{a.issuer} · {a.year}</p>
                {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-[13px] font-semibold text-forest hover:underline">View source</a>}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {STRENGTHS.map((s) => (
              <li key={s.title} className="panel flex gap-4 p-6">
                <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-moss" />
                <div><p className="font-display text-[16px] font-extrabold tracking-tight">{s.title}</p><p className="mt-1.5 text-[13.5px] leading-relaxed text-mute">{s.detail}</p></div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-8 text-center text-[13px] text-dim">Want to see it work? <Link href="/signup" className="font-semibold text-forest hover:underline">Start with 25 free leads</Link>.</p>
      </div>
    </section>
  );
}

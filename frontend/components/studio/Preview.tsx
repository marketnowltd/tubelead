"use client";
import { AlertTriangle, CheckCircle2, Monitor, Smartphone, Tablet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { Segmented } from "@/components/ui/inputs";
import { api } from "@/lib/api";
import type { Doc } from "./model";

export const DEVICES = { desktop: 1024, tablet: 768, mobile: 375 } as const;
export type Device = keyof typeof DEVICES;

export async function renderDoc(doc: Doc, subject: string, preheader: string, opts: { demo?: boolean; prospectId?: string | null } = {}) {
  if (opts.demo) {
    const r = await fetch("/api/public/email/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc, subject, preheader }) });
    if (!r.ok) throw new Error("Preview unavailable");
    return r.json() as Promise<{ html: string; text: string; subject?: string }>;
  }
  return api<{ html: string; text: string; subject: string }>("/studio/render", { method: "POST", json: { doc, subject, preheader, prospect_id: opts.prospectId || undefined } });
}

/** Responsive problems measured in the rendered email at the current width. */
function inspectFrame(doc: Document, mobile: boolean): string[] {
  const out: string[] = [];
  const root = doc.documentElement;
  if (root.scrollWidth > root.clientWidth + 2) out.push("Content is wider than the screen, so readers would scroll sideways.");
  if (mobile) {
    let small = 0;
    doc.querySelectorAll("h1, div, p, td, span, a").forEach((n) => {
      const el = n as HTMLElement;
      if (!el.childNodes.length || ![...el.childNodes].some((c) => c.nodeType === 3 && (c.textContent || "").trim())) return;
      if (parseFloat(getComputedStyle(el).fontSize) < 13) small++;
    });
    if (small) out.push(`${small} piece${small > 1 ? "s" : ""} of text ${small > 1 ? "are" : "is"} smaller than 13px on phones.`);
    doc.querySelectorAll("a").forEach((a) => {
      const r = (a as HTMLElement).getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.height < 40 && (a as HTMLElement).style.padding) out.push(`The button “${(a.textContent || "").trim().slice(0, 30)}” is under 40px tall and may be hard to tap.`);
    });
  }
  doc.querySelectorAll("img").forEach((img) => {
    const r = img.getBoundingClientRect(); const parent = img.parentElement?.getBoundingClientRect();
    if (parent && r.width > parent.width + 2) out.push(`An image (${img.alt || "no alt text"}) is wider than its container.`);
  });
  return [...new Set(out)];
}

export function EmailFrame({ html, width, onIssues, title = "Email preview", className }: { html: string; width: number; onIssues?: (i: string[]) => void; title?: string; className?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(600);
  const measure = () => {
    const d = ref.current?.contentDocument; if (!d) return;
    setH(Math.max(300, d.documentElement.scrollHeight));
    onIssues?.(inspectFrame(d, width < 500));
  };
  useEffect(() => { const t = setTimeout(measure, 120); return () => clearTimeout(t); }, [html, width]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={cn("mx-auto overflow-hidden rounded-xl border border-line bg-white shadow-card transition-[width] duration-500 ease-[cubic-bezier(.22,1,.36,1)]", className)} style={{ width: Math.min(width, 1024), maxWidth: "100%" }}>
      <iframe ref={ref} title={title} srcDoc={html} sandbox="allow-same-origin allow-popups" onLoad={measure} className="block w-full border-0" style={{ height: h }} />
    </div>
  );
}

export function PreviewPanel({ doc, subject, preheader, demo, prospects }: { doc: Doc; subject: string; preheader: string; demo?: boolean; prospects?: { id: string; name: string }[] }) {
  const [device, setDevice] = useState<Device>("mobile");
  const [tab, setTab] = useState<"html" | "text">("html");
  const [prospect, setProspect] = useState<string>("");
  const [out, setOut] = useState<{ html: string; text: string; subject?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => renderDoc(doc, subject, preheader, { demo, prospectId: prospect }).then((r) => live && (setOut(r), setErr(null))).catch((e) => live && setErr(e.message)), 250);
    return () => { live = false; clearTimeout(t); };
  }, [doc, subject, preheader, demo, prospect]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Preview size" className="inline-flex rounded-lg border border-line bg-bg/60 p-0.5">
          {([["desktop", Monitor], ["tablet", Tablet], ["mobile", Smartphone]] as const).map(([d, I]) => (
            <button key={d} type="button" role="radio" aria-checked={device === d} aria-label={`${d} preview`} onClick={() => setDevice(d)}
              className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold capitalize transition", device === d ? "bg-forest text-paper shadow-card" : "text-mute hover:text-ink")}><I size={13} />{d}</button>))}
        </div>
        <Segmented label="Preview format" value={tab} onChange={setTab} options={[{ value: "html", label: "Designed" }, { value: "text", label: "Plain text" }]} />
        {prospects && prospects.length > 0 && <select aria-label="Preview as recipient" className="field !w-auto !py-1.5 text-xs" value={prospect} onChange={(e) => setProspect(e.target.value)}>
          <option value="">Preview with fallbacks</option>{prospects.map((p) => <option key={p.id} value={p.id}>As {p.name}</option>)}</select>}
      </div>
      {out?.subject !== undefined && <p className="text-sm"><span className="text-mute">Subject:</span> <strong>{out.subject || "(no subject)"}</strong></p>}
      {err && <p role="alert" className="text-sm text-[#A33A2A]">{err}</p>}
      {out && tab === "html" && <>
        <div className={cn("flex items-start gap-2 rounded-lg p-2.5 text-[12.5px]", issues.length ? "bg-gold/15 text-gold-text" : "bg-moss/10 text-moss")}>
          {issues.length ? <AlertTriangle size={15} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={15} className="mt-0.5 shrink-0" />}
          <div>{issues.length ? <ul className="space-y-0.5">{issues.map((i) => <li key={i}>{i}</li>)}</ul> : `No layout problems at ${DEVICES[device]}px.`}</div>
        </div>
        <div className="overflow-x-auto rounded-2xl bg-bg2/60 p-3"><EmailFrame html={out.html} width={DEVICES[device]} onIssues={setIssues} /></div>
      </>}
      {out && tab === "text" && <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-panel p-4 text-[13px] leading-relaxed">{out.text}</pre>}
    </div>
  );
}

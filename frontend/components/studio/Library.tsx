"use client";
import { LayoutTemplate, Palette } from "lucide-react";
import { useState } from "react";
import { cn } from "@/components/ui/cn";
import { Modal, useToast } from "@/components/ui/overlay";
import { api, useApi } from "@/lib/api";
import { ColorField, ImageUpload, Row, Select } from "./fields";
import { FONTS, make, makeSection, uid, type Doc, type El, type Section } from "./model";

export interface Template { id: string; name: string; category: string; category_label: string; subject: string; doc: Doc; mine: boolean }

export function TemplatePicker({ open, onClose, onPick, demo }: { open: boolean; onClose: () => void; onPick: (t: Template) => void; demo?: boolean }) {
  const { data } = useApi<Template[]>(open ? (demo ? "/public/email/templates" : "/studio/templates") : null);
  const [cat, setCat] = useState("all");
  const cats = [...new Map((data ?? []).map((t) => [t.category, t.category_label])).entries()];
  const list = (data ?? []).filter((t) => cat === "all" || t.category === cat);
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Templates" description="Every template is fully editable in both editors. Replace the [bracketed] text with your own.">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">{[["all", "All"], ...cats].map(([v, l]) => (
          <button key={v} type="button" onClick={() => setCat(v)} className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", cat === v ? "border-forest bg-forest text-paper" : "border-line text-mute")}>{l}</button>))}</div>
        <ul className="grid max-h-[50vh] gap-2 overflow-y-auto sm:grid-cols-2">{list.map((t) => (
          <li key={t.id}><button type="button" onClick={() => onPick(t)} className="w-full rounded-xl border border-line p-3 text-left transition hover:-translate-y-0.5 hover:border-forest hover:shadow-card">
            <span className="mb-2 block h-14 rounded-lg" style={{ background: `linear-gradient(135deg, ${t.doc.settings.background}, ${t.doc.settings.linkColor})` }} />
            <span className="block text-[13px] font-semibold">{t.name}</span><span className="block truncate text-[11px] text-mute">{t.subject}</span></button></li>))}</ul>
        {!data && <p className="text-sm text-mute">Loading…</p>}
      </div>
    </Modal>
  );
}

export interface Brand { company?: string; logo?: string; primary?: string; secondary?: string; font?: string; website?: string; email?: string; phone?: string; address?: string; socials?: Record<string, string>; images?: string[] }

export function BrandKitDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { data, mutate } = useApi<Brand>(open ? "/studio/brand" : null);
  const [b, setB] = useState<Brand | null>(null);
  const cur = b ?? data ?? {};
  const set = (k: keyof Brand, v: any) => setB({ ...cur, [k]: v });
  const save = async () => {
    try { await mutate(api<Brand>("/studio/brand", { method: "PUT", json: { ...cur, socials: cur.socials ?? {}, images: cur.images ?? [] } }), { revalidate: false }); toast("success", "Brand Kit saved"); setB(null); onClose(); }
    catch (e: any) { toast("error", e.message); }
  };
  return (
    <Modal open={open} onOpenChange={(o) => !o && (setB(null), onClose())} title="Brand Kit" description="Saved once, applied to any email with “Apply my brand”."
      footer={<><button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button><button className="btn-primary btn-sm" onClick={save}>Save Brand Kit</button></>}>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
        <Row label="Company"><input aria-label="Company" className="field !py-1.5 text-xs" value={cur.company ?? ""} onChange={(e) => set("company", e.target.value)} /></Row>
        <Row label="Logo">{cur.logo ? <div className="flex items-center gap-2"><img src={cur.logo} alt="" className="h-10 rounded border border-line" /><button type="button" className="btn-ghost btn-sm" onClick={() => set("logo", "")}>Remove</button></div>
          : <ImageUpload label="Upload logo" onUploaded={(r) => set("logo", r.url)} />}</Row>
        <ColorField label="Primary colour" value={cur.primary || null} allowEmpty onChange={(v) => set("primary", v ?? "")} />
        <ColorField label="Secondary colour" value={cur.secondary || null} allowEmpty onChange={(v) => set("secondary", v ?? "")} />
        <Select label="Font" value={cur.font ?? ""} options={[["", "No preference"], ...Object.keys(FONTS).map((f) => [f, f] as [string, string])]} onChange={(v) => set("font", v)} />
        {(["website", "email", "phone", "address"] as const).map((k) => <Row key={k} label={k[0].toUpperCase() + k.slice(1)}><input aria-label={k} className="field !py-1.5 text-xs" value={(cur[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} /></Row>)}
        <Row label="Social links">{["linkedin", "instagram", "x", "youtube", "facebook"].map((s) => (
          <input key={s} aria-label={`${s} link`} className="field mb-1 !py-1.5 text-xs" placeholder={`${s} URL`} value={cur.socials?.[s] ?? ""} onChange={(e) => set("socials", { ...(cur.socials ?? {}), [s]: e.target.value })} />))}</Row>
      </div>
    </Modal>
  );
}

/** Prebuilt content blocks (sections) for both editors. */
export function blocks(): { id: string; label: string; make: () => Section }[] {
  const sec = (els: El[], kind: Section["kind"] = "content", name = "Section") => { const s = makeSection(1, kind); s.name = name; s.columns[0].elements = els; return s; };
  const heading = (t: string) => { const e = make("heading") as any; e.content = t; return e; };
  const text = (t: string) => { const e = make("text") as any; e.content = t; return e; };
  return [
    { id: "text", label: "Headline & text", make: () => sec([heading("A clear headline"), text("A short paragraph that explains the value to {{first_name}}.")], "content", "Text block") },
    { id: "image", label: "Image", make: () => sec([make("image")], "content", "Image block") },
    { id: "button", label: "Call to action", make: () => sec([text("Ready when you are."), make("button")], "content", "Call to action") },
    { id: "hero", label: "Hero", make: () => { const s = sec([heading("Big statement"), text("Supporting sentence."), make("button")], "hero", "Hero"); s.style.background = "#1B1433";
      (s.columns[0].elements[0] as any).style.color = "#FFFFFF"; (s.columns[0].elements[1] as any).style.color = "#D9D2F0"; (s.columns[0].elements[0] as any).style.align = "center"; (s.columns[0].elements[1] as any).style.align = "center"; return s; } },
    { id: "two", label: "Two columns", make: () => { const s = makeSection(2); s.columns[0].elements = [heading("Left"), text("Left column text.")]; s.columns[1].elements = [heading("Right"), text("Right column text.")];
      (s.columns[0].elements[0] as any).style.fontSize = 18; (s.columns[1].elements[0] as any).style.fontSize = 18; return s; } },
    { id: "three", label: "Three columns", make: () => { const s = makeSection(3); s.columns.forEach((c, i) => { c.elements = [make("image"), text(`Feature ${i + 1}`)]; }); return s; } },
    { id: "divider", label: "Divider", make: () => sec([make("divider")], "content", "Divider") },
    { id: "spacer", label: "Spacing", make: () => sec([make("spacer")], "content", "Spacing") },
    { id: "header", label: "Header with logo", make: () => { const img = make("image") as any; img.name = "Logo"; img.style.width = 30; return sec([img], "header", "Header"); } },
    { id: "footer", label: "Footer", make: () => { const t = text("[Your company] · [Address]<br>[Website] · [Phone]") as any; t.style.fontSize = 12; t.style.align = "center"; t.style.color = "#8A85A3"; return sec([t], "footer", "Footer"); } },
  ];
}

export const freshIds = (s: Section): Section => ({ ...s, id: uid(), columns: s.columns.map((c) => ({ ...c, id: uid() })) });
export { LayoutTemplate, Palette };

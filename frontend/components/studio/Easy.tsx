"use client";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, Copy, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/components/ui/cn";
import { AssistPanel } from "./Assist";
import { Canvas } from "./Canvas";
import { ColorField, Select } from "./fields";
import { blocks, freshIds } from "./Library";
import { duplicateEl, find, FONTS, moveEl, removeEl, updateEl, updateSection, type Doc } from "./model";
import type { EditorProps } from "./Pro";
import { ElementProperties, SectionProperties } from "./Properties";

/** Visual presets (mirror the server's PRESETS) applied in the browser so the change is instant and undoable. */
const PRESET_STYLES: Record<string, { label: string; swatch: [string, string]; settings: Partial<Doc["settings"]>; button: Record<string, unknown>; heading: Record<string, unknown> }> = {
  minimal: { label: "Minimal", swatch: ["#FFFFFF", "#111111"], settings: { background: "#FFFFFF", contentBackground: "#FFFFFF", fontFamily: "Helvetica", textColor: "#111111", linkColor: "#111111", radius: 0 }, button: { background: "#111111", color: "#FFFFFF", radius: 0, gradient: null }, heading: { fontWeight: 600, letterSpacing: -0.5 } },
  modern: { label: "Modern", swatch: ["#F4F1FB", "#7B3FF2"], settings: { background: "#F4F1FB", contentBackground: "#FFFFFF", fontFamily: "Helvetica", textColor: "#1B1433", linkColor: "#7B3FF2", radius: 16 }, button: { background: "#7B3FF2", color: "#FFFFFF", radius: 999, gradient: null }, heading: { fontWeight: 800, letterSpacing: -0.5 } },
  luxury: { label: "Luxury", swatch: ["#17150F", "#C9A96E"], settings: { background: "#0F0E0C", contentBackground: "#17150F", fontFamily: "Georgia", textColor: "#EDE6D6", linkColor: "#C9A96E", radius: 0 }, button: { background: "#C9A96E", color: "#17150F", radius: 0, gradient: null }, heading: { fontWeight: 400, letterSpacing: 1 } },
  bold: { label: "Bold", swatch: ["#FFE9DD", "#FF7A3D"], settings: { background: "#FFE9DD", contentBackground: "#FFFFFF", fontFamily: "Arial", textColor: "#1B1433", linkColor: "#D9531E", radius: 4 }, button: { background: "#C2410C", color: "#FFFFFF", radius: 4, gradient: null }, heading: { fontWeight: 900, letterSpacing: -1 } },
  corporate: { label: "Corporate", swatch: ["#EEF2F7", "#1D4ED8"], settings: { background: "#EEF2F7", contentBackground: "#FFFFFF", fontFamily: "Arial", textColor: "#1F2937", linkColor: "#1D4ED8", radius: 4 }, button: { background: "#1D4ED8", color: "#FFFFFF", radius: 4, gradient: null }, heading: { fontWeight: 700, letterSpacing: 0 } },
  creative: { label: "Creative", swatch: ["#FDF2FA", "#C026D3"], settings: { background: "#FDF2FA", contentBackground: "#FFFFFF", fontFamily: "Trebuchet", textColor: "#2B1036", linkColor: "#C026D3", radius: 24 }, button: { background: "#C026D3", color: "#FFFFFF", radius: 999, gradient: { from: "#D32DE5", to: "#FF982E", angle: 105 } }, heading: { fontWeight: 800, letterSpacing: -0.5 } },
};

export function applyPreset(doc: Doc, name: string): Doc {
  const p = PRESET_STYLES[name]; if (!p) return doc;
  const d: Doc = JSON.parse(JSON.stringify(doc));
  Object.assign(d.settings, p.settings, { preset: name });
  const walk = (els: any[], hero: boolean) => els.forEach((e) => {
    if (e.type === "button") Object.assign(e.style, p.button);
    if (e.type === "heading") { Object.assign(e.style, p.heading); if (!hero) e.style.color = null; }
    if (e.type === "text" && !hero) e.style.color = null;
    if (e.type === "group") walk(e.children, hero);
  });
  // hero text sits on its own background, so its colours are kept
  d.sections.forEach((s) => { if (s.kind !== "hero") { s.style.background = null; s.style.gradient = null; } s.columns.forEach((c) => walk(c.elements, s.kind === "hero")); });
  return d;
}

export function EasyEditor(p: EditorProps) {
  const { doc, setDoc, selected, setSelected } = p;
  const [panel, setPanel] = useState<"blocks" | "ai">("blocks");
  const sel = selected[0] ? find(doc, selected[0]) : null;
  const sec = p.selectedSection ? doc.sections.find((s) => s.id === p.selectedSection) : null;
  const width = p.device === "mobile" ? 375 : p.device === "tablet" ? 520 : doc.settings.width;
  const moveSection = (i: number, dir: -1 | 1) => { const a = [...doc.sections]; const j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setDoc({ ...doc, sections: a }); };

  return (
    <div className="space-y-4">
      {/* presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-mute">Style</span>
        {Object.entries(PRESET_STYLES).map(([k, v]) => {
          const on = doc.settings.preset === k;
          return (
            <motion.button key={k} type="button" whileTap={{ scale: 0.95 }} onClick={() => setDoc(applyPreset(doc, k))} aria-pressed={on}
              className={cn("relative flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition", on ? "border-forest text-forest" : "border-line text-mute hover:border-forest/50 hover:text-ink")}>
              <span className="flex -space-x-1"><i className="h-3.5 w-3.5 rounded-full border border-white" style={{ background: v.swatch[0] }} /><i className="h-3.5 w-3.5 rounded-full border border-white" style={{ background: v.swatch[1] }} /></span>
              {v.label}{on && <motion.span layoutId="easy-preset" className="absolute inset-0 -z-10 rounded-full bg-forest/10" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
            </motion.button>);
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_300px]">
        {/* left: add blocks / AI */}
        <aside className="space-y-3 rounded-2xl border border-line bg-panel p-3">
          <div role="tablist" aria-label="Easy panels" className="relative grid grid-cols-2 rounded-xl bg-bg2 p-1">
            {([["blocks", "Add content", Plus], ["ai", "Improve", Sparkles]] as const).map(([k, l, I]) => (
              <button key={k} role="tab" aria-selected={panel === k} type="button" onClick={() => setPanel(k)} className={cn("relative z-10 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-semibold transition", panel === k ? "text-forest" : "text-mute")}>
                {panel === k && <motion.span layoutId="easy-panel" className="absolute inset-0 -z-10 rounded-lg bg-panel shadow-card" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}<I size={13} />{l}</button>))}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={panel} initial={{ opacity: 0, x: panel === "ai" ? 12 : -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: panel === "ai" ? -12 : 12 }} transition={{ type: "spring", stiffness: 420, damping: 36 }}>
              {panel === "blocks" ? (
                <div className="space-y-3">
                  <ul className="grid grid-cols-2 gap-1.5">{blocks().map((b) => (
                    <li key={b.id}><motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} type="button" className="w-full rounded-lg border border-line px-2 py-2 text-left text-[11.5px] font-medium transition hover:border-forest hover:text-forest"
                      onClick={() => { const s = freshIds(b.make()); const i = p.selectedSection ? doc.sections.findIndex((x) => x.id === p.selectedSection) + 1 : doc.sections.length; const a = [...doc.sections]; a.splice(i, 0, s); setDoc({ ...doc, sections: a }); p.setSelectedSection(s.id); setSelected([]); }}>
                      {b.label}</motion.button></li>))}</ul>
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-mute">Sections</p>
                    <ul className="space-y-1">{doc.sections.map((s, i) => (
                      <motion.li layout key={s.id} className={cn("flex items-center gap-1 rounded-lg px-2 py-1 text-[12px]", p.selectedSection === s.id ? "bg-forest/10 text-forest" : "hover:bg-ink/5")}>
                        <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => { p.setSelectedSection(s.id); setSelected([]); }}>{s.name}</button>
                        <button aria-label={`Move ${s.name} up`} disabled={i === 0} className="rounded p-0.5 disabled:opacity-20" onClick={() => moveSection(i, -1)}><ArrowUp size={12} /></button>
                        <button aria-label={`Move ${s.name} down`} disabled={i === doc.sections.length - 1} className="rounded p-0.5 disabled:opacity-20" onClick={() => moveSection(i, 1)}><ArrowDown size={12} /></button>
                        <button aria-label={`Remove ${s.name}`} className="rounded p-0.5 hover:text-[#A33A2A]" onClick={() => { setDoc({ ...doc, sections: doc.sections.filter((x) => x.id !== s.id) }); p.setSelectedSection(null); }}><Trash2 size={12} /></button>
                      </motion.li>))}</ul>
                  </div>
                </div>
              ) : <AssistPanel doc={doc} demo={p.demo} selectedId={selected[0]} onApply={(d) => setDoc(d)} onUndo={p.undo} />}
            </motion.div>
          </AnimatePresence>
        </aside>

        {/* canvas */}
        <div className="min-w-0 rounded-2xl border border-line p-4 transition-colors duration-500 sm:p-6" style={{ background: doc.settings.background }}>
          <Canvas doc={doc} width={width} mobile={p.device === "mobile"} selected={selected} inlineEdit="click" selectedSection={p.selectedSection}
            onSelect={(id) => { setSelected(id ? [id] : []); if (id) p.setSelectedSection(null); }} onSelectSection={(id) => p.setSelectedSection(id)}
            onText={(id, html) => setDoc(updateEl(doc, id, (e) => { e.content = html; }))} onDrop={(data, t) => { if (data.id) setDoc(moveEl(doc, data.id, t)); }} />
          <p className="mt-3 text-center text-[11px] text-dim">Click any text to edit it. Drag elements to rearrange them.</p>
        </div>

        {/* contextual panel */}
        <aside className="rounded-2xl border border-line bg-panel p-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={sel?.el.id ?? sec?.id ?? "email"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ type: "spring", stiffness: 420, damping: 34 }} className="space-y-3">
              {sel ? <>
                <div className="flex items-center justify-between"><p className="font-heading text-sm font-bold">{sel.el.name}</p>
                  <div className="flex gap-1"><button aria-label="Duplicate" className="rounded-md p-1.5 text-mute hover:bg-forest/10" onClick={() => { const r = duplicateEl(doc, sel.el.id); setDoc(r.doc); setSelected([r.newId]); }}><Copy size={14} /></button>
                    <button aria-label="Remove" className="rounded-md p-1.5 text-mute hover:bg-[#B5493A]/15 hover:text-[#A33A2A]" onClick={() => { setDoc(removeEl(doc, sel.el.id)); setSelected([]); }}><Trash2 size={14} /></button></div></div>
                {sel.el.locked ? <p className="text-xs text-mute">Locked in Pro Editor.</p> : <ElementProperties el={sel.el} level="easy" demo={p.demo} brandColors={p.brandColors} onChange={(fn) => setDoc(updateEl(doc, sel.el.id, fn))} />}
              </> : sec ? <><p className="font-heading text-sm font-bold">{sec.name}</p><SectionProperties sec={sec} level="easy" demo={p.demo} brandColors={p.brandColors} onChange={(fn) => setDoc(updateSection(doc, sec.id, fn))} /></> : <>
                <p className="font-heading text-sm font-bold">Email style</p>
                <ColorField label="Background" value={doc.settings.background} swatches={p.brandColors} onChange={(v) => v && setDoc({ ...doc, settings: { ...doc.settings, background: v } })} />
                <ColorField label="Brand colour (links)" value={doc.settings.linkColor} swatches={p.brandColors} onChange={(v) => v && setDoc({ ...doc, settings: { ...doc.settings, linkColor: v } })} />
                <ColorField label="Text colour" value={doc.settings.textColor} swatches={p.brandColors} onChange={(v) => v && setDoc({ ...doc, settings: { ...doc.settings, textColor: v } })} />
                <Select label="Font" value={doc.settings.fontFamily} options={Object.keys(FONTS).map((f) => [f, f])} onChange={(v) => setDoc({ ...doc, settings: { ...doc.settings, fontFamily: v } })} />
                <p className="text-[11px] text-dim">Select text, an image, a button or a section to change it.</p>
              </>}
            </motion.div>
          </AnimatePresence>
        </aside>
      </div>
    </div>
  );
}

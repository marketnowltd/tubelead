"use client";
import { AnimatePresence, motion } from "motion/react";
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Boxes, ChevronRight, Columns2, Columns3, Copy, Eye, EyeOff, Group, Heading1, Image as ImageIcon, Layers, LayoutPanelTop,
  Lock, MousePointer2, PaintBucket, RectangleHorizontal, Rows3, SeparatorHorizontal, Sparkles, Square, SquarePlus, Trash2, Type, Ungroup, Unlock } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { useApi } from "@/lib/api";
import { AssistPanel } from "./Assist";
import { Canvas, type DropTarget } from "./Canvas";
import { blocks, freshIds } from "./Library";
import { duplicateEl, find, groupEls, insertEl, make, makeSection, moveEl, removeEl, shiftEl, stripHtml, ungroup, updateEl, updateSection, type Doc, type El, type GroupEl } from "./model";
import { DocProperties, ElementProperties, SectionProperties } from "./Properties";

export interface EditorProps {
  doc: Doc; setDoc: (d: Doc, merge?: boolean) => void; selected: string[]; setSelected: (ids: string[]) => void; selectedSection: string | null; setSelectedSection: (id: string | null) => void;
  brandColors: string[]; demo?: boolean; device: "desktop" | "tablet" | "mobile"; undo: () => void;
}

const TOOLS: { id: string; label: string; icon: any; key?: string; el?: El["type"] }[] = [
  { id: "select", label: "Select", icon: MousePointer2, key: "V" }, { id: "heading", label: "Headline", icon: Heading1, key: "H", el: "heading" },
  { id: "text", label: "Text", icon: Type, key: "T", el: "text" }, { id: "image", label: "Image", icon: ImageIcon, key: "I", el: "image" },
  { id: "shape", label: "Shape", icon: Square, key: "S", el: "shape" }, { id: "button", label: "Button", icon: RectangleHorizontal, key: "B", el: "button" },
  { id: "divider", label: "Divider", icon: SeparatorHorizontal, el: "divider" }, { id: "spacer", label: "Spacer", icon: Rows3, el: "spacer" },
  { id: "group", label: "Container", icon: Boxes, el: "group" }, { id: "layout", label: "Layout", icon: Columns3 }, { id: "section", label: "Section", icon: SquarePlus },
  { id: "background", label: "Background", icon: PaintBucket }, { id: "assets", label: "Assets", icon: LayoutPanelTop },
];

export function insertionPoint(doc: Doc, selected: string[], sectionId: string | null): DropTarget | null {
  const sel = selected[0] ? find(doc, selected[0]) : null;
  if (sel) return sel.parent ? { section: sel.loc.s, column: sel.loc.c, index: (sel.loc.g ?? 0) + 1, group: sel.parent.id }
    : sel.el.type === "group" ? { section: sel.loc.s, column: sel.loc.c, index: (sel.el as GroupEl).children.length, group: sel.el.id } : { section: sel.loc.s, column: sel.loc.c, index: sel.loc.i + 1 };
  const si = sectionId ? doc.sections.findIndex((s) => s.id === sectionId) : doc.sections.length - 1;
  if (si < 0) return null;
  return { section: si, column: 0, index: doc.sections[si].columns[0].elements.length };
}

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return <span className="group/tip relative">{children}<span className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-paper opacity-0 transition group-hover/tip:opacity-100">{label}</span></span>;
}

export function ProEditor(p: EditorProps) {
  const { doc, setDoc, selected, setSelected } = p;
  const [tool, setTool] = useState("select");
  const [tab, setTab] = useState<"properties" | "layers" | "ai">("properties");
  const [zoom, setZoom] = useState(1);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [popover, setPopover] = useState<"layout" | "assets" | "blocks" | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const { data: assets } = useApi<{ id: string; url: string; filename: string; width: number | null; height: number | null }[]>(popover === "assets" && !p.demo ? "/studio/assets" : null);
  const sel = selected[0] ? find(doc, selected[0]) : null;
  const sec = p.selectedSection ? doc.sections.find((s) => s.id === p.selectedSection) : null;

  const add = (type: El["type"]) => {
    const t = insertionPoint(doc, selected, p.selectedSection);
    let d = doc;
    let target = t;
    if (!target) { d = { ...doc, sections: [...doc.sections, makeSection(1)] }; target = { section: d.sections.length - 1, column: 0, index: 0 }; }
    const el = make(type);
    setDoc(insertEl(d, el, target)); setSelected([el.id]); setTool("select"); setTab("properties");
  };
  const addSection = (cols: number) => { const s = makeSection(cols); const i = p.selectedSection ? doc.sections.findIndex((x) => x.id === p.selectedSection) + 1 : doc.sections.length;
    const sections = [...doc.sections]; sections.splice(i, 0, s); setDoc({ ...doc, sections }); p.setSelectedSection(s.id); setSelected([]); setPopover(null); };
  const pickTool = (id: string) => {
    const t = TOOLS.find((x) => x.id === id);
    if (t?.el) return add(t.el);
    if (id === "layout") return setPopover(popover === "layout" ? null : "layout");
    if (id === "assets") return setPopover(popover === "assets" ? null : "assets");
    if (id === "section") return setPopover(popover === "blocks" ? null : "blocks");
    if (id === "background") { setSelected([]); p.setSelectedSection(null); setTab("properties"); }
    setTool(id);
  };
  const act = (a: string, id = selected[0]) => {
    if (!id && a !== "group") return;
    if (a === "duplicate") { const r = duplicateEl(doc, id); setDoc(r.doc); setSelected([r.newId]); }
    if (a === "delete") { let d = doc; selected.forEach((x) => { if (!find(d, x)?.el.locked) d = removeEl(d, x); }); setDoc(d); setSelected([]); }
    if (a === "up" || a === "down") setDoc(shiftEl(doc, id, a === "up" ? -1 : 1));
    if (a === "lock") setDoc(updateEl(doc, id, (e) => { e.locked = !e.locked; }));
    if (a === "hide") setDoc(updateEl(doc, id, (e) => { e.hidden = !e.hidden; }));
    if (a === "group") { const r = groupEls(doc, selected); if (r.groupId) { setDoc(r.doc); setSelected([r.groupId]); } }
    if (a === "ungroup") { setDoc(ungroup(doc, id)); setSelected([]); }
    setMenu(null);
  };
  const alignSelected = (v: "left" | "center" | "right") => {
    let d = doc;
    selected.forEach((id) => { d = updateEl(d, id, (e) => { if (e.style && "align" in e.style) e.style.align = v; }); });
    setDoc(d);
  };
  const distribute = () => {
    const els = selected.map((id) => find(doc, id)?.el).filter(Boolean) as El[];
    const pads = els.map((e: any) => e.style?.padding?.bottom).filter((x) => typeof x === "number");
    if (pads.length < 2) return;
    const avg = Math.round(pads.reduce((a, b) => a + b, 0) / pads.length);
    let d = doc; selected.forEach((id) => { d = updateEl(d, id, (e) => { if (e.style?.padding) e.style.padding.bottom = avg; }); }); setDoc(d);
  };
  const onDrop = (data: { id?: string; type?: El["type"] }, t: DropTarget) => {
    if (data.id) setDoc(moveEl(doc, data.id, t));
    else if (data.type) { const el = make(data.type); setDoc(insertEl(doc, el, t)); setSelected([el.id]); }
  };

  // keyboard shortcuts (tools); editing shortcuts live in the studio container
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || e.metaKey || e.ctrlKey) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "g" && !t.isContentEditable && !["INPUT", "TEXTAREA"].includes(t.tagName)) { e.preventDefault(); act(e.shiftKey ? "ungroup" : "group"); }
        if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) { e.preventDefault(); setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2))); }
        if ((e.metaKey || e.ctrlKey) && e.key === "-") { e.preventDefault(); setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2))); }
        return;
      }
      const tl = TOOLS.find((x) => x.key && x.key === e.key.toUpperCase());
      if (tl) { e.preventDefault(); pickTool(tl.id); }
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && selected[0]) { e.preventDefault(); act(e.key === "ArrowUp" ? "up" : "down"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => { const close = () => setMenu(null); window.addEventListener("click", close); return () => window.removeEventListener("click", close); }, []);

  const width = p.device === "mobile" ? 375 : p.device === "tablet" ? 520 : doc.settings.width;
  const layerName = (e: El) => (e.type === "heading" || e.type === "text" ? stripHtml(e.content).slice(0, 28) || e.name : e.type === "button" ? e.label : e.name);

  return (
    <div className="grid min-h-[640px] grid-cols-[52px_minmax(0,1fr)] gap-0 overflow-hidden rounded-2xl border border-line bg-[#F3F1F8] lg:grid-cols-[52px_minmax(0,1fr)_300px]">
      {/* tool rail */}
      <nav aria-label="Tools" className="relative z-20 flex flex-col items-center gap-1 border-r border-line bg-panel py-2">
        {TOOLS.map((t) => { const I = t.icon; const active = tool === t.id || (popover === "layout" && t.id === "layout") || (popover === "assets" && t.id === "assets") || (popover === "blocks" && t.id === "section");
          return <Tip key={t.id} label={`${t.label}${t.key ? ` (${t.key})` : ""}`}><button type="button" aria-label={t.label} aria-pressed={active} onClick={() => pickTool(t.id)}
            draggable={!!t.el} onDragStart={(e) => t.el && e.dataTransfer.setData("application/x-tubelead", JSON.stringify({ type: t.el }))}
            className={cn("grid h-9 w-9 place-items-center rounded-xl transition duration-150 active:scale-90", active ? "bg-forest text-paper shadow-card" : "text-mute hover:bg-forest/10 hover:text-forest")}><I size={17} /></button></Tip>; })}
        <AnimatePresence>{popover && (
          <motion.div initial={{ opacity: 0, x: -6, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -6 }} transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="absolute left-full top-2 z-30 ml-2 w-64 rounded-2xl border border-line bg-panel p-3 shadow-pop">
            {popover === "layout" && <><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-mute">New section</p>
              <div className="grid grid-cols-3 gap-2">{([[1, Rows3], [2, Columns2], [3, Columns3]] as const).map(([n, I]) => (
                <button key={n} type="button" onClick={() => addSection(n)} className="flex flex-col items-center gap-1 rounded-xl border border-line p-2 text-[11px] font-semibold hover:border-forest hover:text-forest"><I size={18} />{n} col</button>))}</div></>}
            {popover === "blocks" && <><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-mute">Content blocks</p>
              <ul className="grid grid-cols-2 gap-1.5">{blocks().map((b) => <li key={b.id}><button type="button" className="w-full rounded-lg border border-line px-2 py-2 text-left text-[11.5px] font-medium hover:border-forest hover:text-forest"
                onClick={() => { const s = freshIds(b.make()); const i = p.selectedSection ? doc.sections.findIndex((x) => x.id === p.selectedSection) + 1 : doc.sections.length; const sections = [...doc.sections]; sections.splice(i, 0, s); setDoc({ ...doc, sections }); p.setSelectedSection(s.id); setPopover(null); }}>{b.label}</button></li>)}</ul></>}
            {popover === "assets" && <><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-mute">Your images</p>
              {p.demo ? <p className="text-xs text-mute">Your uploaded images appear here.</p> : !assets ? <p className="text-xs text-mute">Loading…</p> : assets.length === 0 ? <p className="text-xs text-mute">No images yet. Upload one from an image's properties.</p> :
                <ul className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto">{assets.map((a) => <li key={a.id}><button type="button" title={a.filename} className="block w-full overflow-hidden rounded-md border border-line hover:border-forest"
                  onClick={() => { const el = make("image") as any; el.src = a.url; el.alt = ""; el.naturalWidth = a.width; el.naturalHeight = a.height; const t = insertionPoint(doc, selected, p.selectedSection); if (t) { setDoc(insertEl(doc, el, t)); setSelected([el.id]); } setPopover(null); }}>
                  <img src={a.url} alt={a.filename} loading="lazy" className="aspect-square w-full object-cover" /></button></li>)}</ul>}</>}
          </motion.div>)}</AnimatePresence>
      </nav>

      {/* canvas */}
      <div className="relative min-w-0">
        <div className="flex items-center justify-end gap-1 border-b border-line bg-panel/70 px-3 py-1.5 text-[11px] text-mute backdrop-blur">
          <span className="mr-auto">{selected.length > 1 ? `${selected.length} selected · Shift-click to add or remove` : sel ? sel.el.name : p.selectedSection ? "Section selected" : "Click an element to edit it"}</span>
          {selected.length > 0 && <>
            <button aria-label="Align left" title="Align left" className="rounded p-1 hover:bg-forest/10" onClick={() => alignSelected("left")}><AlignLeft size={14} /></button>
            <button aria-label="Align centre" title="Align centre" className="rounded p-1 hover:bg-forest/10" onClick={() => alignSelected("center")}><AlignCenter size={14} /></button>
            <button aria-label="Align right" title="Align right" className="rounded p-1 hover:bg-forest/10" onClick={() => alignSelected("right")}><AlignRight size={14} /></button>
            {selected.length > 1 && <button className="rounded px-1.5 py-1 hover:bg-forest/10" onClick={distribute}>Even spacing</button>}
            <span className="mx-1 h-4 w-px bg-line" />
          </>}
          <button aria-label="Zoom out" className="rounded px-1.5 py-0.5 hover:bg-forest/10" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}>−</button>
          <span className="w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button aria-label="Zoom in" className="rounded px-1.5 py-0.5 hover:bg-forest/10" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}>+</button>
        </div>
        <div className="h-[640px] overflow-auto bg-[radial-gradient(rgba(123,63,242,.10)_1px,transparent_1px)] [background-size:16px_16px] p-6">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center", transition: "transform .25s cubic-bezier(.22,1,.36,1)" }}>
            <Canvas doc={doc} width={width} mobile={p.device === "mobile"} selected={selected} outlineSections selectedSection={p.selectedSection}
              onSelect={(id, additive) => { if (!id) { setSelected([]); return; } p.setSelectedSection(null); setSelected(additive ? (selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]) : [id]); setTab("properties"); }}
              onSelectSection={(id) => { p.setSelectedSection(id); setTab("properties"); }}
              onText={(id, html) => setDoc(updateEl(doc, id, (e) => { e.content = html; }))} onDrop={onDrop} onContext={(id, x, y) => setMenu({ id, x, y })} />
          </div>
        </div>
        <AnimatePresence>{menu && (
          <motion.ul initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} role="menu"
            className="fixed z-50 w-48 overflow-hidden rounded-xl border border-line bg-panel py-1 text-[12.5px] shadow-pop" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
            {([["duplicate", "Duplicate", "⌘D", Copy], ["up", "Move up", "⌥↑", ArrowUp], ["down", "Move down", "⌥↓", ArrowDown], ["lock", find(doc, menu.id)?.el.locked ? "Unlock" : "Lock", "", Lock],
              ["hide", find(doc, menu.id)?.el.hidden ? "Show" : "Hide", "", Eye], ...(selected.length > 1 ? [["group", "Group selection", "⌘G", Group]] : []),
              ...(find(doc, menu.id)?.el.type === "group" ? [["ungroup", "Ungroup", "⌘⇧G", Ungroup]] : []), ["delete", "Delete", "⌫", Trash2]] as [string, string, string, any][]).map(([a, l, k, I]) => (
              <li key={a}><button role="menuitem" type="button" onClick={() => act(a, menu.id)} className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-forest/10", a === "delete" && "text-[#A33A2A]")}>
                <I size={13} /><span className="flex-1">{l}</span><span className="text-[10px] text-dim">{k}</span></button></li>))}
          </motion.ul>)}</AnimatePresence>
      </div>

      {/* right panel */}
      <aside className="col-span-2 border-t border-line bg-panel lg:col-span-1 lg:border-l lg:border-t-0">
        <div role="tablist" aria-label="Pro panels" className="relative flex border-b border-line">
          {([["properties", "Properties", SquarePlus], ["layers", "Layers", Layers], ["ai", "AI", Sparkles]] as const).map(([t, l, I]) => (
            <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={cn("relative flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold transition", tab === t ? "text-forest" : "text-mute hover:text-ink")}>
              <I size={13} />{l}{tab === t && <motion.span layoutId="pro-tab" className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-forest" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}</button>))}
        </div>
        <div className="max-h-[640px] overflow-y-auto p-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={tab + (sel?.el.id ?? sec?.id ?? "doc")} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16 }}>
              {tab === "properties" && (sel ? <div className="space-y-3">
                <div className="flex items-center gap-2"><input aria-label="Layer name" className="field !py-1 text-xs font-semibold" value={sel.el.name} maxLength={80} onChange={(e) => setDoc(updateEl(doc, sel.el.id, (x) => { x.name = e.target.value; }), true)} />
                  <button aria-label="Duplicate" className="rounded-md p-1.5 text-mute hover:bg-forest/10" onClick={() => act("duplicate")}><Copy size={14} /></button>
                  <button aria-label="Delete" className="rounded-md p-1.5 text-mute hover:bg-[#B5493A]/15 hover:text-[#A33A2A]" onClick={() => act("delete")}><Trash2 size={14} /></button></div>
                {sel.el.locked ? <p className="rounded-lg bg-bg2 p-3 text-xs text-mute">This element is locked. <button className="font-semibold text-forest" onClick={() => act("lock")}>Unlock</button> to edit it.</p>
                  : <ElementProperties el={sel.el} level="pro" demo={p.demo} brandColors={p.brandColors} onChange={(fn) => setDoc(updateEl(doc, sel.el.id, fn))} />}
              </div> : sec ? <SectionProperties sec={sec} level="pro" demo={p.demo} brandColors={p.brandColors} onChange={(fn) => setDoc(updateSection(doc, sec.id, fn))} />
                : <><p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-mute">Email</p><DocProperties doc={doc} brandColors={p.brandColors} onChange={(fn) => { const d = JSON.parse(JSON.stringify(doc)); fn(d); setDoc(d); }} /></>)}
              {tab === "layers" && layersPanel()}
              {tab === "ai" && <AssistPanel doc={doc} demo={p.demo} selectedId={selected[0]} onApply={(d) => setDoc(d)} onUndo={p.undo} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </aside>
    </div>
  );

  function layersPanel() {
    const row = (e: El, depth: number) => (
      <li key={e.id}>
        <div onClick={(ev) => { p.setSelectedSection(null); setSelected(ev.shiftKey ? (selected.includes(e.id) ? selected.filter((x) => x !== e.id) : [...selected, e.id]) : [e.id]); }}
          onDoubleClick={() => setRenaming(e.id)}
          className={cn("group flex cursor-pointer items-center gap-1.5 rounded-lg py-1 pr-1 text-[12px] transition", selected.includes(e.id) ? "bg-forest/10 text-forest" : "hover:bg-ink/5")} style={{ paddingLeft: 8 + depth * 14 }}>
          {e.type === "group" ? <ChevronRight size={11} className="rotate-90 text-dim" /> : <span className="w-[11px]" />}
          {renaming === e.id ? <input autoFocus aria-label="Rename layer" defaultValue={e.name} className="field !py-0.5 text-xs" onBlur={(ev) => { setDoc(updateEl(doc, e.id, (x) => { x.name = ev.target.value.slice(0, 80) || x.name; })); setRenaming(null); }}
            onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); ev.stopPropagation(); }} />
            : <span className={cn("min-w-0 flex-1 truncate", e.hidden && "text-dim line-through")}>{layerName(e)}</span>}
          <button aria-label={e.hidden ? "Show layer" : "Hide layer"} className="rounded p-0.5 text-dim opacity-60 hover:opacity-100" onClick={(ev) => { ev.stopPropagation(); setDoc(updateEl(doc, e.id, (x) => { x.hidden = !x.hidden; })); }}>{e.hidden ? <EyeOff size={12} /> : <Eye size={12} />}</button>
          <button aria-label={e.locked ? "Unlock layer" : "Lock layer"} className="rounded p-0.5 text-dim opacity-60 hover:opacity-100" onClick={(ev) => { ev.stopPropagation(); setDoc(updateEl(doc, e.id, (x) => { x.locked = !x.locked; })); }}>{e.locked ? <Lock size={12} /> : <Unlock size={12} />}</button>
        </div>
        {e.type === "group" && <ul>{e.children.map((c) => row(c, depth + 1))}</ul>}
      </li>
    );
    const multi = selected.length > 1;
    const canUngroup = sel?.el.type === "group";
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {([["duplicate", Copy, "Duplicate", !!sel], ["up", ArrowUp, "Move up", !!sel], ["down", ArrowDown, "Move down", !!sel], ["group", Group, "Group", multi], ["ungroup", Ungroup, "Ungroup", canUngroup], ["delete", Trash2, "Delete", !!sel]] as const).map(([a, I, l, en]) => (
            <button key={a} type="button" aria-label={l} title={l} disabled={!en} onClick={() => act(a)} className="rounded-md border border-line p-1.5 text-mute transition hover:border-forest hover:text-forest disabled:opacity-30"><I size={13} /></button>))}
        </div>
        <ul className="space-y-1">{doc.sections.map((s, si) => (
          <li key={s.id}>
            <div onClick={() => { p.setSelectedSection(s.id); setSelected([]); }} className={cn("flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wide", p.selectedSection === s.id ? "bg-forest/10 text-forest" : "text-mute hover:bg-ink/5")}>
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <button aria-label="Move section up" disabled={si === 0} className="rounded p-0.5 disabled:opacity-20" onClick={(ev) => { ev.stopPropagation(); const a = [...doc.sections]; [a[si - 1], a[si]] = [a[si], a[si - 1]]; setDoc({ ...doc, sections: a }); }}><ArrowUp size={11} /></button>
              <button aria-label="Move section down" disabled={si === doc.sections.length - 1} className="rounded p-0.5 disabled:opacity-20" onClick={(ev) => { ev.stopPropagation(); const a = [...doc.sections]; [a[si + 1], a[si]] = [a[si], a[si + 1]]; setDoc({ ...doc, sections: a }); }}><ArrowDown size={11} /></button>
              <button aria-label={s.hidden ? "Show section" : "Hide section"} className="rounded p-0.5" onClick={(ev) => { ev.stopPropagation(); setDoc(updateSection(doc, s.id, (x) => { x.hidden = !x.hidden; })); }}>{s.hidden ? <EyeOff size={11} /> : <Eye size={11} />}</button>
              <button aria-label="Delete section" className="rounded p-0.5 hover:text-[#A33A2A]" onClick={(ev) => { ev.stopPropagation(); setDoc({ ...doc, sections: doc.sections.filter((x) => x.id !== s.id) }); }}><Trash2 size={11} /></button>
            </div>
            {s.columns.map((c, ci) => <ul key={c.id}>{s.columns.length > 1 && <li className="pl-4 text-[10px] uppercase text-dim">Column {ci + 1}</li>}{c.elements.map((e) => row(e, s.columns.length > 1 ? 1 : 0))}</ul>)}
          </li>))}</ul>
        <p className="text-[10.5px] text-dim">Shift-click to select several. Double-click to rename. Drag elements on the canvas to reorder.</p>
      </div>
    );
  }
}

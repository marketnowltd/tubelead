"use client";
import { motion } from "motion/react";
import { Image as ImageIcon, Lock } from "lucide-react";
import React, { useEffect, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent } from "react";
import { cn } from "@/components/ui/cn";
import { FONTS, sanitise, type Doc, type El, type Gradient, type Pad, type Section } from "./model";

const padCss = (p: Pad) => `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;
const bg = (color?: string | null, g?: Gradient | null): CSSProperties =>
  g ? { backgroundImage: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})`, backgroundColor: g.from } : color ? { backgroundColor: color } : {};
const assetUrl = (src: string) => src; // /api/assets/... is served by the same origin through the Next.js rewrite

export interface DropTarget { section: number; column: number; index: number; group?: string }
export interface CanvasProps {
  doc: Doc; width: number; selected: string[]; onSelect: (id: string | null, additive?: boolean) => void;
  onText?: (id: string, html: string) => void; onDrop?: (data: { id?: string; type?: El["type"] }, t: DropTarget) => void;
  onContext?: (id: string, x: number, y: number) => void; inlineEdit?: boolean | "click"; mobile?: boolean; outlineSections?: boolean;
  selectedSection?: string | null; onSelectSection?: (id: string) => void;
}

function EditableText({ el, editing, onCommit, style, tag }: { el: Extract<El, { type: "heading" | "text" }>; editing: boolean; onCommit: (html: string) => void; style: CSSProperties; tag: "h1" | "div" }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (ref.current && !editing) ref.current.innerHTML = el.content; }, [el.content, editing]);
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); const r = document.createRange(); r.selectNodeContents(ref.current); r.collapse(false); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); } }, [editing]);
  const Tag = tag as any;
  return <Tag ref={ref} contentEditable={editing} suppressContentEditableWarning spellCheck={editing}
    onBlur={() => editing && ref.current && onCommit(sanitise(ref.current.innerHTML))}
    onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Escape") (e.target as HTMLElement).blur(); e.stopPropagation(); }}
    className={cn("outline-none", editing && "cursor-text ring-2 ring-forest/40 ring-offset-2")} style={style}
    dangerouslySetInnerHTML={{ __html: el.content }} />;
}

export function Canvas(p: CanvasProps) {
  const { doc } = p;
  const st = doc.settings;
  const [editing, setEditing] = useState<string | null>(null);
  const [drop, setDrop] = useState<string | null>(null); // key of the active drop slot
  useEffect(() => { if (!p.selected.includes(editing ?? "")) setEditing(null); }, [p.selected, editing]);

  const font = (f?: string | null) => FONTS[f || st.fontFamily] || FONTS.Helvetica;
  const dragStart = (e: DragEvent, id: string) => { e.dataTransfer.setData("application/x-tubelead", JSON.stringify({ id })); e.dataTransfer.effectAllowed = "move"; e.stopPropagation(); };
  const slot = (t: DropTarget) => {
    const key = `${t.section}-${t.column}-${t.group ?? ""}-${t.index}`;
    return (
      <div key={`slot-${key}`} aria-hidden onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDrop(key); }} onDragLeave={() => setDrop((d) => (d === key ? null : d))}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDrop(null); try { p.onDrop?.(JSON.parse(e.dataTransfer.getData("application/x-tubelead")), t); } catch { /* not ours */ } }}
        className="relative -my-1.5 h-3">
        <motion.div initial={false} animate={{ opacity: drop === key ? 1 : 0, scaleX: drop === key ? 1 : 0.6 }} transition={{ type: "spring", stiffness: 500, damping: 35 }}
          className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-forest" />
      </div>
    );
  };

  const element = (el: El, s: number, c: number, i: number, group?: string): React.ReactElement | null => {
    const sel = p.selected.includes(el.id);
    const click = (e: MouseEvent) => {
      e.stopPropagation(); p.onSelect(el.id, e.shiftKey || e.metaKey);
      if (p.inlineEdit === "click" && (el.type === "heading" || el.type === "text") && !el.locked) setEditing(el.id);
    };
    const wrapCls = cn("group/el relative rounded-[3px] transition-[box-shadow] duration-150",
      sel ? "shadow-[0_0_0_2px_#7B3FF2]" : "hover:shadow-[0_0_0_1px_rgba(123,63,242,.45)]", el.hidden && "opacity-30");
    const common = { onClick: click, onContextMenu: (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); p.onSelect(el.id); p.onContext?.(el.id, e.clientX, e.clientY); },
      draggable: !el.locked && editing !== el.id && !!p.onDrop, onDragStart: (e: DragEvent) => dragStart(e, el.id), "data-el": el.id };
    let body: React.ReactElement | null = null;
    if (el.type === "heading" || el.type === "text") {
      const s2 = el.style; const size = p.mobile && s2.mobileFontSize ? s2.mobileFontSize : s2.fontSize;
      body = <EditableText el={el} tag={el.type === "heading" ? "h1" : "div"} editing={editing === el.id} onCommit={(h) => { setEditing(null); p.onText?.(el.id, h); }}
        style={{ margin: 0, fontFamily: font(s2.fontFamily), fontSize: size, fontWeight: s2.fontWeight, lineHeight: s2.lineHeight, letterSpacing: s2.letterSpacing, color: s2.color || st.textColor,
          textAlign: s2.align, textDecoration: s2.decoration, textTransform: s2.transform, fontStyle: s2.italic ? "italic" : undefined, padding: padCss(s2.padding), ...bg(s2.background) }} />;
    } else if (el.type === "image") {
      const s2 = el.style;
      body = <div style={{ padding: padCss(s2.padding), textAlign: s2.align }}>{el.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(el.src)} alt={el.alt} draggable={false} style={{ display: "inline-block", width: `${s2.width}%`, borderRadius: s2.radius, border: s2.borderWidth ? `${s2.borderWidth}px solid ${s2.borderColor}` : undefined }} />
      ) : <div className="mx-auto grid h-28 place-items-center rounded-md border-2 border-dashed border-forest/30 bg-forest/5 text-xs text-mute" style={{ width: `${s2.width}%` }}><span className="flex items-center gap-1.5"><ImageIcon size={14} /> Add an image</span></div>}</div>;
    } else if (el.type === "button") {
      const s2 = el.style;
      body = <div style={{ padding: padCss(s2.padding), textAlign: s2.align }}><span style={{ display: s2.fullWidth ? "block" : "inline-block", ...bg(s2.background, s2.gradient), color: s2.color, fontFamily: font(s2.fontFamily),
        fontSize: s2.fontSize, fontWeight: s2.fontWeight, padding: `${s2.paddingY}px ${s2.paddingX}px`, borderRadius: s2.radius, border: s2.borderWidth ? `${s2.borderWidth}px solid ${s2.borderColor}` : undefined, lineHeight: 1.2 }}>{el.label}</span></div>;
    } else if (el.type === "divider") {
      body = <div style={{ padding: padCss(el.style.padding) }}><div style={{ margin: "0 auto", width: `${el.style.width}%`, borderTop: `${el.style.thickness}px solid ${el.style.color}` }} /></div>;
    } else if (el.type === "spacer") {
      body = <div style={{ height: el.style.height }} className={cn(sel && "bg-forest/5")} />;
    } else if (el.type === "shape") {
      const s2 = el.style;
      body = <div style={{ padding: padCss(s2.padding), textAlign: s2.align }}><div style={{ display: "inline-block", width: `${s2.width}%`, height: s2.height, borderRadius: s2.radius, ...bg(s2.background, s2.gradient) }} /></div>;
    } else if (el.type === "group") {
      const s2 = el.style;
      body = <div style={{ padding: padCss(s2.padding), borderRadius: s2.radius, border: s2.borderWidth ? `${s2.borderWidth}px solid ${s2.borderColor}` : "1px dashed rgba(123,63,242,.25)", ...bg(s2.background, s2.gradient) }}>
        {p.onDrop && slot({ section: s, column: c, index: 0, group: el.id })}
        {el.children.map((ch, k) => <div key={ch.id}>{element(ch, s, c, k, el.id)}{p.onDrop && slot({ section: s, column: c, index: k + 1, group: el.id })}</div>)}
        {!el.children.length && <p className="py-3 text-center text-[11px] text-mute">Empty group: drop elements here</p>}
      </div>;
    }
    return (
      <div className={wrapCls} {...common} onDoubleClick={(e) => { if ((el.type === "heading" || el.type === "text") && !el.locked && p.inlineEdit !== false) { e.stopPropagation(); p.onSelect(el.id); setEditing(el.id); } }}>
        {body}
        {el.locked && <span className="pointer-events-none absolute right-1 top-1 rounded bg-ink/70 p-0.5 text-white"><Lock size={10} /></span>}
        {sel && <span className="pointer-events-none absolute -top-5 left-0 rounded-t-md bg-forest px-1.5 py-0.5 text-[10px] font-semibold text-white">{el.name}</span>}
      </div>
    );
  };

  const section = (sec: Section, s: number) => {
    const ss = sec.style; const stack = p.mobile && ss.stackOnMobile;
    return (
      <div key={sec.id} onClick={(e) => { e.stopPropagation(); p.onSelectSection?.(sec.id); p.onSelect(null); }}
        className={cn("relative transition-[box-shadow]", p.outlineSections && "hover:shadow-[inset_0_0_0_1px_rgba(123,63,242,.3)]", p.selectedSection === sec.id && "shadow-[inset_0_0_0_2px_rgba(123,63,242,.6)]", sec.hidden && "opacity-30")}
        style={{ padding: padCss(ss.padding), ...bg(ss.background, ss.gradient), ...(ss.backgroundImage ? { backgroundImage: `url(${assetUrl(ss.backgroundImage)})`, backgroundSize: "cover", backgroundPosition: "center" } : {}) }}>
        <div className={cn("flex gap-4", stack && "flex-col")}>
          {sec.columns.map((col, c) => (
            <div key={col.id} className="min-w-0" style={{ width: stack ? "100%" : `${col.width}%`, alignSelf: col.verticalAlign === "middle" ? "center" : col.verticalAlign === "bottom" ? "flex-end" : "flex-start" }}>
              {p.onDrop && slot({ section: s, column: c, index: 0 })}
              {col.elements.map((el, i) => <div key={el.id}>{element(el, s, c, i)}{p.onDrop && slot({ section: s, column: c, index: i + 1 })}</div>)}
              {!col.elements.length && <div className="rounded-md border border-dashed border-forest/25 py-6 text-center text-[11px] text-mute">Drop content here</div>}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto transition-[max-width] duration-500 ease-[cubic-bezier(.22,1,.36,1)]" style={{ maxWidth: p.width }} onClick={() => { p.onSelect(null); }}>
      <div className="overflow-hidden shadow-[0_24px_60px_-28px_rgba(54,30,120,.35)]" style={{ backgroundColor: st.contentBackground, borderRadius: st.radius }}>
        {doc.sections.map(section)}
        {st.footer && <p style={{ fontFamily: font(null), fontSize: 12, color: "#8a85a3", textAlign: "center", padding: "16px 32px 28px", margin: 0 }}>{st.footer}</p>}
      </div>
    </div>
  );
}

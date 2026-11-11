/** Creative Studio document model (mirrors backend/app/services/email_doc.py). Both editors edit this structure. */
export type Align = "left" | "center" | "right";
export interface Pad { top: number; right: number; bottom: number; left: number }
export interface Gradient { from: string; to: string; angle: number }
export interface TextStyle {
  fontFamily?: string | null; fontSize: number; mobileFontSize?: number | null; fontWeight: number; color?: string | null; align: Align | "justify";
  lineHeight: number; letterSpacing: number; decoration: "none" | "underline" | "line-through"; transform: "none" | "uppercase" | "lowercase" | "capitalize";
  italic?: boolean; paragraphSpacing: number; padding: Pad; background?: string | null;
}
interface Base { id: string; name: string; hidden?: boolean; locked?: boolean }
export interface TextEl extends Base { type: "heading" | "text"; content: string; style: TextStyle }
export interface ImageEl extends Base { type: "image"; src: string; alt: string; href: string; naturalWidth?: number | null; naturalHeight?: number | null;
  style: { width: number; align: Align; padding: Pad; radius: number; borderWidth: number; borderColor: string } }
export interface ButtonEl extends Base { type: "button"; label: string; href: string; style: { background: string; gradient?: Gradient | null; color: string; fontSize: number;
  fontWeight: number; fontFamily?: string | null; radius: number; paddingX: number; paddingY: number; align: Align; fullWidth: boolean; borderWidth: number; borderColor: string; padding: Pad } }
export interface DividerEl extends Base { type: "divider"; style: { color: string; thickness: number; width: number; padding: Pad } }
export interface SpacerEl extends Base { type: "spacer"; style: { height: number } }
export interface ShapeEl extends Base { type: "shape"; style: { background: string; gradient?: Gradient | null; height: number; width: number; radius: number; align: Align; padding: Pad } }
export interface GroupEl extends Base { type: "group"; children: El[]; style: { background?: string | null; gradient?: Gradient | null; padding: Pad; radius: number; borderWidth: number; borderColor: string } }
export type El = TextEl | ImageEl | ButtonEl | DividerEl | SpacerEl | ShapeEl | GroupEl;
export interface Column { id: string; width: number; elements: El[]; verticalAlign: "top" | "middle" | "bottom" }
export interface Section { id: string; name: string; kind: "header" | "content" | "footer" | "hero"; hidden?: boolean; locked?: boolean; columns: Column[];
  style: { background?: string | null; gradient?: Gradient | null; backgroundImage?: string | null; padding: Pad; stackOnMobile: boolean } }
export interface Settings { width: number; background: string; contentBackground: string; fontFamily: string; textColor: string; linkColor: string; radius: number; preset: string; footer: string; fallbacks: Record<string, string> }
export interface Doc { version: number; settings: Settings; sections: Section[] }

export const FONTS: Record<string, string> = {
  Helvetica: "Helvetica, Arial, sans-serif", Arial: "Arial, Helvetica, sans-serif", Georgia: "Georgia, 'Times New Roman', serif", Times: "'Times New Roman', Times, serif",
  Verdana: "Verdana, Geneva, sans-serif", Trebuchet: "'Trebuchet MS', Helvetica, sans-serif", Tahoma: "Tahoma, Verdana, sans-serif", Courier: "'Courier New', Courier, monospace",
};
export const VARIABLES = ["first_name", "last_name", "company_name", "website", "industry", "business_location", "campaign_name"] as const;
export const PRESETS = ["minimal", "modern", "luxury", "bold", "corporate", "creative"] as const;

export const uid = () => Math.random().toString(16).slice(2, 12);
export const pad = (t = 0, r = 0, b = 0, l = 0): Pad => ({ top: t, right: r, bottom: b, left: l });
const textStyle = (size: number, weight: number): TextStyle => ({ fontFamily: null, fontSize: size, mobileFontSize: null, fontWeight: weight, color: null, align: "left", lineHeight: size > 22 ? 1.2 : 1.55,
  letterSpacing: 0, decoration: "none", transform: "none", italic: false, paragraphSpacing: 0, padding: pad(0, 0, 12, 0), background: null });

export function make(type: El["type"]): El {
  const id = uid();
  switch (type) {
    case "heading": return { id, type, name: "Headline", content: "Your headline", style: textStyle(28, 700) };
    case "text": return { id, type, name: "Paragraph", content: "Write something useful for {{first_name}}.", style: textStyle(16, 400) };
    case "image": return { id, type, name: "Image", src: "", alt: "", href: "", style: { width: 100, align: "center", padding: pad(0, 0, 12, 0), radius: 0, borderWidth: 0, borderColor: "#E5E0F0" } };
    case "button": return { id, type, name: "Button", label: "Learn more", href: "{{website}}", style: { background: "#7B3FF2", gradient: null, color: "#FFFFFF", fontSize: 16, fontWeight: 700, fontFamily: null,
      radius: 8, paddingX: 28, paddingY: 14, align: "center", fullWidth: false, borderWidth: 0, borderColor: "#7B3FF2", padding: pad(8, 0, 16, 0) } };
    case "divider": return { id, type, name: "Divider", style: { color: "#E5E0F0", thickness: 1, width: 100, padding: pad(12, 0, 12, 0) } };
    case "spacer": return { id, type, name: "Spacer", style: { height: 24 } };
    case "shape": return { id, type, name: "Shape", style: { background: "#EFE8FF", gradient: null, height: 80, width: 100, radius: 12, align: "center", padding: pad(0, 0, 12, 0) } };
    case "group": return { id, type, name: "Group", children: [], style: { background: null, gradient: null, padding: pad(16, 16, 16, 16), radius: 0, borderWidth: 0, borderColor: "#E5E0F0" } };
  }
}

export function makeSection(columns = 1, kind: Section["kind"] = "content"): Section {
  const w = Math.round(100 / columns);
  return { id: uid(), name: kind === "header" ? "Header" : kind === "footer" ? "Footer" : columns > 1 ? `${columns} columns` : "Section", kind,
    columns: Array.from({ length: columns }, () => ({ id: uid(), width: w, elements: [], verticalAlign: "top" as const })),
    style: { background: null, gradient: null, backgroundImage: null, padding: pad(24, 32, 24, 32), stackOnMobile: true } };
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Location of an element: section/column indexes plus its path (index, and child index inside a group). */
export interface Loc { s: number; c: number; i: number; g?: number }

export function find(doc: Doc, id: string): { el: El; loc: Loc; parent?: GroupEl } | null {
  for (let s = 0; s < doc.sections.length; s++) for (let c = 0; c < doc.sections[s].columns.length; c++) {
    const els = doc.sections[s].columns[c].elements;
    for (let i = 0; i < els.length; i++) {
      if (els[i].id === id) return { el: els[i], loc: { s, c, i } };
      const g = els[i];
      if (g.type === "group") for (let k = 0; k < g.children.length; k++) if (g.children[k].id === id) return { el: g.children[k], loc: { s, c, i, g: k }, parent: g };
    }
  }
  return null;
}
export const findSection = (doc: Doc, id: string) => doc.sections.findIndex((s) => s.id === id);

export function allElements(doc: Doc): El[] {
  const out: El[] = [];
  doc.sections.forEach((s) => s.columns.forEach((c) => c.elements.forEach((e) => { out.push(e); if (e.type === "group") out.push(...e.children); })));
  return out;
}

export function updateEl(doc: Doc, id: string, fn: (e: any) => void): Doc {
  const d = clone(doc); const f = find(d, id); if (f) fn(f.el); return d;
}
export function updateSection(doc: Doc, id: string, fn: (s: Section) => void): Doc {
  const d = clone(doc); const i = findSection(d, id); if (i >= 0) fn(d.sections[i]); return d;
}

function listAt(d: Doc, loc: Loc): El[] {
  const els = d.sections[loc.s].columns[loc.c].elements;
  return loc.g !== undefined ? (els[loc.i] as GroupEl).children : els;
}

export function removeEl(doc: Doc, id: string): Doc {
  const d = clone(doc); const f = find(d, id); if (!f) return doc;
  listAt(d, f.loc).splice(f.loc.g ?? f.loc.i, 1); return d;
}
export function duplicateEl(doc: Doc, id: string): { doc: Doc; newId: string } {
  const d = clone(doc); const f = find(d, id); if (!f) return { doc, newId: id };
  const copy = clone(f.el); copy.id = uid(); copy.name = `${f.el.name} copy`;
  if (copy.type === "group") copy.children.forEach((ch) => (ch.id = uid()));
  listAt(d, f.loc).splice((f.loc.g ?? f.loc.i) + 1, 0, copy); return { doc: d, newId: copy.id };
}
/** Insert an element into a column at an index (or into a group). */
export function insertEl(doc: Doc, el: El, target: { section: number; column: number; index: number; group?: string }): Doc {
  const d = clone(doc);
  const col = d.sections[target.section]?.columns[target.column];
  if (!col) return doc;
  if (target.group) {
    const g = col.elements.find((e) => e.id === target.group) as GroupEl | undefined;
    if (g && el.type !== "group") { g.children.splice(Math.min(target.index, g.children.length), 0, el); return d; }
  }
  col.elements.splice(Math.min(target.index, col.elements.length), 0, el); return d;
}
/** Move an element to a new position (drag and drop, or layer reordering). Locked elements don't move. */
export function moveEl(doc: Doc, id: string, target: { section: number; column: number; index: number; group?: string }): Doc {
  const f = find(doc, id); if (!f || f.el.locked) return doc;
  if (f.el.type === "group" && target.group) return doc;
  let t = { ...target };
  // adjust index when moving down inside the same list
  if (!target.group && f.loc.g === undefined && f.loc.s === t.section && f.loc.c === t.column && f.loc.i < t.index) t.index -= 1;
  return insertEl(removeEl(doc, id), clone(f.el), t);
}
export function shiftEl(doc: Doc, id: string, dir: -1 | 1): Doc {
  const d = clone(doc); const f = find(d, id); if (!f || f.el.locked) return doc;
  const list = listAt(d, f.loc); const i = f.loc.g ?? f.loc.i; const j = i + dir;
  if (j < 0 || j >= list.length) return doc;
  [list[i], list[j]] = [list[j], list[i]]; return d;
}
export function groupEls(doc: Doc, ids: string[]): { doc: Doc; groupId?: string } {
  const found = ids.map((id) => find(doc, id)).filter(Boolean) as NonNullable<ReturnType<typeof find>>[];
  if (found.length < 2 || found.some((f) => f.parent || f.el.type === "group" || f.el.locked)) return { doc };
  const { s, c } = found[0].loc;
  if (found.some((f) => f.loc.s !== s || f.loc.c !== c)) return { doc };
  const d = clone(doc); const col = d.sections[s].columns[c];
  const idx = Math.min(...found.map((f) => f.loc.i));
  const members = col.elements.filter((e) => ids.includes(e.id));
  col.elements = col.elements.filter((e) => !ids.includes(e.id));
  const g = make("group") as GroupEl; g.children = members;
  col.elements.splice(idx, 0, g); return { doc: d, groupId: g.id };
}
export function ungroup(doc: Doc, id: string): Doc {
  const d = clone(doc); const f = find(d, id); if (!f || f.el.type !== "group" || f.parent) return doc;
  const col = d.sections[f.loc.s].columns[f.loc.c]; col.elements.splice(f.loc.i, 1, ...(f.el as GroupEl).children); return d;
}

/** Plain text of a rich-text string, for layer names and the Easy editor. */
export const stripHtml = (s: string) => s.replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

/** Allow-list sanitiser for contentEditable output (mirrors the server). */
export function sanitise(html: string): string {
  if (typeof window === "undefined") return html;
  const tpl = document.createElement("template"); tpl.innerHTML = html;
  const ALLOWED = new Set(["B", "STRONG", "I", "EM", "U", "S", "BR", "A", "SPAN"]);
  const walk = (node: Node): string => {
    let out = "";
    node.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) { out += (n.textContent || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); return; }
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      const el = n as HTMLElement; const tag = el.tagName;
      if (tag === "DIV" || tag === "P") { if (out && !out.endsWith("<br>")) out += "<br>"; out += walk(el); return; }
      if (!ALLOWED.has(tag)) { out += walk(el); return; }
      if (tag === "BR") { out += "<br>"; return; }
      if (tag === "A") { const href = el.getAttribute("href") || ""; out += /^(https?:|mailto:|tel:|\{\{)/i.test(href) ? `<a href="${href.replace(/"/g, "&quot;")}">${walk(el)}</a>` : walk(el); return; }
      if (tag === "SPAN") { const c = el.style.color; out += c ? `<span style="color:${c}">${walk(el)}</span>` : walk(el); return; }
      const t = tag.toLowerCase(); out += `<${t}>${walk(el)}</${t}>`;
    });
    return out;
  };
  return walk(tpl.content).replace(/^(<br>)+|(<br>)+$/g, "");
}

// ---------------- history (undo/redo) ----------------
export interface History { past: Doc[]; present: Doc; future: Doc[] }
export type HistoryAction = { type: "set"; doc: Doc; merge?: boolean } | { type: "undo" } | { type: "redo" } | { type: "reset"; doc: Doc };
export function historyReducer(h: History, a: HistoryAction): History {
  switch (a.type) {
    case "set": if (a.doc === h.present) return h;
      return a.merge ? { ...h, present: a.doc, future: [] } : { past: [...h.past, h.present].slice(-100), present: a.doc, future: [] };
    case "undo": if (!h.past.length) return h; return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
    case "redo": if (!h.future.length) return h; return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
    case "reset": return { past: [], present: a.doc, future: [] };
  }
}

/** Elements the Easy editor can't represent faithfully (Pro-only features), for the compatibility notice. */
export function proOnlyFeatures(doc: Doc): string[] {
  const out = new Set<string>();
  allElements(doc).forEach((e) => {
    if (e.type === "group") out.add("grouped elements");
    if (e.hidden) out.add("hidden layers");
    if (e.locked) out.add("locked layers");
    if ((e.type === "button" || e.type === "shape") && e.style.gradient) out.add("gradients");
  });
  doc.sections.forEach((s) => { if (s.columns.length > 1) out.add("multi-column sections"); if (s.style.backgroundImage) out.add("background images"); });
  return [...out];
}

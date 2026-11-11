"use client";
import { Crop } from "lucide-react";
import { useState } from "react";
import { AlignField, ColorField, CropDialog, GradientField, ImageUpload, LinkField, NumberField, PadField, Row, Select } from "./fields";
import { FONTS, type Doc, type El, type Section } from "./model";

type Level = "easy" | "pro";
const fontOptions = (withDefault = true): [string, string][] => [...(withDefault ? [["", "Email default"] as [string, string]] : []), ...Object.keys(FONTS).map((f) => [f, f] as [string, string])];
const weights: [string, string][] = [["300", "Light"], ["400", "Regular"], ["500", "Medium"], ["600", "Semibold"], ["700", "Bold"], ["800", "Extra bold"], ["900", "Black"]];

export function ElementProperties({ el, level, onChange, brandColors, demo }: { el: El; level: Level; onChange: (fn: (e: any) => void) => void; brandColors: string[]; demo?: boolean }) {
  const [crop, setCrop] = useState(false);
  const set = (k: string, v: unknown) => onChange((e) => { e.style[k] = v; });
  const pro = level === "pro";
  if (el.type === "heading" || el.type === "text") {
    const s = el.style;
    return (
      <div className="space-y-3">
        {pro && <Select label="Font" value={s.fontFamily ?? ""} options={fontOptions()} onChange={(v) => set("fontFamily", v || null)} />}
        <NumberField label="Size" value={s.fontSize} min={8} max={96} onChange={(v) => set("fontSize", v)} />
        {pro && <NumberField label="Mobile size" value={s.mobileFontSize ?? s.fontSize} min={8} max={96} onChange={(v) => set("mobileFontSize", v)} />}
        <Select label="Weight" value={String(s.fontWeight)} options={weights} onChange={(v) => set("fontWeight", Number(v))} />
        <ColorField label="Colour" value={s.color} allowEmpty swatches={brandColors} onChange={(v) => set("color", v)} />
        <AlignField value={s.align} justify={pro} onChange={(v) => set("align", v)} />
        {pro && <>
          <NumberField label="Line height" value={s.lineHeight} min={0.8} max={3} step={0.05} unit="×" onChange={(v) => set("lineHeight", v)} />
          <NumberField label="Letter spacing" value={s.letterSpacing} min={-5} max={20} step={0.5} onChange={(v) => set("letterSpacing", v)} />
          <NumberField label="Paragraph spacing" value={s.paragraphSpacing} min={0} max={80} onChange={(v) => set("paragraphSpacing", v)} />
          <Select label="Decoration" value={s.decoration} options={[["none", "None"], ["underline", "Underline"], ["line-through", "Strikethrough"]]} onChange={(v) => set("decoration", v)} />
          <Select label="Transform" value={s.transform} options={[["none", "None"], ["uppercase", "UPPERCASE"], ["lowercase", "lowercase"], ["capitalize", "Capitalise"]]} onChange={(v) => set("transform", v)} />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!s.italic} onChange={(e) => set("italic", e.target.checked)} /> Italic</label>
          <ColorField label="Text background" value={s.background} allowEmpty swatches={brandColors} onChange={(v) => set("background", v)} />
          <PadField value={s.padding} onChange={(v) => set("padding", v)} />
        </>}
        <p className="text-[11px] text-dim">Double-click the text on the canvas to edit it. Select words and press ⌘/Ctrl+B, I or U for bold, italic or underline.</p>
      </div>
    );
  }
  if (el.type === "image") {
    const s = el.style;
    return (
      <div className="space-y-3">
        {el.src && <img src={el.src} alt="" className="max-h-28 w-full rounded-lg border border-line object-contain" />}
        <ImageUpload demo={demo} label={el.src ? "Replace image" : "Upload image"} onUploaded={(r) => onChange((e) => { e.src = r.url; e.naturalWidth = r.width; e.naturalHeight = r.height; })} />
        {el.src && <button type="button" className="btn-ghost btn-sm w-full" onClick={() => setCrop(true)}><Crop size={13} /> Crop & rotate</button>}
        <Row label="Alternative text" hint="Read aloud and shown if images are off"><input aria-label="Alternative text" className="field !py-1.5 text-xs" value={el.alt} maxLength={300} onChange={(e) => onChange((x) => { x.alt = e.target.value; })} /></Row>
        <LinkField value={el.href} onChange={(v) => onChange((x) => { x.href = v; })} />
        <NumberField label="Width" value={s.width} min={10} max={100} unit="%" onChange={(v) => set("width", v)} />
        <AlignField value={s.align} onChange={(v) => set("align", v)} />
        {pro && <>
          <NumberField label="Corner radius" value={s.radius} min={0} max={200} onChange={(v) => set("radius", v)} />
          <NumberField label="Border" value={s.borderWidth} min={0} max={20} onChange={(v) => set("borderWidth", v)} />
          {s.borderWidth > 0 && <ColorField label="Border colour" value={s.borderColor} swatches={brandColors} onChange={(v) => v && set("borderColor", v)} />}
          <PadField value={s.padding} onChange={(v) => set("padding", v)} />
          {el.naturalWidth && <p className="text-[11px] text-dim">Original: {el.naturalWidth} × {el.naturalHeight ?? "?"} px</p>}
        </>}
        {el.src && <CropDialog demo={demo} src={el.src} open={crop} onClose={() => setCrop(false)} onDone={(r) => onChange((e) => { e.src = r.url; e.naturalWidth = r.width; e.naturalHeight = r.height; })} />}
      </div>
    );
  }
  if (el.type === "button") {
    const s = el.style;
    return (
      <div className="space-y-3">
        <Row label="Button text"><input aria-label="Button text" className="field !py-1.5 text-xs" value={el.label} maxLength={120} onChange={(e) => onChange((x) => { x.label = e.target.value; })} /></Row>
        <LinkField value={el.href} onChange={(v) => onChange((x) => { x.href = v; })} />
        <ColorField label="Button colour" value={s.background} swatches={brandColors} onChange={(v) => v && set("background", v)} />
        <ColorField label="Text colour" value={s.color} swatches={["#FFFFFF", "#111111", ...brandColors]} onChange={(v) => v && set("color", v)} />
        <AlignField value={s.align} onChange={(v) => set("align", v)} />
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={s.fullWidth} onChange={(e) => set("fullWidth", e.target.checked)} /> Full width</label>
        <NumberField label="Corner radius" value={s.radius} min={0} max={60} onChange={(v) => set("radius", v)} />
        {pro && <>
          <GradientField value={s.gradient} onChange={(g) => set("gradient", g)} />
          <Select label="Font" value={s.fontFamily ?? ""} options={fontOptions()} onChange={(v) => set("fontFamily", v || null)} />
          <NumberField label="Text size" value={s.fontSize} min={10} max={40} onChange={(v) => set("fontSize", v)} />
          <Select label="Weight" value={String(s.fontWeight)} options={weights} onChange={(v) => set("fontWeight", Number(v))} />
          <NumberField label="Horizontal padding" value={s.paddingX} min={4} max={80} onChange={(v) => set("paddingX", v)} />
          <NumberField label="Vertical padding" value={s.paddingY} min={4} max={40} onChange={(v) => set("paddingY", v)} />
          <NumberField label="Border" value={s.borderWidth} min={0} max={10} onChange={(v) => set("borderWidth", v)} />
          {s.borderWidth > 0 && <ColorField label="Border colour" value={s.borderColor} swatches={brandColors} onChange={(v) => v && set("borderColor", v)} />}
          <PadField label="Outer spacing" value={s.padding} onChange={(v) => set("padding", v)} />
        </>}
      </div>
    );
  }
  if (el.type === "divider") {
    const s = el.style;
    return <div className="space-y-3"><ColorField label="Colour" value={s.color} swatches={brandColors} onChange={(v) => v && set("color", v)} />
      <NumberField label="Thickness" value={s.thickness} min={1} max={12} onChange={(v) => set("thickness", v)} />
      <NumberField label="Width" value={s.width} min={10} max={100} unit="%" onChange={(v) => set("width", v)} /><PadField value={s.padding} onChange={(v) => set("padding", v)} /></div>;
  }
  if (el.type === "spacer") return <NumberField label="Height" value={el.style.height} min={4} max={200} onChange={(v) => set("height", v)} />;
  if (el.type === "shape") {
    const s = el.style;
    return <div className="space-y-3"><ColorField label="Fill" value={s.background} swatches={brandColors} onChange={(v) => v && set("background", v)} />
      {pro && <GradientField value={s.gradient} onChange={(g) => set("gradient", g)} />}
      <NumberField label="Height" value={s.height} min={2} max={400} onChange={(v) => set("height", v)} />
      <NumberField label="Width" value={s.width} min={5} max={100} unit="%" onChange={(v) => set("width", v)} />
      <NumberField label="Corner radius" value={s.radius} min={0} max={200} onChange={(v) => set("radius", v)} /><AlignField value={s.align} onChange={(v) => set("align", v)} />
      {pro && <PadField value={s.padding} onChange={(v) => set("padding", v)} />}</div>;
  }
  if (el.type === "group") {
    const s = el.style;
    return <div className="space-y-3"><ColorField label="Background" value={s.background} allowEmpty swatches={brandColors} onChange={(v) => set("background", v)} />
      <GradientField value={s.gradient} onChange={(g) => set("gradient", g)} />
      <NumberField label="Corner radius" value={s.radius} min={0} max={60} onChange={(v) => set("radius", v)} />
      <NumberField label="Border" value={s.borderWidth} min={0} max={10} onChange={(v) => set("borderWidth", v)} />
      {s.borderWidth > 0 && <ColorField label="Border colour" value={s.borderColor} swatches={brandColors} onChange={(v) => v && set("borderColor", v)} />}
      <PadField value={s.padding} onChange={(v) => set("padding", v)} /></div>;
  }
  return null;
}

export function SectionProperties({ sec, level, onChange, brandColors, demo }: { sec: Section; level: Level; onChange: (fn: (s: Section) => void) => void; brandColors: string[]; demo?: boolean }) {
  const pro = level === "pro";
  return (
    <div className="space-y-3">
      {pro && <Row label="Name"><input aria-label="Section name" className="field !py-1.5 text-xs" value={sec.name} maxLength={80} onChange={(e) => onChange((s) => { s.name = e.target.value; })} /></Row>}
      <ColorField label="Background" value={sec.style.background} allowEmpty swatches={brandColors} onChange={(v) => onChange((s) => { s.style.background = v; })} />
      {pro && <GradientField value={sec.style.gradient} onChange={(g) => onChange((s) => { s.style.gradient = g; })} />}
      {pro && <Row label="Background image">{sec.style.backgroundImage
        ? <div className="flex gap-2"><img src={sec.style.backgroundImage} alt="" className="h-10 w-16 rounded object-cover" /><button type="button" className="btn-ghost btn-sm" onClick={() => onChange((s) => { s.style.backgroundImage = null; })}>Remove</button></div>
        : <ImageUpload demo={demo} label="Add background image" onUploaded={(r) => onChange((s) => { s.style.backgroundImage = r.url; })} />}</Row>}
      <PadField label="Spacing" value={sec.style.padding} onChange={(v) => onChange((s) => { s.style.padding = v; })} />
      {pro && sec.columns.length > 1 && <>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={sec.style.stackOnMobile} onChange={(e) => onChange((s) => { s.style.stackOnMobile = e.target.checked; })} /> Stack columns on phones</label>
        {sec.columns.map((c, i) => <NumberField key={c.id} label={`Column ${i + 1} width`} value={c.width} min={10} max={90} unit="%" onChange={(v) => onChange((s) => {
          const rest = s.columns.length - 1; s.columns[i].width = v; s.columns.forEach((cc, j) => { if (j !== i) cc.width = Math.round((100 - v) / rest); }); })} />)}
        <Select label="Vertical alignment" value={sec.columns[0].verticalAlign} options={[["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]]} onChange={(v) => onChange((s) => { s.columns.forEach((c) => { c.verticalAlign = v as any; }); })} />
      </>}
    </div>
  );
}

export function DocProperties({ doc, onChange, brandColors }: { doc: Doc; onChange: (fn: (d: Doc) => void) => void; brandColors: string[] }) {
  const st = doc.settings;
  return (
    <div className="space-y-3">
      <ColorField label="Page background" value={st.background} swatches={brandColors} onChange={(v) => v && onChange((d) => { d.settings.background = v; })} />
      <ColorField label="Email background" value={st.contentBackground} swatches={["#FFFFFF", ...brandColors]} onChange={(v) => v && onChange((d) => { d.settings.contentBackground = v; })} />
      <ColorField label="Text colour" value={st.textColor} swatches={brandColors} onChange={(v) => v && onChange((d) => { d.settings.textColor = v; })} />
      <ColorField label="Link colour" value={st.linkColor} swatches={brandColors} onChange={(v) => v && onChange((d) => { d.settings.linkColor = v; })} />
      <Select label="Font" value={st.fontFamily} options={fontOptions(false)} onChange={(v) => onChange((d) => { d.settings.fontFamily = v; })} />
      <NumberField label="Email width" value={st.width} min={480} max={760} onChange={(v) => onChange((d) => { d.settings.width = v; })} />
      <NumberField label="Corner radius" value={st.radius} min={0} max={40} onChange={(v) => onChange((d) => { d.settings.radius = v; })} />
      <Row label="Opt-out line" hint="Required: a simple way to refuse more emails"><textarea aria-label="Opt-out line" className="field min-h-[64px] text-xs" value={st.footer} maxLength={600} onChange={(e) => onChange((d) => { d.settings.footer = e.target.value; })} /></Row>
      <Row label="Personalisation fallbacks" hint="Used when a recipient's value is unknown">
        <div className="space-y-1">{Object.keys(st.fallbacks).map((k) => (
          <label key={k} className="flex items-center gap-2 text-[11px]"><code className="w-32 shrink-0 text-forest">{`{{${k}}}`}</code>
            <input aria-label={`Fallback for ${k}`} className="field !py-1 text-xs" value={st.fallbacks[k]} maxLength={80} onChange={(e) => onChange((d) => { d.settings.fallbacks[k] = e.target.value; })} /></label>))}</div>
      </Row>
    </div>
  );
}

"use client";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Crop, RotateCw, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { Modal, useToast } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { VARIABLES, type Gradient, type Pad } from "./model";

export const Row = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <div className="space-y-1"><div className="flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-wide text-mute">{label}</span>{hint && <span className="text-[10px] text-dim">{hint}</span>}</div>{children}</div>
);

export function NumberField({ label, value, min, max, step = 1, onChange, unit = "px" }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <Row label={label}>
      <div className="flex items-center gap-2">
        <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 flex-1 accent-[#7B3FF2]" />
        <div className="flex items-center rounded-md border border-line bg-panel pr-1.5"><input aria-label={`${label} value`} type="number" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))} className="w-12 bg-transparent px-1.5 py-1 text-right text-xs outline-none" /><span className="text-[10px] text-dim">{unit}</span></div>
      </div>
    </Row>
  );
}

const hexToRgb = (h: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbToHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, x | 0)).toString(16).padStart(2, "0")).join("").toUpperCase();

export function ColorField({ label, value, onChange, allowEmpty, swatches = [] }: { label: string; value?: string | null; onChange: (v: string | null) => void; allowEmpty?: boolean; swatches?: string[] }) {
  const [hex, setHex] = useState(value ?? "");
  useEffect(() => setHex(value ?? ""), [value]);
  const rgb = hexToRgb(value ?? "");
  return (
    <Row label={label}>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <label className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-line shadow-inner" style={{ background: value || "repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0/10px 10px" }}>
            <input aria-label={`${label} colour picker`} type="color" value={rgb ? (value as string) : "#7B3FF2"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
          <input aria-label={`${label} hex`} value={hex} placeholder={allowEmpty ? "Default" : "#000000"} onChange={(e) => setHex(e.target.value)}
            onBlur={() => { const v = hex.trim(); if (!v && allowEmpty) onChange(null); else if (/^#[0-9a-f]{3,8}$/i.test(v)) onChange(v.toUpperCase()); else setHex(value ?? ""); }}
            className="field !w-24 !py-1 font-mono text-xs" />
          {rgb && <div className="flex gap-1">{(["R", "G", "B"] as const).map((k, i) => (
            <input key={k} aria-label={`${label} ${k}`} type="number" min={0} max={255} value={rgb[i]} className="w-11 rounded-md border border-line bg-panel px-1 py-1 text-center text-[11px]"
              onChange={(e) => { const n = [...rgb]; n[i] = Number(e.target.value); onChange(rgbToHex(n[0], n[1], n[2])); }} />))}</div>}
          {allowEmpty && value && <button type="button" onClick={() => onChange(null)} className="text-[11px] text-mute hover:text-ink">Reset</button>}
        </div>
        {swatches.length > 0 && <div className="flex flex-wrap gap-1">{swatches.map((s) => <button key={s} type="button" aria-label={`Use ${s}`} onClick={() => onChange(s)} className={cn("h-5 w-5 rounded-full border border-line transition hover:scale-110", value === s && "ring-2 ring-forest ring-offset-1")} style={{ background: s }} />)}</div>}
      </div>
    </Row>
  );
}

export function GradientField({ value, onChange }: { value?: Gradient | null; onChange: (g: Gradient | null) => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-line p-2">
      <label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked ? { from: "#D32DE5", to: "#FF982E", angle: 105 } : null)} /> Gradient
        <span className="text-[10px] text-dim">(Outlook shows the first colour)</span></label>
      {value && <div className="space-y-2">
        <ColorField label="From" value={value.from} onChange={(v) => v && onChange({ ...value, from: v })} />
        <ColorField label="To" value={value.to} onChange={(v) => v && onChange({ ...value, to: v })} />
        <NumberField label="Angle" value={value.angle} min={0} max={360} unit="°" onChange={(angle) => onChange({ ...value, angle })} />
      </div>}
    </div>
  );
}

export function AlignField({ value, onChange, justify }: { value: string; onChange: (v: any) => void; justify?: boolean }) {
  const opts: [string, typeof AlignLeft][] = [["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight], ...(justify ? [["justify", AlignJustify] as [string, typeof AlignLeft]] : [])];
  return (
    <Row label="Align">
      <div role="radiogroup" aria-label="Alignment" className="inline-flex rounded-lg border border-line bg-bg/60 p-0.5">
        {opts.map(([v, Icon]) => <button key={v} type="button" role="radio" aria-checked={value === v} aria-label={`Align ${v}`} onClick={() => onChange(v)}
          className={cn("rounded-md p-1.5 transition", value === v ? "bg-forest text-paper shadow-card" : "text-mute hover:text-ink")}><Icon size={14} /></button>)}
      </div>
    </Row>
  );
}

export function PadField({ label = "Padding", value, onChange }: { label?: string; value: Pad; onChange: (p: Pad) => void }) {
  return (
    <Row label={label}>
      <div className="grid grid-cols-4 gap-1">{(["top", "right", "bottom", "left"] as const).map((k) => (
        <label key={k} className="flex flex-col items-center gap-0.5 text-[9px] uppercase text-dim">{k[0]}
          <input aria-label={`${label} ${k}`} type="number" min={0} max={120} value={value[k]} onChange={(e) => onChange({ ...value, [k]: Math.max(0, Math.min(120, Number(e.target.value) || 0)) })}
            className="w-full rounded-md border border-line bg-panel px-1 py-1 text-center text-xs" /></label>))}</div>
    </Row>
  );
}

export function LinkField({ label = "Link", value, onChange }: { label?: string; value: string; onChange: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Row label={label} hint="https://, mailto: or {{website}}">
      <div className="flex gap-1"><input aria-label={label} className="field !py-1.5 text-xs" value={v} placeholder="https://" onChange={(e) => setV(e.target.value)} onBlur={() => onChange(v.trim())} />
        <select aria-label="Insert a personalisation field" className="field !w-auto !py-1 text-[11px]" value="" onChange={(e) => { if (e.target.value) { const n = `{{${e.target.value}}}`; setV(n); onChange(n); } }}>
          <option value="">{"{{ }}"}</option>{VARIABLES.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
    </Row>
  );
}

export function Select({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return <Row label={label}><select aria-label={label} className="field !py-1.5 text-xs" value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>;
}

/** Read a File as a data URL. */
const readFile = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });

export async function uploadDataUrl(dataUrl: string, filename: string): Promise<{ url: string; width: number | null; height: number | null }> {
  return api("/studio/assets", { method: "POST", json: { filename, data_url: dataUrl } });
}

export function ImageUpload({ onUploaded, label = "Upload image", demo }: { onUploaded: (r: { url: string; width: number | null; height: number | null }) => void; label?: string; demo?: boolean }) {
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f?: File) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) { toast("error", "Use a PNG, JPG, GIF or WebP image."); return; }
    if (f.size > 2 * 1024 * 1024) { toast("error", "Images must be 2 MB or smaller."); return; }
    setBusy(true);
    try {
      const data = await readFile(f);
      if (demo) { const img = new Image(); img.src = data; await img.decode().catch(() => {}); onUploaded({ url: data, width: img.naturalWidth || null, height: img.naturalHeight || null }); }
      else onUploaded(await uploadDataUrl(data, f.name));
    } catch (e: any) { toast("error", e.message || "Upload failed"); } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  };
  return (
    <>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} aria-label={label} />
      <button type="button" className="btn-ghost btn-sm w-full" disabled={busy} onClick={() => ref.current?.click()}><Upload size={13} /> {busy ? "Uploading…" : label}</button>
    </>
  );
}

/** Crop and rotate in the browser, then upload the result as a new hosted image (email clients can't crop or rotate). */
export function CropDialog({ src, open, onClose, onDone, demo }: { src: string; open: boolean; onClose: () => void; onDone: (r: { url: string; width: number | null; height: number | null }) => void; demo?: boolean }) {
  const toast = useToast();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [rot, setRot] = useState(0);
  const [box, setBox] = useState({ x: 0, y: 0, w: 100, h: 100 }); // percent of the rotated image
  const [ratio, setRatio] = useState<"free" | "1" | "1.777" | "1.333" | "3">("free");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) return; const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => setImg(i); i.src = src; setRot(0); setBox({ x: 0, y: 0, w: 100, h: 100 }); setRatio("free"); }, [open, src]);
  const rw = img ? (rot % 180 ? img.naturalHeight : img.naturalWidth) : 1, rh = img ? (rot % 180 ? img.naturalWidth : img.naturalHeight) : 1;
  const applyRatio = (r: typeof ratio) => {
    setRatio(r);
    if (r === "free") return;
    const target = Number(r);
    let w = 100, h = (rw / rh) * 100 / target;
    if (h > 100) { h = 100; w = (rh / rw) * 100 * target; }
    setBox({ x: (100 - w) / 2, y: (100 - h) / 2, w, h });
  };
  const save = async () => {
    if (!img) return;
    setBusy(true);
    try {
      const rc = document.createElement("canvas"); rc.width = rw; rc.height = rh;
      const rx = rc.getContext("2d")!; rx.translate(rw / 2, rh / 2); rx.rotate((rot * Math.PI) / 180); rx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      const cw = Math.max(1, Math.round((box.w / 100) * rw)), ch = Math.max(1, Math.round((box.h / 100) * rh));
      const c = document.createElement("canvas"); c.width = cw; c.height = ch;
      c.getContext("2d")!.drawImage(rc, (box.x / 100) * rw, (box.y / 100) * rh, cw, ch, 0, 0, cw, ch);
      const data = c.toDataURL(src.includes("image/png") || src.endsWith(".png") ? "image/png" : "image/jpeg", 0.9);
      onDone(demo ? { url: data, width: cw, height: ch } : await uploadDataUrl(data, "edited.jpg"));
      onClose();
    } catch { toast("error", "This image can't be edited here. Upload it again, then crop it."); } finally { setBusy(false); }
  };
  const drag = (kind: "move" | "se") => (e: React.PointerEvent) => {
    e.preventDefault(); const el = (e.currentTarget as HTMLElement).closest("[data-crop]") as HTMLElement; const r = el.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, box };
    const mv = (ev: PointerEvent) => {
      const dx = ((ev.clientX - start.x) / r.width) * 100, dy = ((ev.clientY - start.y) / r.height) * 100;
      if (kind === "move") setBox({ ...start.box, x: Math.max(0, Math.min(100 - start.box.w, start.box.x + dx)), y: Math.max(0, Math.min(100 - start.box.h, start.box.y + dy)) });
      else { let w = Math.max(5, Math.min(100 - start.box.x, start.box.w + dx)); let h = Math.max(5, Math.min(100 - start.box.y, start.box.h + dy));
        if (ratio !== "free") h = Math.min(100 - start.box.y, (w * rw) / rh / Number(ratio)); setBox({ ...start.box, w, h }); }
    };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Crop & rotate" description="Drag the box to crop. The edited image is saved as a new copy."
      footer={<><button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button><button className="btn-primary btn-sm" disabled={busy || !img} onClick={save}>{busy ? "Saving…" : "Apply"}</button></>}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setRot((r) => (r + 90) % 360)}><RotateCw size={13} /> Rotate</button>
          {([["free", "Free"], ["1", "1:1"], ["1.777", "16:9"], ["1.333", "4:3"], ["3", "3:1"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => applyRatio(v)} className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", ratio === v ? "border-forest bg-forest text-paper" : "border-line text-mute")}>{l}</button>))}
        </div>
        <div data-crop className="relative mx-auto w-full select-none overflow-hidden rounded-lg bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] bg-[length:16px_16px]" style={{ aspectRatio: `${rw} / ${rh}`, maxHeight: 360 }}>
          {img && <img src={src} alt="" draggable={false} className="absolute left-1/2 top-1/2 max-w-none" style={{ width: rot % 180 ? `${(rh / rw) * 100}%` : "100%", transform: `translate(-50%,-50%) rotate(${rot}deg)` }} />}
          <div className="absolute inset-0 bg-ink/40" style={{ clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 ${box.y}%,${box.x}% ${box.y}%,${box.x}% ${box.y + box.h}%,${box.x + box.w}% ${box.y + box.h}%,${box.x + box.w}% ${box.y}%,0 ${box.y}%)` }} />
          <div onPointerDown={drag("move")} className="absolute cursor-move border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.3)]" style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}>
            <span onPointerDown={(e) => { e.stopPropagation(); drag("se")(e); }} className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-se-resize rounded-sm border-2 border-white bg-forest" aria-label="Resize crop" />
          </div>
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-dim"><Crop size={12} /> {Math.round((box.w / 100) * rw)} × {Math.round((box.h / 100) * rh)} px</p>
      </div>
    </Modal>
  );
}

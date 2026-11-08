"use client";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="label mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-dim">{hint}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-panel px-3 py-2.5">
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-[11px] text-dim">{hint}</span>}
      </label>
      <SwitchPrimitive.Root id={id} checked={checked} onCheckedChange={onChange}
        className="relative h-6 w-11 shrink-0 rounded-full bg-ink/10 outline-none transition data-[state=checked]:bg-forest">
        <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-paper shadow transition-transform data-[state=checked]:translate-x-[22px]" />
      </SwitchPrimitive.Root>
    </div>
  );
}

export function TagInput({ value, onChange, placeholder, max = 20, label }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; max?: number; label: string }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    const next = [...value];
    for (const p of parts) if (next.length < max && !next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p.slice(0, 60));
    onChange(next);
    setDraft("");
  };
  return (
    <div className="field flex min-h-[42px] flex-wrap items-center gap-1.5 !py-1.5 focus-within:border-forest focus-within:shadow-[0_0_0_3px_rgba(36,74,58,.25)]">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-md bg-forest/20 px-2 py-0.5 text-xs font-medium text-[#244A3A] ring-1 ring-forest/30">
          {t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="rounded hover:text-paper"><X size={12} /></button>
        </span>
      ))}
      <input aria-label={label} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={value.length ? "" : placeholder}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); if (draft.trim()) add(draft); } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1)); }}
        onBlur={() => draft.trim() && add(draft)} onPaste={(e) => { const t = e.clipboardData.getData("text"); if (/[,\n]/.test(t)) { e.preventDefault(); add(t); } }}
        className="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-dim" />
    </div>
  );
}

export interface Opt { value: string; label: string; group?: string; meta?: string }
export function MultiSelect({ options, value, onChange, placeholder, label, searchable = true }: {
  options: Opt[]; value: string[]; onChange: (v: string[]) => void; placeholder: string; label: string; searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, []);
  const shown = options.filter((o) => (o.label + (o.group ?? "")).toLowerCase().includes(q.toLowerCase()));
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const sel = options.filter((o) => value.includes(o.value));
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}
        className="field flex min-h-[42px] items-center justify-between gap-2 text-left">
        <span className="flex flex-1 flex-wrap gap-1">
          {sel.length === 0 && <span className="text-dim">{placeholder}</span>}
          {sel.slice(0, 4).map((s) => <span key={s.value} className="rounded-md bg-forest/20 px-1.5 py-0.5 text-xs font-medium text-[#244A3A] ring-1 ring-forest/30">{s.label}</span>)}
          {sel.length > 4 && <span className="text-xs text-mute">+{sel.length - 4} more</span>}
        </span>
        <ChevronDown size={16} className={cn("shrink-0 text-mute transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="panel absolute z-30 mt-1.5 w-full min-w-[240px] p-2 shadow-2xl" role="listbox" aria-multiselectable>
          {searchable && (
            <div className="relative mb-1.5">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label={`Search ${label}`} className="field !py-1.5 !pl-8 text-xs" />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto">
            {shown.length === 0 && <p className="px-2 py-3 text-center text-xs text-dim">No matches</p>}
            {shown.map((o) => {
              const on = value.includes(o.value);
              return (
                <button type="button" key={o.value} role="option" aria-selected={on} onClick={() => toggle(o.value)}
                  className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-forest/15", on && "text-ink")}>
                  <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border", on ? "border-forest bg-forest" : "border-ink/20")}>{on && <Check size={11} />}</span>
                  <span className="flex-1">{o.label}</span>
                  {o.meta && <span className="text-[11px] text-dim">{o.meta}</span>}
                </button>
              );
            })}
          </div>
          {value.length > 0 && <button type="button" onClick={() => onChange([])} className="mt-1.5 w-full rounded-md py-1 text-xs text-mute hover:bg-ink/5 hover:text-ink">Clear selection</button>}
        </div>
      )}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-forest/20 bg-bg/60 p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn("rounded-md px-3 py-1.5 text-xs font-semibold transition", value === o.value ? "bg-forest text-paper shadow-card" : "text-mute hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

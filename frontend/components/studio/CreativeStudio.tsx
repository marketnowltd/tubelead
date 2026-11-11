"use client";
import { useReducedMotionSafe } from "@/components/ui/motion";
import { AnimatePresence, motion} from "motion/react";
import { Check, CloudOff, Eye, History as HistoryIcon, LayoutTemplate, Loader2, Monitor, Palette, Redo2, Save, Send, ShieldCheck, Smartphone, Tablet, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { Modal, Sheet, useToast } from "@/components/ui/overlay";
import { api, useApi } from "@/lib/api";
import { CheckPanel } from "./CheckPanel";
import { EasyEditor } from "./Easy";
import { BrandKitDialog, TemplatePicker, type Brand, type Template } from "./Library";
import { duplicateEl, find, historyReducer, insertEl, proOnlyFeatures, removeEl, uid, VARIABLES, type Doc, type El } from "./model";
import { PreviewPanel } from "./Preview";
import { insertionPoint, ProEditor } from "./Pro";

interface DocRecord { id: string; name: string; subject: string; preheader: string; doc: Doc; editor_mode: "easy" | "pro"; version: number; updated_at: string | null }

export function ModeSwitch({ mode, onChange }: { mode: "easy" | "pro"; onChange: (m: "easy" | "pro") => void }) {
  return (
    <div role="radiogroup" aria-label="Editor mode" className="relative inline-grid grid-cols-2 rounded-full border border-line bg-bg2 p-1 shadow-inner">
      {(["easy", "pro"] as const).map((m) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => onChange(m)}
          className={cn("relative z-10 px-5 py-1.5 text-[12px] font-extrabold uppercase tracking-[0.14em] transition-colors duration-200", mode === m ? "text-paper" : "text-mute hover:text-ink")}>
          {mode === m && <motion.span layoutId="studio-mode" className="absolute inset-0 -z-10 rounded-full shadow-[0_6px_16px_-6px_rgba(123,63,242,.6)]"
            style={{ background: "linear-gradient(105deg,#9235f5,#c02df0)" }} transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
          {m === "easy" ? "Easy Editor" : "Pro Editor"}
        </button>))}
    </div>
  );
}

export function CreativeStudio({ documentId, demo, demoInitial, prospects, onApprove, approveLabel = "Approve campaign" }: {
  documentId?: string; demo?: boolean; demoInitial?: { doc: Doc; subject: string }; prospects?: { id: string; name: string }[]; onApprove?: () => void; approveLabel?: string;
}) {
  const toast = useToast();
  const reduce = useReducedMotionSafe();
  const { data: rec, error } = useApi<DocRecord>(documentId && !demo ? `/studio/documents/${documentId}` : null, { revalidateOnFocus: false });
  const { data: brand } = useApi<Brand>(!demo ? "/studio/brand" : null);
  const [hist, dispatch] = useReducer(historyReducer, { past: [], present: demoInitial?.doc as Doc, future: [] });
  const [loaded, setLoaded] = useState(!!demo);
  const [mode, setModeState] = useState<"easy" | "pro">("easy");
  const [subject, setSubject] = useState(demoInitial?.subject ?? "");
  const [preheader, setPreheader] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [save, setSave] = useState<"saved" | "saving" | "error" | "idle">("idle");
  const [sheet, setSheet] = useState<"preview" | "check" | "versions" | null>(null);
  const [dialog, setDialog] = useState<"templates" | "brand" | null>(null);
  const [notice, setNotice] = useState<string[] | null>(null);
  const [clip, setClip] = useState<El | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const skip = useRef(true);
  const doc = hist.present;

  useEffect(() => {
    if (!rec || loaded) return;
    dispatch({ type: "reset", doc: rec.doc }); setSubject(rec.subject); setPreheader(rec.preheader); setName(rec.name); setModeState(rec.editor_mode); setLoaded(true); setSave("saved");
  }, [rec, loaded]);

  const setDoc = useCallback((d: Doc, merge?: boolean) => dispatch({ type: "set", doc: d, merge }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);

  // autosave
  useEffect(() => {
    if (demo || !documentId || !loaded) return;
    if (skip.current) { skip.current = false; return; }
    setSave("saving");
    const t = setTimeout(() => {
      api(`/studio/documents/${documentId}`, { method: "PUT", json: { doc, subject, preheader, name, editor_mode: mode } })
        .then(() => setSave("saved")).catch(() => setSave("error"));
    }, 900);
    return () => clearTimeout(t);
  }, [doc, subject, preheader, name, mode, demo, documentId, loaded]);

  const checkpoint = async () => {
    if (demo || !documentId) { toast("info", "Saving versions is available with an account."); return; }
    try { await api(`/studio/documents/${documentId}`, { method: "PUT", json: { doc, subject, preheader, name, editor_mode: mode, checkpoint: `Saved ${new Date().toLocaleString("en-GB")}` } }); setSave("saved"); toast("success", "Version saved"); }
    catch (e: any) { toast("error", e.message); }
  };

  const setMode = (m: "easy" | "pro") => {
    if (m === mode) return;
    if (m === "easy") { const f = proOnlyFeatures(doc); setNotice(f.length ? f : null); } else setNotice(null);
    setModeState(m);
  };

  // editing shortcuts (both editors)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      const mod = e.metaKey || e.ctrlKey; const k = e.key.toLowerCase();
      if (mod && k === "z") { e.preventDefault(); dispatch({ type: e.shiftKey ? "redo" : "undo" }); }
      else if (mod && k === "y") { e.preventDefault(); dispatch({ type: "redo" }); }
      else if (mod && k === "s") { e.preventDefault(); checkpoint(); }
      else if (mod && k === "d" && selected[0]) { e.preventDefault(); const r = duplicateEl(doc, selected[0]); setDoc(r.doc); setSelected([r.newId]); }
      else if (mod && k === "c" && selected[0]) { const f = find(doc, selected[0]); if (f) setClip(JSON.parse(JSON.stringify(f.el))); }
      else if (mod && k === "v" && clip) { e.preventDefault(); const t2 = insertionPoint(doc, selected, selectedSection); if (t2) { const c = { ...JSON.parse(JSON.stringify(clip)), id: uid() }; setDoc(insertEl(doc, c, t2)); setSelected([c.id]); } }
      else if ((e.key === "Delete" || e.key === "Backspace") && selected.length) { e.preventDefault(); let d = doc; selected.forEach((id) => { if (!find(d, id)?.el.locked) d = removeEl(d, id); }); setDoc(d); setSelected([]); }
      else if (e.key === "Escape") { setSelected([]); setSelectedSection(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const brandColors = useMemo(() => [brand?.primary, brand?.secondary].filter(Boolean) as string[], [brand]);
  const sendTest = async () => {
    if (demo || !documentId) { toast("info", "Test emails are available once you start your free trial."); return; }
    setTestBusy(true);
    try { await api(`/studio/documents/${documentId}`, { method: "PUT", json: { doc, subject, preheader, name, editor_mode: mode } });
      const r = await api<{ sent_to: string }>(`/studio/documents/${documentId}/test`, { method: "POST" }); toast("success", `Test sent to ${r.sent_to}`); }
    catch (e: any) { toast("error", e.message); } finally { setTestBusy(false); }
  };
  const pickTemplate = (t: Template) => { setDoc(t.doc); if (!subject) setSubject(t.subject); setDialog(null); setSelected([]); toast("success", `“${t.name}” applied. Undo to go back.`); };

  if (error) return <p className="text-sm text-[#A33A2A]">{error.message}</p>;
  if (!loaded || !doc) return <div className="skeleton h-[560px] w-full rounded-2xl" />;

  const editorProps = { doc, setDoc, selected, setSelected, selectedSection, setSelectedSection, brandColors, demo, device, undo };
  return (
    <div className="space-y-4">
      {/* top toolbar */}
      <div className="sticky top-[68px] z-30 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-panel/85 px-3 py-2 shadow-card backdrop-blur-xl">
        <ModeSwitch mode={mode} onChange={setMode} />
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
        <div className="flex items-center">
          <button aria-label="Undo" title="Undo (⌘Z)" disabled={!hist.past.length} onClick={undo} className="rounded-lg p-2 text-mute transition hover:bg-forest/10 hover:text-forest disabled:opacity-30"><Undo2 size={16} /></button>
          <button aria-label="Redo" title="Redo (⌘⇧Z)" disabled={!hist.future.length} onClick={() => dispatch({ type: "redo" })} className="rounded-lg p-2 text-mute transition hover:bg-forest/10 hover:text-forest disabled:opacity-30"><Redo2 size={16} /></button>
          <button aria-label="Save version" title="Save version (⌘S)" onClick={checkpoint} className="rounded-lg p-2 text-mute transition hover:bg-forest/10 hover:text-forest"><Save size={16} /></button>
          {!demo && <button aria-label="Version history" title="Version history" onClick={() => setSheet("versions")} className="rounded-lg p-2 text-mute transition hover:bg-forest/10 hover:text-forest"><HistoryIcon size={16} /></button>}
        </div>
        <div role="radiogroup" aria-label="Canvas size" className="inline-flex rounded-lg border border-line bg-bg/60 p-0.5">
          {([["desktop", Monitor], ["tablet", Tablet], ["mobile", Smartphone]] as const).map(([d, I]) => (
            <button key={d} type="button" role="radio" aria-checked={device === d} aria-label={`${d} canvas`} onClick={() => setDevice(d)} className={cn("rounded-md p-1.5 transition", device === d ? "bg-forest text-paper shadow-card" : "text-mute hover:text-ink")}><I size={14} /></button>))}
        </div>
        <button className="btn-ghost btn-sm" onClick={() => setDialog("templates")}><LayoutTemplate size={13} /> Templates</button>
        {!demo && <button className="btn-ghost btn-sm" onClick={() => setDialog("brand")}><Palette size={13} /> Brand Kit</button>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-[11px] text-dim" aria-live="polite">{demo ? "Sample: not saved" : save === "saving" ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : save === "error" ? <><CloudOff size={12} /> Not saved</> : save === "saved" ? <><Check size={12} /> Saved</> : null}</span>
          <button className="btn-ghost btn-sm" onClick={() => setSheet("preview")}><Eye size={13} /> Preview</button>
          <button className="btn-ghost btn-sm" onClick={() => setSheet("check")}><ShieldCheck size={13} /> Run checks</button>
          <button className="btn-ghost btn-sm" disabled={testBusy} onClick={sendTest}><Send size={13} /> {testBusy ? "Sending…" : "Send test"}</button>
          {onApprove && <button className="btn-primary btn-sm" onClick={onApprove}>{approveLabel}</button>}
        </div>
      </div>

      {/* subject line */}
      <div className="grid gap-3 rounded-2xl border border-line bg-panel p-4 md:grid-cols-[1fr_1fr_auto]">
        <label className="space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-mute">Subject line</span>
          <input className="field" maxLength={300} value={subject} placeholder="What's in it for them?" onChange={(e) => setSubject(e.target.value)} /></label>
        <label className="space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-mute">Preview text</span>
          <input className="field" maxLength={300} value={preheader} placeholder="Shown after the subject in most inboxes" onChange={(e) => setPreheader(e.target.value)} /></label>
        <label className="space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-mute">Insert field</span>
          <select aria-label="Insert personalisation field into subject" className="field" value="" onChange={(e) => e.target.value && setSubject((s) => `${s}{{${e.target.value}}}`)}>
            <option value="">{"{{ }}"}</option>{VARIABLES.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
      </div>

      <AnimatePresence>{notice && mode === "easy" && (
        <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} role="status" className="overflow-hidden rounded-xl bg-gold/15 px-4 py-2.5 text-[12.5px] text-gold-text">
          This design uses Pro features ({notice.join(", ")}). They're kept exactly as they are and still appear in the email; switch to Pro Editor to change them.
          <button className="ml-2 font-semibold underline" onClick={() => setNotice(null)}>OK</button></motion.p>)}</AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={mode} initial={reduce ? false : { opacity: 0, y: 12, scale: 0.995 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduce ? undefined : { opacity: 0, y: -8, scale: 0.995 }}
          transition={{ type: "spring", stiffness: 300, damping: 32 }}>
          {mode === "easy" ? <EasyEditor {...editorProps} /> : <ProEditor {...editorProps} />}
        </motion.div>
      </AnimatePresence>

      <Sheet padded open={sheet === "preview"} onOpenChange={(o) => !o && setSheet(null)} title="Preview" description="The actual email HTML, as recipients receive it." width="max-w-[1080px]">
        <PreviewPanel doc={doc} subject={subject} preheader={preheader} demo={demo} prospects={prospects} />
      </Sheet>
      <Sheet padded open={sheet === "check"} onOpenChange={(o) => !o && setSheet(null)} title="TubeLead Email Check" width="max-w-[760px]">
        {!demo && <SaveFirst doc={doc} subject={subject} preheader={preheader} name={name} mode={mode} documentId={documentId} />}
        <CheckPanel docId={documentId} demo={demo} demoDoc={doc} subject={subject} onDocReplaced={(d, s) => { setDoc(d); setSubject(s); }}
          onLocate={(id) => { setSheet(null); setSelected([id]); setModeState("pro"); }} />
      </Sheet>
      {!demo && documentId && <Versions open={sheet === "versions"} onClose={() => setSheet(null)} documentId={documentId} onRestored={(d) => { dispatch({ type: "reset", doc: d.doc }); setSubject(d.subject); }} />}
      <TemplatePicker demo={demo} open={dialog === "templates"} onClose={() => setDialog(null)} onPick={pickTemplate} />
      {!demo && <BrandKitDialog open={dialog === "brand"} onClose={() => setDialog(null)} />}
    </div>
  );
}

/** Make sure the server has the latest edits before checking. */
function SaveFirst({ doc, subject, preheader, name, mode, documentId }: { doc: Doc; subject: string; preheader: string; name: string; mode: string; documentId?: string }) {
  useEffect(() => { if (documentId) api(`/studio/documents/${documentId}`, { method: "PUT", json: { doc, subject, preheader, name, editor_mode: mode } }).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Versions({ open, onClose, documentId, onRestored }: { open: boolean; onClose: () => void; documentId: string; onRestored: (d: DocRecord) => void }) {
  const toast = useToast();
  const { data } = useApi<{ id: string; version: number; note: string; created_at: string }[]>(open ? `/studio/documents/${documentId}/versions` : null);
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Version history" description="Restoring keeps the current design as a version too.">
      <ul className="max-h-[50vh] space-y-1 overflow-y-auto">{(data ?? []).map((v) => (
        <li key={v.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-ink/5">
          <span><span className="font-semibold">v{v.version}</span> <span className="text-mute">· {v.note} · {new Date(v.created_at).toLocaleString("en-GB")}</span></span>
          <button className="btn-ghost btn-sm" onClick={async () => { try { onRestored(await api<DocRecord>(`/studio/documents/${documentId}/versions/${v.id}/restore`, { method: "POST" })); toast("success", `Restored v${v.version}`); onClose(); } catch (e: any) { toast("error", e.message); } }}>Restore</button>
        </li>))}</ul>
    </Modal>
  );
}

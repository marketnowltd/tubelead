"use client";
import { Bot, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, ErrorState, Panel, PanelHeader, Skeleton, StatCard } from "@/components/ui/core";
import { Field, Segmented } from "@/components/ui/inputs";
import { Modal, Sheet, useToast } from "@/components/ui/overlay";
import { api, useApi } from "@/lib/api";
import { ago, dateLong } from "@/lib/format";
import { isAdmin, Row, Table, Td } from "./shared";

interface Usage { days: number; conversations: number; replies: number; unanswered: number; tokens: number; tickets_from_assistant: number; financial_requests_redirected: number; blocked_actions: number; mode: "ai" | "help_articles" }
interface Conv { id: string; who: string; status: string; escalated: boolean; unanswered: boolean; messages: number; first_message: string; updated_at: string }
interface Article { id: string; title: string; category: string; body: string; published: boolean; updated_at: string }

export function AssistantTab({ myRole }: { myRole: string }) {
  const { data: u } = useApi<Usage>("/admin/assistant/usage");
  const [filter, setFilter] = useState<"" | "escalated" | "unanswered">("");
  const { data, error, mutate } = useApi<Conv[]>(`/admin/conversations${filter ? `?filter=${filter}` : ""}`);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      {u && (
        <>
          <p className="text-[13px] text-mute">{u.mode === "ai" ? "The assistant is using OpenAI." : "OPENAI_API_KEY is not set, so the assistant answers from help articles only."} Last {u.days} days:</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Conversations" value={u.conversations} icon={<Bot size={18} />} sub={`${u.replies} replies · ${u.tokens.toLocaleString()} tokens`} />
            <StatCard label="Unanswered questions" value={u.unanswered} icon={<Bot size={18} />} tone="magenta" />
            <StatCard label="Tickets opened by assistant" value={u.tickets_from_assistant} icon={<Bot size={18} />} tone="cyan" />
            <StatCard label="Billing requests passed to staff" value={u.financial_requests_redirected} icon={<Bot size={18} />} tone="green" sub={`${u.blocked_actions} blocked actions`} />
          </div>
        </>
      )}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="font-heading text-sm font-semibold">Conversations</p>
          <Segmented label="Conversation filter" value={filter} onChange={setFilter} options={[{ value: "", label: "All" }, { value: "escalated", label: "Escalated" }, { value: "unanswered", label: "Unanswered" }]} />
        </div>
        {error ? <ErrorState error={error} onRetry={() => mutate()} /> : !data ? <Skeleton className="m-4 h-32" /> : (
          <Table head={["Who", "First message", "Messages", "Status", "Updated"]} empty={data.length === 0}>
            {data.map((c) => (
              <Row key={c.id} onClick={() => setOpen(c.id)}>
                <Td>{c.who}</Td><Td className="max-w-[320px] truncate">{c.first_message}</Td><Td>{c.messages}</Td>
                <Td>{c.escalated && <Badge tone="amber" dot>Escalated</Badge>}{c.unanswered && <Badge tone="red" className="ml-1">Unanswered</Badge>}{!c.escalated && !c.unanswered && <span className="text-mute">—</span>}</Td>
                <Td className="text-mute">{ago(c.updated_at)}</Td>
              </Row>))}
          </Table>
        )}
      </Panel>
      {open && <ConversationSheet id={open} onClose={() => setOpen(null)} />}
      <KnowledgeBase canEdit={isAdmin(myRole)} />
    </div>
  );
}

function ConversationSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useApi<{ messages: { role: string; content: string; meta: Record<string, any>; created_at: string }[] }>(`/admin/conversations/${id}`);
  return (
    <Sheet padded open onOpenChange={(o) => !o && onClose()} title="Conversation" width="max-w-[560px]">
      {!data ? <Skeleton className="h-64" /> : (
        <ol className="space-y-2.5">
          {data.messages.map((m, i) => (
            <li key={i} className={`rounded-2xl px-3.5 py-2.5 text-[13.5px] ${m.role === "user" ? "ml-8 bg-forest-50" : "mr-8 bg-bg2"}`}>
              <p className="label mb-1 !text-[10px]">{m.role === "user" ? "Customer" : `Assistant${m.meta?.mode ? ` (${m.meta.mode.replace("_", " ")})` : ""}`} · {dateLong(m.created_at)}</p>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.meta?.answered === false && <Badge tone="red" className="mt-1.5">No answer found</Badge>}
              {m.meta?.blocked_tools?.length > 0 && <Badge tone="amber" className="mt-1.5">Blocked: {m.meta.blocked_tools.join(", ")}</Badge>}
            </li>))}
        </ol>
      )}
    </Sheet>
  );
}

const CATS = ["company", "product", "pricing", "faq", "policy", "tutorial", "support"];

function KnowledgeBase({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const { data, error, mutate } = useApi<Article[]>("/admin/knowledge");
  const [edit, setEdit] = useState<Partial<Article> | null>(null);
  const [del, setDel] = useState<Article | null>(null);
  const save = async () => {
    if (!edit) return;
    try {
      const body = { title: edit.title, category: edit.category ?? "faq", body: edit.body, published: edit.published ?? true };
      await api(edit.id ? `/admin/knowledge/${edit.id}` : "/admin/knowledge", { method: edit.id ? "PUT" : "POST", json: body });
      toast("success", "Help article saved"); setEdit(null); mutate();
    } catch (e: any) { toast("error", e.message); }
  };
  const remove = async () => {
    if (!del) return;
    try { await api(`/admin/knowledge/${del.id}`, { method: "DELETE" }); toast("success", "Help article deleted"); setDel(null); mutate(); }
    catch (e: any) { toast("error", e.message); }
  };
  return (
    <Panel>
      <PanelHeader title="Knowledge base" sub="The assistant answers from these articles. Keep prices and policies accurate."
        action={canEdit ? <button className="btn-primary btn-sm" onClick={() => setEdit({ category: "faq", published: true, title: "", body: "" })}><Plus size={14} /> New article</button> : undefined} />
      {error ? <ErrorState error={error} onRetry={() => mutate()} /> : !data ? <Skeleton className="m-4 h-32" /> : (
        <ul className="divide-y divide-line pb-2">
          {data.map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{a.title} {!a.published && <Badge className="ml-1">Hidden</Badge>}</p>
                <p className="line-clamp-2 text-[12.5px] text-mute">{a.body}</p>
                <p className="mt-0.5 text-[11px] text-dim">{a.category} · updated {ago(a.updated_at)}</p>
              </div>
              {canEdit && <>
                <button aria-label={`Edit ${a.title}`} className="rounded-lg p-2 text-mute hover:bg-ink/5 hover:text-ink" onClick={() => setEdit(a)}><Pencil size={15} /></button>
                <button aria-label={`Delete ${a.title}`} className="rounded-lg p-2 text-mute hover:bg-[#B5493A]/15 hover:text-[#A33A2A]" onClick={() => setDel(a)}><Trash2 size={15} /></button></>}
            </li>))}
        </ul>
      )}
      <Modal open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit?.id ? "Edit article" : "New article"}
        footer={<><button className="btn-ghost btn-sm" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary btn-sm" disabled={!edit?.title || (edit.title?.length ?? 0) < 3 || (edit.body?.length ?? 0) < 10} onClick={save}>Save</button></>}>
        {edit && <div className="space-y-3">
          <Field label="Title"><input className="field" value={edit.title ?? ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} maxLength={200} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category"><select className="field" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
            <Field label="Visible to the assistant"><select className="field" value={edit.published ? "yes" : "no"} onChange={(e) => setEdit({ ...edit, published: e.target.value === "yes" })}><option value="yes">Yes</option><option value="no">No (hidden)</option></select></Field>
          </div>
          <Field label="Text"><textarea className="field min-h-[180px]" value={edit.body ?? ""} onChange={(e) => setEdit({ ...edit, body: e.target.value })} maxLength={20000} /></Field>
        </div>}
      </Modal>
      <Modal open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Delete article?" description={del ? `“${del.title}” will no longer be used by the assistant.` : ""}
        footer={<><button className="btn-ghost btn-sm" onClick={() => setDel(null)}>Cancel</button><button className="btn-primary btn-sm !bg-none !bg-[#B5493A]" onClick={remove}>Delete</button></>}><span /></Modal>
    </Panel>
  );
}

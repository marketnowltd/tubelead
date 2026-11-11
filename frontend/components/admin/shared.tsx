"use client";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export interface Overview {
  role: "support" | "admin" | "operator"; users_total: number; users_active_30d: number; users_new_7d: number; subscriptions_active: number;
  mrr_gbp: number; revenue_total_gbp: number; tickets_open: number; refunds_pending: number;
  alerts: { level: "error" | "warning" | "info"; message: string }[]; recent_activity: Audit[];
}
export interface Audit { id: string; action: string; actor_type: string; actor_id: string | null; target_type: string; target_id: string; detail: Record<string, any>; created_at: string }
export interface Payment { id: string; amount: number; currency: string; refunded_amount: number; created_at: string; stripe_url: string | null }

export const isAdmin = (role?: string) => role === "admin" || role === "operator";

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead className="text-[11px] uppercase tracking-wide text-mute"><tr>{head.map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
      {empty && <p className="px-4 py-8 text-center text-sm text-mute">Nothing here yet.</p>}
    </div>
  );
}
export const Row = ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
  <tr onClick={onClick} className={cn("border-t border-line align-top", onClick && "cursor-pointer hover:bg-forest-50")}>{children}</tr>
);
export const Td = ({ children, className }: { children: ReactNode; className?: string }) => <td className={cn("px-4 py-3", className)}>{children}</td>;

export const ACTION_LABEL: Record<string, string> = {
  "account.created": "New account", "account.suspended": "Account suspended", "account.reactivated": "Account reactivated", "account.role_changed": "Role changed",
  "account.deleted": "Account deleted", "ticket.created": "Ticket opened", "ticket.updated": "Ticket updated", "ticket.replied": "Staff replied",
  "refund.approved": "Refund approved", "refund.rejected": "Refund rejected", "refund.execute_attempt": "Refund started", "refund.executed": "Refund issued",
  "refund.execute_failed": "Refund failed", "knowledge.created": "Help article added", "knowledge.updated": "Help article edited", "knowledge.deleted": "Help article deleted",
  "chatbot.financial_request_redirected": "Assistant passed a billing request to the team", "chatbot.tool_blocked": "Assistant action blocked", "chatbot.reply_blocked": "Assistant reply corrected",
};

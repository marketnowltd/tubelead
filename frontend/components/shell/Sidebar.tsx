"use client";
import { ChevronsLeft, LogOut, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { compact } from "@/lib/format";
import { NAV } from "@/lib/nav";
import type { Status } from "@/lib/types";
import { cn } from "../ui/cn";
import { Avatar, Progress, Skeleton } from "../ui/core";
import { LogoMark, Wordmark } from "./Logo";

export const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/");

const GROUPS = ["Discover", "Organise", "Intelligence", "Workspace"] as const;

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const path = usePathname();
  const { data: st } = useApi<Status>("/status", { refreshInterval: 15000 });
  const { enabled, signOut } = useAuth();
  const q = st?.quota;
  const qPct = q ? (q.used / q.daily_limit) * 100 : 0;
  const plan = st?.plan;
  const planPct = plan ? (plan.leads_used / Math.max(plan.leads, 1)) * 100 : 0;

  return (
    <aside style={{ width: collapsed ? 84 : 276 }} className="fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-bg2 transition-[width] duration-300 lg:flex" aria-label="Primary">
      <Link href="/" aria-label="TubeLead home" className={cn("flex h-[68px] items-center border-b border-line", collapsed ? "justify-center" : "gap-3 px-5")}>
        <LogoMark />
        {!collapsed && <Wordmark />}
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Main navigation">
        {GROUPS.map((g) => (
          <div key={g} className="mb-3">
            {!collapsed && <p className="label mb-1 px-3 !text-[10px]">{g}</p>}
            <ul className="space-y-0.5">
              {NAV.filter((n) => n.group === g).map((n) => {
                const active = isActive(path, n.href);
                const Icon = n.icon;
                const Tag: any = Link;
                return (
                  <li key={n.href}>
                    <Tag href={n.href} title={collapsed ? n.label : undefined} aria-current={active ? "page" : undefined}
                      className={cn("group relative flex items-center gap-3 rounded-xl px-3 py-[7px] text-[13.5px] font-medium transition-colors",
                        active ? "bg-forest text-paper shadow-card" : "text-mute hover:bg-ink/[0.05] hover:text-ink", collapsed && "justify-center px-0")}>
                      <Icon size={17} strokeWidth={active ? 2.2 : 1.8} className={cn("shrink-0", !active && "text-quiet group-hover:text-forest")} />
                      {!collapsed && <span className="flex-1">{n.label}</span>}
                    </Tag>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="space-y-2 px-3 pb-2">
          <div className="rounded-2xl border border-line bg-panel p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="label flex items-center gap-1.5"><Zap size={12} className="text-gold-text" /> YouTube quota</span>
              {q ? <span className="data text-[11px] text-mute">{compact(q.used)} / {compact(q.daily_limit)}</span> : <Skeleton className="h-3 w-14" />}
            </div>
            <Progress label="YouTube API units used today" value={qPct} tone={qPct > 85 ? "purple" : "green"} />
            <p className="mt-1.5 text-[11px] text-dim">{st ? (st.youtube_configured ? "Units today · resets 00:00 UTC" : "YouTube API key not configured") : "Loading…"}</p>
          </div>
          <div className="rounded-2xl bg-forest p-3 text-paper">
            <div className="flex items-center gap-2"><Sparkles size={15} className="text-gold" /><span className="font-heading text-sm font-semibold">{plan ? `${plan.label} plan` : "Plan"}</span></div>
            <p className="mt-1.5 text-[11px] text-paper/75">{plan ? `${plan.leads_used.toLocaleString()} of ${plan.leads.toLocaleString()} leads ${plan.lead_period === "lifetime" ? "in your trial" : "this month"}` : "—"}</p>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper/20" role="progressbar" aria-label="Lead allowance used" aria-valuenow={Math.round(Math.min(planPct, 100))} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(planPct, 100)}%` }} /></div>
            <Link href="/billing" className="mt-2.5 block rounded-full bg-paper py-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-forest hover:bg-white">{plan?.id === "free" ? "Upgrade" : "Manage plan"}</Link>
          </div>
        </div>
      )}

      <div className={cn("flex items-center gap-3 border-t border-line p-2.5", collapsed && "flex-col")}>
        <div className="relative">
          <Avatar name={st?.profile.display_name ?? "Operator"} size={38} />
          <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-bg2", st?.youtube_configured ? "bg-moss" : "bg-gold")} title={st?.youtube_configured ? "Account active" : "Setup required"} />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">{st?.profile.display_name ?? "Operator"}</p>
            <p className="truncate text-[11px] text-dim">{st ? (st.youtube_configured ? "Account active" : "Setup required") : "…"}</p>
          </div>
        )}
        {enabled && <button onClick={signOut} aria-label="Sign out" className="rounded-lg p-2 text-mute hover:bg-ink/[0.06] hover:text-ink"><LogOut size={16} /></button>}
        <button onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} className="rounded-lg p-2 text-mute transition hover:bg-ink/[0.06] hover:text-ink">
          <ChevronsLeft size={16} className={cn("transition-transform", collapsed && "rotate-180")} />
        </button>
      </div>
    </aside>
  );
}

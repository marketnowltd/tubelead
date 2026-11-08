"use client";
import { AnimatePresence, motion } from "motion/react";
import { Menu, MoreHorizontal, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV, PRIMARY_MOBILE } from "@/lib/nav";
import { cn } from "../ui/cn";
import { LogoMark, Wordmark } from "./Logo";
import { isActive } from "./Sidebar";

export function MobileTopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur-xl lg:hidden">
      <Link href="/" className="flex items-center gap-2.5"><LogoMark size={30} /><Wordmark tagline={false} /></Link>
    </header>
  );
}

export function MobileTabBar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const primary = NAV.filter((n) => PRIMARY_MOBILE.includes(n.href));
  const moreActive = !primary.some((n) => isActive(path, n.href));
  return (
    <>
      <nav aria-label="Primary mobile" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-bg2/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        {primary.map((n) => {
          const a = isActive(path, n.href); const I = n.icon;
          return (
            <Link key={n.href} href={n.href} aria-current={a ? "page" : undefined} className={cn("relative flex min-h-[56px] flex-col items-center justify-center gap-1 text-[10px] font-semibold", a ? "text-ink" : "text-dim")}>
              {a && <span className="absolute inset-x-5 top-0 h-[2px] rounded-b bg-forest" />}
              <I size={20} className={a ? "text-forest" : ""} />{n.short}
            </Link>
          );
        })}
        <button onClick={() => setOpen(true)} aria-label="Open all sections" aria-expanded={open} className={cn("flex min-h-[56px] flex-col items-center justify-center gap-1 text-[10px] font-semibold", moreActive ? "text-ink" : "text-dim")}>
          <MoreHorizontal size={20} className={moreActive ? "text-forest" : ""} />More
        </button>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div role="dialog" aria-modal="true" aria-label="All sections" className="fixed inset-0 z-50 overflow-y-auto bg-bg/95 p-4 backdrop-blur-2xl lg:hidden"
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}>
            <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-3"><LogoMark size={30} /><Wordmark /></div>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-2 hover:bg-ink/[0.06]"><X size={22} /></button></div>
            <ul className="grid grid-cols-2 gap-3 pb-24">
              {NAV.map((n) => { const I = n.icon; const a = isActive(path, n.href); const Tag: any = Link; return (
                <li key={n.href}>
                  <Tag href={n.href} className={cn("panel flex h-full flex-col gap-2 p-4", a && "ring-1 ring-forest/60")}>
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-forest/10 text-forest"><I size={19} /></span>
                    <span className="font-heading text-sm font-semibold">{n.label}</span>
                    <span className="text-[11px] text-dim">{n.blurb}</span>
                  </Tag>
                </li>); })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
export { Menu };

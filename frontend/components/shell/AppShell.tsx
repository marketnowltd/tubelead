"use client";
import { useEffect, useState, type ReactNode } from "react";
import { MobileTabBar, MobileTopBar } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { PaywallHost } from "../billing/Paywall";
import { cn } from "../ui/cn";

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem("tl.sidebar") === "1"); } catch { /* storage unavailable */ } }, []);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("tl.sidebar", c ? "0" : "1"); } catch { /* ignore */ } return !c; });
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-forest focus:text-paper focus:px-4 focus:py-2">Skip to content</a>
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className={cn("min-h-screen transition-[padding] duration-300", collapsed ? "lg:pl-[84px]" : "lg:pl-[276px]")}>
        <MobileTopBar />
        <Topbar />
        <main id="main" className="mx-auto w-full max-w-[1640px] px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7">{children}</main>
      </div>
      <MobileTabBar />
      <PaywallHost />
    </>
  );
}

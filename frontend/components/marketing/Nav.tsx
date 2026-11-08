"use client";
import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LogoMark, Wordmark } from "../shell/Logo";

const LINKS = [["Product", "#demo"], ["How it works", "#how"], ["AI", "#ai"], ["Pricing", "#pricing"], ["FAQ", "#faq"]] as const;

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 8);
    h(); window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  return (
    <header className={`sticky top-0 z-40 transition ${scrolled ? "border-b border-line bg-bg/90 backdrop-blur-md" : "bg-transparent"}`}>
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center gap-6 px-5 sm:px-8">
        <Link href="/" aria-label="TubeLead home" className="flex items-center gap-2.5"><LogoMark size={34} /><Wordmark tagline={false} /></Link>
        <nav aria-label="Site" className="ml-8 hidden items-center gap-7 md:flex">
          {LINKS.map(([l, h]) => <a key={h} href={h} className="text-[14px] font-medium text-mute transition hover:text-ink">{l}</a>)}
        </nav>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          <Link href="/login" className="rounded-full px-4 py-2 text-[14px] font-semibold text-ink hover:bg-ink/5">Sign in</Link>
          <Link href="/signup" className="btn-primary !px-5 !py-2.5 !text-[11.5px]">Start discovering <ArrowRight size={14} /></Link>
        </div>
        <button className="ml-auto grid h-10 w-10 place-items-center rounded-full border border-line bg-panel md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={18} /> : <Menu size={18} />}</button>
      </div>
      {open && (
        <div className="border-t border-line bg-bg px-5 pb-6 pt-3 md:hidden">
          <nav aria-label="Mobile site" className="flex flex-col">
            {LINKS.map(([l, h]) => <a key={h} href={h} onClick={() => setOpen(false)} className="border-b border-line py-3.5 text-[16px] font-semibold">{l}</a>)}
          </nav>
          <div className="mt-5 flex flex-col gap-3"><Link href="/signup" className="btn-primary w-full">Start discovering <ArrowRight size={14} /></Link><Link href="/login" className="btn-ghost w-full">Sign in</Link></div>
        </div>
      )}
    </header>
  );
}

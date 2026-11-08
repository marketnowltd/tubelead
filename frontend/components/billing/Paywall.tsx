"use client";
import { ArrowRight, Lock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Modal } from "../ui/overlay";

interface PaywallDetail { reason?: string; message: string; feature?: string | null; current_plan?: string; required_plan?: string | null }

/** Shown only when the API reports a REAL limit (lead allowance reached, premium feature, daily runs). Says exactly what was hit. */
export function PaywallHost() {
  const [d, setD] = useState<PaywallDetail | null>(null);
  useEffect(() => {
    const h = (e: Event) => setD((e as CustomEvent<PaywallDetail>).detail);
    window.addEventListener("tubelead:paywall", h);
    return () => window.removeEventListener("tubelead:paywall", h);
  }, []);
  const title = d?.reason === "allowance_reached" ? "You've used your lead allowance" : d?.reason === "daily_jobs" ? "Daily discovery limit reached" : "This is a paid feature";
  return (
    <Modal open={!!d} onOpenChange={(o) => !o && setD(null)} title={title} description={d?.message}
      footer={<><button className="btn-ghost btn-sm" onClick={() => setD(null)}>Not now</button><Link href="/billing" onClick={() => setD(null)} className="btn-primary btn-sm">See plans <ArrowRight size={13} /></Link></>}>
      <div className="flex gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold/20 text-gold-text"><Lock size={18} /></span>
        <div className="space-y-2 text-sm">
          <p>{d?.message}</p>
          {d?.required_plan && <p className="text-mute">Available from the <strong className="text-ink">{d.required_plan}</strong> plan. Your current plan: <span className="capitalize">{d.current_plan}</span>.</p>}
          <p className="text-xs text-dim">Nothing is charged until you confirm in Stripe Checkout, and paid features unlock only after Stripe confirms the payment.</p>
        </div>
      </div>
    </Modal>
  );
}

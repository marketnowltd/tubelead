"use client";
import { ArrowRight, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { authEnabled, getAuthClient } from "@/lib/auth";
import { LogoMark, Wordmark } from "../shell/Logo";

type Mode = "in" | "up" | "reset";

export function AuthForm({ initial = "in" }: { initial?: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") && params.get("next")!.startsWith("/") ? params.get("next")! : "/dashboard";
  const [mode, setMode] = useState<Mode>(initial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const client = getAuthClient();

  useEffect(() => {
    if (!client) return;
    client.auth.getSession().then(({ data }) => { if (data.session) router.replace(next); });
  }, [client, next, router]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    setBusy(true); setMsg(null);
    try {
      if (mode === "in") {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
      } else if (mode === "up") {
        const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/login?next=${encodeURIComponent(next)}` } });
        if (error) throw error;
        setMsg({ ok: true, text: data.session ? "Account created." : "Check your inbox to confirm your email address, then sign in." });
        if (data.session) router.replace(next);
      } else {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/login` });
        if (error) throw error;
        setMsg({ ok: true, text: "If that address has an account, a recovery link is on its way." });
      }
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Something went wrong" });
    } finally { setBusy(false); }
  };
  const google = async () => {
    if (!client) return;
    const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${origin}${next}` } });
    if (error) setMsg({ ok: false, text: error.message });
  };

  const title = { in: "Welcome back", up: "Create your account", reset: "Reset your password" }[mode];
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between bg-forest p-12 text-paper lg:flex">
        <Link href="/" className="flex items-center gap-3"><LogoMark size={36} /><Wordmark tagline={false} className="[&_span]:!text-paper" /></Link>
        <div>
          <p className="font-display text-4xl font-extrabold leading-[1.1] tracking-tight">Find the creators.<br />Build the connections.<br /><span className="text-gold">Grow your network.</span></p>
          <p className="mt-5 max-w-sm text-sm text-paper/75">Every discovery runs on the official YouTube Data API. Contact routes are only ever what creators publish themselves.</p>
        </div>
        <p className="text-xs text-paper/60">25 free trial leads · no card required</p>
      </section>
      <section className="grid place-items-center px-4 py-10">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-3 lg:hidden"><LogoMark size={32} /><Wordmark tagline={false} /></Link>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-mute">{mode === "up" ? "Start with 25 free leads. Upgrade only if it earns its place." : mode === "in" ? "Sign in to your TubeLead workspace." : "We'll email you a link to choose a new password."}</p>

          {!authEnabled ? (
            <div className="panel mt-8 space-y-4 p-5">
              <p className="text-sm"><strong>Single-user local mode.</strong> Supabase Auth is not configured on this deployment, so there is no sign-in: the app opens straight to your workspace.</p>
              <p className="text-xs text-mute">Set <code className="data rounded bg-ink/5 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="data rounded bg-ink/5 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (and <code className="data rounded bg-ink/5 px-1">AUTH_MODE=supabase</code> on the API) to enable email, Google and recovery flows.</p>
              <Link href="/dashboard" className="btn-primary w-full">Open the app <ArrowRight size={16} /></Link>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
              {mode !== "reset" && (
                <>
                  <button type="button" onClick={google} className="btn-ghost w-full !normal-case !tracking-normal !text-sm">
                    <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full border border-forest/40 text-[11px] font-bold !order-none">G</span>
                    Continue with Google
                  </button>
                  <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-dim"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
                </>
              )}
              <label className="block"><span className="label mb-1.5 block">Email</span><input className="field" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              {mode !== "reset" && <label className="block"><span className="label mb-1.5 block">Password</span><input className="field" type="password" required minLength={8} autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
              {msg && <p role="alert" className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-moss/10 text-moss" : "bg-[#B5493A]/10 text-[#A33A2A]"}`}>{msg.ok && <MailCheck size={16} className="mt-0.5 shrink-0" />}{msg.text}</p>}
              <button className="btn-primary w-full" disabled={busy}>{busy ? "Please wait…" : mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send recovery link"}<ArrowRight size={15} /></button>
              <div className="flex justify-between text-xs text-mute">
                <button type="button" className="hover:text-ink hover:underline" onClick={() => { setMode(mode === "up" ? "in" : "up"); setMsg(null); }}>{mode === "up" ? "Have an account? Sign in" : "New here? Create an account"}</button>
                {mode === "in" && <button type="button" className="hover:text-ink hover:underline" onClick={() => { setMode("reset"); setMsg(null); }}>Forgot password?</button>}
                {mode === "reset" && <button type="button" className="hover:text-ink hover:underline" onClick={() => { setMode("in"); setMsg(null); }}>Back to sign in</button>}
              </div>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

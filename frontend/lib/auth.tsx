"use client";
import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setTokenProvider } from "./api";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const authEnabled = Boolean(URL_ && ANON);

interface AuthCtx { enabled: boolean; session: Session | null; signOut: () => Promise<void>; client: SupabaseClient | null }
const Ctx = createContext<AuthCtx>({ enabled: false, session: null, signOut: async () => {}, client: null });
export const useAuth = () => useContext(Ctx);

function RedirectToLogin() {
  const router = useRouter();
  const path = usePathname();
  useEffect(() => { router.replace(`/login?next=${encodeURIComponent(path || "/dashboard")}`); }, [router, path]);
  return <div className="grid min-h-screen place-items-center"><div className="skeleton h-10 w-40" /></div>;
}

/** Shared Supabase browser client for the public auth pages (null when Supabase is not configured). */
let _client: SupabaseClient | null = null;
export function getAuthClient(): SupabaseClient | null {
  if (!authEnabled) return null;
  return (_client ??= createClient(URL_!, ANON!));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => (authEnabled ? createClient(URL_!, ANON!) : null), []);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!authEnabled);

  useEffect(() => {
    if (!client) return;
    client.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = client.auth.onAuthStateChange((_e, s) => setSession(s));
    setTokenProvider(async () => (await client.auth.getSession()).data.session?.access_token ?? null);
    return () => { sub.subscription.unsubscribe(); setTokenProvider(null); };
  }, [client]);

  if (!ready) return <div className="grid min-h-screen place-items-center"><div className="skeleton h-10 w-40" /></div>;
  if (client && !session) return <RedirectToLogin />;
  return <Ctx.Provider value={{ enabled: authEnabled, session, client, signOut: async () => { await client?.auth.signOut(); } }}>{children}</Ctx.Provider>;
}

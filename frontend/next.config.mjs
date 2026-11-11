/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  // The browser only ever talks to /api/* on this origin; app/api/[...path]/route.ts forwards it to BACKEND_URL at run
  // time, so the backend URL and all secrets stay server-side.
  async headers() {
    // CSP: Next.js injects inline bootstrap scripts, so 'unsafe-inline' stays for scripts (a nonce setup is the stricter next step).
    // Everything else is locked down; images may come from https (YouTube thumbnails); Supabase is allowed for auth calls.
    const supa = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src 'self' ${supa}`.trim(),
      "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
    ].join("; ");
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};

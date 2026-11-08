const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:8000";
// SendLoom (email marketing) is part of the same site: its pages and API are served beneath /mail on this origin.
const SENDLOOM = process.env.SENDLOOM_URL || "http://127.0.0.1:3100";

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  // The browser only ever talks to /api/* on this origin; the backend URL and all secrets stay server-side.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND}/api/:path*` },
            { source: "/mail", destination: `${SENDLOOM}/mail` }, { source: "/mail/:path*", destination: `${SENDLOOM}/mail/:path*` }];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};

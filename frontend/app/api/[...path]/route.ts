/**
 * Forwards /api/* to the TubeLead API. BACKEND_URL is read when each request arrives (not when the site is built),
 * so the website works on any host as soon as BACKEND_URL is set, without a rebuild. Bodies pass through byte for
 * byte (Stripe signatures, file uploads), and the visitor's address is passed on for the API's rate limits.
 */
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const HOP = new Set(["connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "proxy-authorization", "proxy-authenticate", "host",
  "content-length", "content-encoding"]);

function backend(): string {
  return (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
}

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  const target = `${backend()}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const headers = new Headers();
  req.headers.forEach((v, k) => { if (!HOP.has(k.toLowerCase())) headers.set(k, v); });
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
  if (ip) headers.set("x-forwarded-for", ip);
  const hasBody = !["GET", "HEAD"].includes(req.method);
  let upstream: Response;
  try {
    upstream = await fetch(target, { method: req.method, headers, body: hasBody ? await req.arrayBuffer() : undefined, redirect: "manual", cache: "no-store" });
  } catch {
    return Response.json({ detail: { code: "api_unreachable", message: "The TubeLead API can't be reached right now. Please try again in a moment." } }, { status: 502 });
  }
  const out = new Headers();
  upstream.headers.forEach((v, k) => { if (!HOP.has(k.toLowerCase())) out.set(k, v); });
  return new Response(req.method === "HEAD" || upstream.status === 204 || upstream.status === 304 ? null : await upstream.arrayBuffer(), { status: upstream.status, headers: out });
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE, forward as HEAD, forward as OPTIONS };

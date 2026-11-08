# TubeLead — what is done, what is verified, what is not

Legend: ✅ implemented **and** tested · 🟡 implemented, only partly tested · ❌ not implemented / not possible here

## Brief compliance
| Requirement | Status | Notes |
|---|---|---|
| Rebrand to TubeLead (name, logo/wordmark, favicon, metadata, copy, docs, folder, API title) | ✅ | The logo is an original SVG (play tile + connection nodes). SendLoom keeps its own brand and is linked as a sibling product |
| Cream editorial design system (your palette, no large black areas, no glassmorphism) | ✅ | Tokens in `tailwind.config.ts` / `globals.css`; the only large dark-green blocks are the active nav, the plan card, the pricing "Pro" card and the final CTA — all brand forest, not black |
| Manrope / DM Sans / IBM Plex Mono | ✅ | Self-hosted via Fontsource; verified by computed styles in the E2E |
| **Fontjoy** | ❌ | An interactive website that can't be operated from the build sandbox. The pairing was chosen directly; swap on fontjoy.com if you prefer |
| Secondary-text colour `#77756E` | 🟡 | Fails WCAG AA on cream (4.2:1), so body secondary text uses `#55534D`/`#6B6962`; `#77756E` is reserved for icon strokes |
| Reference pill buttons | ✅ | Shape, uppercase label, right-hand icon, soft shadow kept; colours remapped to the palette (forest / terracotta / gold / sage) |
| Dribbble layout reference | 🟡 | Used for composition only (large headline, pill search, product mock with floating cards, creator tiles, rounded cards). Not reproduced pixel-for-pixel, and the image could only be seen as an attachment description |
| Public landing page before the app — 12 sections | ✅ | Playwright: headline, both CTAs, anchors, interactive demo, pricing toggle, FAQ, all internal links resolve, 390 px no horizontal scroll |
| Landing "product preview / creator previews / data viz" | ✅ | **Fictional sample creators**, labelled "Sample data" wherever shown |
| 16 app modules, no dead buttons | ✅ | E2E loads all 16 with no console errors; every button/link on every module has an accessible name |
| Real YouTube discovery engine | 🟡 | **Never run against the live YouTube API** (no key / no outbound access). Verified against mocked transports and a local fake that follows the documented response shapes |
| Keyword expansion, video-based, topic-based, "similar to videos" discovery | 🟡 | Unit/E2E with the fake server; AI keyword ideas tested with a fake provider |
| Dedupe, subscriber filters, history, schedules, quota monitor, pause/resume/cancel, failed-request tolerance | ✅ | pytest + E2E (pause holds progress for 8+ s, resume completes, re-run removes duplicates) |
| Queue + background workers | 🟡 | In-process thread pool with DB-backed state, **not** Redis/Celery. Single API replica |
| Job metrics (keywords, channels, unique, duplicates, qualified, routes, failed requests, quota) | ✅ | Every counter is a DB measurement |
| Contact statuses (published / unverified / deliverability-checked / website / form / none), separated | ✅ | pytest + UI. "Deliverability checked" = DNS/MX only; **mailbox-level verification is not integrated** (SendLoom has its own checks) |
| No invented contacts; no unsolicited mass email | ✅ | By design; AI prompts forbid it and output is never written to contact fields |
| AI Connect: 6 adapters, BYO key, test, models, default, rotate, disable, delete, usage, recent requests | 🟡 | OpenAI-compatible + Anthropic + Gemini adapters tested with **mock transports**, plus a fake OpenAI-compatible server in the browser E2E. **No call was ever made to a real provider** |
| AI OAuth login | ❌ | Not offered: OpenAI/Anthropic/Google do not let third-party apps use a consumer subscription via OAuth. The UI explains subscription ≠ API |
| AI Task Manager (8 tasks, per-task provider, fallback, disable) + orchestrator (retries, timeouts, rate limit, usage, cost estimates, error log) | ✅ | pytest (retry ×3 then fallback; disabled task never calls a provider) + E2E |
| Keys encrypted, never in frontend, rotated/deleted, redacted from errors | ✅ | pytest (ciphertext in DB, never in any response, leak test with a key echoed in a provider error) |
| AI search assistant → editable criteria shown before running | ✅ | Works with AI (validated against the schema; invalid fields dropped) and without (rules parser, labelled) |
| Stripe: plans, monthly + annual, Checkout, change/cancel/resume, portal, past-due, refund status, verified idempotent webhooks, unlock only after verification | 🟡 | Webhook signature/replay/idempotency/lifecycle tested with locally signed events; Checkout request shape verified against a mock. **Never run against real Stripe** (no account/network) — do a test-mode purchase before launch |
| Plan limits + paywalls (allowance reached, premium feature, daily runs) | ✅ | pytest + E2E: Free trial clamped to 25, exhaustion → 402, export/schedules/API/AI gated, UI modal names the limit; Settings can't self-upgrade |
| Supabase Auth: email register/verify, Google, recovery | 🟡 | Screens and client calls written; JWT verification + tenant isolation tested with locally signed tokens. **Never exercised against a hosted Supabase project / Google OAuth** |
| RLS | ✅ | `002_tubelead.sql` applied to local Postgres 16: other owner's rows hidden, `key_encrypted` unreadable, client cannot write `subscriptions`; full backend suite passes on it |
| Per-customer isolation | ✅ | Two-user JWT test across providers, tasks, creators, export, jobs (get/cancel/pause/resume), billing |
| Saved campaigns/schedules, analytics with interactive charts, downloadable reports | ✅ | CSV/JSON report download (formula-injection-safe) + AI summary from aggregate numbers only |
| Next.js/TS/Tailwind/Lucide/Recharts/Framer Motion | ✅ | "shadcn/ui" = hand-written shadcn-style components on Radix (no registry/CLI run) |
| FastAPI; Redis / n8n | 🟡 | Redis = rate limiting only; n8n = outgoing webhook only, tested against a local listener, not n8n |
| Production Docker config for a VPS | ❌/🟡 | `deploy/` (compose + Caddy + env template) and `docs/DEPLOY.md` written; **images were never built** (no Docker daemon) |
| Security: encrypted creds, rate limiting, validation, logging hygiene, webhook verification, SSRF guards, CSV formula neutralising | 🟡 | All present and tested except: **no Content-Security-Policy header** (Next inline scripts need a nonce setup), and no external pen-test |
| Accessibility | 🟡 | axe-core (WCAG 2.1 AA) run over landing, auth and all 16 modules at 1440 px and 390 px — see result in the final report |
| Email marketing / sending | ✅ (SendLoom) | Separate product at `/mail`, unchanged except branding of the hand-off; 34-check combined E2E passes |

## Known gaps (be aware before launch)
- No real-service verification of **YouTube, Stripe, Supabase, Google OAuth or any AI provider** — only mocks/fakes/local Postgres.
- Two sign-ins (TubeLead and SendLoom); no SSO.
- Team accounts are a plan flag and seat count only — no invite flow was built.
- Annual/monthly prices exist in two places (app config for display, Stripe for charging): keep them in sync.
- Single API replica; no Redis-backed job queue.
- The landing page's pricing falls back to static values if `/api/plans` is unreachable.
- Starter legal pages (`/privacy`, `/terms`) are templates, not legal advice.

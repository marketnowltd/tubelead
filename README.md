# TubeLead
**Find the creators. Build the connections. Grow your network.**

TubeLead discovers YouTube creators at scale through the **official YouTube Data API**, removes duplicates, scores every channel against your criteria and surfaces the business contact routes creators have **published themselves** (channel description, official website, public contact page). It never guesses or invents contact details.

> Formerly "CreatorLead AI". It still ships beside **SendLoom** (email marketing, `../sendloom`) as one platform — see `../platform/README.md`.

| | |
|---|---|
| **Public site** `/` | Cream editorial landing page: hero, interactive generator demo, how it works, discovery capabilities, AI integrations, lead-database preview with live filters, campaigns, pricing (monthly/annual), FAQ, final CTA, footer. Demo creators on it are fictional and labelled *Sample data*. |
| **Auth** `/login` `/signup` | Supabase email register/verify, Google login, password recovery. Without Supabase configured the app runs in single-user local mode and says so. |
| **App — 16 modules** | Dashboard · Lead Generator · Discovery Engine · Creator Intelligence · Lead Database · Contact Finder · Saved Searches · Campaign Manager · Automation Centre · AI Connect · AI Task Manager · Analytics · Integrations · API Management · Billing & Subscription · Account Settings (+ link to SendLoom) |

## Architecture
```
Browser ─► Next.js 15 (landing + app, Tailwind, Recharts, Framer Motion)   one origin
              └─ /api/*  (rewrite) ─► FastAPI ── SQLAlchemy ─► Postgres (Supabase, RLS) | SQLite (dev)
                                        ├─ discovery engine + job workers + scheduler (in-process, DB-backed state)
                                        ├─ AI orchestrator ─► OpenAI · Anthropic · Gemini · OpenRouter · Ollama · custom (BYO key, Fernet-encrypted)
                                        ├─ Stripe (Checkout, portal, signature-verified webhooks)
                                        └─ YouTube Data API v3 (quota ledger, reserve, per-job cap) · Redis (rate limits) · n8n webhook
```

## What the product does
**Discovery** — keyword, video-based (creators of videos on the topic), topic-based (keyword → sub-topics) and "similar to these videos" discovery; multi-niche, worldwide (14 regions), deep and repeat modes; AI-assisted keyword ideas (you approve each); duplicate removal against everything you already hold; min/max subscribers, engagement, activity, creator type, "has public email/website"; per-job quota cap; **pause / resume / cancel**; failed requests are counted and skipped, quota exhaustion stops the job gracefully; scheduled runs.
Every job counter is a database measurement: searches, keywords processed, channels found, unique, duplicates removed, qualified, rejected, contact routes found, failed requests, quota used, ETA, log.

**Contacts** — separate statuses, never merged: *deliverability checked* (public email whose domain passed a DNS/MX check) · *publicly published* · *unverified* · *website* · *contact form* · *none*. Each route shows source and confidence. There is no unsolicited mass-email feature; hand leads to SendLoom (lawful-basis declaration enforced).

**AI Connect** — modular adapters (OpenAI-compatible covers OpenAI, OpenRouter, Ollama, custom; Anthropic; Gemini). Bring your own key; keys are encrypted at rest, never returned by any endpoint, redacted from errors. Test connection, list models, choose model, default provider, rotate, disable, delete. **AI Task Manager** routes 8 tasks (keyword research, creator analysis, lead qualification, lead scoring, contact analysis, campaign intelligence, report generation, search assistant) to a provider with a fallback, or switches them off. The orchestrator handles timeouts, retries with back-off, a per-user rate limit, usage/cost estimates and error logging. The **search assistant** turns plain language into criteria you review and edit before anything runs (a transparent rules parser is used when no AI is connected). AI is advisory only — contact details and metrics come from YouTube and the creator's own pages.
*A ChatGPT/Claude/Gemini consumer subscription is not an API key.* The UI says so, and links to each provider's key page. OAuth login to AI providers is **not** offered (none of these providers lets third-party apps use a consumer subscription that way).

**Billing** — Free (25 trial leads, lifetime) · Starter £19 (2,500/mo) · Pro £49 (25,000/mo) · Elite £99 (100,000/mo, API, teams, priority). Annual = 2 months free. Checkout, upgrade/downgrade (prorated), cancel/resume, customer portal, past-due and refund status, idempotent signature-verified webhooks. Allowances, prices and feature gates are configuration (`app/services/plans.py`, `PLANS_FILE`). Paywalls appear only when a real limit is hit (allowance reached, premium feature, daily runs) and name the limit.

## Run locally
```bash
# backend
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
cp .env.example .env            # add YOUTUBE_API_KEY (optional: PLAN_OVERRIDE=pro to try paid features without Stripe)
uvicorn app.main:app --port 8000
# frontend
cd ../frontend && npm ci && npm run dev      # http://localhost:3000
```
Without a YouTube key everything renders; real discovery returns a clear "key required" message. **Load demo data** (Dashboard) populates clearly flagged fictional records.
Production/VPS: **`docs/DEPLOY.md`** (Docker + Caddy, Supabase, Stripe, env reference).

## Design
Cream editorial system — background `#F7F4EC`, secondary `#EFEAE0`, cards `#FFFDF8`, text `#22231F`, forest `#244A3A` (primary actions, active nav), sage `#A5B39D`, terracotta `#C8795B`, gold `#C6A46B`, borders `#E4DED2`. **Manrope** (headings), **DM Sans** (body), **IBM Plex Mono** (data), self-hosted via Fontsource. Pill buttons keep the reference set's shape (uppercase label, icon at the right, soft coloured shadow) in the TubeLead palette. Secondary text is `#55534D`/`#6B6962` rather than the brief's `#77756E`, which is only 4.2:1 on cream (fails WCAG AA); `#77756E` is used for icon strokes.
*Fontjoy:* it is an interactive website and could not be operated from the build environment; the Manrope/DM Sans/Plex Mono pairing was chosen directly. Verify or swap it on fontjoy.com — fonts are three lines in `globals.css` + `tailwind.config.ts`.

## Tests
| | |
|---|---|
| `cd backend && pytest` | **49 tests**, pass on SQLite and PostgreSQL 16 (discovery, dedupe, contacts, plans/paywalls, AI providers/routing/fallback/key-leak, Stripe signature/replay/idempotency, tenant isolation with real JWTs, pause/resume) |
| `bash e2e/run-tubelead.sh` | **94 browser checks** on the production build with a fake YouTube + fake OpenAI-compatible server and signed Stripe webhooks: landing interactions, 16 modules, mobile overflow, paywalls, pause/resume, dedupe, AI connect/rotate/delete, billing, report download |
| `bash ../platform/e2e/run-combined.sh` | **34 checks** for the TubeLead + SendLoom single-origin deployment and creator → email-audience hand-off |
See **`CHECKLIST.md`** for exactly what is and isn't verified.

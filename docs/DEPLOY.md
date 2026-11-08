# Deploying TubeLead to your VPS

> The Docker files in `deploy/` were written but **not built** in the authoring environment (no Docker daemon). Everything they wire together — API, web proxy, Stripe webhook path, Supabase schema — was exercised by starting the processes directly. Expect to fix small Docker-specific issues on first build.

## 1. What you need
| Item | Where | Needed for |
|---|---|---|
| A VPS (2 vCPU / 2 GB is plenty) with Docker + Compose, ports 80/443 open | your host | everything |
| A domain pointing at the VPS (A/AAAA record) | your DNS | HTTPS via Caddy, Stripe webhook, Supabase redirects |
| **YouTube Data API v3 key** | Google Cloud Console → APIs & Services → Credentials | discovery |
| **Supabase project** | supabase.com | login (email + Google), Postgres, RLS |
| **Stripe account** (test mode first) | stripe.com | paid plans |
| AI provider keys | *each customer brings their own* in AI Connect | AI features (optional) |

## 2. Supabase
1. Create a project. SQL editor → run `supabase/migrations/001_init.sql`, then `002_tubelead.sql`.
2. Settings → API: copy the **URL**, **anon key** and **JWT secret** (→ `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`).
3. Settings → Database: copy the connection URI (→ `DATABASE_URL`, prefix `postgresql+psycopg://`).
4. Authentication → Providers: enable **Email** (keep "Confirm email" on) and **Google** (create an OAuth client in Google Cloud, add Supabase's callback URL it shows you). Authentication → URL configuration: Site URL `https://YOUR-DOMAIN`, redirect URL `https://YOUR-DOMAIN/**`.

The backend connects with the database owner role and scopes every query by the verified JWT `sub`; the RLS policies in the migrations additionally protect the data if it's ever queried through Supabase's client libraries. `ai_providers.key_encrypted` is excluded from client `SELECT`, and `subscriptions` is read-only to clients.

## 3. Stripe (test mode first)
1. Products → create **Starter**, **Pro**, **Elite**. Give each two recurring GBP prices: monthly (19 / 49 / 99) and yearly (190 / 490 / 990). Copy the six `price_…` IDs into `STRIPE_PRICE_<PLAN>_<MONTHLY|ANNUAL>`. (Prices and allowances shown in the app come from `app/services/plans.py` / `PLANS_FILE`; the Stripe price is what is actually charged — keep them in sync.)
2. Developers → API keys: `STRIPE_SECRET_KEY` (and optionally `STRIPE_PUBLISHABLE_KEY`).
3. Developers → Webhooks → add endpoint `https://YOUR-DOMAIN/api/billing/webhook` with events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`. Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.
4. Settings → Billing → **Customer portal**: enable cancellation, plan switching and payment-method updates.
5. Test: Billing → Upgrade → pay with `4242 4242 4242 4242`. The page says it is waiting for Stripe, then the plan flips when the **verified webhook** arrives. Try `4000 0000 0000 0341` (payment fails) for the past-due banner, and refund a charge in the Stripe dashboard to see "refunded".

Plans unlock **only** from signature-verified webhooks. The redirect back from Checkout never changes anything by itself.

## 4. Configure and launch
```bash
cd tubelead
cp deploy/.env.prod.example deploy/.env.prod     # fill every value; SECRET_KEY: openssl rand -hex 32
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
docker compose -f deploy/docker-compose.prod.yml logs -f api     # look for: "TubeLead API ready | db=postgresql auth=supabase youtube=configured"
```
Open `https://YOUR-DOMAIN`. Register, confirm the email, and you land in the app on the **Free** plan.

## 5. Environment reference (backend)
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres (Supabase). SQLite only for local dev |
| `AUTH_MODE` | `supabase` in production (`dev` = single local user, **never** in production) |
| `SUPABASE_JWT_SECRET` | verifies user tokens |
| `SECRET_KEY` | encrypts AI provider keys. **Changing it makes stored keys unreadable** |
| `YOUTUBE_API_KEY`, `YOUTUBE_DAILY_QUOTA`, `YOUTUBE_QUOTA_RESERVE` | discovery + quota ledger |
| `STRIPE_*` | billing (see §3) |
| `APP_BASE_URL` | Checkout/portal return links |
| `AI_ALLOW_PRIVATE_HOSTS` | `false` on multi-tenant servers so users can't aim "custom" AI providers at internal addresses (this also blocks a same-host Ollama — set `true` only if you trust all users) |
| `PLAN_OVERRIDE` | **dev only**; ignored unless `AUTH_MODE=dev`. Leave empty |
| `PLANS_FILE` | optional JSON to change allowances without code, e.g. `{"pro": {"leads": 30000}}` |
| `REDIS_URL` | shared rate limiting |
| `MAX_CONCURRENT_JOBS` | parallel discovery jobs per process |
| `N8N_WEBHOOK_URL` | default job-event webhook |

Frontend build args: `BACKEND_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` — all baked at build time, so rebuild `web` after changing them.

## 6. Operating notes
- **One API replica.** Discovery workers and the scheduler run in-process; two replicas would double-fire scheduled searches. Scale up with `MAX_CONCURRENT_JOBS` first. A Redis-backed queue is the next step and was not built.
- **YouTube quota** is per Google Cloud project (default 10,000 units/day; one search costs 100). Apply for a quota extension if you run many customers.
- **Backups:** Supabase handles Postgres; back up `SECRET_KEY` separately (without it stored AI keys are lost).
- **Updating:** `git pull && docker compose … up -d --build`. Run any new `supabase/migrations/*.sql` first.
- **Logs** never contain the YouTube key, AI keys or Stripe secrets (httpx logging is clamped; provider error bodies are redacted before storage).

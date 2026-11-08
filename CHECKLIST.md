# Project checklist — what is done, what is verified, what is not

Legend: ✅ implemented **and** tested · 🟡 implemented, only partly tested · ❌ not implemented

## Reference image & brief compliance (read first)
- ❌ **The reference image was never received** — no attachment reached the session and none exists in the repo. The UI was built from
  the written brief only (palette, hero contents, sidebar contents, panel types). **Visual fidelity to your image is unverified**;
  expect to send the image for a comparison/adjustment pass.
- ❌ **Fontjoy was not used** — it is an interactive web tool that couldn't be operated here. The brief's suggested pairing
  (Space Grotesk / Inter / IBM Plex Mono) is implemented as specified; refine on fontjoy.com if desired.
- 🟡 "shadcn/ui": the shadcn CLI/registry was not run; components are hand-written in the shadcn style on Radix primitives
  (Dialog, Switch) + `class-variance-authority`/`tailwind-merge`.
- 🟡 "Custom iconography": Lucide icons set inside custom glowing icon tiles; there is no bespoke icon set.
- ✅ Hero artwork is original (SVG/CSS/canvas) — no stock photos.

## Product
| Area | Status | Evidence |
|---|---|---|
| 13 screens + persistent collapsible sidebar, active glow, usage meter, plan panel, profile | ✅ | Playwright: 13 nav items, collapse 276→84 px, every page renders |
| Cinematic hero (headline, copy, 2 CTAs, play-button art, creators, orbit, particles, light trails, feature row) | ✅ | Screenshots; reduced-motion removes animated layers (0 infinite animations) |
| Lead Generator: keywords, niches, countries, regions, subs min/max, engagement, type, activity, lead count, email/website toggles, 6 modes | ✅ | E2E: validation blocks bad input; real job run |
| Real background jobs with real counters (found/unique/duplicates/qualified/enrichment/quota/ETA/log) | ✅ | pytest (mocked YouTube) + E2E against fake YouTube server; job quota == quota ledger |
| Duplicate protection (DB unique index + dedupe in engine) | ✅ | pytest + E2E: repeat search removed 6 duplicates, 0 duplicate IDs |
| Cancel running job | ✅ | E2E |
| Quota budget (per job + daily + reserve), YouTube quota errors handled | ✅ | pytest |
| Lead database: search, 12 filters, sort, pagination, bulk select/assign/status/delete, CSV export, saved views, profile drawer, mobile cards | ✅ | E2E (filter == API, bulk, export 2 rows, saved view) |
| Contact intelligence: description + website + contact-page scan, source/date/confidence/website status, trust levels, MX check | 🟡 | pytest with mocked sites; **never run against real websites** |
| Email "verified deliverable" | ❌ | Reserved status; needs a verification provider. Nothing is ever auto-verified |
| Campaigns (CRUD, assignment, funnel stats) | ✅ | E2E + pytest |
| Saved searches + scheduled discovery | ✅ | pytest (scheduler fires due searches, advances `next_run_at`) |
| n8n webhook on job completion | ✅ | pytest with a real local HTTP listener; **not tested against n8n itself** |
| Analytics + dashboard charts (Recharts, animated) | ✅ | Playwright screenshots, no console errors |
| Interactive world map (d3-geo, zoom/pan, hover, click-to-filter, compare, text alternative) | ✅ | Playwright screenshots |
| API keys (hashed, shown once, revoke) + `X-API-Key` auth | ✅ | pytest + E2E |
| Plans / limits (monthly leads, daily jobs) enforced at job start | ✅ | Code path; 🟡 only the happy path is covered by tests |
| Billing (Stripe etc.) | ❌ | Model/limits ready; no payment integration; changing plan in Settings only changes limits |
| Outbound email sending, CRM sync | ❌ | Out of scope |

## Backend / infrastructure
| Item | Status | Evidence |
|---|---|---|
| FastAPI REST, background jobs, scheduler, rate limiting, logging, error handling | ✅ | 28 pytest tests |
| Supabase schema + RLS for all 10 tables | 🟡 | Applied to **local PostgreSQL 16** with a stub `auth` schema; all 28 tests pass on it. **No hosted Supabase project was used.** |
| Supabase Auth (JWT verify, login screen) | 🟡 | JWT verification + tenant isolation tested with locally-signed tokens; **the login UI was never exercised against Supabase** |
| Redis | 🟡 | Used for shared rate limiting only (verified with a local redis-server). **Jobs are not queued through Redis** — they run in-process |
| Multiple API replicas | ❌ | Scheduler/job runner assume one instance (documented in README) |
| **Real YouTube Data API calls** | ❌/🟡 | **Never executed — no key and no outbound access to Google.** Engine verified against mocked transports and a local fake that follows the documented response shapes. First real run may reveal field differences |
| Docker images / compose | ❌ | Written but **not built** (no Docker daemon). Next.js standalone output verified directly |
| CSP header | ❌ | Other security headers set |
| Secrets: YouTube key never in frontend; stripped from logs | ✅ | Found & fixed: httpx INFO logging printed the key |

## Quality gates (brief §14)
| Gate | Result |
|---|---|
| Visual hierarchy / spacing / font consistency | Reviewed via screenshots at 1600 px and 390 px; fixed headline wrap, sidebar overflow, logo gradient ID clash, ambiguous tab labels, table width |
| Every visible button & nav link | 40-step Playwright run: all pass (incl. destructive confirms, modals, drawer, Esc to close) |
| Forms & validation | Generator, campaign, settings, manual contact, API key — covered |
| Database connections | SQLite + PostgreSQL 16 |
| API failure handling | Backend-down → error state + Retry (E2E); missing key → clear 503 + inline guidance; YouTube quota error → job fails cleanly (pytest) |
| Console errors | 0 on all 13 pages desktop + mobile, and under reduced motion (found & fixed 2 hydration mismatches) |
| Broken images | 0 |
| Accessibility | axe-core (WCAG 2.0/2.1 A + AA): **0 violations on all 13 pages** (found & fixed unnamed progress bars). Not tested with a real screen reader |
| Performance | Production build; first-load JS 190–213 kB per page (charts + map lazy-loaded). **No Lighthouse/Web-Vitals run** |
| Browsers / devices | **Chromium only** (desktop + iPhone-sized emulation). Not tested on real iOS/Android or Safari/Firefox |

## Bugs found by testing (all fixed)
1. API key leaked into server logs via httpx request logging.
2. Demo-data seeding crashed once real quota rows existed, and counted fictional units against the real quota ledger.
3. `AVG()` returned `Decimal` on PostgreSQL → 500 on campaign stats/analytics (invisible on SQLite).
4. Hydration mismatches (API Management `window.origin`; reduced-motion in hero/counters).
5. Job with a per-job quota cap smaller than one search page failed silently → now warns in the UI and explains in the error.
6. Demo seed marked some emails "verified" despite no verification existing → removed.

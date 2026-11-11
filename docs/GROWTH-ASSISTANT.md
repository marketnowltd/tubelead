# Growth Assistant, Creative Studio and outreach

Added on top of the existing TubeLead platform. The public homepage is unchanged apart from the hero's
"Explore the Platform" button, which now opens the interactive demo at `/demo` (it previously scrolled to
"How it works"). In the app: a Growth Assistant widget on the dashboard, a "Growth Assistant" sidebar item, and a
"Growth & plans" tab in Admin.

Rollback point before this work: commit `becbc2c`.

## 1. Status

| Feature | Status |
|---|---|
| Dashboard widget, five-step wizard, resume later | **Implemented and tested** (browser) |
| Business interpretation | **Implemented and tested.** Uses rules; uses the customer's own AI provider (AI Connect) when connected. |
| Discovery: existing engine (YouTube, Google, Reddit, Twitch, Spotify, Last.fm, MusicBrainz) + Brave Search | **Implemented and tested.** Brave **awaits `BRAVE_API_KEY`**; tested against a simulated API. |
| ChannelCrawler | **Not implemented.** Its API documentation couldn't be reached from the build environment; adding it is one more provider file once the docs and a key are available. |
| Public business directories, social platforms | **Not implemented as separate sources.** Directory pages are found through web search; social platforms are limited to their official APIs (no scraping). |
| Real progress, deduplication, select / save / filter / remove | **Implemented and tested** |
| Opportunity Score (30/25/20/15/10) with "Why this lead?" (fact vs estimate) | **Implemented and tested** |
| Enrichment from public websites (published emails, contact pages) | **Implemented and tested** |
| Enrichment and verification through Snov.io | **Implemented, awaiting `SNOV_CLIENT_ID`/`SNOV_CLIENT_SECRET`.** Tested against a simulated API. Endpoint paths follow Snov.io's knowledge base and are kept in one place (`backend/app/services/snov.py`): verify them against https://snov.io/api when the keys are added. |
| Creative Studio: Easy Editor and Pro Editor on one document model | **Implemented and tested** (switching both ways preserves the design) |
| Pro tools: tool rail, layers (rename, hide, lock, duplicate, reorder, group, ungroup, delete), align, even spacing, zoom, right-click menu, shortcuts, drag and drop | **Implemented.** Layer add/undo and both-way switching are browser-tested; the rest was checked by hand. |
| Image upload, replace, crop, rotate, alt text, links, borders, radius | **Implemented.** Upload is tested; crop and rotate happen in the browser and save a new hosted image. |
| Templates (11 categories), saved templates, Brand Kit, 6 presets | **Implemented and tested.** Every template passes the contrast check (a test enforces it). |
| AI design assistant (preview → apply → undo) | **Implemented.** Design actions use rules (tested); wording actions use the customer's own AI provider, keeping `{{fields}}`, numbers and prices (tested with a simulated AI). |
| Personalisation fields with fallbacks; per-recipient preview | **Implemented and tested** |
| Email HTML renderer (tables, inline CSS, responsive rules, plain text, hosted images) | **Implemented and tested** |
| Desktop / tablet / mobile preview with measured layout problems | **Implemented and tested** |
| TubeLead Email Check: design, content, technical, deliverability (links, SPF, DKIM, DMARC), four scores, critical cap, Fix this / Fix all safe, before/after | **Implemented and tested.** Spelling uses a list of common misspellings, not a full dictionary. |
| Test email to your own address | **Implemented, awaiting `RESEND_API_KEY`.** Tested against a simulated API. |
| Approval checklist; critical issues block launch; re-approval if the email changes | **Implemented and tested** |
| Launch through the customer's own Snov.io account | **Implemented, awaiting each customer's Snov.io connection.** Tested against a simulated API. Snov.io campaigns can't receive custom HTML through the API, so TubeLead puts the personalised subject, HTML and text into the custom fields `tl_subject`, `tl_html` and `tl_text`, and the customer's Snov.io campaign template uses them. **Check in Snov.io that custom fields render HTML in your plan before relying on it.** |
| Delivery metrics from Snov.io | **Implemented, awaiting credentials;** the analytics response format is unverified. |
| Reply inbox: classification (rules or AI), suggested responses for approval, unsubscribe → suppression, reply webhook | **Implemented and tested.** TubeLead never sends replies itself. |
| My Business Results (actual vs classified vs customer-entered) | **Implemented and tested** |
| Interactive public demo | **Implemented and tested** (sample data, nothing saved or sent) |
| Credits per plan, usage, provider costs, margins, admin plan editor | **Implemented and tested.** Prices you change in Admin don't change Stripe prices; update those in Stripe too. |
| Suggested pricing (Starter £19.99, Growth £49.99, Agency £99.99) | **Not applied.** Your current plans and Stripe prices are unchanged. Set names and prices in Admin › Growth & plans if you want them. |
| PostHog analytics | **Not implemented** (needs a consent banner, which is a visible design change). |

## 2. Architecture

```
Dashboard widget ─┐
/growth wizard ───┼─> /api/growth   (sessions, interpretation, discovery, prospects, enrichment)  ── background threads
                  ├─> /api/studio   (documents, render, check, fixes, test email, templates, brand, assets, assistant)
                  └─> /api/outreach (connection, campaigns, approval, launch, metrics, replies, results, suppression)
/demo (public) ───> /api/public/email/{render,check,templates}   (stateless, rate limited)
Snov.io replies ──> /api/hooks/snov/{secret}
```

- **One document model** (`backend/app/services/email_doc.py`, mirrored in `frontend/components/studio/model.ts`):
  sections → columns → elements (heading, text, image, button, divider, spacer, shape, group). Both editors edit it;
  the HTML is generated from it on the server, so the editing canvas and the sent email are separate.
- **Layout is flow-based** because email clients don't support free positioning. "Snap" and "spacing guides" are
  the drop indicators between elements and the spacing controls.
- **Nothing is invented:** prospects come from provider results, emails from public pages or Snov.io (only on the
  prospect's own domain), scores carry their evidence, and "verified" means a verifier said so.

## 3. Database (migration `supabase/migrations/005_growth.sql`)

`growth_sessions`, `prospects`, `prospect_contacts`, `email_documents`, `email_document_versions`,
`email_templates`, `brand_kits`, `email_assets`, `outreach_campaigns`, `campaign_recipients`, `suppressions`,
`outreach_replies`, `business_results`, `provider_connections` (secrets encrypted), `usage_events`, `plan_configs`.
Row Level Security is on for all of them; customers can read only their own rows through the public API, and
connections, assets, recipients and plan settings aren't readable through it at all.

## 4. API routes

Growth: `POST /api/growth/describe`, `GET /api/growth/sessions[/current|/{id}]`, `PUT …/business`, `PUT …/step`,
`POST …/discover`, `GET …/prospects`, `PATCH /api/growth/prospects/{id}`, `POST …/select`, `POST …/enrich`, `GET /api/growth/credits`.

Studio: `GET|POST /api/studio/documents`, `GET|PUT|DELETE /api/studio/documents/{id}`, `GET …/versions`,
`POST …/versions/{v}/restore`, `POST /api/studio/render`, `POST …/check`, `POST …/fix`, `POST …/test`,
`GET /api/studio/templates`, `POST …/save-template`, `DELETE /api/studio/templates/{id}`, `GET|PUT /api/studio/brand`,
`GET|POST /api/studio/assets`, `DELETE /api/studio/assets/{id}`, `GET /api/assets/{id}` (public image), `POST /api/studio/assist`.

Outreach: `GET|PUT|DELETE /api/outreach/connection`, `GET|POST /api/outreach/campaigns`, `GET …/{id}`,
`POST …/recipients`, `POST …/approve`, `POST …/launch`, `POST …/refresh`, `GET|POST /api/outreach/replies`,
`PATCH /api/outreach/replies/{id}`, `GET|POST /api/outreach/suppressions`, `GET|POST /api/outreach/results`,
`DELETE /api/outreach/results/{id}`, `POST /api/hooks/snov/{secret}`.

Admin: `GET /api/admin/growth`, `PUT /api/admin/plans/{plan}`.

## 5. Environment variables (backend)

| Variable | Purpose |
|---|---|
| `PUBLIC_API_URL` | Public URL of the API, so uploaded images in emails load from an https address |
| `SNOV_CLIENT_ID`, `SNOV_CLIENT_SECRET` | TubeLead's Snov.io account for enrichment and verification |
| `SNOV_COST_PER_CREDIT_PENCE`, `BRAVE_COST_PER_QUERY_PENCE` | Your provider costs, for margin reporting |
| `BRAVE_API_KEY` | Brave Search discovery |
| `RESEND_API_KEY`, `EMAIL_FROM` | Test emails (already used for notifications) |

Customers connect their **own** Snov.io account for sending in the wizard's Launch step; AI features use the
provider they connect in AI Connect.

## 6. Setup and deployment

1. Run `supabase/migrations/005_growth.sql` in the Supabase SQL editor (after 004).
2. Add the variables above to `tubelead-api` on Render; at minimum `PUBLIC_API_URL`.
3. Deploy both services.
4. Check Admin › Growth & plans: each provider you configured shows a tick.
5. In Snov.io (per customer): create a list and a drip campaign whose email uses `{{tl_subject}}` and `{{tl_html}}`,
   then connect the account in the Launch step and choose that list. Optionally forward replies to the webhook URL shown there.

## 7. Compliance and security

- Corporate addresses are eligible under legitimate interests; free-mail (personal) addresses are excluded unless the
  customer records consent (UK PECR). Suppressed, bounced and unsubscribed addresses are always excluded.
- Every email carries an opt-out line; an "unsubscribe" reply suppresses the sender automatically.
- Nothing is added to a provider list until the customer approves; any edit after approval requires re-approval.
- Provider secrets are server-side; a customer's Snov.io secret is encrypted at rest and never returned.
- Uploaded images are validated by content (PNG, JPEG, GIF, WebP), limited to 2 MB and to the plan's storage.
- Link checks guard against requests to private network addresses.
- Account deletion removes all growth data.

## 8. Test results

- Backend: **134 passed**, on SQLite and on PostgreSQL 16 with migrations 001–005 applied.
- Browser: **124 passed** (20 new checks covering the widget, wizard, discovery, profile, enrichment, both
  editors, undo, mode switching both ways, Email Check, preview HTML, launch gate, results, public demo, and
  reduced-motion on a phone), no page errors, no server errors. One existing billing check failed once on a
  timing flake and passed on rerun.
- Found and fixed during testing: a hero-text colour bug in style presets (invisible text), two template contrast
  failures and a low-contrast "Bold" button colour, a disabled "Find contacts" button after selecting prospects,
  ambiguous duplicate button labels, Snov.io results on the wrong domain being accepted, and a hydration error
  with reduced motion (also present on the homepage before).

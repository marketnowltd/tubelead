# TubeLead business infrastructure

This document covers the support assistant, tickets, refunds, admin panel, accounts, email, monitoring and
security added on top of the existing TubeLead platform. The public website design is unchanged: the only
visible addition on public pages is the chat button in the bottom-right corner (since replaced by the TubeLead Helper astronaut, which opens the same support assistant; see docs/TUBELEAD-HELPER.md).

Rollback point: commit `1109b08` (the last commit before this work).

## 1. Status at a glance

| Feature | Status |
|---|---|
| Sign-up, sign-in, sign-out, password reset, email verification, sessions | **Already existed** (Supabase Auth). Unchanged. |
| Customer accounts table, last login, suspension enforced on every request | **Fully implemented and tested** |
| Staff roles (support, admin, operator) on every admin route | **Fully implemented and tested** |
| Self-service account deletion | **Fully implemented and tested.** Removing the Supabase sign-in record also **needs `SUPABASE_SERVICE_ROLE_KEY`**. |
| Support assistant: help-article answers, tickets, refund/cancellation redirection | **Fully implemented and tested** (works with no AI key) |
| Support assistant: AI answers (OpenAI) | **Implemented, awaiting `OPENAI_API_KEY`.** Tested against a simulated OpenAI API only. |
| Assistant restrictions (no refunds, cancellations, billing or account changes) | **Fully implemented and tested at backend level** |
| Editable knowledge base (13 starter articles from the site's own FAQ, terms and plans) | **Fully implemented and tested.** The refund article is a placeholder for your policy. |
| Support tickets: references, customer replies, staff replies, assignment, resolution notes | **Fully implemented and tested** |
| Refund requests: review, approve/reject, issue in Stripe, audit trail | **Fully implemented and tested.** Issuing a real refund **needs `STRIPE_SECRET_KEY`**; tested against a simulated Stripe API. |
| Stripe checkout, plans, billing portal, cancellation, verified webhooks | **Already existed.** Now also records payments, sends emails and allows failed events to be retried. |
| Transactional email (Resend): welcome, ticket, refund, payment, failed payment, cancellation, account status, admin alerts | **Implemented, awaiting `RESEND_API_KEY`.** De-duplication and retries tested against a simulated Resend API. Without a key, emails are stored as "not configured" and shown in Admin › System. |
| Admin panel: overview, customers, subscriptions, tickets, refunds, assistant, knowledge base, system, audit log | **Fully implemented and tested** in the browser |
| Error log (API errors, failed webhooks, email and assistant failures) and integration health | **Fully implemented and tested** |
| Database tables with Row Level Security (migration 004) | **Fully implemented and tested** on PostgreSQL 16 |
| Chat data retention (180 days, configurable) | **Fully implemented and tested** |
| PostHog (product analytics) | **Not implemented.** It needs a cookie-consent banner under UK GDPR/PECR, which is a visible design change. Say if you want it. |
| Sentry (external error monitoring) | **Not implemented.** The built-in error log covers server errors. Sentry can be added with a DSN. |
| Database backups | **Not implemented in code.** Use Supabase's automatic backups (Project Settings › Database). |

## 2. Architecture

The Next.js frontend talks only to the FastAPI backend (`/api/...`). The backend holds every secret
(Stripe, OpenAI, Resend, Supabase service key); the browser never sees them.

```
Browser ──> Next.js (rewrites /api) ──> FastAPI ──> PostgreSQL (Supabase)
                                          ├── Stripe     (checkout, portal, refunds: admin only)
                                          ├── OpenAI     (support assistant: no tools beyond the three below)
                                          ├── Resend     (email outbox, sent in the background)
                                          └── Supabase   (JWT verification; account deletion)
```

New backend modules:

- `services/support_bot.py`: the assistant and its restrictions
- `services/support.py`: tickets and refund requests
- `services/email.py`: outbox, templates, delivery
- `services/accounts.py`: accounts and roles
- `services/audit.py`: audit trail and error log
- `services/knowledge_seed.py`: starter help articles
- `routers/support.py`, `routers/admin.py`, `routers/me.py`: the API

### How the assistant is restricted

These are enforced in code, not only in the prompt:

1. **It can call exactly three functions**: search help articles, read the signed-in customer's own billing
   status (read-only, from the database, never from Stripe), and open a support ticket. Any other function the
   model asks for is refused and written to the audit log (`chatbot.tool_blocked`).
2. **It has no route to money.** `support_bot.py` imports nothing from billing or admin and holds no Stripe key.
   A test fails if that ever changes.
3. **Billing requests never reach the AI.** Messages asking for refunds, cancellations, plan or payment changes,
   or account deletion are recognised first and get a fixed reply plus an offer to open a ticket.
4. **Every AI reply is checked.** A reply that says a refund, cancellation or change was approved or done is
   replaced with a safe message (`chatbot.reply_blocked`).
5. **Refunds need a person.** A refund request becomes a ticket. An admin approves or rejects it, and only an admin
   can issue the refund, after approval, by typing `REFUND <reference>`. Stripe receives an idempotency key, so a
   double click cannot refund twice.

## 3. Database (migration `supabase/migrations/004_business.sql`)

| Table | Purpose |
|---|---|
| `user_accounts` | One row per user: email, name, status (active/suspended), role (customer/support/admin), created, last login |
| `payments` | Paid Stripe invoices (amount, refunded amount, payment intent), from verified webhooks |
| `knowledge_articles` | Help articles the assistant answers from |
| `chat_conversations`, `chat_messages` | Assistant conversations; visitors are tied to a private browser token |
| `support_tickets`, `ticket_messages` | Tickets with `TL-XXXXXX` references and the full thread |
| `refund_requests` | Customer refund requests and the staff decision |
| `audit_logs` | Every sensitive action: who, what, when |
| `email_outbox` | Every email, with a unique de-duplication key |
| `error_logs` | Server, webhook, email and assistant failures |

Row Level Security is on for every table. Through Supabase's public API, a customer can read only their own
account, payments, tickets and conversations. Refund requests, audit, email and error logs are not readable at all.
The backend enforces all other permissions.

## 4. API routes

Public or optional sign-in:
- `POST /api/support/chat`: send a message (creates a conversation on first use)
- `GET /api/support/chat/{id}`: conversation history (owner or visitor token only)
- `POST /api/support/tickets`: open a request (visitors must give an email)

Signed-in customer:
- `GET /api/me`: profile and role
- `DELETE /api/me`: delete account (`{"confirm": "DELETE"}`; refused while a paid plan is active)
- `GET /api/support/tickets`, `GET /api/support/tickets/{ref}`, `POST /api/support/tickets/{ref}/reply`

Support role and above:
- `GET /api/admin/overview`, `GET /api/admin/staff`
- `GET|POST /api/admin/tickets`, `GET|PATCH /api/admin/tickets/{ref}`, `POST /api/admin/tickets/{ref}/reply`
- `GET /api/admin/conversations`, `GET /api/admin/conversations/{id}`, `GET /api/admin/assistant/usage`
- `GET /api/admin/knowledge`

Admin role and above:
- `GET /api/admin/customers`, `GET /api/admin/customers/{id}`, `POST /api/admin/customers/{id}/status`
- `GET /api/admin/subscriptions`
- `GET /api/admin/refunds`, `POST /api/admin/refunds/{id}/decision`, `POST /api/admin/refunds/{id}/execute`
- `POST|PUT|DELETE /api/admin/knowledge[/{id}]`
- `GET /api/admin/system`, `POST /api/admin/system/emails/retry`, `GET /api/admin/audit`

Operator only (set by `OPERATOR_USER_IDS`):
- `PATCH /api/admin/customers/{id}/role`

## 5. Environment variables (backend service)

| Variable | Needed for |
|---|---|
| `OPERATOR_USER_IDS` | Your Supabase user ID, for full admin access |
| `OPENAI_API_KEY` (optional `OPENAI_MODEL`, default `gpt-4o-mini`) | AI answers in the assistant |
| `RESEND_API_KEY`, `EMAIL_FROM` | Sending email (your domain must be verified in Resend) |
| `ADMIN_ALERT_EMAIL` | Alerts for new registrations, tickets and failed payments |
| `SUPABASE_SERVICE_ROLE_KEY` | Removing the sign-in record when a customer deletes their account |
| `CHAT_RETENTION_DAYS` | How long untouched conversations are kept (default 180) |

The existing variables (`DATABASE_URL`, `SUPABASE_URL`, `STRIPE_*`, `YOUTUBE_API_KEY`, …) are unchanged.

## 6. Setup and deployment

1. **Database:** in Supabase, open SQL Editor and run `supabase/migrations/004_business.sql` once.
2. **Backend variables:** add the variables above to the `tubelead-api` service on Render. At minimum,
   set `OPERATOR_USER_IDS` (find your ID in Supabase › Authentication › Users).
3. **Stripe webhook:** make sure the endpoint `https://<api>/api/billing/webhook` sends `checkout.session.completed`,
   `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed` and `charge.refunded`.
4. **Deploy** both Render services (Manual Deploy › latest commit, or turn on Auto-Deploy).
5. **Check** Admin › System: every integration you configured should show a tick.
6. **Edit the refund article** in Admin › Assistant & help so it states your actual refund policy.

## 7. Security checklist

- [x] All secrets server-side only; the browser never receives them
- [x] Supabase JWT verified on every request; suspended accounts refused on every request
- [x] Role checks on every admin route (tested: customers get 403; support staff get 403 on admin-only routes)
- [x] Row Level Security on every new table (tested on PostgreSQL 16)
- [x] Input validation on every new endpoint (length limits, allowed values, email format)
- [x] Assistant has no financial or account-changing capability (tested at backend level)
- [x] Refunds: admin role + prior approval + typed confirmation + Stripe idempotency key + audit log
- [x] Stripe webhook signature verification (existing) and idempotency; failed events can now be retried
- [x] Email de-duplication: the same notification can never be sent twice
- [x] Visitors' conversations are protected by a private token; customers cannot read each other's data (tested)
- [x] Rate limiting: the existing global limit, plus chat (30 messages / 10 min per visitor IP, 60 per customer),
  tickets (5 / hour per visitor IP, 10 per customer, 3 / day per email address) and 60 messages per conversation
- [x] The payment provider is never named to customers (pages, API responses, errors, help articles, emails);
  its details appear only in the backend and the private admin panel. Tested in the backend and the browser.
- [x] Audit log for suspensions, role changes, ticket changes, refund decisions and refunds, help-article edits, assistant blocks
- [x] Chat retention policy (180 days by default)

## 8. Test results

- Backend: **113 passed** (39 new), on SQLite and on PostgreSQL 16 with all four migrations applied.
- Browser (Playwright, the full existing suite plus 8 new checks): **104 passed**, no page or console errors,
  no server errors in the API log.
- Design check: the homepage was screenshotted before and after at 1536 px and 390 px wide. The only changed
  pixels are the chat button (56 × 56 px); page height and everything else are identical.
- Tested only against simulated services: OpenAI, Resend and Stripe refunds. Run one real check of each
  after adding the keys (for example, ask the assistant a question, open a ticket and confirm the email arrives).

## 9. Outstanding configuration

- Run migration 004 in Supabase.
- Set `OPERATOR_USER_IDS`, then (optionally) `OPENAI_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_ALERT_EMAIL`,
  `SUPABASE_SERVICE_ROLE_KEY`.
- Add the Stripe webhook events listed above.
- Replace the placeholder refund article with your refund policy.
- Decide on PostHog (needs a consent banner) and Sentry.

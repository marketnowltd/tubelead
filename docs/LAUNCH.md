# Launch checklist

Everything in the code is ready. These are the settings only you can enter: keys, accounts and dashboards. Work through
them in order. Each one says how to check it worked.

## 1. Get the live site talking to the API (do this first)

Your screenshot showed **Offline** in the top bar, which means the website couldn't get an answer from the API.

1. Open https://tubelead-api.onrender.com/api/health in your browser. You should see `{"ok":true,...}`.
   - **It loads slowly the first time.** On Render's free plan the API sleeps when unused and takes up to a minute to
     wake. For launch, switch **tubelead-api** to a paid instance (Starter) so customers never wait.
   - **It shows an error, or nothing.** Open Render → **tubelead-api** → **Logs**. The usual cause is a wrong
     `DATABASE_URL`.
2. The database tables are created and updated automatically when the API starts. Every file in
   `supabase/migrations/` is applied once and recorded in the `tubelead_migrations` table. If one fails, the API logs
   "Database migration … failed" and keeps running. You can also still run the files by hand in Supabase's SQL Editor;
   each one is safe to run again.
3. In Render → **tubelead-web** → **Environment**, set `BACKEND_URL` to `https://tubelead-api.onrender.com`. The
   website now reads this when it runs, so a restart is enough; no rebuild is needed.
4. In Render → **tubelead-api** → **Environment**, set:
   - `APP_BASE_URL=https://tubelead-web.onrender.com`
   - `CORS_ORIGINS=https://tubelead-web.onrender.com`
   - `PUBLIC_API_URL=https://tubelead-api.onrender.com`

Check: sign in. The top bar shows **Search ready** (or nothing, if the YouTube key isn't set yet).
- **Signed out · sign in:** your session has ended; sign in again.
- **Server error:** the API answered with an error. Rest the mouse on the badge to see the message, and check
  Render → tubelead-api → **Logs**.
- **API unreachable:** the website can't connect to the API at all. Check `BACKEND_URL`.

## 2. Sign-in (email and Google)

1. Supabase → **Authentication → URL Configuration**:
   - Site URL: `https://tubelead-web.onrender.com`
   - Redirect URLs: `https://tubelead-web.onrender.com/**`
2. Google sign-in. If you get **"Error 400: redirect_uri_mismatch"**, the address in Google doesn't exactly match the
   one Supabase uses:
   1. In Supabase → **Authentication → Sign In / Providers → Google**, click **Copy** next to **Callback URL**. It is
      `https://lnrxdnkeolksrkghfjno.supabase.co/auth/v1/callback`.
   2. In Google Cloud → **APIs & Services → Credentials**, open your OAuth client. Under **Authorised redirect URIs**,
      paste exactly that address, with no extra slash or spaces. Do not put the onrender.com address here.
   3. Under **Authorised JavaScript origins**, add `https://tubelead-web.onrender.com`.
   4. Click **Save**. Google can take a few minutes to apply it.
   5. Paste the Client ID and Client secret (`GOCSPX-…`) into the Supabase Google panel, and save.
   6. In Google → **OAuth consent screen**, click **Publish app**. Otherwise only test users can sign in.
3. In tubelead-web, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. In tubelead-api, set
   `SUPABASE_URL`. The two `NEXT_PUBLIC_` values are built into the website, so redeploy tubelead-web after changing
   them.
4. Set `OPERATOR_USER_IDS` on tubelead-api to your own Supabase user ID (Supabase → Authentication → Users) for full
   admin access.

Check: "Continue with Google" on `/signup` returns you signed in to the dashboard.

## 3. Search and emails

| Setting (tubelead-api) | What it turns on | Where to get it |
|---|---|---|
| `YOUTUBE_API_KEY` | **Required.** The Lead Generator: YouTube creators and the emails in their channel descriptions and websites. | Google Cloud → enable "YouTube Data API v3" → Credentials → API key |
| `GOOGLE_PSE_KEY`, `GOOGLE_PSE_CX` | Google Search | programmablesearchengine.google.com, plus an API key with the Custom Search API enabled |
| `BRAVE_API_KEY` | Brave Search (also used by the Growth Assistant) | api.search.brave.com |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | Reddit | reddit.com/prefs/apps → "script" app |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | Twitch | dev.twitch.tv/console |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Spotify | developer.spotify.com/dashboard |
| `LASTFM_API_KEY` | Last.fm | last.fm/api/account/create |
| `VIMEO_ACCESS_TOKEN` | Vimeo | developer.vimeo.com → new app → access token with "public" scope |
| (none) | Apple Podcasts, Bluesky, Dailymotion, Mastodon, MusicBrainz | On automatically |
| `SNOV_CLIENT_ID`, `SNOV_CLIENT_SECRET` | Optional: Snov.io email lookup and verification in the Growth Assistant | snov.io → API |

**How emails are found.** Only addresses people publish themselves:
- YouTube channel descriptions
- profile bios
- podcast feeds (the owner email podcasters list in their RSS feed)
- the creator's own website and its contact page, read politely (robots.txt respected)

Nothing is guessed. Search Everywhere shows each email with where it was found, and you can download the results as
CSV.

Check: Admin → **System** lists each source as configured. Run a search in the Lead Generator (Basic: type a niche,
press Enter, then **Find Leads**).

## 4. Stripe (the only part left for payments)

On tubelead-api:

1. `STRIPE_SECRET_KEY`: Stripe → Developers → API keys (`sk_live_…`).
2. Create a Product and Price for each plan and period, and set their Price IDs (`price_…`):
   - `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_ANNUAL`
   - `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`
   - `STRIPE_PRICE_ELITE_MONTHLY`, `STRIPE_PRICE_ELITE_ANNUAL`

   The amounts should match the prices shown on the site (Admin → Growth & plans).
3. Stripe → Developers → **Webhooks → Add endpoint**:
   - URL: `https://tubelead-api.onrender.com/api/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`,
     `charge.refunded`
   - Copy the **Signing secret** (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.

Check: Admin → **System** shows Stripe configured. Buy the cheapest plan with a real card: the plan changes as soon as
the payment is confirmed, and you can refund yourself in Stripe.

## 5. Email

- `RESEND_API_KEY` and `EMAIL_FROM` (for example `TubeLead <support@yourdomain.com>`, on a domain verified in Resend).
  These are for TubeLead's own notices only: welcome, support and billing. Customers send their campaigns from their own
  email service.
- `ADMIN_ALERT_EMAIL`: where new sign-ups, support tickets and failed payments are reported.
- Optional: `OPENAI_API_KEY`. The support assistant and the TubeLead Helper then answer free-form questions with AI.
  Without it, they answer from the page guide and the help articles.

## 6. Final checks before you announce

- Sign up as a new customer in a private window. Run a search, open a lead, and check the email and its source.
- Edit the "Refunds" help article in Admin → Knowledge base to state your own refund policy.
- Review `/terms` and `/privacy` with your own business details.
- Add a custom domain in Render (Settings → Custom Domain). Then update `APP_BASE_URL`, `CORS_ORIGINS`,
  `NEXT_PUBLIC_SITE_URL`, the Supabase URLs and the Google origins to it.

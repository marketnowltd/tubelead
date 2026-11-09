#!/usr/bin/env bash
# Starts TubeLead (+fake YouTube, fake AI provider, fresh DB, FREE plan, Stripe webhook secret set) and runs the browser E2E.
set -e; ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
pkill -f next-server || true; pkill -f "[u]vicorn" || true; sleep 1
rm -f "$ROOT"/tubelead/backend/tl-e2e.db*
cd "$ROOT/tubelead/backend"; . .venv/bin/activate
nohup uvicorn tests.fake_youtube_server:app --port 8765 >/tmp/t-yt.log 2>&1 &
nohup uvicorn tests.fake_ai_server:app --port 8766 >/tmp/t-ai.log 2>&1 &
DATABASE_URL=sqlite:///./tl-e2e.db DEV_OWNER_IS_OPERATOR=false YOUTUBE_API_KEY=fake YOUTUBE_API_BASE=http://127.0.0.1:8765/youtube/v3 STRIPE_WEBHOOK_SECRET=whsec_e2e STRIPE_SECRET_KEY=sk_test_e2e \
  STRIPE_PRICE_PRO_MONTHLY=price_pro_m STRIPE_PRICE_STARTER_MONTHLY=price_starter_m SECRET_KEY=e2e-secret nohup uvicorn app.main:app --port 8000 >/tmp/t-api.log 2>&1 &
cd "$ROOT/tubelead/frontend"; BACKEND_URL=http://127.0.0.1:8000 nohup npx next start -p 3000 >/tmp/t-web.log 2>&1 &
sleep 7; curl -sf localhost:3000/api/health >/dev/null && echo "stack up"
node "$ROOT/tubelead/e2e/tubelead.js"

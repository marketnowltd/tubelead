-- TubeLead — additions on top of 001_init.sql (AI Connect, billing, job counters). Mirrors backend/app/models.py.
-- Run after 001. Safe to re-run.

alter table discovery_jobs add column if not exists failed_requests integer not null default 0;
alter table discovery_jobs add column if not exists contact_routes_found integer not null default 0;
alter table discovery_jobs add column if not exists keywords_done integer not null default 0;

create table if not exists ai_providers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  provider varchar(24) not null,
  label varchar(80) not null default 'default',
  base_url text,
  key_encrypted text,            -- Fernet ciphertext (backend SECRET_KEY). Never exposed to clients.
  key_hint varchar(24),
  model varchar(160) not null default '',
  is_default boolean not null default false,
  status varchar(16) not null default 'untested',
  last_error text,
  last_tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_ai_provider_label unique (owner_id, provider, label)
);
create index if not exists ix_ai_providers_owner on ai_providers(owner_id);

create table if not exists ai_task_assignments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  task varchar(40) not null,
  provider_id uuid references ai_providers(id) on delete set null,
  fallback_provider_id uuid references ai_providers(id) on delete set null,
  enabled boolean not null default true,
  constraint uq_ai_task unique (owner_id, task)
);
create index if not exists ix_ai_tasks_owner on ai_task_assignments(owner_id);

create table if not exists ai_request_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  task varchar(40) not null,
  provider varchar(24) not null,
  model varchar(160) not null default '',
  ok boolean not null default true,
  error text,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  cost_usd double precision,
  latency_ms integer not null default 0,
  attempts integer not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists ix_ai_logs_owner on ai_request_logs(owner_id);
create index if not exists ix_ai_logs_created on ai_request_logs(created_at);

create table if not exists subscriptions (
  owner_id uuid primary key,
  plan varchar(16) not null default 'free',
  interval varchar(8) not null default 'monthly',
  status varchar(24) not null default 'none',
  stripe_customer_id varchar(80),
  stripe_subscription_id varchar(80),
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  last_payment_status varchar(24),
  updated_at timestamptz not null default now()
);
create index if not exists ix_subs_customer on subscriptions(stripe_customer_id);
create index if not exists ix_subs_subscription on subscriptions(stripe_subscription_id);

create table if not exists stripe_events (
  id varchar(80) primary key,
  type varchar(80) not null,
  received_at timestamptz not null default now()
);

-- Row level security. Owner-scoped tables mirror 001. subscriptions are READ-ONLY for clients: only the backend
-- (service role, driven by verified Stripe webhooks) can write them. stripe_events is backend-only (no policies).
do $$
declare t text;
begin
  foreach t in array array['ai_providers','ai_task_assignments','ai_request_logs']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_owner', t);
    execute format('create policy %I on %I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t || '_owner', t);
  end loop;
end $$;

-- Never let a client read the encrypted key column directly: drop table-wide SELECT and grant every column except it.
-- (A column-level REVOKE alone has no effect while a table-level GRANT exists.)
revoke select on ai_providers from authenticated, anon;
grant select (id, owner_id, provider, label, base_url, key_hint, model, is_default, status, last_error, last_tested_at, created_at, updated_at)
  on ai_providers to authenticated;

alter table subscriptions enable row level security;
drop policy if exists subscriptions_read on subscriptions;
create policy subscriptions_read on subscriptions for select to authenticated using (owner_id = auth.uid());

alter table stripe_events enable row level security;

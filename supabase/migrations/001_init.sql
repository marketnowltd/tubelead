-- TubeLead — initial schema for Supabase (PostgreSQL 15+)
-- Mirrors backend/app/models.py. The FastAPI backend connects with the service role / direct
-- Postgres connection and enforces tenant scoping in code; the RLS policies below additionally
-- protect the data if it is ever queried through Supabase's client libraries (anon / authenticated keys).

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name varchar(160) not null,
  description text not null default '',
  status varchar(24) not null default 'draft',
  target_niche varchar(80),
  target_countries jsonb not null default '[]',
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists discovery_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  mode varchar(24) not null default 'standard',
  params jsonb not null default '{}',
  status varchar(16) not null default 'queued',
  current_operation text not null default 'Queued',
  queries_total integer not null default 0,
  queries_done integer not null default 0,
  channels_found integer not null default 0,
  unique_found integer not null default 0,
  duplicates_removed integer not null default 0,
  qualified integer not null default 0,
  rejected integer not null default 0,
  enrich_total integer not null default 0,
  enriched integer not null default 0,
  quota_used integer not null default 0,
  error text,
  log jsonb not null default '[]',
  saved_search_id uuid,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists ix_jobs_owner on discovery_jobs(owner_id);
create index if not exists ix_jobs_status on discovery_jobs(status);
create index if not exists ix_jobs_created on discovery_jobs(created_at);

create table if not exists creators (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  youtube_channel_id varchar(64) not null,
  title varchar(300) not null,
  handle varchar(120),
  thumbnail_url text,
  channel_url text not null,
  description text not null default '',
  subscriber_count bigint,
  video_count integer not null default 0,
  view_count bigint not null default 0,
  country varchar(2),
  niche varchar(80) not null default 'General',
  creator_type varchar(24) not null default 'creator',
  avg_views bigint,
  engagement_rate double precision,
  last_upload_at timestamptz,
  activity varchar(16) not null default 'unknown',
  website text,
  contact_page text,
  website_status varchar(24) not null default 'unchecked',
  qualification_score integer not null default 0,
  score_breakdown jsonb not null default '{}',
  verification_status varchar(16) not null default 'none',
  outreach_status varchar(16) not null default 'new',
  campaign_id uuid references campaigns(id) on delete set null,
  job_id uuid,
  is_demo boolean not null default false,
  discovered_at timestamptz not null default now(),
  constraint uq_creator_owner_channel unique (owner_id, youtube_channel_id)
);
create index if not exists ix_creators_owner on creators(owner_id);
create index if not exists ix_creators_country on creators(country);
create index if not exists ix_creators_niche on creators(niche);
create index if not exists ix_creators_score on creators(qualification_score);
create index if not exists ix_creators_campaign on creators(campaign_id);
create index if not exists ix_creators_demo on creators(is_demo);
create index if not exists ix_creators_discovered on creators(discovered_at);

create table if not exists contact_routes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  creator_id uuid not null references creators(id) on delete cascade,
  kind varchar(16) not null,
  value text not null,
  platform varchar(24),
  source varchar(32) not null,
  source_url text,
  status varchar(16) not null default 'published',
  confidence double precision not null default 0.5,
  website_status varchar(24),
  mx_valid boolean,
  checked_at timestamptz,
  is_demo boolean not null default false,
  discovered_at timestamptz not null default now(),
  constraint uq_route unique (creator_id, kind, value)
);
create index if not exists ix_routes_owner on contact_routes(owner_id);
create index if not exists ix_routes_creator on contact_routes(creator_id);

create table if not exists saved_searches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name varchar(160) not null,
  params jsonb not null default '{}',
  schedule varchar(16) not null default 'none',
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_job_id uuid,
  run_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ix_saved_owner on saved_searches(owner_id);

create table if not exists saved_views (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name varchar(120) not null,
  filters jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists ix_views_owner on saved_views(owner_id);

create table if not exists quota_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  day date not null,
  units integer not null default 0,
  is_demo boolean not null default false,
  constraint uq_quota_day unique (owner_id, day)
);

create table if not exists activity_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  kind varchar(32) not null,
  message text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ix_activity_owner on activity_events(owner_id);
create index if not exists ix_activity_created on activity_events(created_at);

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name varchar(120) not null,
  prefix varchar(16) not null,
  key_hash varchar(64) not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists ix_keys_owner on api_keys(owner_id);

create table if not exists user_settings (
  owner_id uuid primary key,
  plan varchar(16) not null default 'free',
  display_name varchar(120) not null default 'Operator',
  email varchar(255) not null default '',
  n8n_webhook_url text not null default '',
  default_filters jsonb not null default '{}',
  preferences jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Row-level security: every table is private to its owner.
-- ---------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['campaigns','discovery_jobs','creators','contact_routes','saved_searches',
                           'saved_views','quota_usage','activity_events','api_keys','user_settings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_owner_all', t);
    execute format('create policy %I on %I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
                   t || '_owner_all', t);
  end loop;
end $$;

-- API key hashes must never be readable through the client libraries, even by their owner.
revoke select (key_hash) on api_keys from authenticated, anon;

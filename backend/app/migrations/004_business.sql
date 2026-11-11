-- TubeLead — business infrastructure: accounts, payments, help articles, support assistant, tickets,
-- refund requests, audit log, email outbox, error log. Mirrors backend/app/models.py (keep in sync).
--
-- Access model: the FastAPI backend connects with the database owner role and enforces permissions in code.
-- Row Level Security is ON for every table, so the public Supabase API (anon / authenticated keys) can read
-- only a customer's own rows where noted below, and nothing else. No table is writable through the public API.

create table if not exists user_accounts (
  owner_id uuid primary key,
  email varchar(255) not null default '',
  full_name varchar(160) not null default '',
  status varchar(16) not null default 'active' check (status in ('active','suspended')),
  role varchar(16) not null default 'customer' check (role in ('customer','support','admin')),
  status_reason text not null default '',
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);
create index if not exists ix_user_accounts_email on user_accounts(email);
create index if not exists ix_user_accounts_status on user_accounts(status);
create index if not exists ix_user_accounts_created_at on user_accounts(created_at);
create index if not exists ix_user_accounts_last_login_at on user_accounts(last_login_at);

create table if not exists payments (
  id varchar(80) primary key,               -- Stripe invoice id
  owner_id uuid,
  amount integer not null default 0,         -- minor units
  currency varchar(8) not null default 'gbp',
  charge_id varchar(80),
  payment_intent_id varchar(80),
  refunded_amount integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ix_payments_owner_id on payments(owner_id);
create index if not exists ix_payments_created_at on payments(created_at);

create table if not exists knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  title varchar(200) not null,
  category varchar(40) not null default 'faq',
  body text not null,
  published boolean not null default true,
  updated_at timestamptz not null default now()
);
create index if not exists ix_knowledge_articles_category on knowledge_articles(category);
create index if not exists ix_knowledge_articles_published on knowledge_articles(published);

create table if not exists chat_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  visitor_token_hash varchar(64),
  status varchar(16) not null default 'open',
  escalated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_chat_conversations_owner_id on chat_conversations(owner_id);
create index if not exists ix_chat_conversations_status on chat_conversations(status);
create index if not exists ix_chat_conversations_escalated on chat_conversations(escalated);
create index if not exists ix_chat_conversations_created_at on chat_conversations(created_at);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  role varchar(16) not null,
  content text not null,
  meta json not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists ix_chat_messages_conversation_id on chat_messages(conversation_id);
create index if not exists ix_chat_messages_created_at on chat_messages(created_at);

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  ref varchar(16) not null unique,
  owner_id uuid,
  email varchar(255) not null default '',
  name varchar(160) not null default '',
  conversation_id uuid,
  category varchar(24) not null default 'general',
  subject varchar(200) not null,
  description text not null,
  status varchar(24) not null default 'open',
  assigned_to uuid,
  source varchar(16) not null default 'web',
  resolution text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists ix_support_tickets_ref on support_tickets(ref);
create index if not exists ix_support_tickets_owner_id on support_tickets(owner_id);
create index if not exists ix_support_tickets_category on support_tickets(category);
create index if not exists ix_support_tickets_status on support_tickets(status);
create index if not exists ix_support_tickets_assigned_to on support_tickets(assigned_to);
create index if not exists ix_support_tickets_created_at on support_tickets(created_at);

create table if not exists ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  author_type varchar(16) not null,
  author_id uuid,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists ix_ticket_messages_ticket_id on ticket_messages(ticket_id);

create table if not exists refund_requests (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  owner_id uuid,
  reason text not null,
  status varchar(16) not null default 'pending' check (status in ('pending','approved','rejected','refunded')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text not null default '',
  payment_id varchar(80),
  refund_id varchar(80),
  refund_amount integer,
  created_at timestamptz not null default now()
);
create index if not exists ix_refund_requests_ticket_id on refund_requests(ticket_id);
create index if not exists ix_refund_requests_owner_id on refund_requests(owner_id);
create index if not exists ix_refund_requests_status on refund_requests(status);
create index if not exists ix_refund_requests_created_at on refund_requests(created_at);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_type varchar(16) not null,
  action varchar(64) not null,
  target_type varchar(32) not null default '',
  target_id varchar(80) not null default '',
  detail json not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists ix_audit_logs_actor_id on audit_logs(actor_id);
create index if not exists ix_audit_logs_action on audit_logs(action);
create index if not exists ix_audit_logs_created_at on audit_logs(created_at);

create table if not exists email_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key varchar(160) not null unique,
  to_email varchar(255) not null,
  template varchar(48) not null,
  subject varchar(200) not null,
  html text not null,
  status varchar(24) not null default 'queued',
  attempts integer not null default 0,
  error text not null default '',
  provider_id varchar(80),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists ix_email_outbox_template on email_outbox(template);
create index if not exists ix_email_outbox_status on email_outbox(status);
create index if not exists ix_email_outbox_created_at on email_outbox(created_at);

create table if not exists error_logs (
  id uuid primary key default gen_random_uuid(),
  source varchar(32) not null,
  path varchar(300) not null default '',
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists ix_error_logs_source on error_logs(source);
create index if not exists ix_error_logs_created_at on error_logs(created_at);

-- Row Level Security
alter table user_accounts enable row level security;
alter table payments enable row level security;
alter table knowledge_articles enable row level security;
alter table chat_conversations enable row level security;
alter table chat_messages enable row level security;
alter table support_tickets enable row level security;
alter table ticket_messages enable row level security;
alter table refund_requests enable row level security;
alter table audit_logs enable row level security;
alter table email_outbox enable row level security;
alter table error_logs enable row level security;

-- Customers may read only their own rows; nothing is writable through the public API.
drop policy if exists user_accounts_own on user_accounts;
create policy user_accounts_own on user_accounts for select to authenticated using (owner_id = auth.uid());
drop policy if exists payments_own on payments;
create policy payments_own on payments for select to authenticated using (owner_id = auth.uid());
drop policy if exists support_tickets_own on support_tickets;
create policy support_tickets_own on support_tickets for select to authenticated using (owner_id = auth.uid());
drop policy if exists ticket_messages_own on ticket_messages;
create policy ticket_messages_own on ticket_messages for select to authenticated
  using (exists (select 1 from support_tickets t where t.id = ticket_id and t.owner_id = auth.uid()));
drop policy if exists chat_conversations_own on chat_conversations;
create policy chat_conversations_own on chat_conversations for select to authenticated using (owner_id = auth.uid());
drop policy if exists chat_messages_own on chat_messages;
create policy chat_messages_own on chat_messages for select to authenticated
  using (exists (select 1 from chat_conversations c where c.id = conversation_id and c.owner_id = auth.uid()));
drop policy if exists knowledge_public_read on knowledge_articles;
create policy knowledge_public_read on knowledge_articles for select to anon, authenticated using (published);
-- No policies on refund_requests, audit_logs, email_outbox, error_logs: not readable through the public API at all.
revoke select (visitor_token_hash) on chat_conversations from anon, authenticated;
revoke select (status_reason) on user_accounts from anon, authenticated;

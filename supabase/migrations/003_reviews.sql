-- TubeLead — customer reviews (homepage). Mirrors backend/app/models.py Review.
-- A review is private until an operator approves it. The backend writes reviews; the public may only read approved ones.

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  name varchar(120) not null,
  company varchar(160),
  role varchar(120),
  rating integer not null check (rating between 1 and 5),
  body text not null,
  email varchar(255),                       -- private: never returned by the public API
  status varchar(16) not null default 'pending' check (status in ('pending','approved','rejected')),
  verified boolean not null default false,  -- set by an operator only, after checking the customer
  photo_url text,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
create index if not exists ix_reviews_status on reviews(status);

alter table reviews enable row level security;
drop policy if exists reviews_public_read on reviews;
create policy reviews_public_read on reviews for select to anon, authenticated using (status = 'approved');
-- Email is never readable by the public, even on approved rows.
revoke select (email) on reviews from anon, authenticated;

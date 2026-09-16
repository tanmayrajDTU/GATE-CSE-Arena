-- ============================================================
-- GATE CSE PYQ Console — Supabase schema
-- Run this once in: Supabase dashboard → SQL Editor → New query
-- ============================================================

-- Bookmarked questions
create table if not exists public.bookmarks (
  user_id     uuid not null references auth.users(id) on delete cascade,
  subject     text not null,   -- subject slug, e.g. "discrete-mathematics"
  question_id text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, subject, question_id)
);

-- Per-question last outcome (drives subject progress bars / mastery)
create table if not exists public.question_outcomes (
  user_id     uuid not null references auth.users(id) on delete cascade,
  subject     text not null,
  question_id text not null,
  status      text not null check (status in ('correct', 'incorrect', 'skipped')),
  updated_at  timestamptz not null default now(),
  primary key (user_id, subject, question_id)
);

-- Completed test attempts (full detail kept as JSON, same shape the client already uses)
create table if not exists public.test_results (
  id                 text primary key,   -- client-generated id, e.g. "r172..."
  user_id            uuid not null references auth.users(id) on delete cascade,
  title              text not null,
  ts                 bigint not null,     -- client timestamp (ms since epoch)
  timed              boolean not null default false,
  total_seconds      integer,
  time_taken_seconds integer,
  auto_submitted     boolean not null default false,
  total              integer not null,
  correct            integer not null,
  wrong              integer not null,
  skipped            integer not null,
  items              jsonb not null,      -- [{id, subject, type, selected, correctAnswer, isCorrect, answered, flagged}, ...]
  created_at         timestamptz not null default now()
);

create index if not exists test_results_user_ts_idx on public.test_results (user_id, ts desc);

-- ------------------------------------------------------------
-- Row Level Security — every row is only visible/writable by
-- the user who owns it.
-- ------------------------------------------------------------
alter table public.bookmarks enable row level security;
alter table public.question_outcomes enable row level security;
alter table public.test_results enable row level security;

create policy "bookmarks: owner full access"
  on public.bookmarks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "question_outcomes: owner full access"
  on public.question_outcomes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "test_results: owner full access"
  on public.test_results for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Auth setup (do this in the dashboard, not SQL):
-- 1. Authentication → Providers → Email should already be enabled by default.
-- 2. Authentication → Providers → Email → "Confirm email" toggle:
--    - ON (default, more secure): after "Create account" the person must
--      click a confirmation link in their inbox before they can sign in.
--    - OFF: sign-up logs them straight in, no email step at all — simplest
--      for a personal study tool. Your call.
-- 3. This app uses plain email + password (no magic links), so no
--    Redirect URLs / Site URL configuration is required for auth to work.
-- ------------------------------------------------------------

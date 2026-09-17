-- ============================================================
-- IPON — schema additions (run in Supabase SQL Editor)
-- Run this AFTER the original schema.sql
-- ============================================================

-- Add flexible due date fields to recurring_bills
alter table recurring_bills
  add column if not exists due_schedule text not null default 'end_of_month'
    check (due_schedule in ('end_of_month','specific_days','per_cutoff','custom_date')),
  add column if not exists due_days integer[], -- e.g. [10, 15] for specific day(s)
  add column if not exists due_custom_date date; -- for one-off exact date

-- Food entries: one row per meal slot per day
create table if not exists food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  log_date date not null default current_date,
  breakfast text,
  brunch text,
  lunch text,
  merienda text,
  dinner text,
  extra text, -- extra meal + notes column
  created_at timestamptz default now(),
  unique (user_id, log_date)   -- one row per user per day
);

-- Mood entries: one row per day
create table if not exists mood_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  log_date date not null default current_date,
  mood text not null, -- emoji string e.g. '🙂'
  note text,
  created_at timestamptz default now(),
  unique (user_id, log_date)
);

-- RLS for food_entries
alter table food_entries enable row level security;

create policy "view own or buddy food"
  on food_entries for select
  using (auth.uid() = user_id or public.is_buddy(user_id));
create policy "insert own food"
  on food_entries for insert with check (auth.uid() = user_id);
create policy "update own food"
  on food_entries for update using (auth.uid() = user_id);
create policy "delete own food"
  on food_entries for delete using (auth.uid() = user_id);

-- RLS for mood_entries
alter table mood_entries enable row level security;

create policy "view own or buddy mood"
  on mood_entries for select
  using (auth.uid() = user_id or public.is_buddy(user_id));
create policy "insert own mood"
  on mood_entries for insert with check (auth.uid() = user_id);
create policy "update own mood"
  on mood_entries for update using (auth.uid() = user_id);
create policy "delete own mood"
  on mood_entries for delete using (auth.uid() = user_id);

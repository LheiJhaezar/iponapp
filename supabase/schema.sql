-- ============================================================
-- IPON — database schema
-- Run this whole file once in Supabase: Dashboard > SQL Editor > New query
-- ============================================================

-- Profiles: one row per user, mirrors auth.users, holds display name
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz default now()
);

-- Auto-create a profile row whenever someone signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Cutoffs: a pay period the user is tracking
create table cutoffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  target_amount numeric(12,2) not null default 0,
  created_at timestamptz default now()
);

-- Income entries: money logged into a cutoff
create table income_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  cutoff_id uuid not null references cutoffs(id) on delete cascade,
  amount numeric(12,2) not null,
  source text,
  note text,
  created_at timestamptz default now()
);

-- Allocations: how income was assigned within a cutoff
-- category: 'savings' | 'bills' | 'groceries' | 'other'
create table allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  cutoff_id uuid not null references cutoffs(id) on delete cascade,
  category text not null check (category in ('savings','bills','groceries','other')),
  amount numeric(12,2) not null,
  note text,
  bill_id uuid, -- optional link back to a recurring bill
  shared boolean default false,
  estimated boolean default false,
  created_at timestamptz default now()
);

-- Recurring bills: templates that auto-generate an allocation each cutoff
create table recurring_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  category text not null default 'bills',
  expected_amount numeric(12,2) not null,
  frequency text not null default 'monthly', -- 'monthly' | 'cutoff'
  shared boolean default false,
  icon text default '🧾',
  active boolean default true,
  created_at timestamptz default now()
);

alter table allocations
  add constraint allocations_bill_fk
  foreign key (bill_id) references recurring_bills(id) on delete set null;

-- Buddy links: pending/accepted connection between two users
create table buddy_links (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  addressee_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz default now(),
  unique (requester_id, addressee_id)
);

-- Helper: is `other_user` an accepted buddy of the current auth user?
create function public.is_buddy(other_user uuid)
returns boolean as $$
  select exists (
    select 1 from buddy_links
    where status = 'accepted'
      and (
        (requester_id = auth.uid() and addressee_id = other_user)
        or (addressee_id = auth.uid() and requester_id = other_user)
      )
  );
$$ language sql security definer stable;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table profiles enable row level security;
alter table cutoffs enable row level security;
alter table income_entries enable row level security;
alter table allocations enable row level security;
alter table recurring_bills enable row level security;
alter table buddy_links enable row level security;

-- Profiles: anyone signed in can view profiles (needed to look up buddies by email),
-- but can only edit their own
create policy "profiles are viewable by authenticated users"
  on profiles for select using (auth.role() = 'authenticated');
create policy "users update own profile"
  on profiles for update using (auth.uid() = id);

-- Cutoffs: own rows, or an accepted buddy's rows
create policy "view own or buddy cutoffs"
  on cutoffs for select using (auth.uid() = user_id or public.is_buddy(user_id));
create policy "manage own cutoffs"
  on cutoffs for insert with check (auth.uid() = user_id);
create policy "update own cutoffs"
  on cutoffs for update using (auth.uid() = user_id);
create policy "delete own cutoffs"
  on cutoffs for delete using (auth.uid() = user_id);

-- Income entries: same pattern
create policy "view own or buddy income"
  on income_entries for select using (auth.uid() = user_id or public.is_buddy(user_id));
create policy "insert own income"
  on income_entries for insert with check (auth.uid() = user_id);
create policy "update own income"
  on income_entries for update using (auth.uid() = user_id);
create policy "delete own income"
  on income_entries for delete using (auth.uid() = user_id);

-- Allocations: same pattern
create policy "view own or buddy allocations"
  on allocations for select using (auth.uid() = user_id or public.is_buddy(user_id));
create policy "insert own allocations"
  on allocations for insert with check (auth.uid() = user_id);
create policy "update own allocations"
  on allocations for update using (auth.uid() = user_id);
create policy "delete own allocations"
  on allocations for delete using (auth.uid() = user_id);

-- Recurring bills: same pattern
create policy "view own or buddy bills"
  on recurring_bills for select using (auth.uid() = user_id or public.is_buddy(user_id));
create policy "insert own bills"
  on recurring_bills for insert with check (auth.uid() = user_id);
create policy "update own bills"
  on recurring_bills for update using (auth.uid() = user_id);
create policy "delete own bills"
  on recurring_bills for delete using (auth.uid() = user_id);

-- Buddy links: visible to either side of the link; either side can update status
create policy "view own buddy links"
  on buddy_links for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "create buddy invite"
  on buddy_links for insert with check (auth.uid() = requester_id);
create policy "respond to buddy invite"
  on buddy_links for update
  using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "remove buddy link"
  on buddy_links for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

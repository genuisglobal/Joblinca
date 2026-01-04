-- Migration to add resume support tables and policies

-- Create resumes table for storing user‑authored CVs.  Each row
-- belongs to a single user via the auth.users table.  The
-- `data` column stores structured resume information in JSONB
-- format (name, contact details, experience, education, skills,
-- summary etc.) and `pdf_url` optionally points at a generated
-- PDF stored in Supabase Storage.  Timestamps are recorded for
-- auditing.
create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  pdf_url text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- Enable row level security on resumes.  Without RLS the table
-- would be open to any authenticated user.  These policies ensure
-- that users may only read and modify their own resumes while
-- administrators retain full access.
alter table public.resumes enable row level security;

drop policy if exists "Users manage own resumes" on public.resumes;
drop policy if exists "Admin manage resumes" on public.resumes;

-- Allow a user to perform any action on their own resume rows.
create policy "Users manage own resumes" on public.resumes
  for all
  using (auth.uid() = user_id);

-- Allow administrators to manage all resumes.  The admin role is
-- defined in the public.profiles table; when a user with role
-- 'admin' calls an operation the exists() subquery evaluates
-- to true, granting them full privileges.
create policy "Admin manage resumes" on public.resumes
  for all
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

-- Table to track how many resume optimisations a user performs
-- per day.  Premium plans may limit the number of AI calls
-- available.  Each row corresponds to a single calendar date for
-- a user.  The composite index on (user_id, date) prevents
-- duplicate entries.
create table if not exists public.resume_usage (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  used integer not null default 0,
  created_at timestamp with time zone not null default now(),
  constraint resume_usage_user_date_unique unique (user_id, date)
);

alter table public.resume_usage enable row level security;

drop policy if exists "User manage own resume usage" on public.resume_usage;
drop policy if exists "Admin manage resume usage" on public.resume_usage;

-- Users may read and update their own usage counters.  This policy
-- applies to all operations (select/update/insert) so that
-- clients can increment the counter safely via the API.
create policy "User manage own resume usage" on public.resume_usage
  for all
  using (auth.uid() = user_id);

-- Administrators may read and modify any usage records.
create policy "Admin manage resume usage" on public.resume_usage
  for all
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );
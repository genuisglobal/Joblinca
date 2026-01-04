-- Migration 004_auth_roles.sql
--
-- This migration introduces support for multiple user roles and recruiter types.
-- It defines custom enums for roles, recruiter types, verification statuses,
-- subscription tiers, job types and visibility.  It creates new role‑specific
-- profile tables (job_seekers, talents, recruiters) and auxiliary tables
-- (user_badges, capability_tests, capability_results).  It also backfills
-- existing profiles to the new `job_seeker` role when no role is present.

-- 1. Define enums for roles and other entities

create type if not exists public.role_enum as enum (
  'job_seeker',
  'talent',
  'recruiter',
  'vetting_officer',
  'verification_officer',
  'admin',
  'staff'
);

create type if not exists public.recruiter_type_enum as enum (
  'company_hr',
  'agency',
  'verified_individual',
  'institution'
);

create type if not exists public.verification_status_enum as enum (
  'unverified',
  'pending',
  'verified',
  'rejected'
);

create type if not exists public.tier_plan_enum as enum (
  'pay_per_post',
  'screened_shortlist',
  'full_hiring',
  'hr_partner_monthly'
);

create type if not exists public.job_type_enum as enum (
  'job',
  'internship',
  'gig'
);

create type if not exists public.visibility_enum as enum (
  'public',
  'talent_only'
);

-- 2. Alter profiles.role to use role_enum and backfill legacy roles

alter table if exists public.profiles
  alter column role type role_enum using (
    case role
      when 'candidate' then 'job_seeker'
      when 'candidate'::text then 'job_seeker'
      else role::role_enum
    end
  );

-- Ensure non‑null constraint still enforced
alter table if exists public.profiles
  alter column role set not null;

-- Backfill existing users without a profile: create default job_seeker profile row
-- Note: this runs safely on fresh databases because auth.users and profiles
-- exist; if no rows to insert the statement does nothing.
insert into public.profiles (id, full_name, role, created_at, updated_at)
select u.id, u.raw_user_meta_data->>'name' as full_name, 'job_seeker'::role_enum, now(), now()
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- 3. Create role‑specific profile tables

create table if not exists public.job_seeker_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  resume_url text,
  career_info jsonb,
  location text,
  headline text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.talent_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  school_status text,
  portfolio jsonb,
  internship_eligible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recruiter_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  recruiter_type recruiter_type_enum not null,
  verification_status verification_status_enum not null default 'unverified',
  tier_plan tier_plan_enum not null default 'pay_per_post',
  company_name text,
  contact_email text,
  contact_phone text,
  id_document_metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. User badges and capability tests/results tables

create table if not exists public.user_badges (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_type text not null,
  badge_level text not null,
  issued_at timestamptz not null default now()
);

create table if not exists public.capability_tests (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  category text,
  difficulty text,
  price_job_seeker numeric,
  free_for_talent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.capability_results (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  test_id uuid not null references public.capability_tests (id) on delete cascade,
  score numeric,
  passed boolean,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Extend jobs table for job_type and visibility and record applicant_role in applications

alter table if exists public.jobs
  add column if not exists job_type job_type_enum not null default 'job';

alter table if exists public.jobs
  add column if not exists visibility visibility_enum not null default 'public';

alter table if exists public.applications
  add column if not exists applicant_role role_enum;

-- 6. RLS policies for new tables

-- Enable RLS on new tables
alter table public.job_seeker_profiles enable row level security;
alter table public.talent_profiles enable row level security;
alter table public.recruiter_profiles enable row level security;
alter table public.user_badges enable row level security;
alter table public.capability_tests enable row level security;
alter table public.capability_results enable row level security;

-- Policies for job_seeker_profiles
drop policy if exists "job_seeker_self" on public.job_seeker_profiles;
create policy "job_seeker_select" on public.job_seeker_profiles
  for select
  using (auth.uid() = user_id or
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','staff')));

create policy "job_seeker_insert" on public.job_seeker_profiles
  for insert
  with check (auth.uid() = user_id);

create policy "job_seeker_update" on public.job_seeker_profiles
  for update
  using (auth.uid() = user_id);

-- Policies for talent_profiles
drop policy if exists "talent_select" on public.talent_profiles;
create policy "talent_select" on public.talent_profiles
  for select
  using (auth.uid() = user_id or
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','staff')));

create policy "talent_insert" on public.talent_profiles
  for insert
  with check (auth.uid() = user_id);

create policy "talent_update" on public.talent_profiles
  for update
  using (auth.uid() = user_id);

-- Policies for recruiter_profiles
drop policy if exists "recruiter_select" on public.recruiter_profiles;
create policy "recruiter_select" on public.recruiter_profiles
  for select
  using (auth.uid() = user_id or
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','staff')));

create policy "recruiter_insert" on public.recruiter_profiles
  for insert
  with check (auth.uid() = user_id);

create policy "recruiter_update" on public.recruiter_profiles
  for update
  using (auth.uid() = user_id);

-- Policies for user_badges
create policy if not exists "user_badges_select" on public.user_badges
  for select
  using (auth.uid() = user_id or
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','staff')));

create policy if not exists "user_badges_insert" on public.user_badges
  for insert
  with check (auth.uid() = user_id);

-- Policies for capability_tests
create policy if not exists "capability_tests_select" on public.capability_tests
  for select
  using (true);

-- Policies for capability_results
create policy if not exists "capability_results_select" on public.capability_results
  for select
  using (auth.uid() = user_id or
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','staff')));

create policy if not exists "capability_results_insert" on public.capability_results
  for insert
  with check (auth.uid() = user_id);

-- 7. Policies for jobs visibility (talent_only)

-- Anyone can see public jobs
create policy if not exists "jobs_select_public" on public.jobs
  for select
  using (visibility = 'public');

-- Only talents can see talent_only jobs
create policy if not exists "jobs_select_talent_only" on public.jobs
  for select
  using (
    visibility = 'talent_only' and
    exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'talent'
    )
  );

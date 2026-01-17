-- ============================================================================
-- COMBINED JOBLINCA MIGRATIONS
-- Run this entire file in Supabase SQL Editor (Dashboard -> SQL Editor)
-- This is idempotent - safe to run multiple times
-- ============================================================================

-- ============================================================================
-- MIGRATION 1: INITIAL SCHEMA (000_initial.sql)
-- ============================================================================

-- Enable UUID generation extension
create extension if not exists "uuid-ossp";

-- Users are managed by supabase.auth.users. Additional profile information is stored in the profiles table.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'candidate' check (role in ('candidate','recruiter','admin','vetting_officer','verification_officer')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recruiters (
  id uuid primary key references public.profiles (id) on delete cascade,
  company_name text not null,
  company_description text,
  website text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default uuid_generate_v4(),
  recruiter_id uuid not null references public.recruiters (id) on delete cascade,
  title text not null,
  description text not null,
  location text,
  salary numeric,
  custom_questions jsonb,
  external_url text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  cover_letter text,
  answers jsonb,
  status text not null default 'submitted' check (status in ('submitted','shortlisted','interviewed','hired','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vetting_requests (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  recruiter_id uuid not null references public.recruiters (id) on delete cascade,
  package text not null check (package in ('basic','standard','premium')),
  status text not null default 'pending' check (status in ('pending','in_review','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vetting_results (
  id uuid primary key default uuid_generate_v4(),
  vetting_request_id uuid not null references public.vetting_requests (id) on delete cascade,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  score numeric,
  result jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default uuid_generate_v4(),
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text,
  file_urls jsonb,
  github_url text,
  youtube_url text,
  category text,
  tags text[],
  public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tests (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  category text,
  questions jsonb not null,
  practical boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.test_attempts (
  id uuid primary key default uuid_generate_v4(),
  test_id uuid not null references public.tests (id) on delete cascade,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  answers jsonb,
  score numeric,
  status text not null default 'in_progress' check (status in ('in_progress','completed','graded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.certifications (
  id uuid primary key default uuid_generate_v4(),
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  test_id uuid not null references public.tests (id) on delete cascade,
  badge text not null check (badge in ('bronze','silver','gold','platinum')),
  certificate_url text,
  qr_code text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.verifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  id_document_url text,
  selfie_url text,
  certificates jsonb,
  employer_reference text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric not null,
  currency text not null default 'XAF',
  description text,
  status text not null default 'pending' check (status in ('pending','completed','failed')),
  provider text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  status text not null default 'active' check (status in ('active','inactive','cancelled')),
  start_date date not null default (current_date),
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles (id) on delete set null,
  phone text not null,
  message text not null,
  direction text not null check (direction in ('inbound','outbound')),
  status text,
  created_at timestamptz not null default now()
);

create table if not exists public.sms_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles (id) on delete set null,
  phone text not null,
  message text not null,
  status text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_actions (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  target_table text,
  target_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security (RLS) on tables
alter table public.profiles enable row level security;
alter table public.recruiters enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
alter table public.vetting_requests enable row level security;
alter table public.vetting_results enable row level security;
alter table public.projects enable row level security;
alter table public.tests enable row level security;
alter table public.test_attempts enable row level security;
alter table public.certifications enable row level security;
alter table public.verifications enable row level security;
alter table public.transactions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.whatsapp_logs enable row level security;
alter table public.sms_logs enable row level security;
alter table public.admin_actions enable row level security;

-- ============================================================================
-- MIGRATION 2: EXTERNAL JOBS (002_external_jobs_and_jobs_update.sql)
-- ============================================================================

create table if not exists public.external_jobs (
  id uuid primary key default uuid_generate_v4(),
  external_id text,
  source text not null,
  title text not null,
  company_name text,
  company_logo text,
  location text,
  salary text,
  job_type text,
  category text,
  description text,
  url text not null,
  fetched_at timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

alter table public.external_jobs enable row level security;

-- Jobs Table Enhancements
alter table if exists public.jobs
  add column if not exists company_name text,
  add column if not exists company_logo_url text,
  add column if not exists work_type text default 'onsite',
  add column if not exists image_url text;

-- ============================================================================
-- MIGRATION 3: RESUMES (003_resumes.sql)
-- ============================================================================

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  pdf_url text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.resumes enable row level security;

create table if not exists public.resume_usage (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  used integer not null default 0,
  created_at timestamp with time zone not null default now(),
  constraint resume_usage_user_date_unique unique (user_id, date)
);

alter table public.resume_usage enable row level security;

-- ============================================================================
-- MIGRATION 4: AUTH ROLES (004_auth_roles.sql)
-- ============================================================================

-- Create enums if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_enum') THEN
    CREATE TYPE public.role_enum AS ENUM (
      'job_seeker', 'talent', 'recruiter', 'vetting_officer', 'verification_officer', 'admin', 'staff'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recruiter_type_enum') THEN
    CREATE TYPE public.recruiter_type_enum AS ENUM (
      'company_hr', 'agency', 'verified_individual', 'institution'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_status_enum') THEN
    CREATE TYPE public.verification_status_enum AS ENUM (
      'unverified', 'pending', 'verified', 'rejected'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tier_plan_enum') THEN
    CREATE TYPE public.tier_plan_enum AS ENUM (
      'pay_per_post', 'screened_shortlist', 'full_hiring', 'hr_partner_monthly'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_type_enum') THEN
    CREATE TYPE public.job_type_enum AS ENUM ('job', 'internship', 'gig');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'visibility_enum') THEN
    CREATE TYPE public.visibility_enum AS ENUM ('public', 'talent_only');
  END IF;
END $$;

-- Create role-specific profile tables
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
  recruiter_type public.recruiter_type_enum,
  verification_status public.verification_status_enum default 'unverified',
  tier_plan public.tier_plan_enum default 'pay_per_post',
  company_name text,
  contact_email text,
  contact_phone text,
  id_document_metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- Enable RLS on new tables
alter table public.job_seeker_profiles enable row level security;
alter table public.talent_profiles enable row level security;
alter table public.recruiter_profiles enable row level security;
alter table public.user_badges enable row level security;
alter table public.capability_tests enable row level security;
alter table public.capability_results enable row level security;

-- ============================================================================
-- MIGRATION 5: PROFILE FIELDS (005_profile_fields.sql)
-- ============================================================================

alter table if exists public.profiles
  add column if not exists profile_image_url text;

alter table if exists public.profiles
  add column if not exists sex text;

-- ============================================================================
-- MIGRATION 6: ONBOARDING ENHANCEMENTS (007_onboarding_enhancements.sql)
-- ============================================================================

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT;

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS last_name TEXT;

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS residence_location TEXT;

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_skipped BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.job_seeker_profiles
  ADD COLUMN IF NOT EXISTS location_interests JSONB DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.talent_profiles
  ADD COLUMN IF NOT EXISTS school_name TEXT;

ALTER TABLE IF EXISTS public.talent_profiles
  ADD COLUMN IF NOT EXISTS graduation_year INTEGER;

ALTER TABLE IF EXISTS public.talent_profiles
  ADD COLUMN IF NOT EXISTS field_of_study TEXT;

ALTER TABLE IF EXISTS public.talent_profiles
  ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.talent_profiles
  ADD COLUMN IF NOT EXISTS location_interests JSONB DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.talent_profiles
  ADD COLUMN IF NOT EXISTS resume_url TEXT;

ALTER TABLE IF EXISTS public.recruiter_profiles
  ADD COLUMN IF NOT EXISTS company_logo_url TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_onboarding
ON public.profiles (onboarding_completed, onboarding_skipped);

-- ============================================================================
-- MIGRATION 7: ADMIN SYSTEM (009_admin_system.sql)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_type') THEN
    CREATE TYPE public.admin_type AS ENUM (
      'super', 'operations', 'support', 'recruiter_admin', 'ai'
    );
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_type public.admin_type DEFAULT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_granted_at timestamptz DEFAULT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_granted_by uuid DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_admin_type
  ON public.profiles(admin_type)
  WHERE admin_type IS NOT NULL;

-- Admin helper functions
CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND admin_type IN ('super', 'operations')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND admin_type = 'super'
  );
$$;

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  action text NOT NULL,
  admin_id uuid NOT NULL REFERENCES public.profiles(id),
  admin_type public.admin_type NOT NULL,
  target_table text,
  target_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_id
  ON public.admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
  ON public.admin_audit_log(created_at DESC);

-- ============================================================================
-- RLS POLICIES (Combined from multiple migrations)
-- ============================================================================

-- Drop existing policies first (safe to run even if they don't exist)
drop policy if exists "Self profile select" on public.profiles;
drop policy if exists "Self profile update" on public.profiles;
drop policy if exists "Profile select self" on public.profiles;
drop policy if exists "Profile update self" on public.profiles;
drop policy if exists "Admin read all profiles" on public.profiles;
drop policy if exists "profiles_select_own_or_admin" on public.profiles;

-- Profiles policies
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (auth.uid() = id OR public.is_active_admin());

create policy "Profile update self" on public.profiles
  for update to authenticated using (auth.uid() = id);

-- Recruiters policies
drop policy if exists "Own recruiter select" on public.recruiters;
drop policy if exists "Recruiter select self" on public.recruiters;
drop policy if exists "Recruiter insert self" on public.recruiters;
drop policy if exists "Recruiter update self" on public.recruiters;
drop policy if exists "Admin manage recruiters" on public.recruiters;

create policy "Recruiter select self" on public.recruiters
  for select to authenticated using (auth.uid() = id);

create policy "Recruiter insert self" on public.recruiters
  for insert to authenticated with check (auth.uid() = id);

create policy "Recruiter update self" on public.recruiters
  for update to authenticated using (auth.uid() = id);

create policy "Admin manage recruiters" on public.recruiters
  for all to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

-- Jobs policies
drop policy if exists "Published jobs are public" on public.jobs;
drop policy if exists "Recruiter manage own jobs" on public.jobs;
drop policy if exists "Recruiter select own jobs" on public.jobs;
drop policy if exists "Recruiter update own jobs" on public.jobs;
drop policy if exists "Recruiter delete own jobs" on public.jobs;

create policy "Published jobs are public" on public.jobs
  for select to anon, authenticated using (published = true);

create policy "Recruiter select own jobs" on public.jobs
  for select to authenticated using (auth.uid() = recruiter_id);

create policy "Recruiter manage own jobs" on public.jobs
  for insert to authenticated with check (auth.uid() = recruiter_id);

create policy "Recruiter update own jobs" on public.jobs
  for update to authenticated
  using (auth.uid() = recruiter_id)
  with check (auth.uid() = recruiter_id);

create policy "Recruiter delete own jobs" on public.jobs
  for delete to authenticated using (auth.uid() = recruiter_id);

-- Applications policies
drop policy if exists "Applicant create application" on public.applications;
drop policy if exists "Applicant read own application" on public.applications;
drop policy if exists "Recruiter read applications for their jobs" on public.applications;
drop policy if exists "Recruiter update application status for their jobs" on public.applications;

create policy "Applicant create application" on public.applications
  for insert to authenticated with check (auth.uid() = applicant_id);

create policy "Applicant read own application" on public.applications
  for select to authenticated using (auth.uid() = applicant_id);

create policy "Recruiter read applications for their jobs" on public.applications
  for select to authenticated
  using (exists (select 1 from public.jobs j where j.id = applications.job_id and j.recruiter_id = auth.uid()));

create policy "Recruiter update application status for their jobs" on public.applications
  for update to authenticated
  using (exists (select 1 from public.jobs j where j.id = applications.job_id and j.recruiter_id = auth.uid()));

-- Projects policies
drop policy if exists "Public projects readable" on public.projects;
drop policy if exists "Owner manage project" on public.projects;

create policy "Public projects readable" on public.projects
  for select to anon, authenticated using (public.projects.public = true);

create policy "Owner manage project" on public.projects
  for all to authenticated
  using (auth.uid() = candidate_id)
  with check (auth.uid() = candidate_id);

-- External jobs policies
drop policy if exists "Read external jobs" on public.external_jobs;
drop policy if exists "Admin manage external jobs" on public.external_jobs;

create policy "Read external jobs" on public.external_jobs
  for select using (true);

create policy "Admin manage external jobs" on public.external_jobs
  for all using (public.is_active_admin());

-- Resumes policies
drop policy if exists "Users manage own resumes" on public.resumes;
drop policy if exists "Admin manage resumes" on public.resumes;

create policy "Users manage own resumes" on public.resumes
  for all using (auth.uid() = user_id);

create policy "Admin manage resumes" on public.resumes
  for all using (public.is_active_admin());

-- Resume usage policies
drop policy if exists "User manage own resume usage" on public.resume_usage;
drop policy if exists "Admin manage resume usage" on public.resume_usage;

create policy "User manage own resume usage" on public.resume_usage
  for all using (auth.uid() = user_id);

create policy "Admin manage resume usage" on public.resume_usage
  for all using (public.is_active_admin());

-- Job seeker profiles policies
drop policy if exists "job_seeker_select" on public.job_seeker_profiles;
drop policy if exists "job_seeker_insert" on public.job_seeker_profiles;
drop policy if exists "job_seeker_update" on public.job_seeker_profiles;

create policy "job_seeker_select" on public.job_seeker_profiles
  for select using (auth.uid() = user_id OR public.is_active_admin());

create policy "job_seeker_insert" on public.job_seeker_profiles
  for insert with check (auth.uid() = user_id);

create policy "job_seeker_update" on public.job_seeker_profiles
  for update using (auth.uid() = user_id);

-- Talent profiles policies
drop policy if exists "talent_select" on public.talent_profiles;
drop policy if exists "talent_insert" on public.talent_profiles;
drop policy if exists "talent_update" on public.talent_profiles;

create policy "talent_select" on public.talent_profiles
  for select using (auth.uid() = user_id OR public.is_active_admin());

create policy "talent_insert" on public.talent_profiles
  for insert with check (auth.uid() = user_id);

create policy "talent_update" on public.talent_profiles
  for update using (auth.uid() = user_id);

-- Recruiter profiles policies
drop policy if exists "recruiter_select" on public.recruiter_profiles;
drop policy if exists "recruiter_insert" on public.recruiter_profiles;
drop policy if exists "recruiter_update" on public.recruiter_profiles;

create policy "recruiter_select" on public.recruiter_profiles
  for select using (auth.uid() = user_id OR public.is_active_admin());

create policy "recruiter_insert" on public.recruiter_profiles
  for insert with check (auth.uid() = user_id);

create policy "recruiter_update" on public.recruiter_profiles
  for update using (auth.uid() = user_id);

-- Admin audit log policy
drop policy if exists "admin_audit_log_super_only" on public.admin_audit_log;

create policy "admin_audit_log_super_only" on public.admin_audit_log
  for select using (public.is_super_admin());

-- ============================================================================
-- DONE! All migrations applied successfully.
-- ============================================================================

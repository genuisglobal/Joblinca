-- 002_external_jobs_and_jobs_update.sql
--
-- Migration to add a table for global opportunities (external jobs) and
-- extend the existing jobs table with additional fields required for the
-- improved posting flow.  This migration should run after the initial
-- schema and RLS policies have been applied.  It is idempotent so it
-- will not fail if run multiple times on a fresh database.

-- Enable the uuid-ossp extension if it isn't already enabled.  This
-- extension provides the uuid_generate_v4() function used for primary keys.
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- External Jobs Table
-- ---------------------------------------------------------------------------

-- Create a table to store job listings sourced from external providers such
-- as Remotive, Jobicy, Findwork and others.  These jobs are fetched by a
-- scheduled agent and made available for browsing and filtering.  Each row
-- records the source of the job and the identifier provided by that source.
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

-- Enforce Row Level Security on the external_jobs table.  By default no
-- access is permitted until policies are defined.  We allow public read
-- access but restrict insert/update/delete to administrators.
alter table public.external_jobs enable row level security;

-- Allow any authenticated or anonymous user to read external jobs.
create policy if not exists "Read external jobs" on public.external_jobs
  for select
  using (true);

-- Allow administrators to perform any action on external jobs (e.g. insert,
-- update or delete).  This relies on the profiles table containing a
-- role column with the value 'admin' for administrators.
create policy if not exists "Admin manage external jobs" on public.external_jobs
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- Jobs Table Enhancements
-- ---------------------------------------------------------------------------

-- Extend the existing jobs table with additional columns for the
-- improved posting experience.  These columns are added only if they do not
-- already exist.  company_name stores the employer name; company_logo_url
-- stores a URL to the employer's logo in Supabase Storage or externally;
-- work_type indicates whether the job is remote, hybrid or onsite;
-- image_url stores a URL to a generated job card image used when
-- forwarding the job via WhatsApp or SMS.
alter table if exists public.jobs
  add column if not exists company_name text,
  add column if not exists company_logo_url text,
  add column if not exists work_type text default 'onsite',
  add column if not exists image_url text;
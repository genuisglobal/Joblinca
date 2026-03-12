-- Job reports: allows any authenticated user to flag a job posting.
-- Admins review reports from the /admin/reports page.

create type public.report_reason_enum as enum (
  'scam',
  'misleading',
  'duplicate',
  'offensive',
  'wrong_info',
  'other'
);

create type public.report_status_enum as enum (
  'pending',
  'reviewed',
  'dismissed',
  'actioned'
);

create table if not exists public.job_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason report_reason_enum not null,
  description text,
  status report_status_enum not null default 'pending',
  admin_notes text,
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_job_reports_job_id on public.job_reports (job_id);
create index idx_job_reports_status on public.job_reports (status);
create index idx_job_reports_created_at on public.job_reports (created_at desc);

-- Prevent duplicate reports: one report per user per job
create unique index idx_job_reports_unique_per_user on public.job_reports (job_id, reporter_id);

-- Scam score column on jobs table for automated detection
alter table public.jobs add column if not exists scam_score smallint default 0;

-- RLS
alter table public.job_reports enable row level security;

-- Users can insert their own reports
create policy "Users can create reports"
  on public.job_reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- Users can read their own reports
create policy "Users can read own reports"
  on public.job_reports for select
  to authenticated
  using (reporter_id = auth.uid());

-- Service role (admin API) has full access
create policy "Service role full access"
  on public.job_reports for all
  to service_role
  using (true)
  with check (true);

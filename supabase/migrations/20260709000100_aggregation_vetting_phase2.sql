-- Phase 2 of the aggregation vetting pipeline:
--   1. AI vetting fields + rejection provenance on discovered_jobs
--   2. company_reputation registry (repeat offenders / verified employers)
-- (job_reports already exists — 20260309000100_job_reports.sql — and is
--  wired into this loop in application code.)

-- ── 1. discovered_jobs: AI vetting + rejection fields ────────────────────────

alter table public.discovered_jobs
  add column if not exists ai_scam_probability integer,
  add column if not exists ai_vetting_json jsonb,
  add column if not exists ai_vetted_at timestamptz,
  add column if not exists rejected_reason text,
  add column if not exists rejected_note text;

-- Fast lookup of the not-yet-vetted backlog
create index if not exists idx_discovered_jobs_ai_pending
  on public.discovered_jobs (discovered_at desc)
  where ai_vetted_at is null;

-- ── 2. company_reputation ────────────────────────────────────────────────────

create table if not exists public.company_reputation (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null unique,
  display_name text,
  -- verified: trusted employer (admin-set, never auto-changed)
  -- neutral:  default
  -- watch:    repeat rejections — jobs go to manual review instead of auto-publish
  -- blocked:  known scammer — jobs are never auto-published
  status text not null default 'neutral'
    check (status in ('verified', 'neutral', 'watch', 'blocked')),
  scam_reports integer not null default 0,
  rejections integer not null default 0,
  published_jobs integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_reputation enable row level security;

drop policy if exists "Admins manage company reputation" on public.company_reputation;
create policy "Admins manage company reputation" on public.company_reputation
  for all
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );


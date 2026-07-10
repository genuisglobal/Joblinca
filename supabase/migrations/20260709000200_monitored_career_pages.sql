-- Phase 3 aggregation: monitored company career pages.
--
-- Admins register career-page URLs of major Cameroonian employers (banks,
-- telecoms, NGOs, UN agencies, government portals). The 'careerpages'
-- scraper source fetches each page and uses LLM extraction to find postings,
-- feeding them into the same discovered_jobs pipeline as every other source.
-- Adding a source becomes configuration, not code.

create table if not exists public.monitored_career_pages (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  url text not null unique,
  enabled boolean not null default true,
  notes text,
  last_checked_at timestamptz,
  last_jobs_found integer not null default 0,
  consecutive_failures integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_monitored_career_pages_due
  on public.monitored_career_pages (last_checked_at asc nulls first)
  where enabled = true;

alter table public.monitored_career_pages enable row level security;

drop policy if exists "Admins manage monitored career pages" on public.monitored_career_pages;
create policy "Admins manage monitored career pages" on public.monitored_career_pages
  for all
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

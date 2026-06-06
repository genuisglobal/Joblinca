create table if not exists public.recruiter_candidate_outreach_events (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references public.profiles (id) on delete cascade,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid references public.messages (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  channel text not null check (channel in ('joblinca_message')),
  source text not null check (source in ('candidate_search', 'candidate_detail')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_recruiter_candidate_outreach_events_recruiter_candidate
  on public.recruiter_candidate_outreach_events (recruiter_id, candidate_id, created_at desc);

create index if not exists idx_recruiter_candidate_outreach_events_candidate
  on public.recruiter_candidate_outreach_events (candidate_id, created_at desc);

alter table public.recruiter_candidate_outreach_events enable row level security;

drop policy if exists "Recruiters can read their own outreach events"
  on public.recruiter_candidate_outreach_events;
create policy "Recruiters can read their own outreach events"
  on public.recruiter_candidate_outreach_events for select
  using (auth.uid() = recruiter_id);

drop policy if exists "Recruiters can create their own outreach events"
  on public.recruiter_candidate_outreach_events;
create policy "Recruiters can create their own outreach events"
  on public.recruiter_candidate_outreach_events for insert
  with check (auth.uid() = recruiter_id);

drop policy if exists "Active admins can read recruiter outreach events"
  on public.recruiter_candidate_outreach_events;
create policy "Active admins can read recruiter outreach events"
  on public.recruiter_candidate_outreach_events for select
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.admin_type in ('super', 'operations')
    )
  );

drop policy if exists "Service role full access recruiter outreach events"
  on public.recruiter_candidate_outreach_events;
create policy "Service role full access recruiter outreach events"
  on public.recruiter_candidate_outreach_events for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Vetting queue: turn paid Shortlist Service purchases into officer work items.
--
-- Until now a paid shortlist only set jobs.hiring_tier = 'tier2_shortlist';
-- nothing created a work item and vetting_results was never written. This
-- migration gives vetting_requests an SLA clock, an owner and a delivery
-- state, gives vetting_results a rank and officer note, backfills jobs that
-- were already paid for, and narrows the client policies so a shortlist can
-- only be created (and results only written) server-side.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- vetting_requests
-- ---------------------------------------------------------------------------
alter table public.vetting_requests
  add column if not exists source text not null default 'manual',
  add column if not exists transaction_id uuid references public.transactions (id) on delete set null,
  add column if not exists assigned_to uuid references public.profiles (id) on delete set null,
  add column if not exists due_at timestamptz,
  add column if not exists shortlist_size int not null default 5,
  add column if not exists officer_notes text,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivered_by uuid references public.profiles (id) on delete set null,
  add column if not exists cancelled_reason text;

alter table public.vetting_requests drop constraint if exists vetting_requests_status_check;
alter table public.vetting_requests
  add constraint vetting_requests_status_check
  check (status in ('pending', 'in_review', 'delivered', 'completed', 'cancelled'));

alter table public.vetting_requests drop constraint if exists vetting_requests_source_check;
alter table public.vetting_requests
  add constraint vetting_requests_source_check
  check (source in ('payment', 'manual', 'free_trial', 'backfill'));

alter table public.vetting_requests drop constraint if exists vetting_requests_shortlist_size_check;
alter table public.vetting_requests
  add constraint vetting_requests_shortlist_size_check
  check (shortlist_size between 1 and 20);

-- One request per payment (makes webhook + status-poll finalisation idempotent).
create unique index if not exists vetting_requests_transaction_uidx
  on public.vetting_requests (transaction_id)
  where transaction_id is not null;

-- At most one open request per job.
create unique index if not exists vetting_requests_open_job_uidx
  on public.vetting_requests (job_id)
  where status in ('pending', 'in_review');

create index if not exists vetting_requests_queue_idx
  on public.vetting_requests (status, due_at);

-- ---------------------------------------------------------------------------
-- vetting_results
-- ---------------------------------------------------------------------------
alter table public.vetting_results
  add column if not exists application_id uuid references public.applications (id) on delete set null,
  add column if not exists rank int,
  add column if not exists officer_note text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists vetting_results_request_candidate_uidx
  on public.vetting_results (vetting_request_id, candidate_id);

-- ---------------------------------------------------------------------------
-- Backfill: jobs already paid for with no request yet.
-- ---------------------------------------------------------------------------
insert into public.vetting_requests
  (job_id, recruiter_id, package, status, source, transaction_id, due_at)
select
  j.id,
  j.recruiter_id,
  'basic',
  'pending',
  'backfill',
  j.tier_transaction_id,
  now() + interval '72 hours'
from public.jobs j
where j.hiring_tier = 'tier2_shortlist'
  and j.removed_at is null
  and not exists (
    select 1 from public.vetting_requests vr where vr.job_id = j.id
  )
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Policies: reads only from the client; all writes go through the
-- service-role API after an admin check.
-- ---------------------------------------------------------------------------
alter table public.vetting_requests enable row level security;
alter table public.vetting_results enable row level security;

-- Was `for all`: recruiters could insert requests (a free shortlist) or
-- rewrite their own request's status.
drop policy if exists "Recruiter manage own vetting requests" on public.vetting_requests;
drop policy if exists "Recruiter read own vetting requests" on public.vetting_requests;
create policy "Recruiter read own vetting requests" on public.vetting_requests
  for select
  using (auth.uid() = recruiter_id);

-- Was `for all`: anyone holding the vetting_officer role could write results.
drop policy if exists "Vetting officers manage vetting results" on public.vetting_results;
drop policy if exists "Vetting officers read vetting results" on public.vetting_results;
create policy "Vetting officers read vetting results" on public.vetting_results
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'vetting_officer'
    )
  );

-- Recruiters only see a shortlist once it has been delivered, not drafts.
drop policy if exists "Recruiter read vetting results for own jobs" on public.vetting_results;
create policy "Recruiter read vetting results for own jobs" on public.vetting_results
  for select
  using (
    exists (
      select 1
      from public.vetting_requests vr
      join public.jobs j on j.id = vr.job_id
      where vr.id = vetting_request_id
        and j.recruiter_id = auth.uid()
        and vr.status in ('delivered', 'completed')
    )
  );

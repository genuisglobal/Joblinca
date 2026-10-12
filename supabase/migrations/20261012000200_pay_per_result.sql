-- Pay-per-result and success fees for the Shortlist Service.
--
-- - pricing plan job_tier2_pay_per_result: 15,000 FCFA deposit, balance only
--   if the employer hires a shortlisted candidate;
-- - vetting_requests.billing_model says what a hire from the shortlist costs;
-- - shortlist_hires records every confirmed hire of an introduced candidate
--   (the KPI) and any fee it triggers, which the recruiter pays by MoMo.
--
-- Run after 20261012000100_vetting_queue.sql. Idempotent.

-- ---------------------------------------------------------------------------
-- Plan
-- ---------------------------------------------------------------------------
insert into public.pricing_plans
  (slug, name, description, role, plan_type, amount_xaf, duration_days, features, is_active, sort_order)
values (
  'job_tier2_pay_per_result',
  'Pay only if you hire',
  'Deposit now; the balance is due only if you hire someone from your shortlist',
  'recruiter',
  'per_job',
  15000,
  null,
  '["Ranked shortlist of screened candidates within 72 hours", "15,000 FCFA deposit now", "70,000 FCFA balance only if you hire from the shortlist"]'::jsonb,
  true,
  25
)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Billing model on requests
-- ---------------------------------------------------------------------------
alter table public.vetting_requests
  add column if not exists billing_model text not null default 'prepaid',
  add column if not exists success_fee_percent numeric;

alter table public.vetting_requests drop constraint if exists vetting_requests_billing_model_check;
alter table public.vetting_requests
  add constraint vetting_requests_billing_model_check
  check (billing_model in ('prepaid', 'pay_per_result', 'success_fee', 'free'));

alter table public.vetting_requests drop constraint if exists vetting_requests_success_fee_percent_check;
alter table public.vetting_requests
  add constraint vetting_requests_success_fee_percent_check
  check (success_fee_percent is null or (success_fee_percent > 0 and success_fee_percent <= 100));

update public.vetting_requests
set billing_model = 'free'
where source = 'free_trial' and billing_model = 'prepaid';

-- ---------------------------------------------------------------------------
-- Hires and fees
-- ---------------------------------------------------------------------------
create table if not exists public.shortlist_hires (
  id uuid primary key default gen_random_uuid(),
  vetting_request_id uuid not null references public.vetting_requests (id) on delete cascade,
  recruiter_id uuid not null references public.recruiters (id) on delete cascade,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  -- The application the candidate was hired through; may be for a different
  -- job than the shortlist (the 6-month clause covers any of the employer's roles).
  application_id uuid references public.applications (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  hired_at date not null default current_date,
  detected_by text not null check (detected_by in ('officer', 'recruiter_decision')),
  billing_model text not null check (billing_model in ('prepaid', 'pay_per_result', 'success_fee', 'free')),
  fee_type text check (fee_type in ('pay_per_result_balance', 'success_fee')),
  monthly_salary_xaf integer check (monthly_salary_xaf is null or monthly_salary_xaf > 0),
  amount_xaf integer check (amount_xaf is null or amount_xaf > 0),
  status text not null check (status in ('no_fee', 'needs_review', 'due', 'paid', 'waived')),
  transaction_id uuid references public.transactions (id) on delete set null,
  paid_at timestamptz,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shortlist_hires_due_has_amount check (status not in ('due', 'paid') or amount_xaf is not null)
);

-- One hire record per introduced candidate per shortlist.
create unique index if not exists shortlist_hires_request_candidate_uidx
  on public.shortlist_hires (vetting_request_id, candidate_id);

create index if not exists shortlist_hires_recruiter_idx
  on public.shortlist_hires (recruiter_id, status);

alter table public.shortlist_hires enable row level security;

-- Recruiters read their own hires and fees; all writes are server-side.
drop policy if exists "Recruiter read own shortlist hires" on public.shortlist_hires;
create policy "Recruiter read own shortlist hires" on public.shortlist_hires
  for select
  using (auth.uid() = recruiter_id);

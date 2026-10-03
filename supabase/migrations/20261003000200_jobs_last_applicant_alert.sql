-- ============================================================================
-- Throttle for WhatsApp new-applicant alerts to recruiters
-- (lib/jobs/new-applicant-alert.ts).
--
-- One alert per job per 6 hours, claimed with a conditional UPDATE on this
-- column so concurrent applications can't both send; each alert reports how
-- many applications arrived since the previous one.
-- ============================================================================

alter table public.jobs
  add column if not exists last_applicant_alert_at timestamptz;

comment on column public.jobs.last_applicant_alert_at is
  'When the recruiter was last alerted on WhatsApp about new applications to this job. Set by lib/jobs/new-applicant-alert.ts.';

-- Smart approval gate for recruiter-posted jobs.
--
-- Clean posts from verified recruiters auto-approve at post time; the rest
-- get an LLM review sweep (same model as discovered-job vetting) that
-- auto-approves clean posts and flags scammy ones for admins. These columns
-- store the review verdict on the job itself.

alter table public.jobs
  add column if not exists ai_review_json jsonb,
  add column if not exists ai_reviewed_at timestamptz;

-- The pending-review sweep works oldest-first through unreviewed pending jobs
create index if not exists idx_jobs_pending_ai_review
  on public.jobs (created_at asc)
  where approval_status = 'pending' and ai_reviewed_at is null;

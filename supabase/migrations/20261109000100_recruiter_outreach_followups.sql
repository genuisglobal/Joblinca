-- Support scheduled follow-ups in the admin recruiter outreach queue.
ALTER TABLE public.recruiter_outreach_leads
  ADD COLUMN IF NOT EXISTS follow_up_at date;

CREATE INDEX IF NOT EXISTS idx_recruiter_outreach_leads_follow_up
  ON public.recruiter_outreach_leads (follow_up_at)
  WHERE follow_up_at IS NOT NULL;

ALTER TABLE public.job_interview_self_schedule_settings
  ADD COLUMN IF NOT EXISTS blackout_dates jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.job_interview_self_schedule_settings
SET blackout_dates = '[]'::jsonb
WHERE blackout_dates IS NULL;

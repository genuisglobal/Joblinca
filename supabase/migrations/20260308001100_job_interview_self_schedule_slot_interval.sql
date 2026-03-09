ALTER TABLE public.job_interview_self_schedule_settings
  ADD COLUMN IF NOT EXISTS slot_interval_minutes integer NOT NULL DEFAULT 60;

UPDATE public.job_interview_self_schedule_settings
SET slot_interval_minutes = 60
WHERE slot_interval_minutes IS NULL OR slot_interval_minutes < 15;

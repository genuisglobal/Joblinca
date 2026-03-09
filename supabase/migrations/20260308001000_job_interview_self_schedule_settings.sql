CREATE TABLE IF NOT EXISTS public.job_interview_self_schedule_settings (
  job_id uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'UTC',
  minimum_notice_hours integer NOT NULL DEFAULT 24,
  weekly_availability jsonb NOT NULL DEFAULT '{}'::jsonb,
  slot_templates jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_job_interview_self_schedule_settings_updated_at
  ON public.job_interview_self_schedule_settings;
CREATE TRIGGER trg_job_interview_self_schedule_settings_updated_at
  BEFORE UPDATE ON public.job_interview_self_schedule_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

ALTER TABLE public.job_interview_self_schedule_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recruiters manage own self schedule settings"
  ON public.job_interview_self_schedule_settings;
CREATE POLICY "Recruiters manage own self schedule settings"
  ON public.job_interview_self_schedule_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.id = job_id AND j.recruiter_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.id = job_id AND j.recruiter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins read self schedule settings"
  ON public.job_interview_self_schedule_settings;
CREATE POLICY "Admins read self schedule settings"
  ON public.job_interview_self_schedule_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Service role full access self schedule settings"
  ON public.job_interview_self_schedule_settings;
CREATE POLICY "Service role full access self schedule settings"
  ON public.job_interview_self_schedule_settings
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

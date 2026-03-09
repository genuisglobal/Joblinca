CREATE TABLE IF NOT EXISTS public.job_interview_automation_settings (
  job_id uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  auto_send_reschedule_notice boolean NOT NULL DEFAULT true,
  auto_send_cancellation_notice boolean NOT NULL DEFAULT true,
  auto_send_completion_followup boolean NOT NULL DEFAULT false,
  auto_send_no_show_followup boolean NOT NULL DEFAULT true,
  completion_followup_message text,
  no_show_followup_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_job_interview_automation_settings_updated_at
  ON public.job_interview_automation_settings;
CREATE TRIGGER trg_job_interview_automation_settings_updated_at
  BEFORE UPDATE ON public.job_interview_automation_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

ALTER TABLE public.job_interview_automation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recruiters manage own interview automation settings"
  ON public.job_interview_automation_settings;
CREATE POLICY "Recruiters manage own interview automation settings"
  ON public.job_interview_automation_settings
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

DROP POLICY IF EXISTS "Admins read interview automation settings"
  ON public.job_interview_automation_settings;
CREATE POLICY "Admins read interview automation settings"
  ON public.job_interview_automation_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Service role full access interview automation settings"
  ON public.job_interview_automation_settings;
CREATE POLICY "Service role full access interview automation settings"
  ON public.job_interview_automation_settings
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE public.application_activity
  DROP CONSTRAINT IF EXISTS application_activity_action_check;

ALTER TABLE public.application_activity
  ADD CONSTRAINT application_activity_action_check
  CHECK (action IN (
    'created',
    'status_changed',
    'note_added',
    'rating_changed',
    'tag_added',
    'tag_removed',
    'viewed',
    'pinned',
    'unpinned',
    'hidden',
    'unhidden',
    'ai_analyzed',
    'stage_changed',
    'feedback_submitted',
    'scorecard_completed',
    'decision_recorded',
    'interview_scheduled',
    'interview_rescheduled',
    'interview_cancelled',
    'interview_completed',
    'interview_no_show',
    'interview_confirmation_sent',
    'interview_reschedule_sent',
    'interview_cancel_notice_sent',
    'interview_reminder_sent',
    'interview_candidate_confirmed',
    'interview_candidate_declined',
    'interview_completion_followup_sent',
    'interview_no_show_followup_sent'
  ));

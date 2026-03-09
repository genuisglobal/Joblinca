CREATE TABLE IF NOT EXISTS public.application_interview_slots (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  recruiter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  candidate_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  mode text NOT NULL DEFAULT 'video'
    CHECK (mode IN ('video', 'phone', 'onsite', 'other')),
  location text,
  meeting_url text,
  notes text,
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'booked', 'cancelled')),
  booked_interview_id uuid REFERENCES public.application_interviews(id) ON DELETE SET NULL,
  invitation_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_application_interview_slots_application_status
  ON public.application_interview_slots(application_id, status, scheduled_at ASC);

CREATE INDEX IF NOT EXISTS idx_application_interview_slots_candidate_status
  ON public.application_interview_slots(candidate_user_id, status, scheduled_at ASC);

CREATE OR REPLACE FUNCTION public.sync_application_interview_slot_relationships()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_id uuid;
  v_applicant_id uuid;
  v_recruiter_id uuid;
BEGIN
  SELECT a.job_id, a.applicant_id
  INTO v_job_id, v_applicant_id
  FROM public.applications a
  WHERE a.id = NEW.application_id;

  IF v_job_id IS NULL OR v_applicant_id IS NULL THEN
    RAISE EXCEPTION 'Invalid application_id for interview slot scheduling';
  END IF;

  SELECT j.recruiter_id
  INTO v_recruiter_id
  FROM public.jobs j
  WHERE j.id = v_job_id;

  IF v_recruiter_id IS NULL THEN
    RAISE EXCEPTION 'Interview slot scheduling requires a recruiter-owned job';
  END IF;

  NEW.job_id := v_job_id;
  NEW.candidate_user_id := v_applicant_id;
  NEW.recruiter_id := v_recruiter_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_application_interview_slot_relationships ON public.application_interview_slots;
CREATE TRIGGER sync_application_interview_slot_relationships
  BEFORE INSERT OR UPDATE ON public.application_interview_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_application_interview_slot_relationships();

DROP TRIGGER IF EXISTS application_interview_slots_updated_at ON public.application_interview_slots;
CREATE TRIGGER application_interview_slots_updated_at
  BEFORE UPDATE ON public.application_interview_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

ALTER TABLE public.application_interview_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recruiters manage own interview slots" ON public.application_interview_slots;
CREATE POLICY "Recruiters manage own interview slots"
  ON public.application_interview_slots
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

DROP POLICY IF EXISTS "Candidates read own interview slots" ON public.application_interview_slots;
CREATE POLICY "Candidates read own interview slots"
  ON public.application_interview_slots
  FOR SELECT
  USING (candidate_user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access to interview slots" ON public.application_interview_slots;
CREATE POLICY "Service role full access to interview slots"
  ON public.application_interview_slots
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
    'interview_no_show_followup_sent',
    'interview_slot_created',
    'interview_slot_booked',
    'interview_slot_cancelled',
    'interview_self_schedule_invite_sent'
  ));

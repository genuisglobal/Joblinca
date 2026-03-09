ALTER TABLE IF EXISTS public.application_interviews
  ADD COLUMN IF NOT EXISTS candidate_response_status text NOT NULL DEFAULT 'pending';

ALTER TABLE IF EXISTS public.application_interviews
  ADD COLUMN IF NOT EXISTS candidate_responded_at timestamptz;

ALTER TABLE IF EXISTS public.application_interviews
  ADD COLUMN IF NOT EXISTS candidate_response_note text;

UPDATE public.application_interviews
SET candidate_response_status = 'pending'
WHERE candidate_response_status IS NULL;

ALTER TABLE public.application_interviews
  DROP CONSTRAINT IF EXISTS application_interviews_candidate_response_status_check;

ALTER TABLE public.application_interviews
  ADD CONSTRAINT application_interviews_candidate_response_status_check
  CHECK (candidate_response_status IN ('pending', 'confirmed', 'declined'));

CREATE INDEX IF NOT EXISTS idx_application_interviews_candidate_response
  ON public.application_interviews(candidate_user_id, candidate_response_status, scheduled_at DESC);

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
    'interview_candidate_declined'
  ));

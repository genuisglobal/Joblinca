-- WhatsApp Recruiter Phase 2 (AI)
-- Adds AI summary fields and optional AI follow-up metadata.

ALTER TABLE public.wa_screening_sessions
  ADD COLUMN IF NOT EXISTS ai_summary_status text
    CHECK (ai_summary_status IS NULL OR ai_summary_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS ai_summary_text text,
  ADD COLUMN IF NOT EXISTS ai_recommendation text
    CHECK (ai_recommendation IS NULL OR ai_recommendation IN ('strong_yes', 'review', 'reject')),
  ADD COLUMN IF NOT EXISTS ai_key_strengths text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_key_risks text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS ai_tokens_used int,
  ADD COLUMN IF NOT EXISTS ai_error text,
  ADD COLUMN IF NOT EXISTS ai_last_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_followup_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_followup_question text;

CREATE INDEX IF NOT EXISTS wa_screening_sessions_ai_status_idx
  ON public.wa_screening_sessions (ai_summary_status, created_at DESC);


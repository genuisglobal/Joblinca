-- Allow applicants to finalize their own draft applications.
-- The existing USING clause should still restrict which rows are updateable,
-- while WITH CHECK only needs to ensure ownership on the new row state.

DROP POLICY IF EXISTS "applications_user_update_draft" ON public.applications;

CREATE POLICY "applications_user_update_draft" ON public.applications
  FOR UPDATE
  USING (auth.uid() = applicant_id AND is_draft = true)
  WITH CHECK (auth.uid() = applicant_id);

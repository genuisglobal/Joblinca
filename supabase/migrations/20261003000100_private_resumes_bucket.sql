-- ============================================================================
-- Make profile CVs private.
--
-- The resumes bucket was created public (20260301000100_storage_buckets.sql)
-- with a "Public read resumes" SELECT policy on storage.objects. That policy
-- applies to the anon role, whose key ships in the browser bundle, so anyone
-- could LIST the bucket and download every CV -- names, phone numbers, work
-- history. Verified on a database built from the migration chain: an
-- anonymous storage.list('resumes/<user id>') returned the user's CV.
--
-- After this migration:
--   - the bucket is private: /object/public/resumes/... URLs stop working
--   - nobody but the service role can list or read objects, except that a
--     signed-in user can read their own folder (resumes/<their id>/...)
--   - the app serves CVs through short-lived signed URLs minted after its own
--     access checks (lib/storage/sign-cv.ts):
--       owner      -> GET /api/profile/resume/file
--       recruiter  -> GET /api/recruiter/candidates/[id] (signed resumeUrl)
--       applicant / job's recruiter / admin -> GET /api/applications/[id]/resume
--
-- Stored resume_url values keep their old public-URL form; the app parses
-- them back to bucket + path, so no data migration is needed.
--
-- Deploy the app change BEFORE applying this, or CV links in the dashboard
-- will 400 until the new code is live.
-- ============================================================================

update storage.buckets
   set public = false
 where id = 'resumes';

drop policy if exists "Public read resumes" on storage.objects;

-- Objects are stored as resumes/<user id>/<file>; storage.foldername() gives
-- the folder segments, so [1] = 'resumes' and [2] = the owner's id.
drop policy if exists "Owners read own resumes" on storage.objects;
create policy "Owners read own resumes"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = 'resumes'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- "Service role full access resumes" (from 20260301000100) stays: uploads and
-- signing run as the service role.

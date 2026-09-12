-- ============================================================================
-- RUNBOOK: close the rls_disabled_in_public advisor alert on joblinca-prod
-- (project aymglgugrfhxjsgiehad). Run these three steps IN ORDER in the
-- Supabase SQL editor. Steps 1 and 3 are read-only.
--
-- Verified 2026-09-01 with the anon key: public.profiles returns all 296 rows
-- and public.job_internship_requirements is readable. Both are still open.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 1 — PRE-FLIGHT (read-only). Read all four results before continuing.
-- ----------------------------------------------------------------------------

-- 1a. Current RLS state. Expect relrowsecurity = false for both today.
select relname, relrowsecurity, relforcerowsecurity
  from pg_class
 where relnamespace = 'public'::regnamespace
   and relname in ('profiles', 'job_internship_requirements');

-- 1b. Every policy that currently stands on the two tables. The migration in
--     step 2 drops six policies BY NAME. If anything here grants read to anon
--     or public and is NOT one of those six, enabling RLS will not close the
--     hole -- drop it too, then re-run step 3.
select tablename, policyname, roles, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and tablename in ('profiles', 'job_internship_requirements')
 order by tablename, policyname;

-- 1c. Admins who lose visibility. The new policies key on admin_type, not on
--     role = 'admin'. ANY ROW HERE IS A PERSON WHO LOSES THE ADMIN PAGES
--     (/admin/users and friends read profiles on the caller's own client).
--     Fix by setting their admin_type before step 2, or accept the change.
select id, role, admin_type
  from public.profiles
 where role = 'admin' and admin_type is null;

-- 1d. Sanity check that at least one working admin survives.
select count(*) as surviving_admins
  from public.profiles
 where admin_type::text in ('super', 'operations', 'content');


-- ----------------------------------------------------------------------------
-- STEP 2 — APPLY. Paste the full contents of
--   supabase/migrations/20260825000100_rls_gap_fixes.sql
-- here and run it. It is idempotent: safe to re-run, and a no-op on anything
-- already correct. Do not retype it -- the policy bodies matter.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- STEP 3 — VERIFY (read-only).
-- ----------------------------------------------------------------------------

-- 3a. Both tables must now show relrowsecurity = true.
select relname, relrowsecurity
  from pg_class
 where relnamespace = 'public'::regnamespace
   and relname in ('profiles', 'job_internship_requirements');

-- 3b. Expect exactly: profiles -> profiles_select_own_or_admin,
--     profiles_update_own_or_admin, profiles_insert_own;
--     job_internship_requirements -> jir_select_via_parent_job,
--     jir_owner_insert, jir_owner_update, jir_owner_delete.
--     Anything else listed is a leftover -- read its qual before leaving it.
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename in ('profiles', 'job_internship_requirements')
 order by tablename, policyname;

-- 3c. The recursion check. Under the old "Admin ..." policies this errors with
--     42P17 (infinite recursion detected in policy for relation "profiles").
--     It must return a row count instead.
select count(*) from public.profiles;

-- 3d. Then, OUTSIDE the SQL editor, re-probe with the anon key -- the SQL
--     editor runs privileged and cannot prove the hole is shut:
--
--   curl -s "https://aymglgugrfhxjsgiehad.supabase.co/rest/v1/profiles?select=id&limit=1" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--
--     Expect [] (RLS on, no session, so no rows) -- not a row, and not a 401.
--     Repeat for job_internship_requirements.
--
-- 3e. Finally, smoke-test as a real user: log in as an admin and open
--     /admin/users, and post an internship via /jobs/new (that write path runs
--     on the caller's own client, so jir_owner_insert is load-bearing).

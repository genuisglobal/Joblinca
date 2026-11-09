-- ============================================================================
-- RLS gap fixes — 2026-08-25
--
-- Triggered by a Supabase advisor alert (rls_disabled_in_public) on
-- joblinca-prod (aymglgugrfhxjsgiehad).
--
-- Two gaps, found by comparing what the anon key can read against what the
-- service_role key can read, table by table:
--
--   1. public.job_internship_requirements — created in
--      20260308000200_opportunity_types_phase1.sql without ever enabling RLS.
--      It is the only one of 109 tables with no ENABLE ROW LEVEL SECURITY
--      statement anywhere in the migration chain. Currently empty (0 rows),
--      so this is a latent hole rather than an active leak — it goes live the
--      moment somebody posts an internship.
--
--   2. public.profiles — RLS is enabled in 20260102000100_initial.sql and the
--      intended policy is self-or-admin, yet in production the anon role can
--      read all 284 rows (full_name, phone, first_name, last_name, sex,
--      residence_location, role, referral_code). Production has drifted from
--      the migration chain. The anon key ships in the browser bundle, so this
--      is world-readable PII.
--
-- BEFORE APPLYING, inspect the live state so you know what you are changing:
--
--   select relname, relrowsecurity, relforcerowsecurity
--     from pg_class
--    where relname in ('profiles','job_internship_requirements');
--
--   select schemaname, tablename, policyname, roles, cmd, qual, with_check
--     from pg_policies
--    where tablename in ('profiles','job_internship_requirements')
--    order by tablename, policyname;
--
-- If that second query shows a permissive policy on profiles that is not
-- recreated below (something granting read to anon/public), drop it too —
-- enabling RLS alone will not help while such a policy stands.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. public.job_internship_requirements
-- ---------------------------------------------------------------------------
-- This table is 1:1 with public.jobs (job_id is both PK and FK). Rather than
-- restate the parent's visibility rules, each policy asks whether the caller
-- can see the parent row: the EXISTS subquery is itself subject to the RLS on
-- public.jobs, so visibility here tracks jobs automatically and cannot drift
-- from it. (public.jobs has no policy referencing this table, so there is no
-- recursion risk.)

alter table public.job_internship_requirements enable row level security;

drop policy if exists "jir_select_via_parent_job" on public.job_internship_requirements;
create policy "jir_select_via_parent_job"
  on public.job_internship_requirements
  for select
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_internship_requirements.job_id
    )
  );

-- Writes: the recruiter who owns the parent job, or an active admin.
-- POST /api/jobs and /api/admin/jobs/create both write this table with the
-- caller's own session (createServerSupabaseClient), not the service role, so
-- these policies are load-bearing — without them, posting an internship
-- breaks. PATCH /api/jobs/[id] and the repost route use the service client and
-- bypass RLS either way.

drop policy if exists "jir_owner_insert" on public.job_internship_requirements;
create policy "jir_owner_insert"
  on public.job_internship_requirements
  for insert
  with check (
    public.is_active_admin()
    or exists (
      select 1 from public.jobs j
      where j.id = job_internship_requirements.job_id
        and (j.recruiter_id = auth.uid() or j.posted_by = auth.uid())
    )
  );

drop policy if exists "jir_owner_update" on public.job_internship_requirements;
create policy "jir_owner_update"
  on public.job_internship_requirements
  for update
  using (
    public.is_active_admin()
    or exists (
      select 1 from public.jobs j
      where j.id = job_internship_requirements.job_id
        and (j.recruiter_id = auth.uid() or j.posted_by = auth.uid())
    )
  )
  with check (
    public.is_active_admin()
    or exists (
      select 1 from public.jobs j
      where j.id = job_internship_requirements.job_id
        and (j.recruiter_id = auth.uid() or j.posted_by = auth.uid())
    )
  );

-- persistJobOpportunityMetadata() deletes the row when a job stops being an
-- internship, on the caller's own client, so DELETE needs a policy too.
drop policy if exists "jir_owner_delete" on public.job_internship_requirements;
create policy "jir_owner_delete"
  on public.job_internship_requirements
  for delete
  using (
    public.is_active_admin()
    or exists (
      select 1 from public.jobs j
      where j.id = job_internship_requirements.job_id
        and (j.recruiter_id = auth.uid() or j.posted_by = auth.uid())
    )
  );


-- ---------------------------------------------------------------------------
-- 1b. Harden public.is_active_admin() before turning RLS on for profiles
-- ---------------------------------------------------------------------------
-- is_active_admin() reads public.profiles, and the profiles SELECT policy
-- below calls is_active_admin(). With RLS on, that is a recursion trap:
-- evaluating the policy calls the function, which queries profiles, which
-- evaluates the policy. SECURITY DEFINER usually saves this, because the
-- function runs as its owner and owners bypass RLS -- but only while that
-- owner really is the table owner and FORCE ROW LEVEL SECURITY is off. That
-- is a silent dependency, and it has bitten this stack before.
--
-- Pinning row_security = off makes the bypass explicit. If the ownership
-- assumption ever stops holding, the query then fails loudly ("query would be
-- affected by row-level security policy") instead of recursing.
--
-- Worth knowing: this policy has never actually executed in production, since
-- RLS on profiles is currently off -- so the interaction is unverified there.
-- A recursion error is a plausible reason somebody disabled RLS in the first
-- place. Verify on a branch database before shipping this to prod.

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND admin_type::text IN ('super', 'operations', 'content')
  );
$$;


-- ---------------------------------------------------------------------------
-- 2. public.profiles
-- ---------------------------------------------------------------------------
-- Idempotent: a no-op if production already has RLS on, and the fix if it does
-- not. The policies below restate the intent of
-- 20260116000100_admin_system.sql so that the migration chain and production
-- agree no matter which way they drifted.

-- First clear out the legacy policies still left on this table by the early
-- migrations. Policies are OR'd together, so leaving any of these in place
-- would undercut the ones created below.
--
-- The two "Admin ..." policies are the important ones, and they are very
-- probably why RLS is off in production today. Created in
-- 20260102000200_rls_hardening.sql, each is a policy ON profiles whose
-- condition runs `exists (select 1 from public.profiles p ...)` -- a policy on
-- profiles that reads profiles. Postgres answers any query against the table
-- with "infinite recursion detected in policy for relation profiles" (42P17).
-- The usual field fix for that error is to
-- switch RLS off, which matches exactly what production looks like.
--
-- 20260102000700_fix_initial_policies.sql does drop both, so a database built
-- cleanly from the chain never carries them -- which is itself evidence that
-- production did not apply the chain cleanly. Re-dropping them here is
-- idempotent and covers the case where prod stopped at 000200.
--
-- Their replacements below route the admin check through is_active_admin(),
-- which is SECURITY DEFINER with row_security pinned off, so it reads profiles
-- without re-entering the policy.
--
-- Behaviour change worth noting: the old policies granted access on
-- profiles.role = 'admin', the new ones on admin_type in
-- (super, operations, content), per is_active_admin() -- which
-- 20260116000100_admin_system.sql declares to be the single source of truth
-- for admin access. Anyone holding role = 'admin' with no admin_type set loses
-- admin visibility here. Check before applying:
--   select id, role, admin_type from public.profiles
--    where role = 'admin' and admin_type is null;

drop policy if exists "Admin read all profiles" on public.profiles;
drop policy if exists "Admin update all profiles" on public.profiles;
drop policy if exists "Profile select self" on public.profiles;
drop policy if exists "Profile update self" on public.profiles;
drop policy if exists "Self profile select" on public.profiles;
drop policy if exists "Self profile update" on public.profiles;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles
  for select
  using (
    auth.uid() = id
    or public.is_active_admin()
  );

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles
  for update
  using (
    auth.uid() = id
    or public.is_active_admin()
  )
  with check (
    auth.uid() = id
    or public.is_active_admin()
  );

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  with check (
    auth.uid() = id
    or public.is_active_admin()
  );

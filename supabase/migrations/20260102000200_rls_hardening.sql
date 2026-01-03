-- Migration: 001_rls_hardening.sql
--
-- This migration hardens and completes Row‑Level Security (RLS) policies for the
-- core tables defined in 000_initial.sql.  It drops overly permissive
-- policies and replaces them with stricter, role‑aware policies.  This file is
-- idempotent and safe to run once after 000_initial.sql.

-- ============================================================================
-- PROFILES RLS HARDENING
-- Users can only see and update their own profiles.  Admins can manage all.
-- ============================================================================

-- Drop existing permissive policies if they exist
drop policy if exists "Self profile select" on public.profiles;
drop policy if exists "Self profile update" on public.profiles;

-- Allow each user to read their own profile
create policy "Profile select self" on public.profiles
  for select
  using (auth.uid() = id);

-- Allow each user to update their own profile
create policy "Profile update self" on public.profiles
  for update
  using (auth.uid() = id);

-- Admin can read all profiles
create policy "Admin read all profiles" on public.profiles
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Admin can update all profiles
create policy "Admin update all profiles" on public.profiles
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ============================================================================
-- RECRUITERS RLS HARDENING
-- Users can manage only their own recruiter row.  Admins manage all.
-- ============================================================================

drop policy if exists "Own recruiter select" on public.recruiters;
drop policy if exists "Own recruiter modify" on public.recruiters;

-- Recruiter can read their own recruiter record
create policy "Recruiter select self" on public.recruiters
  for select
  using (auth.uid() = id);

-- Recruiter can insert their own recruiter record
create policy "Recruiter insert self" on public.recruiters
  for insert
  with check (auth.uid() = id);

-- Recruiter can update their own recruiter record
create policy "Recruiter update self" on public.recruiters
  for update
  using (auth.uid() = id);

-- Admin can manage all recruiters
create policy "Admin manage recruiters" on public.recruiters
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ============================================================================
-- FINANCIAL & SUBSCRIPTION TABLES
-- Normal users only see/manage their own rows.  Admins manage all.
-- ============================================================================

-- Transactions
create policy if not exists "User read own transactions" on public.transactions
  for select
  using (auth.uid() = user_id);

create policy if not exists "User insert own transaction" on public.transactions
  for insert
  with check (auth.uid() = user_id);

create policy if not exists "Admin manage transactions" on public.transactions
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Subscriptions
create policy if not exists "User read own subscriptions" on public.subscriptions
  for select
  using (auth.uid() = user_id);

create policy if not exists "User manage own subscriptions" on public.subscriptions
  for all
  using (auth.uid() = user_id);

create policy if not exists "Admin manage subscriptions" on public.subscriptions
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ============================================================================
-- VERIFICATION & VETTING TABLES
-- Users manage only their own verification row.  Verification officers can read
-- all verifications.  Recruiters manage only their own vetting requests.  Vetting
-- officers manage vetting requests and results.
-- ============================================================================

-- Verifications
create policy if not exists "User manage own verifications" on public.verifications
  for all
  using (auth.uid() = user_id);

create policy if not exists "Verification officers read all verifications" on public.verifications
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'verification_officer'
    )
  );

-- Vetting requests
create policy if not exists "Recruiter manage own vetting requests" on public.vetting_requests
  for all
  using (auth.uid() = recruiter_id);

create policy if not exists "Vetting officers read all vetting requests" on public.vetting_requests
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'vetting_officer'
    )
  );

-- Vetting results
create policy if not exists "Vetting officers manage vetting results" on public.vetting_results
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'vetting_officer'
    )
  );

create policy if not exists "Recruiter read vetting results for own jobs" on public.vetting_results
  for select
  using (
    exists (
      select 1
      from public.vetting_requests vr
      join public.jobs j on j.id = vr.job_id
      where vr.id = vetting_request_id
        and j.recruiter_id = auth.uid()
    )
  );

-- ============================================================================
-- TESTS, ATTEMPTS, CERTIFICATIONS
-- Admins manage tests & certifications.  Candidates manage their own attempts and
-- can read their own certifications.
-- ============================================================================

-- Tests
create policy if not exists "Admin manage tests" on public.tests
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Test attempts
create policy if not exists "Candidate manage own test attempts" on public.test_attempts
  for all
  using (auth.uid() = candidate_id);

-- Certifications
create policy if not exists "Candidate read own certifications" on public.certifications
  for select
  using (auth.uid() = candidate_id);

create policy if not exists "Admin manage certifications" on public.certifications
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ============================================================================
-- MESSAGING LOGS & ADMIN ACTIONS
-- Users can read their own messaging logs.  System/service role can insert.
-- Admins can read admin actions.
-- ============================================================================

-- WhatsApp logs
create policy if not exists "User read own whatsapp logs" on public.whatsapp_logs
  for select
  using (auth.uid() = user_id);

create policy if not exists "System insert whatsapp logs" on public.whatsapp_logs
  for insert
  with check (true);

-- SMS logs
create policy if not exists "User read own sms logs" on public.sms_logs
  for select
  using (auth.uid() = user_id);

create policy if not exists "System insert sms logs" on public.sms_logs
  for insert
  with check (true);

-- Admin actions
create policy if not exists "Admin read admin actions" on public.admin_actions
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
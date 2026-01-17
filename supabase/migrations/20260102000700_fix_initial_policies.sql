-- ============================================================================
-- FIX / REPLACE INITIAL RLS POLICIES (IDEMPOTENT)
-- Run AFTER tables exist + RLS is enabled on tables
-- ============================================================================

-- ----------------------------
-- PROFILES
-- Users can read/update ONLY their own profile.
-- Admin can read/update all.
-- ----------------------------
drop policy if exists "Self profile select" on public.profiles;
drop policy if exists "Self profile update" on public.profiles;
drop policy if exists "Profile select self" on public.profiles;
drop policy if exists "Profile update self" on public.profiles;
drop policy if exists "Admin read all profiles" on public.profiles;
drop policy if exists "Admin update all profiles" on public.profiles;

create policy "Profile select self"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "Profile update self"
on public.profiles
for update
to authenticated
using (auth.uid() = id);

create policy "Admin read all profiles"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

create policy "Admin update all profiles"
on public.profiles
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

-- ----------------------------
-- RECRUITERS
-- Recruiter can read/insert/update ONLY their own row.
-- Admin can manage all.
-- ----------------------------
drop policy if exists "Own recruiter select" on public.recruiters;
drop policy if exists "Own recruiter modify" on public.recruiters;
drop policy if exists "Recruiter select self" on public.recruiters;
drop policy if exists "Recruiter insert self" on public.recruiters;
drop policy if exists "Recruiter update self" on public.recruiters;
drop policy if exists "Admin manage recruiters" on public.recruiters;

create policy "Recruiter select self"
on public.recruiters
for select
to authenticated
using (auth.uid() = id);

create policy "Recruiter insert self"
on public.recruiters
for insert
to authenticated
with check (auth.uid() = id);

create policy "Recruiter update self"
on public.recruiters
for update
to authenticated
using (auth.uid() = id);

create policy "Admin manage recruiters"
on public.recruiters
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

-- ----------------------------
-- JOBS
-- Public can read published jobs.
-- Recruiter can read/manage ONLY their own jobs (including unpublished).
-- ----------------------------
drop policy if exists "Published jobs are public" on public.jobs;
drop policy if exists "Recruiter manage own jobs" on public.jobs;

create policy "Published jobs are public"
on public.jobs
for select
to anon, authenticated
using (published = true);

-- Allow recruiters to see their own jobs even if unpublished
create policy "Recruiter select own jobs"
on public.jobs
for select
to authenticated
using (auth.uid() = recruiter_id);

-- Recruiters manage (insert/update/delete) only their own jobs
create policy "Recruiter manage own jobs"
on public.jobs
for insert
to authenticated
with check (auth.uid() = recruiter_id);

create policy "Recruiter update own jobs"
on public.jobs
for update
to authenticated
using (auth.uid() = recruiter_id)
with check (auth.uid() = recruiter_id);

create policy "Recruiter delete own jobs"
on public.jobs
for delete
to authenticated
using (auth.uid() = recruiter_id);

-- ----------------------------
-- APPLICATIONS
-- Applicants can create/read their own applications.
-- Recruiters can read applications for jobs they own.
-- Recruiters can update status for applications on their jobs.
-- ----------------------------
drop policy if exists "Applicant create application" on public.applications;
drop policy if exists "Applicant read own application" on public.applications;
drop policy if exists "Recruiter read applications for their jobs" on public.applications;

create policy "Applicant create application"
on public.applications
for insert
to authenticated
with check (auth.uid() = applicant_id);

create policy "Applicant read own application"
on public.applications
for select
to authenticated
using (auth.uid() = applicant_id);

create policy "Recruiter read applications for their jobs"
on public.applications
for select
to authenticated
using (
  exists (
    select 1
    from public.jobs j
    where j.id = applications.job_id
      and j.recruiter_id = auth.uid()
  )
);

create policy "Recruiter update application status for their jobs"
on public.applications
for update
to authenticated
using (
  exists (
    select 1
    from public.jobs j
    where j.id = applications.job_id
      and j.recruiter_id = auth.uid()
  )
);

-- ----------------------------
-- PROJECTS
-- Public can view public projects.
-- Owner can manage their own projects.
-- ----------------------------
drop policy if exists "Public projects readable" on public.projects;
drop policy if exists "Owner manage project" on public.projects;

create policy "Public projects readable"
on public.projects
for select
to anon, authenticated
using (public.projects.public = true);

create policy "Owner manage project"
on public.projects
for all
to authenticated
using (auth.uid() = candidate_id)
with check (auth.uid() = candidate_id);

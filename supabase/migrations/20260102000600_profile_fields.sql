-- Migration 005_profile_fields.sql
--
-- This migration augments the profiles table with optional fields for
-- storing a user's profile image URL and sex/gender.  These fields are
-- optional for job seekers and talent users, but recruiters who wish
-- to become verified must supply a profile image (personal photo or
-- company logo).  Sex/gender is stored privately and is never exposed
-- to recruiters or used for ranking or filtering.

-- 1. Add optional profile_image_url and sex columns to profiles

alter table if exists public.profiles
  add column if not exists profile_image_url text;

alter table if exists public.profiles
  add column if not exists sex text;

-- 2. Ensure existing data remains intact; these columns are nullable
--    so no backfill is needed.

-- 3. RLS: no additional policies are required because the existing
--    policies on public.profiles restrict row access to the owning
--    user and admins.  Recruiters will only see candidate badges or
--    public fields via dedicated views; the sex field will not be
--    surfaced via those views.
-- Migration 008_storage_policies.sql
--
-- This migration creates RLS policies for the profile-avatars and company-logos
-- storage buckets to allow authenticated users to upload their own files.

-- Drop existing policies if they exist (safe to run multiple times)
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own logo" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own logo" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own logo" ON storage.objects;

-- Policies for profile-avatars bucket
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'profile-avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'profile-avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-avatars');

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'profile-avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policies for company-logos bucket
CREATE POLICY "Users can upload their own logo"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'company-logos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own logo"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'company-logos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Anyone can view logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'company-logos');

CREATE POLICY "Users can delete their own logo"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'company-logos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Create storage buckets for avatars and resumes
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'avatars',
    'avatars',
    true,
    2097152,  -- 2MB
    ARRAY['image/jpeg','image/png','image/webp','image/gif']
  ),
  (
    'resumes',
    'resumes',
    true,
    5242880,  -- 5MB
    ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  )
ON CONFLICT (id) DO NOTHING;

-- Public read access for avatars
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Public read access for resumes
CREATE POLICY "Public read resumes"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'resumes');

-- Service role full access (used by API routes)
CREATE POLICY "Service role full access avatars"
  ON storage.objects FOR ALL
  USING (bucket_id = 'avatars' AND auth.role() = 'service_role');

CREATE POLICY "Service role full access resumes"
  ON storage.objects FOR ALL
  USING (bucket_id = 'resumes' AND auth.role() = 'service_role');

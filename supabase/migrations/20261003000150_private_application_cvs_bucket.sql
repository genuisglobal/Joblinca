-- ============================================================================
-- Make application CVs private.
--
-- The application-cvs bucket (CVs uploaded on the apply form, in onboarding,
-- and by the CV builder's "attach") was created by hand in production -- no
-- migration defines it -- so its settings are unknown from the codebase. The
-- app already treats it as private: recruiters, applicants and admins open
-- these CVs through signed URLs (GET /api/applications/[id]/resume, and for
-- profile CVs lib/storage/sign-cv.ts). This migration makes the database
-- agree, whatever state production is in:
--
--   1. the bucket exists and is private (public URLs stop working)
--   2. every policy on this bucket that is NOT scoped to the file's owner
--      is dropped -- e.g. a public/anon read policy, which would let anyone
--      holding the browser's anon key list and download every CV. Each
--      dropped policy is reported with RAISE NOTICE.
--   3. signed-in users can read/upload/replace/delete only their own folder
--      (<user id>/...), which the apply form, onboarding and CV-builder
--      attach need (they upload with the user's session and upsert: true).
--
-- The service role bypasses RLS, so server-side signing is unaffected.
-- Deploy the signed-URL code (same PR) before applying this.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application-cvs',
  'application-cvs',
  false,
  5242880, -- 5MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set public = false;

do $$
declare
  p record;
  other_literals text[];
begin
  for p in
    select policyname, cmd, roles, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
      from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and (qual ilike '%application-cvs%' or with_check ilike '%application-cvs%')
       -- owner-scoped policies (checking auth.uid()) are fine; keep them
       and coalesce(qual, '') not ilike '%auth.uid()%'
       and coalesce(with_check, '') not ilike '%auth.uid()%'
  loop
    -- A policy that also names another bucket (or any other literal) may be
    -- shared, e.g. bucket_id in ('avatars','application-cvs'); dropping it
    -- would break that bucket. Leave those for a human.
    select array_agg(distinct m[1]) into other_literals
      from regexp_matches(p.qual || ' ' || p.with_check, '''([^'']+)''', 'g') as m
     where m[1] <> 'application-cvs';

    if other_literals is not null then
      raise warning 'NOT dropping policy "%" on storage.objects: it also mentions % -- review by hand (using %, check %)',
        p.policyname, other_literals, p.qual, p.with_check;
      continue;
    end if;

    raise notice 'Dropping non-owner policy on application-cvs: "%" (cmd %, roles %, using %, check %)',
      p.policyname, p.cmd, p.roles, p.qual, p.with_check;
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end
$$;

-- Owner-only access: objects are stored as <user id>/<file>.
drop policy if exists "Owners read own application cvs" on storage.objects;
create policy "Owners read own application cvs"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'application-cvs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Owners upload own application cvs" on storage.objects;
create policy "Owners upload own application cvs"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'application-cvs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Owners replace own application cvs" on storage.objects;
create policy "Owners replace own application cvs"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'application-cvs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'application-cvs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Owners delete own application cvs" on storage.objects;
create policy "Owners delete own application cvs"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'application-cvs' and (storage.foldername(name))[1] = auth.uid()::text);

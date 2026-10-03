-- ============================================================================
-- Make recruiter verification documents private.
--
-- The documents bucket holds what recruiters submit for verification:
-- national ID documents, selfies holding the ID, and business registrations
-- (lib/recruiter-verifications/service.ts, paths verifications/<user id>/...).
-- Like application-cvs it was created by hand in production -- no migration
-- defines it -- and the code stores getPublicUrl() links, so it may well be
-- public. Identity documents are the most sensitive files we hold.
--
-- Every upload and read goes through the service role (which bypasses RLS);
-- admins view the files via signed URLs minted when /admin/verifications
-- renders (lib/storage/sign-documents.ts). Nobody else needs access, so:
--
--   1. the bucket exists and is private (public URLs stop working)
--   2. every policy on this bucket is dropped and reported (RAISE NOTICE)
--      -- including owner-scoped ones: recruiters never read their uploads
--      back, and service-role access needs no policy
--   3. a policy that also names another bucket is NOT dropped (that would
--      break the other bucket) but reported with RAISE WARNING for a human
--
-- Deploy the signed-URL code (same PR) before applying this, or the admin
-- verifications page will show broken document links until it is live.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 10485760) -- 10MB
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
       and (qual ilike '%''documents''%' or with_check ilike '%''documents''%')
  loop
    select array_agg(distinct m[1]) into other_literals
      from regexp_matches(p.qual || ' ' || p.with_check, '''([^'']+)''', 'g') as m
     where m[1] not in ('documents', 'service_role', 'verifications', 'authenticated', 'anon');

    if other_literals is not null then
      raise warning 'NOT dropping policy "%" on storage.objects: it also mentions % -- review by hand (using %, check %)',
        p.policyname, other_literals, p.qual, p.with_check;
      continue;
    end if;

    raise notice 'Dropping policy on documents bucket: "%" (cmd %, roles %, using %, check %)',
      p.policyname, p.cmd, p.roles, p.qual, p.with_check;
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end
$$;

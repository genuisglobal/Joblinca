import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { signCvUrl } from '@/lib/storage/sign-cv';

export const dynamic = 'force-dynamic';

/**
 * GET /api/profile/resume/file -- open your own profile CV.
 *
 * CVs are in a private bucket, so the profile page links here instead of to
 * the stored URL; this redirects to a short-lived signed link.
 */
export async function GET() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const service = createServiceSupabaseClient();
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const table =
    profile?.role === 'job_seeker' ? 'job_seeker_profiles' : profile?.role === 'talent' ? 'talent_profiles' : null;
  if (!table) {
    return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
  }

  const { data: row } = await service.from(table).select('resume_url').eq('user_id', user.id).maybeSingle();
  const signed = row?.resume_url ? await signCvUrl(service, row.resume_url, user.id) : null;
  if (!signed) {
    return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
  }

  const response = NextResponse.redirect(signed);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

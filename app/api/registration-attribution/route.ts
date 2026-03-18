import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const NON_ATTRIBUTABLE_ROLES = new Set([
  'admin',
  'staff',
  'field_agent',
  'vetting_officer',
  'verification_officer',
]);

export async function GET() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const serviceClient = createServiceSupabaseClient();
  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('id, role, registration_help_response, registration_help_answered_at')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const [{ data: officerRecord, error: officerError }, { data: attribution, error: attributionError }] =
    await Promise.all([
      serviceClient
        .from('registration_officers')
        .select('id, officer_code, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle(),
      serviceClient
        .from('registration_attributions')
        .select('id, officer_code_snapshot, officer_user_id, created_at, locked_at')
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .maybeSingle(),
    ]);

  if (officerError) {
    return NextResponse.json({ error: officerError.message }, { status: 500 });
  }

  if (attributionError) {
    return NextResponse.json({ error: attributionError.message }, { status: 500 });
  }

  const isFieldAgent = profile.role === 'field_agent' || Boolean(officerRecord?.id);
  const shouldPrompt =
    !isFieldAgent &&
    !NON_ATTRIBUTABLE_ROLES.has(profile.role) &&
    !attribution?.id &&
    profile.registration_help_response === 'unknown';

  return NextResponse.json({
    shouldPrompt,
    isFieldAgent,
    registrationHelpResponse: profile.registration_help_response,
    registrationHelpAnsweredAt: profile.registration_help_answered_at,
    attribution: attribution
      ? {
          id: attribution.id,
          officerCode: attribution.officer_code_snapshot,
          officerUserId: attribution.officer_user_id,
          claimedAt: attribution.created_at,
          lockedAt: attribution.locked_at,
        }
      : null,
  });
}

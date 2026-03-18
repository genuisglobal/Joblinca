import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  claimRegistrationAttribution,
  normalizeOfficerCode,
} from '@/lib/registration-officers';
import { getRateLimitIdentifier, rateLimit } from '@/lib/rate-limit';

const NON_ATTRIBUTABLE_ROLES = new Set([
  'admin',
  'staff',
  'field_agent',
  'vetting_officer',
  'verification_officer',
]);

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const limit = await rateLimit(getRateLimitIdentifier(request, user.id), {
    requests: 6,
    window: '1m',
  });
  if (!limit.allowed) {
    return limit.response!;
  }

  const body = await request.json().catch(() => null);
  const officerCode = normalizeOfficerCode(body?.officerCode);
  if (!officerCode) {
    return NextResponse.json({ error: 'Officer code is required' }, { status: 400 });
  }

  const serviceClient = createServiceSupabaseClient();
  const [{ data: profile, error: profileError }, { data: officerRow, error: officerError }] =
    await Promise.all([
      serviceClient
        .from('profiles')
        .select('id, role')
        .eq('id', user.id)
        .maybeSingle(),
      serviceClient
        .from('registration_officers')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle(),
    ]);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (officerError) {
    return NextResponse.json({ error: officerError.message }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  if (NON_ATTRIBUTABLE_ROLES.has(profile.role) || officerRow?.id) {
    return NextResponse.json(
      { error: 'This account cannot be attributed to a registration officer' },
      { status: 403 }
    );
  }

  try {
    const result = await claimRegistrationAttribution(serviceClient, {
      userId: user.id,
      officerCode,
      source: 'manual_prompt',
      confirmedByUser: true,
      actorUserId: user.id,
    });

    return NextResponse.json({
      success: true,
      attributionId: result.attributionId,
      officer: {
        userId: result.officer.user_id,
        officerCode: result.officer.officer_code,
        region: result.officer.region,
        town: result.officer.town,
      },
      created: result.created,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to claim registration attribution';
    const status =
      message.includes('not found') ? 404 : message.includes('locked') ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

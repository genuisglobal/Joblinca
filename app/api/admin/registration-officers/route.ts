import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminType } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  buildOfficerSignupUrl,
  generateUniqueOfficerCode,
  normalizeOfficerCode,
} from '@/lib/registration-officers';
import { getRequestBaseUrl } from '@/lib/app-url';

function buildTemporaryPassword(length = 12): string {
  const raw = randomBytes(length).toString('base64').replace(/[^A-Za-z0-9]/g, '');
  return `${raw.slice(0, 10)}A1!`;
}

function splitName(fullName: string) {
  const compact = fullName.trim();
  if (!compact) {
    return { firstName: null as string | null, lastName: null as string | null };
  }

  const [firstName, ...rest] = compact.split(/\s+/);
  return {
    firstName: firstName || null,
    lastName: rest.length > 0 ? rest.join(' ') : null,
  };
}

export async function POST(request: NextRequest) {
  let createdUserId: string | null = null;

  try {
    const admin = await requireAdminType(['super', 'operations']);
    const serviceClient = createServiceSupabaseClient();
    const body = await request.json().catch(() => null);

    const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    const region = typeof body?.region === 'string' ? body.region.trim() : '';
    const town = typeof body?.town === 'string' ? body.town.trim() : '';
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';
    const requestedOfficerCode =
      typeof body?.officerCode === 'string' ? body.officerCode.trim() : '';

    if (!fullName || !email) {
      return NextResponse.json(
        { error: 'Full name and email are required' },
        { status: 400 }
      );
    }

    const officerCode = requestedOfficerCode
      ? normalizeOfficerCode(requestedOfficerCode)
      : await generateUniqueOfficerCode(serviceClient);

    if (!officerCode) {
      return NextResponse.json({ error: 'Officer code is invalid' }, { status: 400 });
    }

    const temporaryPassword = buildTemporaryPassword();
    const { firstName, lastName } = splitName(fullName);
    const now = new Date().toISOString();

    const { data: createdUser, error: createUserError } =
      await serviceClient.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          role: 'field_agent',
          name: fullName,
        },
      });

    if (createUserError || !createdUser.user) {
      return NextResponse.json(
        { error: createUserError?.message || 'Failed to create field agent account' },
        { status: 400 }
      );
    }

    createdUserId = createdUser.user.id;

    const { error: profileError } = await serviceClient.from('profiles').upsert(
      {
        id: createdUserId,
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || null,
        role: 'field_agent',
        onboarding_completed: true,
        onboarding_skipped: true,
        registration_help_response: 'no',
        registration_help_answered_at: now,
        updated_at: now,
      },
      { onConflict: 'id' }
    );

    if (profileError) {
      throw new Error(profileError.message || 'Failed to create field agent profile');
    }

    const { data: officerRecord, error: officerInsertError } = await serviceClient
      .from('registration_officers')
      .insert({
        user_id: createdUserId,
        officer_code: officerCode,
        is_active: true,
        region: region || null,
        town: town || null,
        notes: notes || null,
        created_at: now,
        updated_at: now,
      })
      .select('id, user_id, officer_code, is_active, region, town')
      .single();

    if (officerInsertError || !officerRecord) {
      throw new Error(officerInsertError?.message || 'Failed to create field agent record');
    }

    try {
      await serviceClient.from('admin_audit_log').insert({
        action: 'create_registration_officer',
        admin_id: admin.userId,
        admin_type: admin.adminType,
        target_table: 'registration_officers',
        target_id: officerRecord.id,
        new_values: {
          user_id: createdUserId,
          officer_code: officerCode,
          email,
          region: region || null,
          town: town || null,
        },
      });
    } catch {
      // Ignore audit logging failures for account creation.
    }

    const baseUrl = getRequestBaseUrl();
    return NextResponse.json({
      success: true,
      officer: officerRecord,
      account: {
        userId: createdUserId,
        email,
        temporaryPassword,
        shareUrl: buildOfficerSignupUrl(baseUrl, officerCode),
      },
    });
  } catch (error) {
    if (createdUserId) {
      const serviceClient = createServiceSupabaseClient();
      try {
        await serviceClient.from('registration_officers').delete().eq('user_id', createdUserId);
      } catch {
        // Ignore rollback failures.
      }
      try {
        await serviceClient.from('profiles').delete().eq('id', createdUserId);
      } catch {
        // Ignore rollback failures.
      }
      await serviceClient.auth.admin.deleteUser(createdUserId).catch(() => null);
    }

    const message =
      error instanceof Error ? error.message : 'Failed to create field agent account';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Admin access required' || message.includes('Insufficient admin privileges')
          ? 403
          : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

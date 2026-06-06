import { NextRequest, NextResponse } from 'next/server';
import { getRequestBaseUrl } from '@/lib/app-url';
import { requireFieldAgent } from '@/lib/field-registration/auth';
import {
  createLeadInvite,
  createOrUpdateRegistrationLead,
  listRegistrationLeadsForOfficer,
  markLeadInviteFailed,
  markLeadInviteSent,
} from '@/lib/field-registration/service';
import type {
  RegistrationLeadCaptureMode,
  RegistrationLeadRole,
  RegistrationLeadStatus,
} from '@/lib/field-registration/types';
import { sendFieldRegistrationInviteWhatsapp } from '@/lib/messaging/whatsapp';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

function getRoleLabel(role: RegistrationLeadRole): string {
  switch (role) {
    case 'job_seeker':
      return 'Job seeker';
    case 'talent':
      return 'Talent';
    case 'recruiter':
      return 'Recruiter';
    default:
      return 'Account';
  }
}

export async function GET(request: NextRequest) {
  try {
    const fieldAgent = await requireFieldAgent({ allowInactive: true });
    const serviceClient = createServiceSupabaseClient();
    const searchParams = request.nextUrl.searchParams;
    const status = (searchParams.get('status') || 'all') as
      | RegistrationLeadStatus
      | 'all';
    const role = (searchParams.get('role') || 'all') as RegistrationLeadRole | 'all';
    const q = searchParams.get('q');

    const leads = await listRegistrationLeadsForOfficer(serviceClient, fieldAgent.userId, {
      status,
      role,
      q,
    });

    return NextResponse.json({ leads });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load registration leads';
    const status =
      message === 'Authentication required'
        ? 401
        : message.includes('Field agent')
          ? 403
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const fieldAgent = await requireFieldAgent();
    const serviceClient = createServiceSupabaseClient();
    const body = await request.json().catch(() => null);

    const fullName = typeof body?.fullName === 'string' ? body.fullName : '';
    const phone = typeof body?.phone === 'string' ? body.phone : '';
    const intendedRole = (body?.intendedRole || 'job_seeker') as RegistrationLeadRole;
    const captureMode = (body?.captureMode || 'quick_capture') as RegistrationLeadCaptureMode;
    const consentWhatsapp = body?.consentWhatsapp === true;
    const email = typeof body?.email === 'string' ? body.email : null;
    const notes = typeof body?.notes === 'string' ? body.notes : null;
    const sendInvite = body?.sendInvite === true;
    const payload =
      body?.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : null;

    const result = await createOrUpdateRegistrationLead(serviceClient, {
      officerUserId: fieldAgent.userId,
      officerCode: fieldAgent.officerCode,
      fullName,
      phone,
      intendedRole,
      captureMode,
      consentWhatsapp,
      email,
      notes,
      payload,
    });

    if (!sendInvite) {
      const warning = result.existingUserId
        ? 'This phone number is already linked to an existing JobLinca account.'
        : null;
      return NextResponse.json({
        success: true,
        created: result.created,
        lead: result.lead,
        duplicateExistingUser: Boolean(result.existingUserId),
        warning,
      });
    }

    if (result.existingUserId) {
      return NextResponse.json({
        success: true,
        created: result.created,
        lead: result.lead,
        duplicateExistingUser: true,
        warning: 'This phone number is already linked to an existing JobLinca account.',
      });
    }

    if (!result.lead.consent_whatsapp) {
      return NextResponse.json({
        success: true,
        created: result.created,
        lead: result.lead,
        warning: 'WhatsApp consent is required before sending an invite.',
      });
    }

    const invite = await createLeadInvite(serviceClient, {
      leadId: result.lead.id,
      actorUserId: fieldAgent.userId,
      baseUrl: getRequestBaseUrl(),
    });

    try {
      const delivery = await sendFieldRegistrationInviteWhatsapp({
        to: invite.lead.phone_e164,
        fullName: invite.lead.full_name,
        roleLabel: getRoleLabel(invite.lead.intended_role),
        completionUrl: invite.claimUrl,
        userId: fieldAgent.userId,
      });

      await markLeadInviteSent(serviceClient, {
        leadId: invite.lead.id,
        inviteId: invite.invite.id,
        actorUserId: fieldAgent.userId,
      });

      return NextResponse.json({
        success: true,
        created: result.created,
        lead: {
          ...invite.lead,
          status: 'invite_sent',
        },
        invite: {
          ...invite.invite,
          status: 'sent',
          sent_at: new Date().toISOString(),
        },
        claimUrl: invite.claimUrl,
        delivery,
      });
    } catch (deliveryError) {
      const message =
        deliveryError instanceof Error
          ? deliveryError.message
          : 'Failed to send registration invite';

      await markLeadInviteFailed(serviceClient, {
        leadId: invite.lead.id,
        inviteId: invite.invite.id,
        actorUserId: fieldAgent.userId,
        errorMessage: message,
      });

      return NextResponse.json(
        {
          success: false,
          lead: result.lead,
          invite: {
            ...invite.invite,
            status: 'failed',
            error_message: message,
          },
          error: message,
        },
        { status: 502 }
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create registration lead';
    const status =
      message === 'Authentication required'
        ? 401
        : message.includes('Field agent')
          ? 403
          : message.includes('required') || message.includes('invalid')
            ? 400
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

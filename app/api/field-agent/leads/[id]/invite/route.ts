import { NextRequest, NextResponse } from 'next/server';
import { getRequestBaseUrl } from '@/lib/app-url';
import { requireFieldAgent } from '@/lib/field-registration/auth';
import {
  createLeadInvite,
  markLeadInviteFailed,
  markLeadInviteSent,
} from '@/lib/field-registration/service';
import { sendFieldRegistrationInviteWhatsapp } from '@/lib/messaging/whatsapp';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

function getRoleLabel(role: string): string {
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

export async function POST(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const fieldAgent = await requireFieldAgent();
    const serviceClient = createServiceSupabaseClient();
    const invite = await createLeadInvite(serviceClient, {
      leadId: context.params.id,
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
          lead: invite.lead,
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
      error instanceof Error ? error.message : 'Failed to resend registration invite';
    const status =
      message === 'Authentication required'
        ? 401
        : message.includes('Field agent')
          ? 403
          : message.includes('not found') || message.includes('cannot')
            ? 404
            : message.includes('required')
              ? 400
              : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

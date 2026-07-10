import { NextRequest, NextResponse } from 'next/server';
import { requireAdminType } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { updateSupportTicket } from '@/lib/support-tickets/service';
import type {
  SupportTicketPriority,
  SupportTicketStatus,
  SupportTicketTeam,
} from '@/lib/support-tickets/types';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireAdminType(['super', 'operations']);
    const serviceClient = createServiceSupabaseClient();
    const body = await request.json().catch(() => null);

    const status =
      typeof body?.status === 'string'
        ? (body.status as SupportTicketStatus)
        : undefined;
    const priority =
      typeof body?.priority === 'string'
        ? (body.priority as SupportTicketPriority)
        : undefined;
    const assignedTeam =
      typeof body?.assignedTeam === 'string'
        ? (body.assignedTeam as SupportTicketTeam)
        : undefined;
    const resolutionSummary =
      typeof body?.resolutionSummary === 'string'
        ? body.resolutionSummary
        : undefined;
    const messageBody =
      typeof body?.messageBody === 'string' ? body.messageBody : undefined;
    const messageVisibility =
      body?.messageVisibility === 'public' ? 'public' : 'internal';

    const ticket = await updateSupportTicket(serviceClient, {
      ticketId: params.id,
      actorUserId: admin.userId!,
      assignedAdminId: admin.userId!,
      status,
      priority,
      assignedTeam,
      resolutionSummary,
      messageBody,
      messageVisibility,
    });

    try {
      await serviceClient.from('admin_audit_log').insert({
        action: 'update_support_ticket',
        admin_id: admin.userId,
        admin_type: admin.adminType,
        target_table: 'support_tickets',
        target_id: params.id,
        new_values: {
          status: status ?? null,
          priority: priority ?? null,
          assigned_team: assignedTeam ?? null,
          resolution_summary_updated: resolutionSummary !== undefined,
          message_visibility: messageBody ? messageVisibility : null,
        },
      });
    } catch {
      // Ignore audit logging failures for operational updates.
    }

    return NextResponse.json({ success: true, ticket });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to update support ticket';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Admin access required' || message.includes('Insufficient admin privileges')
          ? 403
          : message.includes('Invalid')
            ? 400
            : message.includes('not found')
              ? 404
              : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

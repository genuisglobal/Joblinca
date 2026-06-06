import { NextRequest, NextResponse } from 'next/server';
import { requireFieldAgent } from '@/lib/field-registration/auth';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  createSupportTicket,
  listSupportTicketsForFieldAgent,
} from '@/lib/support-tickets/service';
import type {
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportTicketTeam,
} from '@/lib/support-tickets/types';
import type { RegistrationLeadRole } from '@/lib/field-registration/types';

export async function GET(request: NextRequest) {
  try {
    const fieldAgent = await requireFieldAgent({ allowInactive: true });
    const serviceClient = createServiceSupabaseClient();
    const searchParams = request.nextUrl.searchParams;
    const status = (searchParams.get('status') || 'all') as
      | SupportTicketStatus
      | 'all';
    const assignedTeam = (searchParams.get('assignedTeam') || 'all') as
      | SupportTicketTeam
      | 'all';

    const tickets = await listSupportTicketsForFieldAgent(
      serviceClient,
      fieldAgent.userId,
      {
        status,
        assignedTeam,
      }
    );

    return NextResponse.json({ tickets });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load support tickets';
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

    const targetRole = (body?.targetRole || 'job_seeker') as RegistrationLeadRole;
    const category = (body?.category || 'other') as SupportTicketCategory;
    const priority = (body?.priority || 'normal') as SupportTicketPriority;
    const assignedTeam = (body?.assignedTeam || 'operations') as SupportTicketTeam;
    const requesterUserId =
      typeof body?.requesterUserId === 'string' ? body.requesterUserId : null;
    const registrationLeadId =
      typeof body?.registrationLeadId === 'string' ? body.registrationLeadId : null;
    const subjectFullName =
      typeof body?.subjectFullName === 'string' ? body.subjectFullName : '';
    const subjectPhone = typeof body?.subjectPhone === 'string' ? body.subjectPhone : '';
    const subjectEmail =
      typeof body?.subjectEmail === 'string' ? body.subjectEmail : null;
    const subject = typeof body?.subject === 'string' ? body.subject : '';
    const description =
      typeof body?.description === 'string' ? body.description : '';

    const ticket = await createSupportTicket(serviceClient, {
      fieldAgentUserId: fieldAgent.userId,
      fieldOfficerCodeSnapshot: fieldAgent.officerCode,
      requesterUserId,
      registrationLeadId,
      targetRole,
      subjectFullName,
      subjectPhone,
      subjectEmail,
      category,
      priority,
      assignedTeam,
      subject,
      description,
    });

    return NextResponse.json({
      success: true,
      ticket,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create support ticket';
    const status =
      message === 'Authentication required'
        ? 401
        : message.includes('Field agent')
          ? 403
          : message.includes('required') || message.includes('invalid')
            ? 400
            : message.includes('not found')
              ? 404
              : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireFieldAgent } from '@/lib/field-registration/auth';
import { cancelRegistrationLead } from '@/lib/field-registration/service';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export async function POST(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const fieldAgent = await requireFieldAgent({ allowInactive: true });
    const serviceClient = createServiceSupabaseClient();
    const lead = await cancelRegistrationLead(serviceClient, {
      leadId: context.params.id,
      officerUserId: fieldAgent.userId,
    });

    return NextResponse.json({ success: true, lead });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to cancel registration lead';
    const status =
      message === 'Authentication required'
        ? 401
        : message.includes('Field agent')
          ? 403
          : message.includes('not found') || message.includes('cannot')
            ? 404
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

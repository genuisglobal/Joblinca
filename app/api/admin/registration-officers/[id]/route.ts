import { NextRequest, NextResponse } from 'next/server';
import { requireAdminType } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireAdminType(['super', 'operations']);
    const serviceClient = createServiceSupabaseClient();
    const body = await request.json().catch(() => null);

    const isActive = typeof body?.isActive === 'boolean' ? body.isActive : null;
    const region = typeof body?.region === 'string' ? body.region.trim() : undefined;
    const town = typeof body?.town === 'string' ? body.town.trim() : undefined;
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : undefined;

    if (isActive === null && region === undefined && town === undefined && notes === undefined) {
      return NextResponse.json({ error: 'No updates supplied' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      updated_at: now,
    };

    if (isActive !== null) {
      updates.is_active = isActive;
      updates.deactivated_at = isActive ? null : now;
    }
    if (region !== undefined) updates.region = region || null;
    if (town !== undefined) updates.town = town || null;
    if (notes !== undefined) updates.notes = notes || null;

    const { data: updatedOfficer, error: updateError } = await serviceClient
      .from('registration_officers')
      .update(updates)
      .eq('id', params.id)
      .select('id, user_id, officer_code, is_active, region, town, deactivated_at')
      .single();

    if (updateError || !updatedOfficer) {
      return NextResponse.json(
        { error: updateError?.message || 'Field agent not found' },
        { status: 404 }
      );
    }

    try {
      await serviceClient.from('admin_audit_log').insert({
        action: 'update_registration_officer',
        admin_id: admin.userId,
        admin_type: admin.adminType,
        target_table: 'registration_officers',
        target_id: params.id,
        new_values: updates,
      });
    } catch {
      // Ignore audit logging failures for status updates.
    }

    return NextResponse.json({ success: true, officer: updatedOfficer });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to update field agent account';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Admin access required' || message.includes('Insufficient admin privileges')
          ? 403
          : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

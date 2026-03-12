import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  isSponsorPlacement,
  isSponsorStatus,
  isSponsorType,
} from '@/lib/sponsorship-schema';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalString(value: unknown) {
  const normalized = normalizeString(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await requireAdmin();
    const { id } = params;
    const body = (await request.json()) as Record<string, unknown>;

    if (!id) {
      return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};

    if (body.sponsor_type !== undefined) {
      const value = normalizeString(body.sponsor_type);
      if (!isSponsorType(value)) {
        return NextResponse.json({ error: 'Invalid sponsor_type' }, { status: 400 });
      }
      updates.sponsor_type = value;
    }

    if (body.placement !== undefined) {
      const value = normalizeString(body.placement);
      if (!isSponsorPlacement(value)) {
        return NextResponse.json({ error: 'Invalid placement' }, { status: 400 });
      }
      updates.placement = value;
    }

    if (body.status !== undefined) {
      const value = normalizeString(body.status);
      if (!isSponsorStatus(value)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      updates.status = value;
      updates.approved_by = value === 'active' ? userId : null;
    }

    const optionalFields = [
      'sponsor_name',
      'title',
      'short_copy',
      'cta_label',
      'cta_url',
      'image_url',
      'sponsor_logo_url',
      'job_id',
      'recruiter_id',
      'partner_course_id',
      'starts_at',
      'ends_at',
      'rejection_reason',
    ] as const;

    for (const field of optionalFields) {
      if (body[field] !== undefined) {
        updates[field] = normalizeOptionalString(body[field]);
      }
    }

    if (body.priority !== undefined) {
      const value = Number.parseInt(`${body.priority}`, 10);
      if (!Number.isFinite(value)) {
        return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
      }
      updates.priority = value;
    }

    if (body.price_xaf !== undefined) {
      const value = Number.parseInt(`${body.price_xaf}`, 10);
      if (!Number.isFinite(value)) {
        return NextResponse.json({ error: 'Invalid price_xaf' }, { status: 400 });
      }
      updates.price_xaf = Math.max(0, value);
    }

    if (body.audience_roles !== undefined) {
      updates.audience_roles = normalizeStringArray(body.audience_roles);
    }

    if (body.city_targets !== undefined) {
      updates.city_targets = normalizeStringArray(body.city_targets);
    }

    if (body.metadata !== undefined) {
      updates.metadata =
        body.metadata && typeof body.metadata === 'object'
          ? (body.metadata as Record<string, unknown>)
          : {};
    }

    const supabase = createServiceSupabaseClient();
    const { error } = await supabase.from('sponsor_campaigns').update(updates).eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();
    const { id } = params;

    if (!id) {
      return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();
    const { error } = await supabase.from('sponsor_campaigns').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

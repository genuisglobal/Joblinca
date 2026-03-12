import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  isSponsorPlacement,
  isSponsorStatus,
  isSponsorType,
} from '@/lib/sponsorship-schema';
import { listSponsorCampaigns } from '@/lib/sponsorships';

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

export async function GET() {
  try {
    await requireAdmin();
    const sponsorships = await listSponsorCampaigns();
    return NextResponse.json({ sponsorships });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAdmin();
    const body = (await request.json()) as Record<string, unknown>;
    const sponsorType = normalizeString(body.sponsor_type);
    const placement = normalizeString(body.placement);
    const status = normalizeString(body.status || 'draft');
    const sponsorName = normalizeString(body.sponsor_name);
    const title = normalizeString(body.title);
    const ctaUrl = normalizeOptionalString(body.cta_url);
    const jobId = normalizeOptionalString(body.job_id);
    const recruiterId = normalizeOptionalString(body.recruiter_id);
    const partnerCourseId = normalizeOptionalString(body.partner_course_id);
    const priority = Number.parseInt(`${body.priority ?? 0}`, 10);
    const priceXaf = Number.parseInt(`${body.price_xaf ?? 0}`, 10);

    if (!isSponsorType(sponsorType)) {
      return NextResponse.json({ error: 'Invalid sponsor_type' }, { status: 400 });
    }

    if (!isSponsorPlacement(placement)) {
      return NextResponse.json({ error: 'Invalid placement' }, { status: 400 });
    }

    if (!isSponsorStatus(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    if (!sponsorName || !title) {
      return NextResponse.json(
        { error: 'sponsor_name and title are required' },
        { status: 400 }
      );
    }

    if (!ctaUrl && !jobId && !recruiterId && !partnerCourseId) {
      return NextResponse.json(
        { error: 'Provide a cta_url or link the campaign to a job, recruiter, or academy record' },
        { status: 400 }
      );
    }

    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from('sponsor_campaigns')
      .insert({
        sponsor_type: sponsorType,
        placement,
        status,
        sponsor_name: sponsorName,
        title,
        short_copy: normalizeOptionalString(body.short_copy),
        cta_label: normalizeOptionalString(body.cta_label),
        cta_url: ctaUrl,
        image_url: normalizeOptionalString(body.image_url),
        sponsor_logo_url: normalizeOptionalString(body.sponsor_logo_url),
        job_id: jobId,
        recruiter_id: recruiterId,
        partner_course_id: partnerCourseId,
        audience_roles: normalizeStringArray(body.audience_roles),
        city_targets: normalizeStringArray(body.city_targets),
        priority: Number.isFinite(priority) ? priority : 0,
        price_xaf: Number.isFinite(priceXaf) ? Math.max(0, priceXaf) : 0,
        starts_at: normalizeOptionalString(body.starts_at),
        ends_at: normalizeOptionalString(body.ends_at),
        metadata:
          body.metadata && typeof body.metadata === 'object'
            ? (body.metadata as Record<string, unknown>)
            : {},
        created_by: userId,
        approved_by: status === 'active' ? userId : null,
      })
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { isMissingAggregationRelationError } from '@/lib/aggregation/admin';
import {
  updateAggregationSourceSchema,
  type UpdateAggregationSourceInput,
} from '@/lib/aggregation/source-schema';

function mapPatchPayload(payload: UpdateAggregationSourceInput, userId: string) {
  const update: Record<string, unknown> = {
    updated_by: userId,
  };

  if (payload.name !== undefined) update.name = payload.name;
  if (payload.slug !== undefined) update.slug = payload.slug;
  if (payload.sourceType !== undefined) update.source_type = payload.sourceType;
  if (payload.platformRegionId !== undefined) update.platform_region_id = payload.platformRegionId;
  if (payload.baseUrl !== undefined) update.base_url = payload.baseUrl;
  if (payload.sourceHomeUrl !== undefined) update.source_home_url = payload.sourceHomeUrl;
  if (payload.allowedDomains !== undefined) update.allowed_domains = payload.allowedDomains;
  if (payload.requiresAttribution !== undefined) update.requires_attribution = payload.requiresAttribution;
  if (payload.attributionText !== undefined) update.attribution_text = payload.attributionText;
  if (payload.pollIntervalMinutes !== undefined) update.poll_interval_minutes = payload.pollIntervalMinutes;
  if (payload.maxPagesPerRun !== undefined) update.max_pages_per_run = payload.maxPagesPerRun;
  if (payload.rateLimitPerMinute !== undefined) update.rate_limit_per_minute = payload.rateLimitPerMinute;
  if (payload.trustTier !== undefined) update.trust_tier = payload.trustTier;
  if (payload.enabled !== undefined) update.enabled = payload.enabled;
  if (payload.nextRunAt !== undefined) update.next_run_at = payload.nextRunAt;
  if (payload.config !== undefined) update.config_json = payload.config;
  if (payload.notes !== undefined) update.notes = payload.notes;

  return update;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await requireAdmin();
    const body = await request.json();
    const parsed = updateAggregationSourceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid aggregation source payload' },
        { status: 400 }
      );
    }

    const update = mapPatchPayload(parsed.data, userId as string);

    if (Object.keys(update).length === 1) {
      return NextResponse.json({ error: 'No source fields were provided to update.' }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from('aggregation_sources')
      .update(update)
      .eq('id', params.id)
      .select('*')
      .maybeSingle();

    if (error) {
      if (isMissingAggregationRelationError(error)) {
        return NextResponse.json(
          { error: 'Aggregation schema is not available yet. Apply the latest aggregation migration first.' },
          { status: 503 }
        );
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Aggregation source not found' }, { status: 404 });
    }

    return NextResponse.json({ source: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

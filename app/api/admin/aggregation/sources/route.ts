import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { isMissingAggregationRelationError } from '@/lib/aggregation/admin';
import {
  createAggregationSourceSchema,
  type CreateAggregationSourceInput,
} from '@/lib/aggregation/source-schema';

function mapSourcePayload(payload: CreateAggregationSourceInput, userId: string) {
  return {
    name: payload.name,
    slug: payload.slug,
    source_type: payload.sourceType,
    platform_region_id: payload.platformRegionId,
    base_url: payload.baseUrl,
    source_home_url: payload.sourceHomeUrl,
    allowed_domains: payload.allowedDomains,
    requires_attribution: payload.requiresAttribution,
    attribution_text: payload.attributionText,
    poll_interval_minutes: payload.pollIntervalMinutes,
    max_pages_per_run: payload.maxPagesPerRun,
    rate_limit_per_minute: payload.rateLimitPerMinute,
    trust_tier: payload.trustTier,
    enabled: payload.enabled,
    next_run_at: payload.nextRunAt,
    config_json: payload.config,
    notes: payload.notes,
    created_by: userId,
    updated_by: userId,
  };
}

export async function GET() {
  try {
    await requireAdmin();
    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from('aggregation_sources')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingAggregationRelationError(error)) {
        return NextResponse.json(
          { error: 'Aggregation schema is not available yet. Apply the latest aggregation migration first.' },
          { status: 503 }
        );
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sources: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAdmin();
    const body = await request.json();
    const parsed = createAggregationSourceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid aggregation source payload' },
        { status: 400 }
      );
    }

    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from('aggregation_sources')
      .insert(mapSourcePayload(parsed.data, userId as string))
      .select('*')
      .single();

    if (error) {
      if (isMissingAggregationRelationError(error)) {
        return NextResponse.json(
          { error: 'Aggregation schema is not available yet. Apply the latest aggregation migration first.' },
          { status: 503 }
        );
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ source: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

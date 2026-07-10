/**
 * Admin-adjustable auto-publish thresholds for the scraping pipeline.
 *
 * Scraped jobs are auto-published into the live `jobs` table only when their
 * trust_score is at or above `trustMin` AND their scam_score is below `scamMax`.
 * The values live in the single-row `aggregation_settings` table so admins can
 * tune them from the Aggregation Control Room without a redeploy.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface PublishThresholds {
  /** Minimum trust_score (0-100) required to auto-publish. */
  trustMin: number;
  /** Exclusive maximum scam_score (0-100); jobs at or above are held back. */
  scamMax: number;
}

/** Historical hardcoded defaults — used when the settings row is unavailable. */
export const DEFAULT_PUBLISH_THRESHOLDS: PublishThresholds = {
  trustMin: 60,
  scamMax: 30,
};

function clampScore(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Coerce arbitrary input into a valid {trustMin, scamMax} pair. */
export function normalizePublishThresholds(input: {
  trustMin?: unknown;
  scamMax?: unknown;
}): PublishThresholds {
  return {
    trustMin: clampScore(input.trustMin, DEFAULT_PUBLISH_THRESHOLDS.trustMin),
    scamMax: clampScore(input.scamMax, DEFAULT_PUBLISH_THRESHOLDS.scamMax),
  };
}

/**
 * Load the current auto-publish thresholds. Falls back to the defaults if the
 * table/row is missing (e.g. migration not yet applied) so the pipeline never
 * crashes on a config read.
 */
export async function loadPublishThresholds(
  supabase: SupabaseClient,
): Promise<PublishThresholds> {
  try {
    const { data, error } = await supabase
      .from('aggregation_settings')
      .select('auto_publish_trust_min, auto_publish_scam_max')
      .eq('id', 1)
      .maybeSingle();

    if (error || !data) return { ...DEFAULT_PUBLISH_THRESHOLDS };

    return normalizePublishThresholds({
      trustMin: data.auto_publish_trust_min,
      scamMax: data.auto_publish_scam_max,
    });
  } catch {
    return { ...DEFAULT_PUBLISH_THRESHOLDS };
  }
}

/** Persist new thresholds (upserts the singleton row). */
export async function savePublishThresholds(
  supabase: SupabaseClient,
  thresholds: PublishThresholds,
  updatedBy: string | null = null,
): Promise<PublishThresholds> {
  const normalized = normalizePublishThresholds(thresholds);

  const { error } = await supabase.from('aggregation_settings').upsert(
    {
      id: 1,
      auto_publish_trust_min: normalized.trustMin,
      auto_publish_scam_max: normalized.scamMax,
      updated_by: updatedBy,
    },
    { onConflict: 'id' },
  );

  if (error) throw new Error(`Failed to save publish thresholds: ${error.message}`);
  return normalized;
}

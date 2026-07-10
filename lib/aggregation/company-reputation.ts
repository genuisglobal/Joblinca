/**
 * Company reputation registry.
 *
 * Tracks per-company signals across the aggregation pipeline so repeat
 * offenders can't keep slipping through under the same name:
 *   - admin rejections (reject-with-reason in the review queue)
 *   - seeker scam reports (report-this-job)
 *   - successful publishes
 *
 * Status ladder (auto-escalated, but 'verified' is admin-only and never
 * auto-changed):
 *   verified → neutral → watch (2+ negative events: manual review only)
 *            → blocked (3+ scam reports or 5+ negative events: never published)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type CompanyStatus = 'verified' | 'neutral' | 'watch' | 'blocked';

export interface CompanyReputation {
  id: string;
  normalized_name: string;
  display_name: string | null;
  status: CompanyStatus;
  scam_reports: number;
  rejections: number;
  published_jobs: number;
}

const WATCH_THRESHOLD = 2;
const BLOCK_SCAM_THRESHOLD = 3;
const BLOCK_TOTAL_THRESHOLD = 5;

const COMPANY_SUFFIXES =
  /\b(sarl|s\.a\.r\.l|sa|s\.a|ltd|limited|inc|llc|plc|gmbh|cie|co|corp|company|group|groupe|holding|international|cameroun|cameroon)\b/g;

/** Normalize a company name for matching: lowercase, no accents/suffixes/punctuation. */
export function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(COMPANY_SUFFIXES, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function getCompanyReputation(
  supabase: SupabaseClient,
  companyName: string | null | undefined
): Promise<CompanyReputation | null> {
  const normalized = normalizeCompanyName(companyName);
  if (!normalized) return null;

  const { data } = await supabase
    .from('company_reputation')
    .select('id, normalized_name, display_name, status, scam_reports, rejections, published_jobs')
    .eq('normalized_name', normalized)
    .maybeSingle();

  return (data as CompanyReputation | null) ?? null;
}

function escalatedStatus(current: CompanyStatus, scamReports: number, rejections: number): CompanyStatus {
  // Admin-granted trust is never auto-revoked
  if (current === 'verified') return 'verified';
  if (current === 'blocked') return 'blocked';

  const negative = scamReports + rejections;
  if (scamReports >= BLOCK_SCAM_THRESHOLD || negative >= BLOCK_TOTAL_THRESHOLD) {
    return 'blocked';
  }
  if (negative >= WATCH_THRESHOLD) {
    return 'watch';
  }
  return current;
}

export type CompanyEvent = 'rejection' | 'scam_report' | 'published';

/**
 * Record an event against a company, creating its reputation row on first
 * sight and auto-escalating status when negative events accumulate.
 * Never throws — reputation tracking must not break the calling flow.
 */
export async function recordCompanyEvent(
  supabase: SupabaseClient,
  companyName: string | null | undefined,
  event: CompanyEvent
): Promise<CompanyReputation | null> {
  try {
    const normalized = normalizeCompanyName(companyName);
    if (!normalized) return null;

    const existing = await getCompanyReputation(supabase, companyName);

    const scamReports = (existing?.scam_reports ?? 0) + (event === 'scam_report' ? 1 : 0);
    const rejections = (existing?.rejections ?? 0) + (event === 'rejection' ? 1 : 0);
    const publishedJobs = (existing?.published_jobs ?? 0) + (event === 'published' ? 1 : 0);
    const status = escalatedStatus(existing?.status ?? 'neutral', scamReports, rejections);

    const { data, error } = await supabase
      .from('company_reputation')
      .upsert(
        {
          normalized_name: normalized,
          display_name: existing?.display_name || companyName?.trim() || null,
          status,
          scam_reports: scamReports,
          rejections: rejections,
          published_jobs: publishedJobs,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'normalized_name' }
      )
      .select('id, normalized_name, display_name, status, scam_reports, rejections, published_jobs')
      .single();

    if (error) {
      console.error('[company-reputation] upsert failed:', error.message);
      return null;
    }

    return data as CompanyReputation;
  } catch (err) {
    console.error('[company-reputation] recordCompanyEvent error:', err);
    return null;
  }
}

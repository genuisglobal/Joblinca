/**
 * Job ingestion service — bridges scrapers to the aggregation tracking system.
 *
 * This is the missing link: it takes scraper output and creates proper records
 * in aggregation_runs, aggregation_run_items, and discovered_jobs tables,
 * with deduplication, trust scoring, and full audit trail.
 *
 * Flow:
 *   Scraper.run() → ScrapeResult
 *     → ensureSourceExists()     (auto-register source in aggregation_sources)
 *     → createRun()              (aggregation_runs record)
 *     → ingestJobs()             (discovered_jobs + run_items + dedup)
 *     → finalizeRun()            (metrics + status update)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ScrapedJob, ScrapeResult } from './types';
import { createHash } from 'crypto';

// Source type mapping for our scrapers
const SOURCE_TYPE_MAP: Record<string, 'api' | 'html' | 'manual'> = {
  reliefweb: 'api',
  kamerpower: 'html',
  minajobs: 'html',
  cameroonjobs: 'html',
  jobincamer: 'html',
  emploicm: 'html',
  facebook: 'manual',
  remotive: 'api',
  jobicy: 'api',
  findwork: 'api',
};

const SOURCE_META: Record<string, { name: string; url: string; trustTier: number }> = {
  reliefweb: { name: 'ReliefWeb', url: 'https://reliefweb.int', trustTier: 90 },
  kamerpower: { name: 'KamerPower', url: 'https://kamerpower.com', trustTier: 60 },
  minajobs: { name: 'MinaJobs', url: 'https://minajobs.net', trustTier: 60 },
  cameroonjobs: { name: 'CameroonJobs.net', url: 'https://www.cameroonjobs.net', trustTier: 70 },
  jobincamer: { name: 'JobInCamer', url: 'https://www.jobincamer.com', trustTier: 65 },
  emploicm: { name: 'Emploi.cm', url: 'https://www.emploi.cm', trustTier: 75 },
  facebook: { name: 'Facebook Groups', url: 'https://facebook.com', trustTier: 30 },
  remotive: { name: 'Remotive', url: 'https://remotive.com', trustTier: 80 },
  jobicy: { name: 'Jobicy', url: 'https://jobicy.com', trustTier: 75 },
  findwork: { name: 'Findwork', url: 'https://findwork.dev', trustTier: 75 },
};

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Normalize text for dedup: lowercase, strip accents/punctuation, collapse
 * whitespace, and remove filler words so slight variations across sources
 * still produce the same hash.
 */
function normalizeForDedup(text: string): string {
  const skipWords = new Set([
    'recrutement', 'recruitment', 'hiring', 'avis', 'offre',
    'de', 'du', 'un', 'une', 'des', 'le', 'la', 'les', 'et',
    'a', 'the', 'an', 'for', 'of', 'at', 'and', 'is', 'are',
    'looking', 'recherche', 'cherche', 'recrute',
  ]);
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s]/g, ' ')   // strip punctuation
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 1 && !skipWords.has(w))
    .join(' ');
}

/** Generate a dedupe hash from normalized title + company. */
function generateDedupeHash(job: ScrapedJob): string {
  const title = normalizeForDedup(job.title);
  const company = normalizeForDedup(job.company_name || '');
  // Use only significant words from title + company (location varies too much
  // across sources to be reliable for dedup).
  const normalized = `${title}|${company}`;
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

/** Calculate a basic trust score from job data completeness + source tier. */
function calculateTrustScore(job: ScrapedJob, sourceTrustTier: number): number {
  let score = sourceTrustTier * 0.5; // Source trust is 50% of score

  // Completeness signals
  if (job.title && job.title.length > 10) score += 5;
  if (job.company_name) score += 10;
  if (job.description && job.description.length > 50) score += 5;
  if (job.location && job.location !== 'Cameroon') score += 5;
  if (job.salary) score += 5;
  if (job.posted_at) score += 5;
  if (job.closing_at) score += 5;
  if (job.url && job.url.startsWith('http')) score += 5;
  if (job.company_logo) score += 5;

  return Math.min(100, Math.round(score));
}

/** Calculate a basic scam score (higher = more suspicious). */
function calculateScamScore(job: ScrapedJob): number {
  let score = 0;

  const titleLower = job.title.toLowerCase();
  const descLower = (job.description || '').toLowerCase();
  const text = `${titleLower} ${descLower}`;

  // Suspicious signals
  if (!job.company_name) score += 15;
  if (text.includes('earn money') || text.includes('gagner de l\'argent')) score += 20;
  if (text.includes('work from home') && text.includes('no experience')) score += 15;
  if (text.includes('whatsapp') && !job.company_name) score += 10;
  if (text.includes('urgent') && text.includes('payment')) score += 15;
  if (job.title.length < 5) score += 10;
  if (text.includes('mlm') || text.includes('network marketing')) score += 25;

  return Math.min(100, score);
}

export interface IngestionResult {
  runId: string;
  sourceId: string;
  status: 'completed' | 'failed' | 'partial';
  fetched: number;
  inserted: number;
  updated: number;
  duplicates: number;
  suspicious: number;
  errors: number;
  duration_ms: number;
}

/**
 * Ensure an aggregation_source record exists for the given scraper source.
 * Auto-creates if missing.
 */
async function ensureSourceExists(supabase: SupabaseClient, source: string): Promise<string | null> {
  // Check if source already exists
  const { data: existing } = await supabase
    .from('aggregation_sources')
    .select('id')
    .eq('slug', source)
    .maybeSingle();

  if (existing) return existing.id;

  // Auto-create source
  const meta = SOURCE_META[source] || { name: source, url: '', trustTier: 50 };
  const sourceType = SOURCE_TYPE_MAP[source] || 'html';

  const { data: created, error } = await supabase
    .from('aggregation_sources')
    .insert({
      name: meta.name,
      slug: source,
      source_type: sourceType,
      platform_region_id: 'cm',
      base_url: meta.url,
      source_home_url: meta.url,
      trust_tier: meta.trustTier,
      enabled: true,
      health_status: 'unknown',
      poll_interval_minutes: 360,
      max_pages_per_run: 20,
      rate_limit_per_minute: 30,
    })
    .select('id')
    .single();

  if (error) {
    console.error(`[ingestion] Failed to create source ${source}:`, error.message);
    return null;
  }

  return created.id;
}

/**
 * Ingest a scrape result into the aggregation system.
 * Creates aggregation_run, discovered_jobs, and run_items records.
 */
export async function ingestScrapeResult(
  result: ScrapeResult,
  triggerType: 'cron' | 'manual' = 'cron'
): Promise<IngestionResult | null> {
  const start = Date.now();
  const supabase = getSupabase();

  if (!supabase) {
    console.error('[ingestion] Supabase not configured');
    return null;
  }

  const sourceId = await ensureSourceExists(supabase, result.source);
  if (!sourceId) {
    console.error(`[ingestion] Could not resolve source: ${result.source}`);
    return null;
  }

  // Create aggregation_run
  const { data: run, error: runErr } = await supabase
    .from('aggregation_runs')
    .insert({
      source_id: sourceId,
      trigger_type: triggerType,
      status: 'running',
      started_at: new Date().toISOString(),
      fetched_count: result.jobs.length,
    })
    .select('id')
    .single();

  if (runErr || !run) {
    console.error(`[ingestion] Failed to create run for ${result.source}:`, runErr?.message);
    // Update source health
    await supabase
      .from('aggregation_sources')
      .update({ health_status: 'failing', last_failure_at: new Date().toISOString(), failure_count: 1 })
      .eq('id', sourceId);
    return null;
  }

  const runId = run.id;
  const sourceMeta = SOURCE_META[result.source];
  const trustTier = sourceMeta?.trustTier || 50;

  let inserted = 0;
  let updated = 0;
  let duplicates = 0;
  let suspicious = 0;
  let errorCount = 0;

  // Process each job
  for (const job of result.jobs) {
    try {
      const dedupeHash = generateDedupeHash(job);
      const trustScore = calculateTrustScore(job, trustTier);
      const scamScore = calculateScamScore(job);

      if (scamScore >= 50) suspicious++;

      // Check for existing job by dedupe_hash
      const { data: existingJob } = await supabase
        .from('discovered_jobs')
        .select('id')
        .eq('dedupe_hash', dedupeHash)
        .maybeSingle();

      let discoveredJobId: string;

      if (existingJob) {
        // Update last_seen_at
        discoveredJobId = existingJob.id;
        await supabase
          .from('discovered_jobs')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', discoveredJobId);
        duplicates++;
        updated++;
      } else {
        // Insert new discovered job
        const { data: newJob, error: jobErr } = await supabase
          .from('discovered_jobs')
          .insert({
            platform_region_id: 'cm',
            primary_source_id: sourceId,
            source_type: SOURCE_TYPE_MAP[result.source] || 'html',
            source_name: result.source,
            source_url: sourceMeta?.url || null,
            original_job_url: job.url,
            primary_external_job_id: job.external_id,
            title: job.title,
            company_name: job.company_name,
            location: job.location,
            country: 'Cameroon',
            city: job.region || null,
            employment_type: job.job_type,
            description_raw: job.description,
            apply_url: job.url,
            posted_at: job.posted_at || null,
            expires_at: job.closing_at || null,
            trust_score: trustScore,
            scam_score: scamScore,
            dedupe_hash: dedupeHash,
            language: job.language,
            contact_email: job.contact_email || null,
            contact_phone: job.contact_phone || null,
            contact_whatsapp: job.contact_whatsapp || null,
            ingestion_status: scamScore >= 50 ? 'review_required' : 'normalized',
            verification_status: scamScore >= 50 ? 'suspicious' : 'discovered',
          })
          .select('id')
          .single();

        if (jobErr || !newJob) {
          console.error(`[ingestion] Job insert error:`, jobErr?.message);
          errorCount++;
          continue;
        }

        discoveredJobId = newJob.id;
        inserted++;
      }

      // Create run item
      await supabase
        .from('aggregation_run_items')
        .insert({
          run_id: runId,
          source_id: sourceId,
          external_job_id: job.external_id,
          original_job_url: job.url,
          source_payload_json: {
            title: job.title,
            company: job.company_name,
            location: job.location,
            salary: job.salary,
            job_type: job.job_type,
            category: job.category,
          },
          parse_status: 'parsed',
          raw_hash: dedupeHash,
          discovered_job_id: discoveredJobId,
        });

      // Track source for multi-source dedup
      const { data: existingSource } = await supabase
        .from('discovered_job_sources')
        .select('id')
        .eq('discovered_job_id', discoveredJobId)
        .eq('source_id', sourceId)
        .maybeSingle();

      if (existingSource) {
        await supabase
          .from('discovered_job_sources')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', existingSource.id);
      } else {
        await supabase
          .from('discovered_job_sources')
          .insert({
            discovered_job_id: discoveredJobId,
            source_id: sourceId,
            external_job_id: job.external_id,
            original_job_url: job.url,
            is_primary: !existingJob,
            source_confidence: trustTier,
          });
      }
    } catch (err) {
      console.error(`[ingestion] Error processing job ${job.external_id}:`, err);
      errorCount++;
    }
  }

  // Finalize run
  const runStatus = errorCount > 0 && inserted === 0 ? 'failed'
    : errorCount > 0 ? 'partial'
    : 'completed';

  await supabase
    .from('aggregation_runs')
    .update({
      status: runStatus,
      finished_at: new Date().toISOString(),
      fetched_count: result.jobs.length,
      parsed_count: result.jobs.length,
      normalized_count: inserted + updated,
      inserted_count: inserted,
      updated_count: updated,
      duplicate_count: duplicates,
      suspicious_count: suspicious,
      error_count: errorCount,
      error_summary: result.errors.length > 0 ? result.errors.join('; ') : null,
      metrics_json: {
        duration_ms: result.duration_ms,
        pages_scraped: result.pages_scraped,
        scraper_errors: result.errors,
      },
    })
    .eq('id', runId);

  // Update source health
  const healthStatus = runStatus === 'completed' ? 'healthy'
    : runStatus === 'partial' ? 'degraded'
    : 'failing';

  const sourceUpdate: Record<string, any> = {
    health_status: healthStatus,
    next_run_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // +6h
  };

  if (runStatus === 'completed' || runStatus === 'partial') {
    sourceUpdate.last_success_at = new Date().toISOString();
    sourceUpdate.failure_count = 0;
  } else {
    sourceUpdate.last_failure_at = new Date().toISOString();
  }

  await supabase
    .from('aggregation_sources')
    .update(sourceUpdate)
    .eq('id', sourceId);

  const ingestionResult: IngestionResult = {
    runId,
    sourceId,
    status: runStatus,
    fetched: result.jobs.length,
    inserted,
    updated,
    duplicates,
    suspicious,
    errors: errorCount,
    duration_ms: Date.now() - start,
  };

  console.log(`[ingestion] ${result.source}: ${runStatus} — ${inserted} inserted, ${updated} updated, ${duplicates} dupes, ${suspicious} suspicious, ${errorCount} errors`);

  return ingestionResult;
}

/**
 * Ingest multiple scrape results (from runAllScrapers).
 * Processes each source independently.
 */
export async function ingestAllResults(
  results: ScrapeResult[],
  triggerType: 'cron' | 'manual' = 'cron'
): Promise<IngestionResult[]> {
  const ingestionResults: IngestionResult[] = [];

  for (const result of results) {
    if (result.jobs.length === 0 && result.errors.length === 0) continue;

    const ingested = await ingestScrapeResult(result, triggerType);
    if (ingested) {
      ingestionResults.push(ingested);
    }
  }

  return ingestionResults;
}

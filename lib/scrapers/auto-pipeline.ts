/**
 * Fully automated scraping pipeline.
 *
 * Runs all scrapers → ingests into discovered_jobs → auto-publishes
 * trustworthy jobs (high trust, low scam) → deduplicates the published
 * jobs table. No manual admin intervention required.
 *
 * Safety thresholds:
 *   - Auto-publish: trust_score >= 60 AND scam_score < 30
 *   - Jobs below threshold stay in discovered_jobs for manual review
 *   - Duplicate detection prevents the same job from being published twice
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { runAllScrapers } from './registry';
import { ingestAllResults, type IngestionResult } from './ingestion';
import { findDuplicateJob, findAllDuplicateGroups, hideDuplicateJobs } from '@/lib/jobs/dedup';
import { detectContentLanguage, normalizeLocale } from '@/lib/i18n/locale';

// Auto-publish thresholds
const AUTO_PUBLISH_TRUST_MIN = 60;
const AUTO_PUBLISH_SCAM_MAX = 30;

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export interface AutoPipelineResult {
  scraping: {
    sources_run: number;
    total_jobs_fetched: number;
    duration_ms: number;
  };
  ingestion: {
    runs: number;
    inserted: number;
    duplicates: number;
    suspicious: number;
  };
  auto_publish: {
    eligible: number;
    published: number;
    deduplicated: number;
    skipped_duplicate: number;
    errors: number;
  };
  dedup_cleanup: {
    groups_found: number;
    duplicates_hidden: number;
  };
  stale_cleanup: {
    expired: number;
  };
  total_duration_ms: number;
}

export interface AutoPipelineMaintenanceResult {
  auto_publish: {
    eligible: number;
    published: number;
    deduplicated: number;
    skipped_duplicate: number;
    errors: number;
  };
  dedup_cleanup: {
    groups_found: number;
    duplicates_hidden: number;
  };
  stale_cleanup: {
    expired: number;
  };
  total_duration_ms: number;
}

/**
 * Run the complete automated pipeline:
 *   1. Scrape all sources
 *   2. Ingest into discovered_jobs
 *   3. Auto-publish trustworthy jobs
 *   4. Clean up duplicates in published jobs
 */
export async function runAutoPipeline(
  triggerType: 'cron' | 'manual' = 'cron',
  maxPages: number = 2,
): Promise<AutoPipelineResult | null> {
  const pipelineStart = Date.now();
  const supabase = getSupabase();

  if (!supabase) {
    console.error('[auto-pipeline] Supabase not configured');
    return null;
  }

  // Step 1: Scrape all sources
  console.log('[auto-pipeline] Step 1: Running scrapers...');
  const overrides = Object.fromEntries(
    ['reliefweb', 'kamerpower', 'minajobs', 'cameroonjobs', 'jobincamer', 'emploicm'].map(
      (s) => [s, { maxPages }]
    )
  );
  const scrapeResult = await runAllScrapers(overrides);

  // Step 2: Ingest into discovered_jobs
  console.log('[auto-pipeline] Step 2: Ingesting results...');
  const ingestionResults = await ingestAllResults(scrapeResult.results, triggerType);

  const ingestionSummary = {
    runs: ingestionResults.length,
    inserted: ingestionResults.reduce((s, r) => s + r.inserted, 0),
    duplicates: ingestionResults.reduce((s, r) => s + r.duplicates, 0),
    suspicious: ingestionResults.reduce((s, r) => s + r.suspicious, 0),
  };

  // Step 3: Auto-publish trustworthy jobs
  console.log('[auto-pipeline] Step 3: Auto-publishing trustworthy jobs...');
  const publishResult = await autoPublishDiscoveredJobs(supabase);

  // Step 4: Deduplicate published jobs
  console.log('[auto-pipeline] Step 4: Cleaning up duplicates...');
  const dedupResult = await autoCleanDuplicates(supabase);

  // Step 5: Remove stale/expired jobs
  console.log('[auto-pipeline] Step 5: Cleaning up expired jobs...');
  const staleResult = await cleanupExpiredJobs(supabase);

  const result: AutoPipelineResult = {
    scraping: {
      sources_run: scrapeResult.results.length,
      total_jobs_fetched: scrapeResult.total_jobs,
      duration_ms: scrapeResult.duration_ms,
    },
    ingestion: ingestionSummary,
    auto_publish: publishResult,
    dedup_cleanup: dedupResult,
    stale_cleanup: staleResult,
    total_duration_ms: Date.now() - pipelineStart,
  };

  console.log(
    `[auto-pipeline] Complete in ${result.total_duration_ms}ms: ` +
    `${result.scraping.total_jobs_fetched} fetched, ` +
    `${result.ingestion.inserted} ingested, ` +
    `${result.auto_publish.published} published, ` +
    `${result.dedup_cleanup.duplicates_hidden} deduped, ` +
    `${result.stale_cleanup.expired} expired`
  );

  return result;
}

export async function runAutoPipelineMaintenance(): Promise<AutoPipelineMaintenanceResult | null> {
  const start = Date.now();
  const supabase = getSupabase();

  if (!supabase) {
    console.error('[auto-pipeline] Supabase not configured');
    return null;
  }

  console.log('[auto-pipeline] Maintenance step 1: Auto-publishing trustworthy jobs...');
  const publishResult = await autoPublishDiscoveredJobs(supabase);

  console.log('[auto-pipeline] Maintenance step 2: Cleaning up duplicates...');
  const dedupResult = await autoCleanDuplicates(supabase);

  console.log('[auto-pipeline] Maintenance step 3: Cleaning up expired jobs...');
  const staleResult = await cleanupExpiredJobs(supabase);

  return {
    auto_publish: publishResult,
    dedup_cleanup: dedupResult,
    stale_cleanup: staleResult,
    total_duration_ms: Date.now() - start,
  };
}

/**
 * Auto-publish discovered jobs that meet trust/scam thresholds.
 * Skips jobs that would create duplicates in the published jobs table.
 */
async function autoPublishDiscoveredJobs(supabase: SupabaseClient) {
  const stats = {
    eligible: 0,
    published: 0,
    deduplicated: 0,
    skipped_duplicate: 0,
    errors: 0,
  };

  // Find jobs eligible for auto-publish
  const { data: candidates } = await supabase
    .from('discovered_jobs')
    .select('*')
    .is('native_job_id', null)
    .gte('trust_score', AUTO_PUBLISH_TRUST_MIN)
    .lt('scam_score', AUTO_PUBLISH_SCAM_MAX)
    .not('ingestion_status', 'in', '("published","hidden")')
    .order('trust_score', { ascending: false })
    .limit(100);

  if (!candidates || candidates.length === 0) return stats;
  stats.eligible = candidates.length;

  for (const dj of candidates) {
    try {
      const nowIso = new Date().toISOString();

      // Check for duplicate in already-published jobs
      const duplicate = await findDuplicateJob(supabase, {
        title: dj.title,
        companyName: dj.company_name,
        urls: [dj.apply_url, dj.original_job_url],
      });
      if (duplicate) {
        // Link to existing job instead of creating new
        await supabase
          .from('discovered_jobs')
          .update({
            native_job_id: duplicate.id,
            ingestion_status: 'published',
            published_at: nowIso,
            verification_status: 'verified',
          })
          .eq('id', dj.id);

        stats.skipped_duplicate++;
        stats.deduplicated++;
        continue;
      }

      // Skip jobs with no real description — these produce ugly stubs
      const description = dj.description_raw || dj.description_clean || null;
      if (!description || description.length < 30) {
        continue;
      }
      const language =
        normalizeLocale(dj.language) ||
        detectContentLanguage(`${dj.title} ${description}`) ||
        'fr';

      // Determine apply URL
      const originalApplyUrl = dj.apply_url || dj.original_job_url || null;

      // Publish to jobs table
      const { data: newJob, error: insertErr } = await supabase
        .from('jobs')
        .insert({
          title: dj.title,
          description,
          language,
          location: dj.location || 'Cameroon',
          company_name: dj.company_name || null,
          company_logo_url: null,
          work_type: dj.remote_type || 'onsite',
          external_url: originalApplyUrl,
          salary: dj.salary_min || null,
          published: true,
          approval_status: 'approved',
          approved_at: nowIso,
          visibility: 'public',
          lifecycle_status: 'live',
          apply_method: originalApplyUrl ? 'multiple' : 'joblinca',
          external_apply_url: originalApplyUrl,
          apply_email: dj.contact_email || null,
          apply_phone: dj.contact_phone || null,
          origin_type: 'admin_import',
          origin_discovered_job_id: dj.id,
          source_attribution_json: {
            source_name: dj.source_name,
            source_url: dj.source_url,
            original_job_url: dj.original_job_url,
            trust_score: dj.trust_score,
            discovered_at: dj.discovered_at,
          },
          closes_at: dj.expires_at || null,
          recruiter_id: null,
        })
        .select('id')
        .single();

      if (insertErr || !newJob) {
        console.error(`[auto-pipeline] Publish error for ${dj.id}:`, insertErr?.message);
        stats.errors++;
        continue;
      }

      // Link back
      await supabase
        .from('discovered_jobs')
        .update({
          native_job_id: newJob.id,
          ingestion_status: 'published',
          published_at: nowIso,
          verification_status: 'verified',
        })
        .eq('id', dj.id);

      stats.published++;
    } catch (err) {
      console.error(`[auto-pipeline] Error publishing ${dj.id}:`, err);
      stats.errors++;
    }
  }

  return stats;
}

/**
 * Find and hide duplicate jobs in the published jobs table.
 */
async function autoCleanDuplicates(supabase: SupabaseClient) {
  const groups = await findAllDuplicateGroups(supabase);
  const allDuplicateIds = groups.flatMap((g) => g.duplicates.map((d) => d.id));

  if (allDuplicateIds.length === 0) {
    return { groups_found: 0, duplicates_hidden: 0 };
  }

  const result = await hideDuplicateJobs(supabase, allDuplicateIds);
  return {
    groups_found: groups.length,
    duplicates_hidden: result.hidden,
  };
}

/**
 * Archive jobs whose closing date has passed by more than 7 days.
 * Only targets external/scraped jobs (origin_type = 'admin_import')
 * to avoid touching recruiter-managed native jobs.
 */
async function cleanupExpiredJobs(supabase: SupabaseClient) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: expired } = await supabase
    .from('jobs')
    .select('id')
    .eq('published', true)
    .eq('origin_type', 'admin_import')
    .lt('closes_at', sevenDaysAgo)
    .not('lifecycle_status', 'in', '("removed","archived","filled")');

  if (!expired || expired.length === 0) {
    return { expired: 0 };
  }

  const expiredIds = expired.map((j) => j.id);

  const { error } = await supabase
    .from('jobs')
    .update({
      lifecycle_status: 'archived',
      published: false,
      archived_at: new Date().toISOString(),
    })
    .in('id', expiredIds);

  if (error) {
    console.error('[auto-pipeline] Stale cleanup error:', error.message);
    return { expired: 0 };
  }

  console.log(`[auto-pipeline] Archived ${expiredIds.length} expired jobs`);
  return { expired: expiredIds.length };
}

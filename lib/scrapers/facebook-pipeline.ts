import type { SupabaseClient } from '@supabase/supabase-js';

import { ingestScrapeResult, type IngestionResult } from './ingestion';
import type { ScrapeResult } from './types';
import {
  FacebookScraper,
  type FacebookPostOutcome,
  type FacebookRawPost,
} from './providers/facebook';

type FacebookRawPostRow = {
  id: string;
  post_id: string;
  text: string;
  url: string | null;
  posted_at: string | null;
  group_name: string | null;
  group_url: string | null;
  author: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  image_urls: string[] | null;
  processed: boolean | null;
  processed_at: string | null;
  extracted_job_id: string | null;
  extraction_status: string | null;
  extraction_error: string | null;
  extraction_attempts: number | null;
  last_extracted_at: string | null;
  created_at: string;
};

type ProcessTrigger = 'manual' | 'cron';

const RAW_POST_SELECT = [
  'id',
  'post_id',
  'text',
  'url',
  'posted_at',
  'group_name',
  'group_url',
  'author',
  'likes',
  'comments',
  'shares',
  'image_urls',
  'processed',
  'processed_at',
  'extracted_job_id',
  'extraction_status',
  'extraction_error',
  'extraction_attempts',
  'last_extracted_at',
  'created_at',
].join(', ');

export interface FacebookPipelineResult {
  received: number;
  queued: number;
  jobs_extracted: number;
  jobs_inserted: number;
  skipped_posts: number;
  non_job_posts: number;
  failed_posts: number;
  image_assisted_posts: number;
  errors: string[];
  duration_ms: number;
  ingestion: {
    runId: string;
    status: IngestionResult['status'];
    inserted: number;
    duplicates: number;
    suspicious: number;
  } | null;
}

function mapRowToRawPost(row: FacebookRawPostRow): FacebookRawPost {
  return {
    id: row.post_id,
    text: row.text || '',
    url: row.url || undefined,
    post_url: row.url || undefined,
    timestamp: row.posted_at || undefined,
    group_name: row.group_name || undefined,
    group_url: row.group_url || undefined,
    author: row.author || undefined,
    likes: row.likes || 0,
    comments: row.comments || 0,
    shares: row.shares || 0,
    image_urls: Array.isArray(row.image_urls) ? row.image_urls : [],
  };
}

function inferGroupLanguage(name: string | null | undefined): 'fr' | 'en' {
  const lower = (name || '').toLowerCase();
  if (
    lower.includes('offre') ||
    lower.includes('emploi') ||
    lower.includes('douala') ||
    lower.includes('yaounde') ||
    lower.includes('yaoundé')
  ) {
    return 'fr';
  }

  return 'en';
}

function shouldRetryRow(row: FacebookRawPostRow): boolean {
  return !row.processed || row.extraction_status === 'failed' || row.extraction_status === 'pending';
}

function buildRawInsertData(rawPosts: FacebookRawPost[]) {
  return rawPosts.map((post) => ({
    post_id: post.id,
    text: (post.text || '').slice(0, 10000),
    url: post.url || post.post_url || null,
    posted_at: post.timestamp || post.time || null,
    group_name: post.group_name || null,
    group_url: post.group_url || null,
    author: post.author || null,
    likes: post.likes || 0,
    comments: post.comments || 0,
    shares: post.shares || 0,
    image_urls: post.image_urls || [],
    processed: false,
    extraction_status: 'pending',
  }));
}

function getBatchLimitFromPages(maxPages: number | undefined, defaultLimit: number): number {
  if (!maxPages || Number.isNaN(maxPages)) {
    return defaultLimit;
  }

  return Math.max(10, Math.min(200, maxPages * 25));
}

async function loadRowsByPostIds(
  supabase: SupabaseClient,
  postIds: string[]
): Promise<FacebookRawPostRow[]> {
  if (postIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('facebook_raw_posts')
    .select(RAW_POST_SELECT)
    .in('post_id', postIds);

  if (error) {
    throw new Error(`Failed to load stored Facebook posts: ${error.message}`);
  }

  return ((data || []) as unknown) as FacebookRawPostRow[];
}

async function upsertExternalJobs(
  supabase: SupabaseClient,
  scrapeResult: ScrapeResult,
  outcomeByExternalId: Map<string, FacebookPostOutcome>,
  errors: string[]
): Promise<number> {
  if (scrapeResult.jobs.length === 0) {
    return 0;
  }

  let inserted = 0;
  const batchSize = 50;

  for (let i = 0; i < scrapeResult.jobs.length; i += batchSize) {
    const batch = scrapeResult.jobs.slice(i, i + batchSize);
    const { error } = await supabase
      .from('external_jobs')
      .upsert(batch, { onConflict: 'external_id', ignoreDuplicates: false });

    if (error) {
      errors.push(`external_jobs upsert failed: ${error.message}`);
      for (const job of batch) {
        const outcome = outcomeByExternalId.get(job.external_id);
        if (outcome && outcome.status === 'job_extracted') {
          outcome.status = 'failed';
          outcome.reason = `external_jobs_upsert_failed:${error.message}`;
          outcome.extractedExternalId = null;
        }
      }
      continue;
    }

    inserted += batch.length;
  }

  return inserted;
}

async function updateRawPostOutcome(
  supabase: SupabaseClient,
  row: FacebookRawPostRow,
  outcome: FacebookPostOutcome,
  processedAt: string
): Promise<void> {
  const attempts = (row.extraction_attempts || 0) + 1;
  const updatePayload =
    outcome.status === 'job_extracted'
      ? {
          processed: true,
          processed_at: processedAt,
          extracted_job_id: outcome.extractedExternalId || null,
          extraction_status: 'processed',
          extraction_error: null,
          extraction_attempts: attempts,
          last_extracted_at: processedAt,
        }
      : outcome.status === 'failed'
        ? {
            processed: false,
            processed_at: null,
            extracted_job_id: null,
            extraction_status: 'failed',
            extraction_error: outcome.reason || 'unknown_failure',
            extraction_attempts: attempts,
            last_extracted_at: processedAt,
          }
        : {
            processed: true,
            processed_at: processedAt,
            extracted_job_id: null,
            extraction_status: 'skipped',
            extraction_error: outcome.reason || null,
            extraction_attempts: attempts,
            last_extracted_at: processedAt,
          };

  const { error } = await supabase
    .from('facebook_raw_posts')
    .update(updatePayload)
    .eq('id', row.id);

  if (error) {
    throw new Error(`Failed to update facebook_raw_posts row ${row.post_id}: ${error.message}`);
  }
}

async function refreshFacebookGroupMetrics(
  supabase: SupabaseClient,
  rows: FacebookRawPostRow[],
  processedAt: string
): Promise<void> {
  const grouped = new Map<string, { name: string | null }>();

  for (const row of rows) {
    const groupUrl = (row.group_url || '').trim();
    if (!groupUrl) {
      continue;
    }
    if (!grouped.has(groupUrl)) {
      grouped.set(groupUrl, { name: row.group_name || null });
    }
  }

  if (grouped.size === 0) {
    return;
  }

  const { data: existingGroups } = await supabase
    .from('facebook_job_groups')
    .select('url, name, language, enabled')
    .in('url', [...grouped.keys()]);

  const existingByUrl = new Map(
    (existingGroups || []).map((group: any) => [String(group.url), group])
  );

  for (const [groupUrl, meta] of grouped) {
    const [{ count: postCount }, { count: jobCount }] = await Promise.all([
      supabase
        .from('facebook_raw_posts')
        .select('id', { count: 'exact', head: true })
        .eq('group_url', groupUrl),
      supabase
        .from('facebook_raw_posts')
        .select('id', { count: 'exact', head: true })
        .eq('group_url', groupUrl)
        .not('extracted_job_id', 'is', null),
    ]);

    const existing = existingByUrl.get(groupUrl);
    const payload = {
      url: groupUrl,
      name: existing?.name || meta.name || groupUrl,
      language: existing?.language || inferGroupLanguage(meta.name),
      enabled: existing?.enabled ?? true,
      last_scraped_at: processedAt,
      post_count: postCount || 0,
      job_count: jobCount || 0,
    };

    const { error } = await supabase
      .from('facebook_job_groups')
      .upsert(payload, { onConflict: 'url', ignoreDuplicates: false });

    if (error) {
      console.warn('[facebook-pipeline] Failed to refresh group metrics', groupUrl, error.message);
    }
  }
}

export function normalizeApifyFacebookPosts(items: any[]): FacebookRawPost[] {
  return items.map((item: any) => ({
    id: item.postId || item.id || item.facebookId || String(Date.now() + Math.random()),
    text: item.postText || item.text || item.message || item.caption || '',
    url: item.postUrl || item.url || item.post_url || null,
    post_url: item.postUrl || item.url || item.post_url || null,
    timestamp: item.timestamp || item.time || item.date || item.createdTime || null,
    group_name: item.groupName || item.group_name || null,
    group_url: item.groupUrl || item.group_url || null,
    author: item.authorName || item.author || item.userName || null,
    likes: item.likesCount || item.likes || 0,
    comments: item.commentsCount || item.comments || 0,
    shares: item.sharesCount || item.shares || 0,
    image_urls: item.imageUrls || item.images || [],
  }));
}

export async function storeFacebookRawPosts(
  supabase: SupabaseClient,
  rawPosts: FacebookRawPost[]
): Promise<number> {
  if (rawPosts.length === 0) {
    return 0;
  }

  const { error } = await supabase
    .from('facebook_raw_posts')
    .upsert(buildRawInsertData(rawPosts), { onConflict: 'post_id', ignoreDuplicates: true });

  if (error) {
    throw new Error(`Failed to store Facebook raw posts: ${error.message}`);
  }

  return rawPosts.length;
}

export async function loadPendingFacebookRawPosts(
  supabase: SupabaseClient,
  limit: number = 50
): Promise<FacebookRawPostRow[]> {
  const { data, error } = await supabase
    .from('facebook_raw_posts')
    .select(RAW_POST_SELECT)
    .or('processed.eq.false,extraction_status.eq.failed')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load pending Facebook posts: ${error.message}`);
  }

  return ((data || []) as unknown) as FacebookRawPostRow[];
}

export async function processFacebookRawPostRows(
  supabase: SupabaseClient,
  rows: FacebookRawPostRow[],
  triggerType: ProcessTrigger = 'manual'
): Promise<FacebookPipelineResult> {
  const retryableRows = rows.filter(shouldRetryRow);

  if (retryableRows.length === 0) {
    return {
      received: rows.length,
      queued: 0,
      jobs_extracted: 0,
      jobs_inserted: 0,
      skipped_posts: 0,
      non_job_posts: 0,
      failed_posts: 0,
      image_assisted_posts: 0,
      errors: [],
      duration_ms: 0,
      ingestion: null,
    };
  }

  const scraper = new FacebookScraper();
  scraper.setPosts(retryableRows.map(mapRowToRawPost));
  const scrapeResult = await scraper.run();
  const outcomes = scraper.getLastRunOutcomes().map((outcome) => ({ ...outcome }));
  const outcomeByPostId = new Map(outcomes.map((outcome) => [outcome.postId, outcome]));
  const outcomeByExternalId = new Map(
    outcomes
      .filter((outcome) => outcome.extractedExternalId)
      .map((outcome) => [String(outcome.extractedExternalId), outcome])
  );
  const errors = [...scrapeResult.errors];

  const jobsInserted = await upsertExternalJobs(supabase, scrapeResult, outcomeByExternalId, errors);

  const finalJobs = scrapeResult.jobs.filter((job) => {
    const outcome = outcomeByExternalId.get(job.external_id);
    return outcome?.status === 'job_extracted';
  });

  let ingestion: FacebookPipelineResult['ingestion'] = null;
  if (finalJobs.length > 0) {
    try {
      const ingested = await ingestScrapeResult(
        {
          ...scrapeResult,
          jobs: finalJobs,
        },
        triggerType
      );

      if (ingested) {
        ingestion = {
          runId: ingested.runId,
          status: ingested.status,
          inserted: ingested.inserted,
          duplicates: ingested.duplicates,
          suspicious: ingested.suspicious,
        };
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'unknown_aggregation_ingestion_error';
      errors.push(`aggregation ingestion failed: ${message}`);

      for (const job of finalJobs) {
        const outcome = outcomeByExternalId.get(job.external_id);
        if (outcome && outcome.status === 'job_extracted') {
          outcome.status = 'failed';
          outcome.reason = `aggregation_ingestion_failed:${message}`;
          outcome.extractedExternalId = null;
        }
      }
    }
  }

  const processedAt = new Date().toISOString();
  for (const row of retryableRows) {
    const outcome = outcomeByPostId.get(row.post_id);
    if (!outcome) {
      continue;
    }

    await updateRawPostOutcome(supabase, row, outcome, processedAt);
  }

  await refreshFacebookGroupMetrics(supabase, retryableRows, processedAt);

  const finalStats = outcomes.reduce(
    (stats, outcome) => {
      if (outcome.status === 'job_extracted') {
        stats.jobs_extracted++;
      } else if (outcome.status === 'failed') {
        stats.failed_posts++;
      } else if (outcome.status === 'not_job') {
        stats.non_job_posts++;
      } else {
        stats.skipped_posts++;
      }

      if (outcome.usedImages && outcome.status === 'job_extracted') {
        stats.image_assisted_posts++;
      }

      return stats;
    },
    {
      jobs_extracted: 0,
      skipped_posts: 0,
      non_job_posts: 0,
      failed_posts: 0,
      image_assisted_posts: 0,
    }
  );

  return {
    received: rows.length,
    queued: retryableRows.length,
    jobs_extracted: finalStats.jobs_extracted,
    jobs_inserted: jobsInserted,
    skipped_posts: finalStats.skipped_posts,
    non_job_posts: finalStats.non_job_posts,
    failed_posts: finalStats.failed_posts,
    image_assisted_posts: finalStats.image_assisted_posts,
    errors,
    duration_ms: scrapeResult.duration_ms,
    ingestion,
  };
}

export async function processPendingFacebookRawPosts(
  supabase: SupabaseClient,
  options?: {
    limit?: number;
    triggerType?: ProcessTrigger;
  }
): Promise<FacebookPipelineResult> {
  const rows = await loadPendingFacebookRawPosts(
    supabase,
    options?.limit || 50
  );
  return processFacebookRawPostRows(supabase, rows, options?.triggerType || 'manual');
}

export async function processStoredFacebookPostsByIds(
  supabase: SupabaseClient,
  postIds: string[],
  triggerType: ProcessTrigger = 'manual'
): Promise<FacebookPipelineResult> {
  const rows = await loadRowsByPostIds(supabase, postIds);
  return processFacebookRawPostRows(supabase, rows, triggerType);
}

export function facebookLimitFromMaxPages(
  maxPages: number | undefined,
  defaultLimit: number = 50
): number {
  return getBatchLimitFromPages(maxPages, defaultLimit);
}

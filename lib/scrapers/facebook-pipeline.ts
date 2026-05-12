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

type FacebookRawInsertRow = {
  post_id: string;
  text: string;
  url: string | null;
  posted_at: string | null;
  group_name: string | null;
  group_url: string | null;
  author: string | null;
  likes: number;
  comments: number;
  shares: number;
  image_urls: string[];
  processed: boolean;
  extraction_status: 'pending';
};

type ProcessTrigger = 'manual' | 'cron';

const BASE_RAW_POST_SELECT_FIELDS = [
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
  'created_at',
];

const FACEBOOK_HARDENING_COLUMNS = [
  'extraction_status',
  'extraction_error',
  'extraction_attempts',
  'last_extracted_at',
];

const RAW_POST_SELECT = [
  ...BASE_RAW_POST_SELECT_FIELDS,
  ...FACEBOOK_HARDENING_COLUMNS,
].join(', ');

const LEGACY_RAW_POST_SELECT = BASE_RAW_POST_SELECT_FIELDS.join(', ');

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

export function isMissingFacebookHardeningColumnError(error: unknown): boolean {
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : String((error as { message?: unknown } | null)?.message || error || '');
  const lower = message.toLowerCase();

  return (
    FACEBOOK_HARDENING_COLUMNS.some((column) => lower.includes(column.toLowerCase())) &&
    (lower.includes('does not exist') ||
      lower.includes('schema cache') ||
      lower.includes('could not find the'))
  );
}

function normalizeRawPostRow(row: Partial<FacebookRawPostRow>): FacebookRawPostRow {
  const processed = typeof row.processed === 'boolean' ? row.processed : false;
  const extractedJobId =
    typeof row.extracted_job_id === 'string' && row.extracted_job_id.trim()
      ? row.extracted_job_id
      : null;

  return {
    id: row.id || '',
    post_id: row.post_id || '',
    text: row.text || '',
    url: row.url || null,
    posted_at: row.posted_at || null,
    group_name: row.group_name || null,
    group_url: row.group_url || null,
    author: row.author || null,
    likes: typeof row.likes === 'number' ? row.likes : 0,
    comments: typeof row.comments === 'number' ? row.comments : 0,
    shares: typeof row.shares === 'number' ? row.shares : 0,
    image_urls: Array.isArray(row.image_urls) ? row.image_urls : [],
    processed,
    processed_at: row.processed_at || null,
    extracted_job_id: extractedJobId,
    extraction_status:
      row.extraction_status ||
      (processed ? (extractedJobId ? 'processed' : 'skipped') : 'pending'),
    extraction_error: row.extraction_error || null,
    extraction_attempts:
      typeof row.extraction_attempts === 'number' ? row.extraction_attempts : 0,
    last_extracted_at: row.last_extracted_at || null,
    created_at: row.created_at || new Date(0).toISOString(),
  };
}

function stripFacebookHardeningFields(
  payload: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([key]) => !FACEBOOK_HARDENING_COLUMNS.includes(key)
    )
  );
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

function buildRawInsertData(rawPosts: FacebookRawPost[]): FacebookRawInsertRow[] {
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

function readPath(input: any, path: string): unknown {
  return path.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    return (value as Record<string, unknown>)[segment];
  }, input);
}

function firstDefined(input: any, paths: string[]): unknown {
  for (const path of paths) {
    const value = readPath(input, path);
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return undefined;
}

function coerceString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    const joined = value
      .map((item) => coerceString(item))
      .filter(Boolean)
      .join('\n')
      .trim();
    return joined || null;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['text', 'message', 'name', 'title', 'label', 'value']) {
      const nested = coerceString(record[key]);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function coerceNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function isProbablyImageUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) {
    return false;
  }

  return (
    /\.(?:png|jpe?g|gif|webp)(?:[?#].*)?$/i.test(value) ||
    /(?:image|photo|fbcdn|scontent)/i.test(value)
  );
}

function collectImageUrls(value: unknown, output: Set<string>): void {
  if (!value) {
    return;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (isProbablyImageUrl(trimmed)) {
      output.add(trimmed);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectImageUrls(item, output);
    }
    return;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of [
      'url',
      'src',
      'image',
      'imageUrl',
      'image_url',
      'media',
      'photo',
      'attachment',
      'thumbnail',
      'thumbnailUrl',
      'previewImage',
      'preview_image',
    ]) {
      collectImageUrls(record[key], output);
    }

    if (String(record.type || '').toLowerCase().includes('image')) {
      for (const nested of Object.values(record)) {
        collectImageUrls(nested, output);
      }
    }
  }
}

function extractImageUrls(item: any): string[] {
  const urls = new Set<string>();
  for (const candidate of [
    item.imageUrls,
    item.image_urls,
    item.images,
    item.photos,
    item.media,
    item.attachments,
    item.gallery,
    readPath(item, 'post.images'),
    readPath(item, 'attachments.images'),
    readPath(item, 'attachments.media'),
  ]) {
    collectImageUrls(candidate, urls);
  }

  return [...urls].slice(0, 6);
}

function derivePostIdFromUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }

  const permalinkMatch = url.match(/(?:posts|permalink)\/([^/?#]+)/i);
  if (permalinkMatch?.[1]) {
    return permalinkMatch[1];
  }

  const fallback = url.replace(/^https?:\/\//i, '').replace(/[/?#=&]+/g, '-');
  return fallback || null;
}

function normalizeComparableText(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function normalizeComparableImages(values: string[] | null | undefined): string[] {
  return [...new Set((values || []).map((value) => value.trim()).filter(Boolean))].sort();
}

function stringArrayEquals(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function hasAnyRawFieldChange(row: FacebookRawPostRow, incoming: FacebookRawInsertRow): boolean {
  return (
    normalizeComparableText(row.text) !== normalizeComparableText(incoming.text) ||
    normalizeComparableText(row.url) !== normalizeComparableText(incoming.url) ||
    normalizeComparableText(row.posted_at) !== normalizeComparableText(incoming.posted_at) ||
    normalizeComparableText(row.group_name) !== normalizeComparableText(incoming.group_name) ||
    normalizeComparableText(row.group_url) !== normalizeComparableText(incoming.group_url) ||
    normalizeComparableText(row.author) !== normalizeComparableText(incoming.author) ||
    (row.likes || 0) !== incoming.likes ||
    (row.comments || 0) !== incoming.comments ||
    (row.shares || 0) !== incoming.shares ||
    !stringArrayEquals(
      normalizeComparableImages(row.image_urls),
      normalizeComparableImages(incoming.image_urls)
    )
  );
}

function hasExtractionRelevantChange(row: FacebookRawPostRow, incoming: FacebookRawInsertRow): boolean {
  return (
    normalizeComparableText(row.text) !== normalizeComparableText(incoming.text) ||
    normalizeComparableText(row.url) !== normalizeComparableText(incoming.url) ||
    normalizeComparableText(row.posted_at) !== normalizeComparableText(incoming.posted_at) ||
    !stringArrayEquals(
      normalizeComparableImages(row.image_urls),
      normalizeComparableImages(incoming.image_urls)
    )
  );
}

function buildExistingRowUpdatePayload(
  row: FacebookRawPostRow,
  incoming: FacebookRawInsertRow
): Record<string, unknown> {
  const basePayload: Record<string, unknown> = {
    text: incoming.text,
    url: incoming.url,
    posted_at: incoming.posted_at,
    group_name: incoming.group_name,
    group_url: incoming.group_url,
    author: incoming.author,
    likes: incoming.likes,
    comments: incoming.comments,
    shares: incoming.shares,
    image_urls: incoming.image_urls,
  };

  if (hasExtractionRelevantChange(row, incoming)) {
    return {
      ...basePayload,
      processed: false,
      processed_at: null,
      extracted_job_id: null,
      extraction_status: 'pending',
      extraction_error: null,
    };
  }

  if (row.extraction_status === 'failed') {
    return {
      ...basePayload,
      extraction_status: 'pending',
      extraction_error: null,
      processed: false,
      processed_at: null,
    };
  }

  return basePayload;
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

  if (!error) {
    return ((data || []) as Partial<FacebookRawPostRow>[]).map(normalizeRawPostRow);
  }

  if (!isMissingFacebookHardeningColumnError(error.message)) {
    throw new Error(`Failed to load stored Facebook posts: ${error.message}`);
  }

  const legacyResult = await supabase
    .from('facebook_raw_posts')
    .select(LEGACY_RAW_POST_SELECT)
    .in('post_id', postIds);

  if (legacyResult.error) {
    throw new Error(`Failed to load stored Facebook posts: ${legacyResult.error.message}`);
  }

  return ((legacyResult.data || []) as Partial<FacebookRawPostRow>[]).map(
    normalizeRawPostRow
  );
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

  if (!error) {
    return;
  }

  if (!isMissingFacebookHardeningColumnError(error.message)) {
    throw new Error(`Failed to update facebook_raw_posts row ${row.post_id}: ${error.message}`);
  }

  const legacyUpdatePayload = stripFacebookHardeningFields(updatePayload);
  const legacyResult = await supabase
    .from('facebook_raw_posts')
    .update(legacyUpdatePayload)
    .eq('id', row.id);

  if (legacyResult.error) {
    throw new Error(
      `Failed to update facebook_raw_posts row ${row.post_id}: ${legacyResult.error.message}`
    );
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
  return items.map((item: any, index: number) => {
    const url =
      coerceString(
        firstDefined(item, [
          'postUrl',
          'url',
          'post_url',
          'permalink',
          'permalinkUrl',
          'post.permalink',
          'post.url',
        ])
      ) || null;
    const groupId = coerceString(firstDefined(item, ['groupId', 'group.id']));

    return {
      id:
        coerceString(
          firstDefined(item, [
            'postId',
            'id',
            'facebookId',
            'post.id',
            'post.postId',
          ])
        ) ||
        derivePostIdFromUrl(url) ||
        `${Date.now()}-${index}`,
      text:
        coerceString(
          firstDefined(item, [
            'postText',
            'text',
            'message',
            'caption',
            'content',
            'description',
            'post.text',
            'post.message',
            'post.caption',
            'postTextSegments',
            'messageParts',
          ])
        ) || '',
      url: url || undefined,
      post_url: url || undefined,
      timestamp:
        coerceString(
          firstDefined(item, [
            'timestamp',
            'time',
            'date',
            'createdTime',
            'created_time',
            'publishedAt',
            'post.createdTime',
            'post.created_time',
          ])
        ) || undefined,
      group_name:
        coerceString(
          firstDefined(item, [
            'groupName',
            'group_name',
            'group.name',
            'group.title',
            'owner.name',
          ])
        ) || undefined,
      group_url:
        coerceString(
          firstDefined(item, [
            'groupUrl',
            'group_url',
            'group.url',
            'group.link',
            'group.permalink',
            'owner.url',
          ])
        ) ||
        (groupId ? `https://www.facebook.com/groups/${groupId}/` : undefined),
      author:
        coerceString(
          firstDefined(item, [
            'authorName',
            'author',
            'author.name',
            'userName',
            'user.name',
            'pageName',
            'page.name',
          ])
        ) || undefined,
      likes: coerceNumber(firstDefined(item, ['likesCount', 'likes', 'stats.likes', 'metrics.likes'])),
      comments: coerceNumber(
        firstDefined(item, ['commentsCount', 'comments', 'stats.comments', 'metrics.comments'])
      ),
      shares: coerceNumber(firstDefined(item, ['sharesCount', 'shares', 'stats.shares', 'metrics.shares'])),
      image_urls: extractImageUrls(item),
    };
  });
}

export async function storeFacebookRawPosts(
  supabase: SupabaseClient,
  rawPosts: FacebookRawPost[]
): Promise<number> {
  if (rawPosts.length === 0) {
    return 0;
  }

  const insertRows = buildRawInsertData(rawPosts);
  const existingRows = await loadRowsByPostIds(
    supabase,
    insertRows.map((row) => row.post_id)
  );
  const existingByPostId = new Map(existingRows.map((row) => [row.post_id, row]));
  const newRows: FacebookRawInsertRow[] = [];
  let updatedCount = 0;

  for (const row of insertRows) {
    const existing = existingByPostId.get(row.post_id);
    if (!existing) {
      newRows.push(row);
      continue;
    }

    if (!hasAnyRawFieldChange(existing, row)) {
      continue;
    }

    const { error } = await supabase
      .from('facebook_raw_posts')
      .update(buildExistingRowUpdatePayload(existing, row))
      .eq('id', existing.id);

    if (!error) {
      updatedCount++;
      continue;
    }

    if (!isMissingFacebookHardeningColumnError(error.message)) {
      throw new Error(`Failed to refresh Facebook raw post ${row.post_id}: ${error.message}`);
    }

    const legacyResult = await supabase
      .from('facebook_raw_posts')
      .update(stripFacebookHardeningFields(buildExistingRowUpdatePayload(existing, row)))
      .eq('id', existing.id);

    if (legacyResult.error) {
      throw new Error(
        `Failed to refresh Facebook raw post ${row.post_id}: ${legacyResult.error.message}`
      );
    }

    updatedCount++;
  }

  if (newRows.length === 0) {
    return updatedCount;
  }

  const { error } = await supabase
    .from('facebook_raw_posts')
    .upsert(newRows, { onConflict: 'post_id', ignoreDuplicates: true });

  if (!error) {
    return newRows.length + updatedCount;
  }

  if (!isMissingFacebookHardeningColumnError(error.message)) {
    throw new Error(`Failed to store Facebook raw posts: ${error.message}`);
  }

  const legacyResult = await supabase
    .from('facebook_raw_posts')
    .upsert(
      newRows.map((row) => stripFacebookHardeningFields(row as unknown as Record<string, unknown>)),
      { onConflict: 'post_id', ignoreDuplicates: true }
    );

  if (legacyResult.error) {
    throw new Error(`Failed to store Facebook raw posts: ${legacyResult.error.message}`);
  }

  return newRows.length + updatedCount;
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

  if (!error) {
    return ((data || []) as Partial<FacebookRawPostRow>[]).map(normalizeRawPostRow);
  }

  if (!isMissingFacebookHardeningColumnError(error.message)) {
    throw new Error(`Failed to load pending Facebook posts: ${error.message}`);
  }

  const legacyResult = await supabase
    .from('facebook_raw_posts')
    .select(LEGACY_RAW_POST_SELECT)
    .eq('processed', false)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (legacyResult.error) {
    throw new Error(`Failed to load pending Facebook posts: ${legacyResult.error.message}`);
  }

  return ((legacyResult.data || []) as Partial<FacebookRawPostRow>[]).map(
    normalizeRawPostRow
  );
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

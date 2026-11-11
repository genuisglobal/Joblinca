/**
 * Orchestration for the Facebook scrapers on Apify.
 *
 *   jobs  (daily):  facebook-groups-scraper, one run per enabled group
 *                   -> webhook -> facebook_raw_posts -> existing LLM pipeline
 *                   -> discovered_jobs (poster contacts surface in Outreach)
 *   leads (weekly): facebook-search-scraper (Pages only)
 *                   -> webhook -> facebook-pages-scraper for new Pages
 *                   -> webhook -> facebook_page_leads
 *
 * Every run is recorded in apify_runs; the webhook claims a run atomically
 * before processing, so Apify's retries never process it twice.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  APIFY_ACTORS,
  getActorRun,
  getDatasetItems,
  resolveActorId,
  startActorRun,
  type ApifyRunKind,
} from './client';
import {
  LEAD_SEARCH_KEYWORDS,
  extractSearchPageUrls,
  mapPageItemToLead,
} from './facebook-leads';
import {
  normalizeApifyFacebookPosts,
  processStoredFacebookPostsByIds,
  storeFacebookRawPosts,
} from '@/lib/scrapers/facebook-pipeline';

function envInt(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Posts per group per daily run (cost: ~$0.005 per post). */
const GROUP_POSTS_PER_RUN = () => envInt('APIFY_FB_GROUP_POSTS_PER_RUN', 30, 5, 200);
/** Pages per weekly search run (cost: ~$0.006 per result). */
const SEARCH_RESULTS_PER_RUN = () => envInt('APIFY_FB_SEARCH_RESULTS', 60, 10, 300);
/** Max Pages sent to the details scraper per week (cost: ~$0.012 per Page). */
const PAGE_DETAILS_PER_RUN = () => envInt('APIFY_FB_PAGE_DETAILS_MAX', 60, 5, 300);
/** Pages seen within this many days are not re-scraped. */
const PAGE_REFRESH_DAYS = 60;

/**
 * Public base URL Apify calls back. Never trust the incoming request's host in
 * production: a Vercel cron (or its "Run" button) can arrive on an internal
 * deployment URL that Apify cannot reach or that Deployment Protection blocks.
 */
export function apifyWebhookBase(requestOrigin: string): string {
  const configured = (process.env.APIFY_WEBHOOK_BASE_URL || '').trim();
  const base =
    configured ||
    (process.env.VERCEL_ENV === 'production' ? 'https://joblinca.com' : requestOrigin);
  return base.replace(/\/+$/, '');
}

function webhookUrl(origin: string, kind: ApifyRunKind): string {
  return `${apifyWebhookBase(origin)}/api/webhooks/apify?kind=${kind}`;
}

async function recordRun(
  supabase: SupabaseClient,
  runId: string,
  kind: ApifyRunKind,
  input: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('apify_runs').insert({
    run_id: runId,
    kind,
    actor: APIFY_ACTORS[kind],
    input_json: input,
  });
  if (error) console.error('[apify] failed to record run', runId, error.message);
}

export interface StartSummary {
  started: { run_id: string; target: string }[];
  errors: string[];
}

export async function startFacebookGroupRuns(
  supabase: SupabaseClient,
  origin: string,
): Promise<StartSummary> {
  const summary: StartSummary = { started: [], errors: [] };
  const { data: groups, error } = await supabase
    .from('facebook_job_groups')
    .select('url, name')
    .eq('enabled', true);
  if (error) throw new Error(`Failed to load Facebook groups: ${error.message}`);

  const limit = GROUP_POSTS_PER_RUN();
  for (const group of groups || []) {
    const input = {
      startUrls: [{ url: group.url }],
      resultsLimit: limit,
      viewOption: 'CHRONOLOGICAL',
      onlyPostsNewerThan: '2 days',
    };
    try {
      const run = await startActorRun(APIFY_ACTORS.fb_groups, input, {
        webhookUrl: webhookUrl(origin, 'fb_groups'),
        // ~$0.005/post; cap at 2x the expected cost.
        maxTotalChargeUsd: Math.max(0.1, Number((limit * 0.01).toFixed(2))),
      });
      await recordRun(supabase, run.id, 'fb_groups', input);
      summary.started.push({ run_id: run.id, target: group.url });
    } catch (err) {
      summary.errors.push(`${group.url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return summary;
}

export async function startLeadSearchRun(
  supabase: SupabaseClient,
  origin: string,
): Promise<StartSummary> {
  const limit = SEARCH_RESULTS_PER_RUN();
  const input = {
    categories: LEAD_SEARCH_KEYWORDS,
    locations: [],
    searchType: 'pages',
    resultsLimit: limit,
  };
  const run = await startActorRun(APIFY_ACTORS.fb_search, input, {
    webhookUrl: webhookUrl(origin, 'fb_search'),
    maxTotalChargeUsd: Math.max(0.2, Number((limit * 0.012).toFixed(2))),
  });
  await recordRun(supabase, run.id, 'fb_search', input);
  return { started: [{ run_id: run.id, target: 'search' }], errors: [] };
}

/**
 * Claim a run for processing. Returns false if it is unknown to us (not a run
 * Joblinca started) or another delivery already claimed it.
 */
async function claimRun(
  supabase: SupabaseClient,
  runId: string,
  kind: ApifyRunKind,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('apify_runs')
    .update({ status: 'processing' })
    .eq('run_id', runId)
    .eq('kind', kind)
    .in('status', ['started', 'failed'])
    .select('run_id');
  if (error) throw new Error(`Failed to claim Apify run: ${error.message}`);
  return (data || []).length > 0;
}

async function finishRun(
  supabase: SupabaseClient,
  runId: string,
  patch: { status: 'processed' | 'failed'; items_received?: number; result_json?: unknown; error?: string },
): Promise<void> {
  await supabase
    .from('apify_runs')
    .update({ ...patch, processed_at: new Date().toISOString() })
    .eq('run_id', runId);
}

export type WebhookOutcome =
  | { status: 'ignored'; reason: string }
  | { status: 'processed'; kind: ApifyRunKind; items: number; result: Record<string, unknown> };

export async function handleSucceededRun(
  supabase: SupabaseClient,
  kind: ApifyRunKind,
  runId: string,
  origin: string,
): Promise<WebhookOutcome> {
  if (!(await claimRun(supabase, runId, kind))) {
    return { status: 'ignored', reason: 'unknown_or_already_processed' };
  }

  try {
    // Never trust the webhook body: re-read the run from Apify with our token.
    const run = await getActorRun(runId);
    const expectedActorId = await resolveActorId(APIFY_ACTORS[kind]);
    if (run.actId !== expectedActorId) throw new Error('Run actor does not match kind');
    if (run.status !== 'SUCCEEDED') throw new Error(`Run status is ${run.status}`);

    const items = await getDatasetItems(run.defaultDatasetId, 500);
    let result: Record<string, unknown>;

    if (kind === 'fb_groups') {
      const posts = normalizeApifyFacebookPosts(items as any[]).filter((p) => p.text || p.image_urls?.length);
      await storeFacebookRawPosts(supabase, posts);
      const pipeline = await processStoredFacebookPostsByIds(
        supabase,
        posts.map((p) => p.id),
        'cron',
      );
      result = {
        posts: posts.length,
        jobs_extracted: pipeline.jobs_extracted,
        jobs_inserted: pipeline.jobs_inserted,
        errors: pipeline.errors.slice(0, 10),
      };
    } else if (kind === 'fb_search') {
      result = await startPageDetailsRun(supabase, extractSearchPageUrls(items), origin);
    } else {
      result = await storePageLeads(supabase, items, runId);
    }

    await finishRun(supabase, runId, { status: 'processed', items_received: items.length, result_json: result });
    return { status: 'processed', kind, items: items.length, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(supabase, runId, { status: 'failed', error: message.slice(0, 1000) });
    throw err;
  }
}

async function startPageDetailsRun(
  supabase: SupabaseClient,
  pageUrls: string[],
  origin: string,
): Promise<Record<string, unknown>> {
  if (pageUrls.length === 0) return { pages_found: 0, pages_queued: 0 };

  const since = new Date(Date.now() - PAGE_REFRESH_DAYS * 86_400_000).toISOString();
  const { data: recent, error } = await supabase
    .from('facebook_page_leads')
    .select('page_url')
    .in('page_url', pageUrls)
    .gte('last_seen_at', since);
  if (error) throw new Error(`Failed to check known Pages: ${error.message}`);

  const known = new Set((recent || []).map((row) => row.page_url));
  const fresh = pageUrls.filter((url) => !known.has(url)).slice(0, PAGE_DETAILS_PER_RUN());
  if (fresh.length === 0) return { pages_found: pageUrls.length, pages_queued: 0 };

  const input = { startUrls: fresh.map((url) => ({ url })) };
  const run = await startActorRun(APIFY_ACTORS.fb_pages, input, {
    webhookUrl: webhookUrl(origin, 'fb_pages'),
    maxTotalChargeUsd: Math.max(0.2, Number((fresh.length * 0.02).toFixed(2))),
  });
  await recordRun(supabase, run.id, 'fb_pages', input);
  return { pages_found: pageUrls.length, pages_queued: fresh.length, pages_run_id: run.id };
}

async function storePageLeads(
  supabase: SupabaseClient,
  items: unknown[],
  runId: string,
): Promise<Record<string, unknown>> {
  const byUrl = new Map<string, ReturnType<typeof mapPageItemToLead>>();
  for (const item of items) {
    const lead = mapPageItemToLead(item);
    if (lead) byUrl.set(lead.page_url, lead);
  }
  const leads = [...byUrl.values()].filter(Boolean);
  if (leads.length === 0) return { pages: items.length, leads_saved: 0 };

  const now = new Date().toISOString();
  // status/notes are omitted so an admin's follow-up state is never overwritten.
  const rows = leads.map((lead) => ({ ...lead, source_run_id: runId, last_seen_at: now, updated_at: now }));
  const { error } = await supabase.from('facebook_page_leads').upsert(rows, { onConflict: 'page_url' });
  if (error) throw new Error(`Failed to save Page leads: ${error.message}`);

  return {
    pages: items.length,
    leads_saved: rows.length,
    recruiter_signal: rows.filter((r) => r!.recruiter_signal).length,
  };
}

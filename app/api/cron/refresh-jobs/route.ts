import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  clearRetiredExternalFeedSources,
  fetchExternalFeedJobs,
  replaceExternalJobsBySource,
} from '@/lib/externalJobs';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { runAutoPipeline } from '@/lib/scrapers/auto-pipeline';
import { processPendingFacebookRawPosts } from '@/lib/scrapers/facebook-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for full pipeline

/**
 * Cron endpoint to refresh external jobs daily.
 *
 * Triggered by:
 * - Vercel Cron (configured in vercel.json)
 * - External scheduler (GitHub Actions, etc.)
 * - Manual call with CRON_SECRET header
 *
 * Authentication: supports CRON_SECRET bearer auth and Vercel cron headers.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Use service role key to bypass RLS
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    console.log('[cron] Refreshing legacy external feed (remote/international only)...');
    const jobs = await fetchExternalFeedJobs();
    const retiredSourceSummary = { cleared: true, error: null as string | null };

    try {
      await clearRetiredExternalFeedSources(supabase);
    } catch (retiredSourceError) {
      retiredSourceSummary.cleared = false;
      retiredSourceSummary.error = String(retiredSourceError);
      console.error('[cron] Failed to clear retired Cameroon external feed rows:', retiredSourceError);
    }

    const externalFeedSummary = await replaceExternalJobsBySource(supabase, jobs);
    console.log(`[cron] Refreshed ${jobs.length} legacy external feed jobs`);

    // --- Full auto pipeline: scrape → ingest → auto-publish → dedup cleanup ---
    let pipelineSummary: any = null;
    try {
      console.log('[cron] Running auto pipeline (scrape → ingest → publish → dedup)...');
      const pipelineResult = await runAutoPipeline('cron', 2);
      pipelineSummary = pipelineResult;
      console.log('[cron] Auto pipeline complete:', pipelineSummary);
    } catch (pipelineErr) {
      console.error('[cron] Auto pipeline error (non-fatal):', pipelineErr);
      pipelineSummary = { error: String(pipelineErr) };
    }

    let facebookSummary: any = null;
    try {
      console.log('[cron] Reprocessing pending Facebook raw posts...');
      facebookSummary = await processPendingFacebookRawPosts(supabase, {
        limit: 75,
        triggerType: 'cron',
      });
      console.log('[cron] Facebook processing complete:', facebookSummary);
    } catch (facebookErr) {
      console.error('[cron] Facebook processing error (non-fatal):', facebookErr);
      facebookSummary = { error: String(facebookErr) };
    }

    const summary = {
      success: true,
      external_feed: {
        fetched: jobs.length,
        inserted: externalFeedSummary.inserted,
        errors: externalFeedSummary.errors,
        sources: externalFeedSummary.sources,
        retired_cameroon_sources: retiredSourceSummary,
      },
      pipeline: pipelineSummary,
      facebook_pipeline: facebookSummary,
      timestamp: new Date().toISOString(),
    };

    console.log('[cron] Refresh complete:', summary);
    return NextResponse.json(summary);
  } catch (err) {
    console.error('[cron] Fatal error during job refresh:', err);
    return NextResponse.json(
      { error: 'Job refresh failed', details: String(err) },
      { status: 500 }
    );
  }
}

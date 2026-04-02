import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchAllExternalJobs } from '@/lib/externalJobs';
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
    console.log('[cron] Starting external jobs refresh...');
    const jobs = await fetchAllExternalJobs();
    console.log(`[cron] Fetched ${jobs.length} jobs from all providers`);

    let inserted = 0;
    let errors = 0;

    // Group jobs by source so we can replace each source atomically
    const bySource = new Map<string, typeof jobs>();
    for (const job of jobs) {
      const arr = bySource.get(job.source) || [];
      arr.push(job);
      bySource.set(job.source, arr);
    }

    // For each source: delete old rows, then batch insert fresh ones
    for (const [source, sourceJobs] of bySource) {
      const { error: delErr } = await supabase
        .from('external_jobs')
        .delete()
        .eq('source', source);

      if (delErr) {
        console.error(`[cron] Delete ${source} error:`, delErr.message);
        errors += sourceJobs.length;
        continue;
      }

      const BATCH_SIZE = 50;
      for (let i = 0; i < sourceJobs.length; i += BATCH_SIZE) {
        const batch = sourceJobs.slice(i, i + BATCH_SIZE);
        const { error: insertErr } = await supabase
          .from('external_jobs')
          .insert(batch);

        if (insertErr) {
          console.error(`[cron] Insert ${source} batch error:`, insertErr.message);
          errors += batch.length;
        } else {
          inserted += batch.length;
        }
      }
    }

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
      fetched: jobs.length,
      inserted,
      errors,
      sources: {
        remotive: jobs.filter(j => j.source === 'remotive').length,
        jobicy: jobs.filter(j => j.source === 'jobicy').length,
        findwork: jobs.filter(j => j.source === 'findwork').length,
        reliefweb: jobs.filter(j => j.source === 'reliefweb').length,
        kamerpower: jobs.filter(j => j.source === 'kamerpower').length,
        minajobs: jobs.filter(j => j.source === 'minajobs').length,
        cameroonjobs: jobs.filter(j => j.source === 'cameroonjobs').length,
        jobincamer: jobs.filter(j => j.source === 'jobincamer').length,
        emploicm: jobs.filter(j => j.source === 'emploicm').length,
        facebook: jobs.filter(j => j.source === 'facebook').length,
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

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { isApifyRunKind } from '@/lib/apify/client';
import { handleSucceededRun } from '@/lib/apify/facebook-runs';
import {
  normalizeApifyFacebookPosts,
  processStoredFacebookPostsByIds,
  storeFacebookRawPosts,
} from '@/lib/scrapers/facebook-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min — LLM extraction can be slow

/** Constant-time string comparison to prevent timing attacks. */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * POST /api/webhooks/apify
 *
 * Receives scraped Facebook group posts from Apify actors.
 * Stores raw posts, then runs LLM extraction to produce structured jobs.
 *
 * Auth: APIFY_WEBHOOK_SECRET header (required).
 *
 * With ?kind=fb_groups|fb_search|fb_pages the body is Apify's run
 * notification ({ eventData: { actorRunId } }); see lib/apify/facebook-runs.ts.
 * Without it, the legacy items form below is still accepted.
 *
 * Expected body (Apify dataset items):
 * [
 *   { "postId": "...", "postText": "...", "postUrl": "...", "timestamp": "...", ... }
 * ]
 *
 * Apify field names vary by actor — we normalize on ingestion.
 */
export async function POST(request: NextRequest) {
  // Auth check — secret is REQUIRED
  // Trimmed exactly like lib/apify/client.ts, which sends this value to Apify;
  // a trailing space or newline pasted into Vercel must not make them differ.
  const secret = (process.env.APIFY_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    console.error('[apify-webhook] APIFY_WEBHOOK_SECRET is not configured — rejecting request');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const provided = (request.headers.get('x-apify-secret') || '').trim();
  if (!provided || !safeCompare(provided, secret)) {
    console.warn(
      `[apify-webhook] rejected: secret mismatch (provided length ${provided.length}, expected ${secret.length}), kind=${request.nextUrl.searchParams.get('kind')}`
    );
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Runs Joblinca started (lib/apify/facebook-runs.ts) send Apify's standard
    // run notification; the run is re-read from Apify before any data is used.
    const kind = request.nextUrl.searchParams.get('kind');
    if (kind !== null) {
      if (!isApifyRunKind(kind)) {
        return NextResponse.json({ error: 'Unknown kind' }, { status: 400 });
      }
      const runId = String(body?.eventData?.actorRunId || body?.resource?.id || '');
      if (!runId) {
        return NextResponse.json({ error: 'Missing actorRunId' }, { status: 400 });
      }
      const outcome = await handleSucceededRun(
        createServiceSupabaseClient(),
        kind,
        runId,
        request.nextUrl.origin,
      );
      return NextResponse.json(outcome);
    }

    // Legacy: dataset items posted directly in the body.
    const items: any[] = Array.isArray(body) ? body : (body.items || body.data || []);

    if (items.length === 0) {
      return NextResponse.json({ message: 'No items received', processed: 0 });
    }

    console.log(`[apify-webhook] Received ${items.length} posts`);
    const rawPosts = normalizeApifyFacebookPosts(items);
    const supabase = createServiceSupabaseClient();

    await storeFacebookRawPosts(supabase, rawPosts);

    const pipeline = await processStoredFacebookPostsByIds(
      supabase,
      rawPosts.map((post) => post.id),
      'manual'
    );

    return NextResponse.json({
      received: items.length,
      queued: pipeline.queued,
      jobs_extracted: pipeline.jobs_extracted,
      jobs_inserted: pipeline.jobs_inserted,
      skipped_posts: pipeline.skipped_posts,
      non_job_posts: pipeline.non_job_posts,
      failed_posts: pipeline.failed_posts,
      image_assisted_posts: pipeline.image_assisted_posts,
      errors: pipeline.errors,
      duration_ms: pipeline.duration_ms,
      ingestion: pipeline.ingestion,
    });
  } catch (err) {
    console.error('[apify-webhook] Fatal error:', err);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

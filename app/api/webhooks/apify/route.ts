import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
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
 * Expected body (Apify dataset items):
 * [
 *   { "postId": "...", "postText": "...", "postUrl": "...", "timestamp": "...", ... }
 * ]
 *
 * Apify field names vary by actor — we normalize on ingestion.
 */
export async function POST(request: NextRequest) {
  // Auth check — secret is REQUIRED
  const secret = process.env.APIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[apify-webhook] APIFY_WEBHOOK_SECRET is not configured — rejecting request');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const provided = request.headers.get('x-apify-secret') || '';
  if (!provided || !safeCompare(provided, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
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
      { error: 'Webhook processing failed', details: String(err) },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  processPendingFacebookRawPosts,
  facebookLimitFromMaxPages,
} from '@/lib/scrapers/facebook-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/admin/facebook-reprocess
 *
 * Re-runs LLM extraction on unprocessed Facebook posts.
 * Useful when OpenAI was unavailable during initial webhook processing.
 *
 * Body (optional): { "limit": 50 }
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const limit = facebookLimitFromMaxPages(
    (body as { maxPages?: number }).maxPages,
    (body as { limit?: number }).limit || 50
  );

  try {
    const supabase = createServiceSupabaseClient();
    const result = await processPendingFacebookRawPosts(supabase, {
      limit,
      triggerType: 'manual',
    });

    return NextResponse.json({
      received: result.received,
      queued: result.queued,
      jobs_extracted: result.jobs_extracted,
      jobs_inserted: result.jobs_inserted,
      skipped_posts: result.skipped_posts,
      non_job_posts: result.non_job_posts,
      failed_posts: result.failed_posts,
      image_assisted_posts: result.image_assisted_posts,
      errors: result.errors,
      duration_ms: result.duration_ms,
      ingestion: result.ingestion,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to reprocess Facebook posts',
      },
      { status: 500 }
    );
  }
}

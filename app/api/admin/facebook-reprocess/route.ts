import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { FacebookScraper } from '@/lib/scrapers/providers/facebook';
import type { FacebookRawPost } from '@/lib/scrapers/providers/facebook';

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const limit = (body as { limit?: number }).limit || 50;

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fetch unprocessed posts
  const { data: rawPosts, error: fetchErr } = await supabase
    .from('facebook_raw_posts')
    .select('*')
    .eq('processed', false)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!rawPosts || rawPosts.length === 0) {
    return NextResponse.json({ message: 'No unprocessed posts found', processed: 0 });
  }

  // Convert to FacebookRawPost format
  const posts: FacebookRawPost[] = rawPosts.map((p: any) => ({
    id: p.post_id,
    text: p.text,
    url: p.url,
    timestamp: p.posted_at,
    group_name: p.group_name,
    group_url: p.group_url,
    author: p.author,
    likes: p.likes,
    comments: p.comments,
    shares: p.shares,
    image_urls: p.image_urls,
  }));

  // Run extraction
  const scraper = new FacebookScraper();
  scraper.setPosts(posts);
  const result = await scraper.run();

  // Store extracted jobs
  let inserted = 0;
  if (result.jobs.length > 0) {
    const BATCH_SIZE = 50;
    for (let i = 0; i < result.jobs.length; i += BATCH_SIZE) {
      const batch = result.jobs.slice(i, i + BATCH_SIZE);
      const { error: insertErr } = await supabase
        .from('external_jobs')
        .upsert(batch, { onConflict: 'external_id', ignoreDuplicates: false });

      if (!insertErr) inserted += batch.length;
    }
  }

  // Mark all as processed
  const processedIds = rawPosts.map((p: any) => p.post_id);
  await supabase
    .from('facebook_raw_posts')
    .update({ processed: true, processed_at: new Date().toISOString() })
    .in('post_id', processedIds);

  return NextResponse.json({
    unprocessed_found: rawPosts.length,
    jobs_extracted: result.jobs.length,
    jobs_inserted: inserted,
    errors: result.errors,
    duration_ms: result.duration_ms,
  });
}

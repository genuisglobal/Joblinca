import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FacebookScraper } from '@/lib/scrapers/providers/facebook';
import type { FacebookRawPost } from '@/lib/scrapers/providers/facebook';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min — LLM extraction can be slow

/**
 * POST /api/webhooks/apify
 *
 * Receives scraped Facebook group posts from Apify actors.
 * Stores raw posts, then runs LLM extraction to produce structured jobs.
 *
 * Auth: APIFY_WEBHOOK_SECRET header or query param.
 *
 * Expected body (Apify dataset items):
 * [
 *   { "postId": "...", "postText": "...", "postUrl": "...", "timestamp": "...", ... }
 * ]
 *
 * Apify field names vary by actor — we normalize on ingestion.
 */
export async function POST(request: NextRequest) {
  // Auth check
  const secret = process.env.APIFY_WEBHOOK_SECRET;
  if (secret) {
    const provided = request.headers.get('x-apify-secret')
      || request.nextUrl.searchParams.get('secret');
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const items: any[] = Array.isArray(body) ? body : (body.items || body.data || []);

    if (items.length === 0) {
      return NextResponse.json({ message: 'No items received', processed: 0 });
    }

    console.log(`[apify-webhook] Received ${items.length} posts`);

    // Normalize Apify data to our raw post format
    const rawPosts: FacebookRawPost[] = items.map((item: any) => ({
      id: item.postId || item.id || item.facebookId || String(Date.now() + Math.random()),
      text: item.postText || item.text || item.message || item.caption || '',
      url: item.postUrl || item.url || item.post_url || null,
      post_url: item.postUrl || item.url || null,
      timestamp: item.timestamp || item.time || item.date || item.createdTime || null,
      group_name: item.groupName || item.group_name || null,
      group_url: item.groupUrl || item.group_url || null,
      author: item.authorName || item.author || item.userName || null,
      likes: item.likesCount || item.likes || 0,
      comments: item.commentsCount || item.comments || 0,
      shares: item.sharesCount || item.shares || 0,
      image_urls: item.imageUrls || item.images || [],
    }));

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Store raw posts
    const rawInsertData = rawPosts.map((p) => ({
      post_id: p.id,
      text: p.text?.slice(0, 10000) || '',
      url: p.url || null,
      posted_at: p.timestamp || null,
      group_name: p.group_name || null,
      group_url: p.group_url || null,
      author: p.author || null,
      likes: p.likes || 0,
      comments: p.comments || 0,
      shares: p.shares || 0,
      image_urls: p.image_urls || [],
      processed: false,
    }));

    const { error: rawInsertError } = await supabase
      .from('facebook_raw_posts')
      .upsert(rawInsertData, { onConflict: 'post_id', ignoreDuplicates: true });

    if (rawInsertError) {
      console.error('[apify-webhook] Raw post insert error:', rawInsertError.message);
    }

    // Run LLM extraction
    const scraper = new FacebookScraper();
    // Filter to posts with enough text
    const extractablePosts = rawPosts.filter((p) => p.text && p.text.trim().length >= 30);
    scraper.setPosts(extractablePosts);
    const result = await scraper.run();

    // Store extracted jobs in external_jobs
    if (result.jobs.length > 0) {
      const BATCH_SIZE = 50;
      let inserted = 0;

      for (let i = 0; i < result.jobs.length; i += BATCH_SIZE) {
        const batch = result.jobs.slice(i, i + BATCH_SIZE);
        const { error: insertErr } = await supabase
          .from('external_jobs')
          .upsert(batch, { onConflict: 'external_id', ignoreDuplicates: false });

        if (insertErr) {
          console.error('[apify-webhook] Job insert error:', insertErr.message);
        } else {
          inserted += batch.length;
        }
      }

      // Mark processed posts
      const processedIds = rawPosts.map((p) => p.id);
      await supabase
        .from('facebook_raw_posts')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .in('post_id', processedIds);

      console.log(`[apify-webhook] Inserted ${inserted} jobs from ${extractablePosts.length} posts`);
    }

    return NextResponse.json({
      received: items.length,
      extractable: extractablePosts.length,
      jobs_extracted: result.jobs.length,
      errors: result.errors,
      duration_ms: result.duration_ms,
    });
  } catch (err) {
    console.error('[apify-webhook] Fatal error:', err);
    return NextResponse.json(
      { error: 'Webhook processing failed', details: String(err) },
      { status: 500 }
    );
  }
}

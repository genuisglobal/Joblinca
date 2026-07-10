/**
 * Description backfill for discovered jobs.
 *
 * Scrapers cap how many detail pages they fetch per run, so some jobs land
 * in discovered_jobs with no description — and the auto-publish gate rightly
 * refuses to publish description-less stubs, leaving them stuck forever.
 * This pass fetches the original posting page for those rows and extracts
 * the description, unblocking them for the next publish pass.
 *
 * Retry semantics: a page that loads but yields no description (or a hard
 * HTTP error like 404) marks the row with description_raw='' so it is never
 * fetched again; network failures leave the row untouched for a later retry.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const cheerio = require('cheerio/slim') as typeof import('cheerio');

const BATCH_LIMIT = 15;
const FETCH_TIMEOUT_MS = 15000;
const MIN_DESCRIPTION_LENGTH = 40;

const DESCRIPTION_SELECTORS = [
  'article .entry-content',
  '.job-description',
  '.post-content',
  '.field-name-body',
  '.job-detail-content',
  '.job-detail-holder', // minajobs
  '.detail-font', // minajobs
  'article .content',
  '.description',
  'main .content',
  'article',
  'main',
  '.content',
];

export interface DescriptionBackfillStats {
  examined: number;
  filled: number;
  marked_unavailable: number;
  retry_later: number;
}

interface BackfillRow {
  id: string;
  title: string;
  original_job_url: string | null;
  apply_url: string | null;
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

async function fetchPageHtml(url: string): Promise<{ ok: boolean; html: string | null; permanent: boolean }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Joblinca/1.0 (Cameroon Job Aggregator; contact@joblinca.com)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr,en;q=0.9',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      // 4xx/5xx: treat client errors as permanent, server errors as retryable
      return { ok: false, html: null, permanent: res.status >= 400 && res.status < 500 };
    }

    return { ok: true, html: await res.text(), permanent: false };
  } catch {
    return { ok: false, html: null, permanent: false };
  }
}

function extractDescription(html: string): string | null {
  const $ = cheerio.load(html);
  $('script, style, noscript, nav, header, footer, aside').remove();

  for (const selector of DESCRIPTION_SELECTORS) {
    const el = $(selector);
    if (el.length > 0) {
      const text = cleanText(el.first().text());
      if (text.length >= MIN_DESCRIPTION_LENGTH) {
        return text.slice(0, 4000);
      }
    }
  }

  // Last resort for unknown markup: the div carrying the most text is almost
  // always the posting body once chrome elements are stripped
  let bestText: string | null = null;
  $('div').each((_, el) => {
    const ownText = cleanText($(el).children().length <= 12 ? $(el).text() : '');
    if (ownText.length >= 200 && (!bestText || ownText.length > bestText.length)) {
      bestText = ownText;
    }
  });
  if (bestText !== null) {
    return (bestText as string).slice(0, 4000);
  }

  return null;
}

/**
 * Fill missing descriptions for publish-eligible discovered jobs,
 * highest-trust first.
 */
export async function runDescriptionBackfill(
  supabase: SupabaseClient,
  limit = BATCH_LIMIT
): Promise<DescriptionBackfillStats> {
  const stats: DescriptionBackfillStats = {
    examined: 0,
    filled: 0,
    marked_unavailable: 0,
    retry_later: 0,
  };

  const { data: rows, error } = await supabase
    .from('discovered_jobs')
    .select('id, title, original_job_url, apply_url')
    .is('native_job_id', null)
    .not('ingestion_status', 'in', '("published","hidden")')
    .is('description_raw', null)
    .is('description_clean', null)
    .order('trust_score', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[description-backfill] Query failed:', error.message);
    return stats;
  }

  const jobs = (rows || []) as BackfillRow[];
  stats.examined = jobs.length;

  for (const job of jobs) {
    const url = job.original_job_url || job.apply_url;

    if (!url || !url.startsWith('http')) {
      await supabase.from('discovered_jobs').update({ description_raw: '' }).eq('id', job.id);
      stats.marked_unavailable++;
      continue;
    }

    const page = await fetchPageHtml(url);

    if (!page.ok) {
      if (page.permanent) {
        await supabase.from('discovered_jobs').update({ description_raw: '' }).eq('id', job.id);
        stats.marked_unavailable++;
      } else {
        stats.retry_later++;
      }
      continue;
    }

    const description = page.html ? extractDescription(page.html) : null;

    if (description) {
      const { error: updateErr } = await supabase
        .from('discovered_jobs')
        .update({ description_raw: description })
        .eq('id', job.id);
      if (updateErr) {
        console.error(`[description-backfill] Update failed for ${job.id}:`, updateErr.message);
        stats.retry_later++;
      } else {
        stats.filled++;
      }
    } else {
      // Page loaded but no extractable description — don't retry forever
      await supabase.from('discovered_jobs').update({ description_raw: '' }).eq('id', job.id);
      stats.marked_unavailable++;
    }

    // Politeness between fetches
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  console.log(
    `[description-backfill] ${stats.examined} examined: ${stats.filled} filled, ${stats.marked_unavailable} unavailable, ${stats.retry_later} to retry`
  );

  return stats;
}

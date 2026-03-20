/**
 * Facebook Groups scraper — processes posts from Cameroon job groups.
 *
 * This scraper does NOT crawl Facebook directly. Instead it processes
 * data received from Apify's Facebook Groups Posts Scraper actor via
 * the webhook at /api/webhooks/apify.
 *
 * Flow:
 * 1. Apify scheduled run scrapes configured Facebook groups
 * 2. Apify webhook POSTs results to /api/webhooks/apify
 * 3. Raw posts are stored in facebook_raw_posts table
 * 4. This scraper reads unprocessed raw posts, runs LLM extraction,
 *    and produces ScrapedJob records
 *
 * Can also be triggered manually via /api/admin/scrapers with source=facebook.
 */

import { BaseScraper } from '../base';
import { deriveCategory } from '@/lib/externalJobs';
import { extractJobFromPost } from '../facebook-extractor';
import { isAiConfigured } from '@/lib/ai/client';
import type { ScrapedJob, ScraperConfig } from '../types';

/** Shape of a raw Facebook post (from Apify or stored in DB). */
export interface FacebookRawPost {
  id: string;
  text: string;
  url?: string;
  post_url?: string;
  timestamp?: string;
  time?: string;
  group_name?: string;
  group_url?: string;
  author?: string;
  likes?: number;
  comments?: number;
  shares?: number;
  image_urls?: string[];
}

export class FacebookScraper extends BaseScraper {
  private pendingPosts: FacebookRawPost[] = [];

  constructor(config?: Partial<ScraperConfig>) {
    super('facebook', { maxPages: 1, delayMs: 300, ...config });
  }

  /** Load posts to process (called before run). */
  setPosts(posts: FacebookRawPost[]): void {
    this.pendingPosts = posts;
  }

  protected async scrape(): Promise<ScrapedJob[]> {
    if (!isAiConfigured()) {
      console.warn('[scraper:facebook] OpenAI not configured — cannot extract jobs from posts');
      return [];
    }

    if (this.pendingPosts.length === 0) {
      console.log('[scraper:facebook] No pending posts to process');
      return [];
    }

    const allJobs: ScrapedJob[] = [];
    let processed = 0;
    let skipped = 0;

    for (const post of this.pendingPosts) {
      // Skip posts with too little text
      if (!post.text || post.text.trim().length < 30) {
        skipped++;
        continue;
      }

      try {
        const extraction = await extractJobFromPost(post.text);

        if (!extraction || !extraction.is_job_post || !extraction.title) {
          skipped++;
          continue;
        }

        const postUrl = post.url || post.post_url || `https://facebook.com/${post.id}`;
        const postedAt = post.timestamp || post.time || null;

        allJobs.push({
          external_id: this.makeId(post.id),
          source: this.source,
          title: extraction.title,
          company_name: extraction.company,
          company_logo: null,
          location: extraction.location || 'Cameroon',
          salary: extraction.salary,
          job_type: extraction.job_type,
          category: deriveCategory(extraction.title),
          description: extraction.requirements,
          url: postUrl,
          region: this.normalizeRegion(extraction.location),
          language: extraction.language,
          is_cameroon_local: true,
          posted_at: postedAt,
          closing_at: extraction.deadline,
          fetched_at: new Date().toISOString(),
        });

        processed++;
      } catch (err) {
        console.error(`[scraper:facebook] Post ${post.id} extraction error:`, err);
      }

      // Rate limit between LLM calls
      await this.delay();
    }

    console.log(`[scraper:facebook] Processed ${processed} jobs, skipped ${skipped} non-job posts`);
    return allJobs;
  }
}

/**
 * Default list of Cameroon job Facebook groups to monitor.
 * Add/remove via the admin API at /api/admin/facebook-groups.
 */
export const DEFAULT_FACEBOOK_GROUPS = [
  {
    url: 'https://www.facebook.com/groups/305613197515850/',
    name: 'Job Opportunities in Cameroon',
    language: 'en' as const,
  },
  {
    url: 'https://www.facebook.com/groups/1931632440309708/',
    name: 'Offres d\'emploi à Yaoundé',
    language: 'fr' as const,
  },
  {
    url: 'https://www.facebook.com/groups/374207869423832/',
    name: 'Offres d\'emploi à Douala et au Cameroun',
    language: 'fr' as const,
  },
  {
    url: 'https://www.facebook.com/groups/2577280869082065/',
    name: 'Skilled and unskilled jobs opportunities in Cameroon',
    language: 'en' as const,
  },
];

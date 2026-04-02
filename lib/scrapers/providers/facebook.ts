/**
 * Facebook Groups scraper - processes posts captured by Apify and stored in
 * facebook_raw_posts. It does not crawl Facebook directly.
 */

import { BaseScraper } from '../base';
import { deriveCategory } from '@/lib/externalJobs';
import { extractJobFromPostDetailed } from '../facebook-extractor';
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

export type FacebookPostOutcomeStatus =
  | 'job_extracted'
  | 'not_job'
  | 'skipped'
  | 'failed';

export interface FacebookPostOutcome {
  postId: string;
  status: FacebookPostOutcomeStatus;
  reason?: string;
  extractedExternalId?: string | null;
  usedImages: boolean;
}

export interface FacebookRunStats {
  totalPosts: number;
  extractedJobs: number;
  skippedPosts: number;
  nonJobPosts: number;
  failedPosts: number;
  imageAssistedPosts: number;
}

function createEmptyRunStats(): FacebookRunStats {
  return {
    totalPosts: 0,
    extractedJobs: 0,
    skippedPosts: 0,
    nonJobPosts: 0,
    failedPosts: 0,
    imageAssistedPosts: 0,
  };
}

function hasImages(post: FacebookRawPost): boolean {
  return Array.isArray(post.image_urls) && post.image_urls.length > 0;
}

export function isFacebookPostExtractable(post: FacebookRawPost): boolean {
  const text = (post.text || '').trim();
  return text.length >= 20 || hasImages(post);
}

export class FacebookScraper extends BaseScraper {
  private pendingPosts: FacebookRawPost[] = [];
  private lastRunOutcomes: FacebookPostOutcome[] = [];
  private lastRunStats: FacebookRunStats = createEmptyRunStats();

  constructor(config?: Partial<ScraperConfig>) {
    super('facebook', { maxPages: 1, delayMs: 300, ...config });
  }

  /** Load posts to process (called before run). */
  setPosts(posts: FacebookRawPost[]): void {
    this.pendingPosts = posts;
  }

  getLastRunOutcomes(): FacebookPostOutcome[] {
    return this.lastRunOutcomes;
  }

  getLastRunStats(): FacebookRunStats {
    return this.lastRunStats;
  }

  private resetRunState(totalPosts: number): void {
    this.lastRunOutcomes = [];
    this.lastRunStats = {
      ...createEmptyRunStats(),
      totalPosts,
    };
  }

  protected async scrape(): Promise<ScrapedJob[]> {
    this.resetRunState(this.pendingPosts.length);

    if (this.pendingPosts.length === 0) {
      console.log('[scraper:facebook] No pending posts to process');
      return [];
    }

    if (!isAiConfigured()) {
      console.warn('[scraper:facebook] OpenAI not configured - cannot extract jobs from posts');
      this.lastRunOutcomes = this.pendingPosts.map((post) => ({
        postId: post.id,
        status: 'failed',
        reason: 'ai_not_configured',
        usedImages: hasImages(post),
      }));
      this.lastRunStats.failedPosts = this.pendingPosts.length;
      return [];
    }

    const allJobs: ScrapedJob[] = [];

    for (const post of this.pendingPosts) {
      const postText = (post.text || '').trim();
      const usedImages = hasImages(post);

      if (!isFacebookPostExtractable(post)) {
        this.lastRunStats.skippedPosts++;
        this.lastRunOutcomes.push({
          postId: post.id,
          status: 'skipped',
          reason: 'text_too_short_and_no_images',
          usedImages: false,
        });
        continue;
      }

      try {
        const extractionDetail = await extractJobFromPostDetailed(postText, post.image_urls || []);

        if (extractionDetail.error) {
          this.lastRunStats.failedPosts++;
          this.lastRunOutcomes.push({
            postId: post.id,
            status: 'failed',
            reason: extractionDetail.error,
            usedImages,
          });
          continue;
        }

        const extraction = extractionDetail.extraction;
        if (!extraction || !extraction.is_job_post || !extraction.title) {
          this.lastRunStats.nonJobPosts++;
          this.lastRunOutcomes.push({
            postId: post.id,
            status: 'not_job',
            reason: 'not_job_post',
            usedImages,
          });
          continue;
        }

        const postUrl = post.url || post.post_url || `https://facebook.com/${post.id}`;
        const postedAt = post.timestamp || post.time || null;
        const contacts = this.extractContacts(postText);
        const externalId = this.makeId(post.id);

        allJobs.push({
          external_id: externalId,
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
          contact_email: extraction.contact || contacts.email,
          contact_phone: contacts.phone,
          contact_whatsapp: contacts.whatsapp,
        });

        this.lastRunStats.extractedJobs++;
        if (usedImages) {
          this.lastRunStats.imageAssistedPosts++;
        }

        this.lastRunOutcomes.push({
          postId: post.id,
          status: 'job_extracted',
          extractedExternalId: externalId,
          usedImages,
        });
      } catch (err) {
        console.error(`[scraper:facebook] Post ${post.id} extraction error:`, err);
        this.lastRunStats.failedPosts++;
        this.lastRunOutcomes.push({
          postId: post.id,
          status: 'failed',
          reason: err instanceof Error ? err.message : 'unknown_error',
          usedImages,
        });
      }

      await this.delay();
    }

    console.log(
      `[scraper:facebook] Extracted ${this.lastRunStats.extractedJobs} jobs, ` +
        `${this.lastRunStats.nonJobPosts} non-job posts, ` +
        `${this.lastRunStats.skippedPosts} skipped, ` +
        `${this.lastRunStats.failedPosts} failed`
    );
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
    name: "Offres d'emploi a Yaounde",
    language: 'fr' as const,
  },
  {
    url: 'https://www.facebook.com/groups/374207869423832/',
    name: "Offres d'emploi a Douala et au Cameroun",
    language: 'fr' as const,
  },
  {
    url: 'https://www.facebook.com/groups/2577280869082065/',
    name: 'Skilled and unskilled jobs opportunities in Cameroon',
    language: 'en' as const,
  },
];

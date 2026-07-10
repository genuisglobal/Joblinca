/**
 * KmerJobs scraper.
 *
 * Verified via public search results on May 11, 2026:
 * - The site identifies itself as a Joblook-powered WordPress job portal.
 * - Joblook publicly documents WP Job Manager integration.
 * - WP Job Manager publicly documents `/wp-json/wp/v2/job-listings`.
 *
 * Strategy:
 * 1. Prefer the WP REST API route used by WP Job Manager.
 * 2. Fall back to HTML parsing of the jobs page if the REST route is disabled.
 */

import { BaseScraper } from '../base';
import { deriveCategory } from '@/lib/externalJobs';
import type { ScrapedJob, ScraperConfig } from '../types';

const cheerio = require('cheerio/slim') as typeof import('cheerio');

const BASE_URL = 'https://www.kmerjobs.com';
const JOBS_PATH = '/jobs/';
const API_ROUTES = [
  '/wp-json/wp/v2/job-listings',
  '/wp-json/wp/v2/job_listing',
];

type WpRendered = {
  rendered?: string;
};

type WpEmbeddedTerm = {
  taxonomy?: string;
  name?: string;
};

type WpEmbeddedMedia = {
  source_url?: string;
};

type WpJobListing = {
  id?: number | string;
  link?: string;
  date?: string;
  modified?: string;
  title?: WpRendered;
  excerpt?: WpRendered;
  content?: WpRendered;
  meta?: Record<string, unknown>;
  _embedded?: {
    'wp:featuredmedia'?: WpEmbeddedMedia[];
    'wp:term'?: WpEmbeddedTerm[][];
  };
};

function metaString(meta: Record<string, unknown> | undefined, key: string): string | null {
  const value = meta?.[key];

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string' && entry.trim()) {
        return entry.trim();
      }
    }
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return null;
}

function metaBool(meta: Record<string, unknown> | undefined, key: string): boolean {
  const value = meta?.[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(lower);
  }
  return false;
}

function stripHtml(html: string | undefined): string {
  if (!html) return '';
  const $ = cheerio.load(`<div>${html}</div>`);
  return $.text().replace(/\s+/g, ' ').trim();
}

function firstImageUrl(item: WpJobListing): string | null {
  const media = item._embedded?.['wp:featuredmedia'] || [];
  for (const entry of media) {
    if (entry?.source_url) return entry.source_url;
  }
  return null;
}

function extractEmbeddedTerms(item: WpJobListing): {
  jobType: string | null;
  category: string | null;
} {
  const groups = item._embedded?.['wp:term'] || [];
  let jobType: string | null = null;
  let category: string | null = null;

  for (const group of groups) {
    for (const term of group || []) {
      const taxonomy = (term.taxonomy || '').toLowerCase();
      const name = (term.name || '').trim();
      if (!name) continue;

      if (!jobType && taxonomy.includes('job_listing_type')) {
        jobType = name;
      }

      if (!category && taxonomy.includes('job_listing_category')) {
        category = name;
      }
    }
  }

  return { jobType, category };
}

export class KmerJobsScraper extends BaseScraper {
  constructor(config?: Partial<ScraperConfig>) {
    super('kmerjobs', { maxPages: 5, delayMs: 1500, ...config });
  }

  protected async scrape(): Promise<ScrapedJob[]> {
    const apiJobs = await this.scrapeViaApi();
    if (apiJobs.length > 0) {
      return apiJobs;
    }

    return this.scrapeViaHtml();
  }

  private async scrapeViaApi(): Promise<ScrapedJob[]> {
    const allJobs: ScrapedJob[] = [];
    const seenIds = new Set<string>();
    const perPage = 20;

    for (let page = 1; page <= this.config.maxPages; page++) {
      const pageStartIndex = allJobs.length;
      let items: WpJobListing[] | null = null;

      for (const route of API_ROUTES) {
        const url = `${BASE_URL}${route}?per_page=${perPage}&page=${page}&_embed`;
        try {
          const res = await this.fetchPage(url, {
            headers: {
              Accept: 'application/json',
            },
            retries: 1,
          });

          const payload = await res.json();
          if (Array.isArray(payload)) {
            items = payload as WpJobListing[];
            break;
          }
        } catch {
          continue;
        }
      }

      if (!items || items.length === 0) {
        break;
      }

      for (const item of items) {
        const job = this.mapApiJob(item);
        if (!job || seenIds.has(job.external_id)) {
          continue;
        }

        seenIds.add(job.external_id);
        allJobs.push(job);
      }

      if (this.shouldStopAfterPage(allJobs.slice(pageStartIndex))) break;

      if (items.length < perPage) {
        break;
      }

      if (page < this.config.maxPages) {
        await this.delay();
      }
    }

    return allJobs;
  }

  private mapApiJob(item: WpJobListing): ScrapedJob | null {
    const rawId = String(item.id || '').trim();
    const url = (item.link || '').trim();
    const title = this.clean(stripHtml(item.title?.rendered));

    if (!rawId || !url || !title) {
      return null;
    }

    const meta = item.meta || {};
    const contentText = this.clean(stripHtml(item.content?.rendered));
    const excerptText = this.clean(stripHtml(item.excerpt?.rendered));
    const description = contentText || excerptText || null;
    const company = this.clean(metaString(meta, '_company_name')) || null;
    const rawLocation = this.clean(metaString(meta, '_job_location')) || null;
    const location = metaBool(meta, '_remote_position')
      ? (rawLocation ? `${rawLocation} / Remote` : 'Remote')
      : (rawLocation || 'Cameroon');
    const salary = this.clean(metaString(meta, '_job_salary')) || null;
    const closingAt = metaString(meta, '_job_expires');
    const application = metaString(meta, '_application');
    const terms = extractEmbeddedTerms(item);
    const contacts = this.extractContacts(
      [description, application, metaString(meta, '_company_website')].filter(Boolean).join('\n')
    );

    return {
      external_id: this.makeId(rawId),
      source: this.source,
      title,
      company_name: company,
      company_logo: firstImageUrl(item),
      location,
      salary,
      job_type: this.normalizeJobType(terms.jobType),
      category: terms.category || deriveCategory(title, company || '', description || ''),
      description,
      url,
      region: this.normalizeRegion(location),
      language: this.detectLanguage([title, company, description].filter(Boolean).join(' ')),
      is_cameroon_local: true,
      posted_at: item.date || item.modified || null,
      closing_at: closingAt,
      fetched_at: new Date().toISOString(),
      contact_email: contacts.email,
      contact_phone: contacts.phone,
      contact_whatsapp: contacts.whatsapp,
    };
  }

  private async scrapeViaHtml(): Promise<ScrapedJob[]> {
    const allJobs: ScrapedJob[] = [];
    const seenUrls = new Set<string>();

    for (let page = 1; page <= this.config.maxPages; page++) {
      const pageStartIndex = allJobs.length;
      const url = page === 1 ? `${BASE_URL}${JOBS_PATH}` : `${BASE_URL}${JOBS_PATH}?paged=${page}`;

      try {
        const res = await this.fetchPage(url, { retries: 1 });
        const html = await res.text();
        const $ = cheerio.load(html);

        const cards = $('ul.job_listings li.job_listing, div.job_listings article, article.job_listing, li.job_listing');
        if (cards.length === 0) {
          break;
        }

        cards.each((_, el) => {
          const $el = $(el);
          const $titleLink =
            $el.find('a[href] h3').first().closest('a') ||
            $el.find('h3 a').first() ||
            $el.find('a.job_listing-clickbox').first();

          const href = $titleLink.attr('href') || $el.find('a[href]').first().attr('href') || '';
          const title =
            this.clean($el.find('h3').first().text()) ||
            this.clean($titleLink.text());

          if (!href || !title || seenUrls.has(href)) {
            return;
          }

          seenUrls.add(href);

          const company = this.clean(
            $el.find('.company strong, .company, .job_listing-company, .listing-company').first().text()
          ) || null;
          const location = this.clean(
            $el.find('.location, .job-location, .job_listing-location').first().text()
          ) || 'Cameroon';
          const jobType = this.clean(
            $el.find('.job-type, .job_listing-type, .listing-types .job-type').first().text()
          ) || null;
          const description = this.clean(
            $el.find('.job_listing-description, .excerpt, .job-description').first().text()
          ) || null;
          const logo =
            $el.find('img').first().attr('data-src') ||
            $el.find('img').first().attr('src') ||
            null;
          const postedAt =
            $el.find('time').first().attr('datetime') ||
            $el.find('time').first().text().trim() ||
            null;
          const contacts = this.extractContacts(description || '');
          const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? href : `/${href}`}`;

          allJobs.push({
            external_id: this.makeId(fullUrl),
            source: this.source,
            title,
            company_name: company,
            company_logo: logo,
            location,
            salary: null,
            job_type: this.normalizeJobType(jobType),
            category: deriveCategory(title, company || '', description || ''),
            description,
            url: fullUrl,
            region: this.normalizeRegion(location),
            language: this.detectLanguage([title, company, description].filter(Boolean).join(' ')),
            is_cameroon_local: true,
            posted_at: postedAt,
            closing_at: null,
            fetched_at: new Date().toISOString(),
            contact_email: contacts.email,
            contact_phone: contacts.phone,
            contact_whatsapp: contacts.whatsapp,
          });
        });

        if (this.shouldStopAfterPage(allJobs.slice(pageStartIndex))) break;

        if (page < this.config.maxPages) {
          await this.delay();
        }
      } catch (err) {
        console.error(`[scraper:kmerjobs] HTML fallback page ${page} error:`, err);
        break;
      }
    }

    return allJobs;
  }

  private normalizeJobType(value: string | null): string | null {
    if (!value) return null;

    const lower = value.toLowerCase();
    if (lower.includes('full')) return 'Full-time';
    if (lower.includes('part')) return 'Part-time';
    if (lower.includes('intern') || lower.includes('stage')) return 'Internship';
    if (lower.includes('contract') || lower.includes('cdd')) return 'Contract';
    if (lower.includes('temporary') || lower.includes('temporaire')) return 'Temporary';
    if (lower.includes('freelance')) return 'Freelance';
    if (lower.includes('volunteer') || lower.includes('benevol')) return 'Volunteer';

    return value;
  }
}

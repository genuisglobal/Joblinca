/**
 * MinaJobs scraper — Cameroon job board (French-first).
 *
 * Reads cm.minajobs.net's public JSON API (the same one its own listing page
 * calls) instead of parsing HTML. See ./minajobs-parse for why: the 2026-11
 * redesign removed the old markup and the scraper silently returned 0 jobs.
 *
 * Listing: GET /api/jobs?page=N&limit=30 (newest first)
 * Detail:  GET /api/jobs/{slug} -> full description + applyEmail, used for
 *          the first DETAIL_LIMIT jobs to fill description and contacts.
 */

import { BaseScraper } from '../base';
import { deriveCategory } from '@/lib/externalJobs';
import {
  MINAJOBS_BASE_URL,
  isListResponse,
  jobUrl,
  portableTextToPlain,
  type MinaJobsDetail,
  type MinaJobsListItem,
} from './minajobs-parse';
import type { ScrapedJob, ScraperConfig } from '../types';

const PAGE_SIZE = 30; // server caps `limit` at 30
const DETAIL_LIMIT = 30;

export class MinaJobsScraper extends BaseScraper {
  constructor(config?: Partial<ScraperConfig>) {
    super('minajobs', { maxPages: 5, delayMs: 2500, ...config });
  }

  protected async scrape(): Promise<ScrapedJob[]> {
    const allJobs: ScrapedJob[] = [];
    const slugs = new Map<string, string>(); // external_id -> slug
    const seen = new Set<number>();

    for (let page = 1; page <= this.config.maxPages; page++) {
      const pageStartIndex = allJobs.length;
      const url = `${MINAJOBS_BASE_URL}/api/jobs?page=${page}&limit=${PAGE_SIZE}`;

      try {
        const res = await this.fetchPage(url, { headers: { Accept: 'application/json' } });
        const body: unknown = await res.json();
        if (!isListResponse(body)) {
          this.recordScrapeError(`page ${page}`, new Error('unexpected /api/jobs response shape'));
          break;
        }

        if (body.items.length === 0) {
          if (page === 1) {
            this.recordScrapeError('page 1', new Error('API returned no jobs'));
          }
          break;
        }

        for (const item of body.items) {
          if (!item?.slug || !item.title || typeof item.number !== 'number' || seen.has(item.number)) continue;
          seen.add(item.number);
          const job = this.toScrapedJob(item);
          slugs.set(job.external_id, item.slug);
          allJobs.push(job);
        }

        if (this.shouldStopAfterPage(allJobs.slice(pageStartIndex))) break;
        if (page * (body.pageSize || PAGE_SIZE) >= body.total) break;

        if (page < this.config.maxPages) {
          await this.delay();
        }
      } catch (err) {
        this.recordScrapeError(`page ${page}`, err);
        break;
      }
    }

    // Detail API for description + contacts (non-fatal per job)
    const detailLimit = Math.min(allJobs.length, DETAIL_LIMIT);
    for (let i = 0; i < detailLimit; i++) {
      const job = allJobs[i];
      const slug = slugs.get(job.external_id);
      if (!slug) continue;
      try {
        const res = await this.fetchPage(
          `${MINAJOBS_BASE_URL}/api/jobs/${encodeURIComponent(slug)}`,
          { headers: { Accept: 'application/json' }, retries: 1 }
        );
        const detail = (await res.json()) as MinaJobsDetail;
        const description = portableTextToPlain(detail.description);
        if (description) job.description = description.slice(0, 5000);

        const contacts = this.extractContacts(
          [description, detail.applyInstructions || ''].join('\n')
        );
        job.contact_email = detail.applyEmail?.trim() || contacts.email;
        job.contact_phone = contacts.phone;
        job.contact_whatsapp = contacts.whatsapp;
        if (description) job.category = deriveCategory(job.title, detail.category?.title || '', description);
        await this.delay(1000);
      } catch {
        // Non-fatal
      }
    }

    return allJobs;
  }

  private toScrapedJob(item: MinaJobsListItem): ScrapedJob {
    const cityTitle = item.city?.title?.trim() || null;
    return {
      external_id: this.makeId(String(item.number)),
      source: this.source,
      title: this.clean(item.title),
      company_name: item.company?.name?.trim() || null,
      company_logo: item.company?.logo || null,
      location: cityTitle,
      salary: item.salary || null,
      job_type: this.normalizeJobType(item.type?.title || null),
      category: deriveCategory(item.title, item.category?.title || ''),
      description: null,
      url: jobUrl(item.slug),
      region: this.normalizeRegion(cityTitle),
      language: this.detectLanguage(item.title),
      is_cameroon_local: true,
      posted_at: toIso(item.publishedAt),
      closing_at: toIso(item.deadline),
      fetched_at: new Date().toISOString(),
      contact_email: null,
      contact_phone: null,
      contact_whatsapp: null,
    };
  }

  /** Normalize French job types to a common format. */
  private normalizeJobType(type: string | null): string | null {
    if (!type) return null;
    const lower = type.toLowerCase().trim();
    const map: Record<string, string> = {
      'temps complet': 'Full-time',
      'temps partiel': 'Part-time',
      'stage': 'Internship',
      'freelance': 'Freelance',
      'consultance': 'Freelance',
      'cdd': 'Contract',
      'cdi': 'Full-time',
      'bénévolat': 'Volunteer',
      'intérim': 'Temporary',
      'temporaire': 'Temporary',
    };
    for (const [key, value] of Object.entries(map)) {
      if (lower.includes(key)) return value;
    }
    return type;
  }
}

function toIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

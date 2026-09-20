/**
 * Africarrieres scraper — direct employer job board covering Cameroon.
 *
 * Unlike njorku.com (a re-aggregator of other boards' listings) this is a
 * dedicated recruitment portal where employers post directly, so there's no
 * duplicate-of-a-duplicate risk with the sources already in the catalog.
 * robots.txt (checked 2026-09-20) only disallows /dashboard/, /employeur/,
 * /connexion and other account paths -- job listing and detail pages are
 * unrestricted, so unlike optioncarriere.cm this source can be scraped for
 * full descriptions, not just listing snippets.
 *
 * Listing pages are server-rendered HTML (no JS rendering required), fixed
 * class names (Tailwind), 20 jobs/page, with a rel="next" pagination link
 * matching the pattern the other cheerio-based providers already rely on.
 */

import { BaseScraper } from '../base';
import { deriveCategory } from '@/lib/externalJobs';
import type { ScrapedJob, ScraperConfig } from '../types';

const LISTING_URL = 'https://africarrieres.com/cameroun/en/emplois';
const cheerio = require('cheerio/slim') as typeof import('cheerio');

/** Every job card on a listing page shares exactly this class set (verified: 20/20 cards, no false positives from sidebar/filter boxes). */
const CARD_SELECTOR =
  'div.relative.overflow-hidden.rounded-lg.border.bg-white.p-4';

export class AfricarrieresScraper extends BaseScraper {
  constructor(config?: Partial<ScraperConfig>) {
    super('africarrieres', { maxPages: 6, delayMs: 3000, ...config });
  }

  protected async scrape(): Promise<ScrapedJob[]> {
    const allJobs: ScrapedJob[] = [];
    const seenUrls = new Set<string>();

    for (let page = 1; page <= this.config.maxPages; page++) {
      const pageStartIndex = allJobs.length;
      const url = page === 1 ? LISTING_URL : `${LISTING_URL}?page=${page}`;

      try {
        const res = await this.fetchPage(url);
        const html = await res.text();
        const $ = cheerio.load(html);

        const cards = $(CARD_SELECTOR);
        if (cards.length === 0) break;

        cards.each((_, el) => {
          const $card = $(el);
          const $link = $card.find('> a.block').first();
          const jobUrl = $link.attr('href') || '';
          const title = this.clean($link.find('h3').first().text());

          if (!title || !jobUrl || seenUrls.has(jobUrl)) return;
          seenUrls.add(jobUrl);

          const company = this.clean(
            $link.find('p.text-primary-600 span').first().text()
          ) || null;

          const metaSpans = $link.find(
            'div.mt-2.flex.flex-wrap.items-center.gap-x-4 > span'
          );
          let location: string | null = null;
          let jobType: string | null = null;
          let salary: string | null = null;
          metaSpans.each((__, spanEl) => {
            const $span = $(spanEl);
            const text = this.clean($span.text());
            if (!text) return;
            // The site emits a duplicate `class` attribute on its <svg> icons
            // (e.g. class="h-3.5 w-3.5" ... class="icon-tabler-map-pin"), and
            // per the HTML spec parsers keep only the first -- so the icon
            // class itself is unreliable. Only the location span carries an
            // <svg> at all among these three, so presence is enough.
            if ($span.find('svg').length > 0) {
              location = text;
            } else if ($span.hasClass('font-medium')) {
              salary = text;
            } else if (!jobType) {
              jobType = text;
            }
          });

          const postedText = this.clean(
            $link.find('div.ml-4 p').first().text()
          );
          const postedAt = this.parseRelative(postedText, 'past');

          const title_ = title;
          const language = this.detectLanguage(title_);

          allJobs.push({
            external_id: this.makeId(jobUrl),
            source: this.source,
            title: title_,
            company_name: company,
            company_logo: null,
            location: location || 'Cameroon',
            salary,
            job_type: jobType,
            category: deriveCategory(title_),
            description: null,
            url: jobUrl,
            region: this.normalizeRegion(location),
            language,
            is_cameroon_local: true,
            posted_at: postedAt,
            closing_at: null,
            fetched_at: new Date().toISOString(),
            contact_email: null,
            contact_phone: null,
            contact_whatsapp: null,
          });
        });

        if (this.shouldStopAfterPage(allJobs.slice(pageStartIndex))) break;

        const hasNext = $('a[rel="next"]').length > 0;
        if (!hasNext) break;

        if (page < this.config.maxPages) {
          await this.delay();
        }
      } catch (err) {
        this.recordScrapeError(`page ${page}`, err);
        break;
      }
    }

    // Detail pages are unrestricted by robots.txt here, so fetch full
    // descriptions + contacts + the real closing date (stay polite: cap it).
    const detailLimit = Math.min(allJobs.length, 30);
    for (let i = 0; i < detailLimit; i++) {
      const job = allJobs[i];
      try {
        await this.enrichFromDetailPage(job);
        await this.delay(1500);
      } catch {
        // Non-fatal -- keep the listing-page fields for this job.
      }
    }

    return allJobs;
  }

  /** Fetch a job's detail page for the full description, closing date, and any contact info the employer left in the free text. */
  private async enrichFromDetailPage(job: ScrapedJob): Promise<void> {
    const res = await this.fetchPage(job.url, { retries: 1 });
    const html = await res.text();
    const $ = cheerio.load(html);

    const description = this.clean(
      $('div.prose.mt-4.max-w-none').first().text()
    );
    if (description) {
      job.description = description.slice(0, 4000);
      // Deliberately NOT re-deriving category from description: deriveCategory's
      // keyword list is English-oriented and includes short fragments like 'ui '
      // (for "UI design") that collide with common French words -- 'qui ' (who/
      // which) alone misclassified a finance job as Design in testing. Title-only
      // matches how the other Cameroon providers in this codebase already do it.
      const contacts = this.extractContacts(description);
      job.contact_email = contacts.email;
      job.contact_phone = contacts.phone;
      job.contact_whatsapp = contacts.whatsapp;
    }

    const expiresText = this.clean($('p.text-gray-500').first().text());
    const expiresMatch = expiresText.match(/Expires\s+(.+?)(?:$|\s*·)/i);
    if (expiresMatch) {
      job.closing_at = this.parseRelative(expiresMatch[1], 'future');
    }
  }

  /**
   * Parse "1 month ago" / "4 days ago" (direction 'past') or "1 week from
   * now" / "3 days from now" (direction 'future') into an ISO string.
   */
  private parseRelative(text: string | null, direction: 'past' | 'future'): string | null {
    if (!text) return null;
    const lower = text.toLowerCase().trim();
    const match = lower.match(/(\d+)\s*(minute|hour|day|week|month)s?/);
    if (!match) return null;

    const amount = parseInt(match[1], 10);
    const unit = match[2];
    const msMap: Record<string, number> = {
      minute: 60 * 1000,
      hour: 3600 * 1000,
      day: 86400 * 1000,
      week: 7 * 86400 * 1000,
      month: 30 * 86400 * 1000,
    };
    const ms = msMap[unit];
    if (!ms) return null;

    const offset = amount * ms * (direction === 'past' ? -1 : 1);
    return new Date(Date.now() + offset).toISOString();
  }
}

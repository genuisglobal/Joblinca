/**
 * Emploi.cm scraper — Cameroon's largest French-language job board.
 *
 * Scrapes job listings from /recherche-jobs-cameroun?page=N.
 * Card parsing lives in ./emploicm-parse (see there for the 2026-11 layout).
 *
 * NOTE: Cloudflare may serve a blocking challenge to some IPs. The scraper
 * records an error and stops if a real challenge page is detected. To bypass:
 *   1. A Cloudflare-bypass proxy service (e.g., ScraperAPI, Bright Data)
 *   2. Playwright with stealth plugin (run on a server with a real browser)
 *   3. Set SCRAPER_API_KEY env var to use ScraperAPI as a proxy
 *
 * IMPORTANT: robots.txt specifies crawl-delay: 10, so we use 10s delay.
 */

import { BaseScraper } from '../base';
import { deriveCategory } from '@/lib/externalJobs';
import { isCloudflareChallenge, parseEmploiCmListing } from './emploicm-parse';
import type { ScrapedJob, ScraperConfig } from '../types';

const BASE_URL = 'https://www.emploi.cm';
const LISTING_PATH = '/recherche-jobs-cameroun';

export class EmploiCmScraper extends BaseScraper {
  constructor(config?: Partial<ScraperConfig>) {
    // Respect robots.txt crawl-delay: 10
    super('emploicm', { maxPages: 5, delayMs: 10000, timeoutMs: 20000, ...config });
  }

  protected async scrape(): Promise<ScrapedJob[]> {
    const allJobs: ScrapedJob[] = [];
    const seenUrls = new Set<string>();

    for (let page = 0; page < this.config.maxPages; page++) {
      const pageStartIndex = allJobs.length;
      const url = `${BASE_URL}${LISTING_PATH}?page=${page}`;

      try {
        // If ScraperAPI key is set, route through their proxy to bypass Cloudflare
        const scraperApiKey = process.env.SCRAPER_API_KEY;
        const fetchUrl = scraperApiKey
          ? `https://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(url)}&render=true`
          : url;

        const res = await this.fetchPage(fetchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache',
          },
        });

        const html = await res.text();

        // Only a real interstitial counts — every page loads CF's passive
        // challenge-platform beacon, which the old substring check mistook
        // for a block and failed every run.
        if (isCloudflareChallenge(html)) {
          this.recordScrapeError(
            `page ${page}`,
            new Error('Cloudflare challenge — set SCRAPER_API_KEY to bypass')
          );
          break;
        }

        const { cards, hasNext } = parseEmploiCmListing(html);
        if (cards.length === 0) {
          if (page === 0) {
            this.recordScrapeError('page 0', new Error('no job cards found — listing layout may have changed'));
          }
          break;
        }

        for (const card of cards) {
          if (seenUrls.has(card.url)) continue;
          seenUrls.add(card.url);

          const location = card.region ? `${card.region}, Cameroon` : 'Cameroon';
          const cardContacts = this.extractContacts(card.description || '');

          allJobs.push({
            external_id: this.makeId(card.jobId),
            source: this.source,
            title: card.title,
            company_name: card.company,
            company_logo: card.logo,
            location,
            salary: null,
            job_type: this.normalizeContractType(card.contract),
            category: deriveCategory(card.title, card.skills || '', card.description || ''),
            description: card.description,
            url: card.url,
            region: this.normalizeRegion(card.region || location),
            language: 'fr', // Emploi.cm is French-first
            is_cameroon_local: true,
            posted_at: card.postedDate ? new Date(`${card.postedDate}T00:00:00Z`).toISOString() : null,
            closing_at: null,
            fetched_at: new Date().toISOString(),
            contact_email: cardContacts.email,
            contact_phone: cardContacts.phone,
            contact_whatsapp: cardContacts.whatsapp,
          });
        }

        if (this.shouldStopAfterPage(allJobs.slice(pageStartIndex))) break;
        if (!hasNext) break;

        if (page < this.config.maxPages - 1) {
          await this.delay();
        }
      } catch (err) {
        // Cloudflare rejects at the HTTP layer (403) before the HTML check runs
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('HTTP 403')) {
          this.recordScrapeError(
            `page ${page}`,
            new Error('Cloudflare challenge (HTTP 403) — set SCRAPER_API_KEY to bypass')
          );
        } else {
          this.recordScrapeError(`page ${page}`, err);
        }
        break;
      }
    }

    return allJobs;
  }

  /** Normalize French contract types. */
  private normalizeContractType(type: string | undefined): string | null {
    if (!type) return null;
    const lower = type.toLowerCase();
    if (lower.includes('cdi')) return 'Full-time';
    if (lower.includes('cdd')) return 'Contract';
    if (lower.includes('stage')) return 'Internship';
    if (lower.includes('freelance') || lower.includes('consultant')) return 'Freelance';
    if (lower.includes('temps partiel')) return 'Part-time';
    if (lower.includes('intérim') || lower.includes('interim')) return 'Temporary';
    return type;
  }
}

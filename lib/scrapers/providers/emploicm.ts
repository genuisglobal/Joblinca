/**
 * Emploi.cm scraper — Cameroon's largest French-language job board (Drupal 7).
 *
 * Scrapes job listings from /recherche-jobs-cameroun?page=N.
 * Each card is a .views-row containing structured job details.
 *
 * NOTE: Cloudflare challenge is active and blocks simple fetch requests.
 * This scraper will gracefully skip if a Cloudflare challenge is detected.
 * For production use, requires one of:
 *   1. A Cloudflare-bypass proxy service (e.g., ScraperAPI, Bright Data)
 *   2. Playwright with stealth plugin (run on a server with a real browser)
 *   3. Set SCRAPER_API_KEY env var to use ScraperAPI as a proxy
 *
 * IMPORTANT: robots.txt specifies crawl-delay: 10, so we use 10s delay.
 */

import { BaseScraper } from '../base';
import { deriveCategory } from '@/lib/externalJobs';
import type { Cheerio, CheerioAPI } from 'cheerio';
import type { ScrapedJob, ScraperConfig } from '../types';

const BASE_URL = 'https://www.emploi.cm';
const LISTING_PATH = '/recherche-jobs-cameroun';
const cheerio = require('cheerio/slim') as typeof import('cheerio');

export class EmploiCmScraper extends BaseScraper {
  constructor(config?: Partial<ScraperConfig>) {
    // Respect robots.txt crawl-delay: 10
    super('emploicm', { maxPages: 5, delayMs: 10000, timeoutMs: 20000, ...config });
  }

  protected async scrape(): Promise<ScrapedJob[]> {
    const allJobs: ScrapedJob[] = [];
    const seenUrls = new Set<string>();

    for (let page = 0; page < this.config.maxPages; page++) {
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

        // Detect Cloudflare challenge
        if (html.includes('cf-browser-verification') || html.includes('challenge-platform') || html.includes('cf-challenge')) {
          console.warn(`[scraper:emploicm] Cloudflare challenge on page ${page}. Set SCRAPER_API_KEY to bypass.`);
          break;
        }

        const $ = cheerio.load(html);

        const cards = $('.view-content .views-row');
        if (cards.length === 0) break;

        cards.each((_, el) => {
          const $card = $(el);

          // Title and URL
          const $titleLink = $card.find('h2.node-title a');
          const title = this.clean($titleLink.text());
          const href = $titleLink.attr('href') || '';
          if (!title || !href || seenUrls.has(href)) return;
          seenUrls.add(href);

          const jobUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;

          // Extract job ID from URL slug: /offre-emploi-cameroun/slug-123456
          const idMatch = href.match(/-(\d+)$/);
          const jobId = idMatch ? idMatch[1] : href;

          // Company
          const company = this.clean($card.find('span.company-name a').text()) || null;

          // Logo
          const logoSrc = $card.find('.field-name-field-offre-image img').attr('src') || null;
          const logo = logoSrc
            ? (logoSrc.startsWith('http') ? logoSrc : `${BASE_URL}${logoSrc}`)
            : null;

          // Description excerpt
          const description = this.clean($card.find('.field-name-body .field-item').text()).slice(0, 500) || null;

          // Posted date (DD.MM.YYYY format)
          const dateStr = $card.find('.posted-on').text().trim();
          const postedAt = this.parseDotDate(dateStr);

          // Structured details from <ul class="job-details">
          const details = this.parseJobDetails($card, $);

          // Location from Region field
          const location = details.region
            ? `${details.region}, Cameroon`
            : 'Cameroon';

          // Extract contacts from card text
          const cardText = $card.text();
          const cardContacts = this.extractContacts(cardText);

          allJobs.push({
            external_id: this.makeId(jobId),
            source: this.source,
            title,
            company_name: company,
            company_logo: logo,
            location,
            salary: null,
            job_type: this.normalizeContractType(details.contract),
            category: deriveCategory(title, '', description || ''),
            description,
            url: jobUrl,
            region: this.normalizeRegion(details.region || location),
            language: 'fr', // Emploi.cm is French-first
            is_cameroon_local: true,
            posted_at: postedAt,
            closing_at: null,
            fetched_at: new Date().toISOString(),
            contact_email: cardContacts.email,
            contact_phone: cardContacts.phone,
            contact_whatsapp: cardContacts.whatsapp,
          });
        });

        // Check for next page
        const hasNext = $('li.pager__item--next a').length > 0
          || $('a[title*="next"]').length > 0
          || $('a[title*="suivant"]').length > 0;
        if (!hasNext && page > 0) break;

        if (page < this.config.maxPages - 1) {
          await this.delay();
        }
      } catch (err) {
        console.error(`[scraper:emploicm] Page ${page} error:`, err);
        break;
      }
    }

    return allJobs;
  }

  /** Parse structured details from the job-details list. */
  private parseJobDetails(
    $card: Cheerio<any>,
    $: CheerioAPI
  ): { education?: string; experience?: string; contract?: string; region?: string; skills?: string } {
    const result: Record<string, string> = {};

    $card.find('.job-details li, ul.job-details li').each((_, li) => {
      const $li = $(li);
      const fullText = $li.text().trim().toLowerCase();
      const value = $li.find('strong').text().trim();

      if (fullText.includes('etudes') || fullText.includes('études')) {
        result.education = value;
      } else if (fullText.includes('experience') || fullText.includes('expérience')) {
        result.experience = value;
      } else if (fullText.includes('contrat')) {
        result.contract = value;
      } else if (fullText.includes('region') || fullText.includes('région')) {
        result.region = value;
      } else if (fullText.includes('competence') || fullText.includes('compétence')) {
        result.skills = value;
      }
    });

    return result;
  }

  /** Parse DD.MM.YYYY date format. */
  private parseDotDate(dateStr: string): string | null {
    if (!dateStr) return null;
    const match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!match) return null;
    const [, day, month, year] = match;
    try {
      const d = new Date(`${year}-${month}-${day}`);
      if (isNaN(d.getTime())) return null;
      return d.toISOString();
    } catch {
      return null;
    }
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

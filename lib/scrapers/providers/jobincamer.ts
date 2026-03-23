/**
 * JobInCamer.com scraper — French-language Cameroon job board (Drupal).
 *
 * Scrapes job listings from the search page using ?page=N pagination
 * (0-indexed). Each job card is a div.media element.
 * No anti-scraping protection besides PageSpeed image rewriting.
 */

import { BaseScraper } from '../base';
import { deriveCategory } from '@/lib/externalJobs';
import type { Cheerio, CheerioAPI } from 'cheerio';
import type { ScrapedJob, ScraperConfig } from '../types';

const BASE_URL = 'https://www.jobincamer.com';
const LISTING_PATH = '/adverts/search';
const cheerio = require('cheerio/slim') as typeof import('cheerio');

export class JobInCamerScraper extends BaseScraper {
  constructor(config?: Partial<ScraperConfig>) {
    super('jobincamer', { maxPages: 5, delayMs: 2500, ...config });
  }

  protected async scrape(): Promise<ScrapedJob[]> {
    const allJobs: ScrapedJob[] = [];
    const seenUrls = new Set<string>();

    for (let page = 0; page < this.config.maxPages; page++) {
      // Search page with all categories, 0-indexed pagination
      const url = `${BASE_URL}${LISTING_PATH}?combine=&field_job_categorie_target_id=All&page=${page}`;

      try {
        const res = await this.fetchPage(url);
        const html = await res.text();
        const $ = cheerio.load(html);

        const mediaCards = $('div.media');
        if (mediaCards.length === 0) break;

        mediaCards.each((_, el) => {
          const $el = $(el);

          // Title and URL
          const $titleLink = $el.find('.media-heading a');
          const title = this.clean($titleLink.text());
          const href = $titleLink.attr('href') || '';
          if (!title || !href || seenUrls.has(href)) return;
          seenUrls.add(href);

          const jobUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;

          // Company from employer link
          const $companyLink = $el.find('.media-body a[href*="/employer/"]');
          const company = this.clean($companyLink.text()) || null;

          // Logo
          const logoSrc = $el.find('.pull-left img').attr('src') || null;
          const logo = logoSrc
            ? (logoSrc.startsWith('http') ? logoSrc : `${BASE_URL}${logoSrc}`)
            : null;

          // Parse the metadata text block from .media-body
          // Format: "COMPANY | Location | Publie le DD-MM-YYYY | Postuler avant le DD-MM-YYYY"
          const bodyText = $el.find('.media-body').text();

          // Location - text after map marker icon, before date
          const locationMatch = bodyText.match(/(?:fa-map[^|]*|[|])\s*([\w\séèêëàâäùûüîïôöç-]+?)(?:\s*[|]|\s*Publi)/i);
          let locationRaw: string | null = null;

          // Simpler approach: split the metadata line by |
          const metaParts = this.extractMetaLine($el, $);
          if (metaParts.length >= 2) {
            // Usually: [company, location, dates...]
            locationRaw = metaParts[1]?.trim() || null;
          }

          // Posted date
          const postedMatch = bodyText.match(/Publi[ée]\s+le\s+(\d{2}-\d{2}-\d{4})/i);
          const postedAt = postedMatch ? this.parseFrenchDate(postedMatch[1]) : null;

          // Closing date
          const closingMatch = bodyText.match(/Postuler avant le\s+(\d{2}-\d{2}-\d{4})/i);
          const closingAt = closingMatch ? this.parseFrenchDate(closingMatch[1]) : null;

          // Experience level
          const expMatch = bodyText.match(/(Debutant|Milieu de carriere|Senior|Non specifie)/i);
          const experienceLevel = expMatch ? expMatch[1] : null;

          const location = locationRaw || 'Cameroon';

          // Extract contacts from the listing card text
          const cardContacts = this.extractContacts(bodyText);

          allJobs.push({
            external_id: this.makeId(href),
            source: this.source,
            title,
            company_name: company,
            company_logo: logo,
            location,
            salary: null,
            job_type: this.inferJobType(title, bodyText),
            category: deriveCategory(title),
            description: null,
            url: jobUrl,
            region: this.normalizeRegion(location),
            language: 'fr', // JobInCamer is French-first
            is_cameroon_local: true,
            posted_at: postedAt,
            closing_at: closingAt,
            fetched_at: new Date().toISOString(),
            contact_email: cardContacts.email,
            contact_phone: cardContacts.phone,
            contact_whatsapp: cardContacts.whatsapp,
          });
        });

        if (page < this.config.maxPages - 1) {
          await this.delay();
        }
      } catch (err) {
        console.error(`[scraper:jobincamer] Page ${page} error:`, err);
        break;
      }
    }

    // Fetch detail pages for contact extraction (limit to first 10)
    const detailLimit = Math.min(allJobs.length, 30);
    for (let i = 0; i < detailLimit; i++) {
      const job = allJobs[i];
      try {
        const details = await this.fetchJobDetails(job.url);
        if (details) {
          if (details.description && !job.description) job.description = details.description;
          if (details.email && !job.contact_email) job.contact_email = details.email;
          if (details.phone && !job.contact_phone) job.contact_phone = details.phone;
          if (details.whatsapp && !job.contact_whatsapp) job.contact_whatsapp = details.whatsapp;
        }
        await this.delay(1500);
      } catch {
        // Non-fatal
      }
    }

    return allJobs;
  }

  /**
   * Extract the metadata line by getting text between </h4> and <br/> or end,
   * then splitting by |.
   */
  private extractMetaLine($el: Cheerio<any>, $: CheerioAPI): string[] {
    const bodyHtml = $el.find('.media-body').html() || '';
    // Get text between closing </h4> and the first <br
    const afterHeading = bodyHtml.split('</h4>')[1] || '';
    const metaLine = afterHeading.split('<br')[0] || '';
    // Strip HTML tags and split by |
    const text = metaLine.replace(/<[^>]+>/g, '').trim();
    return text.split('|').map((s) => s.trim()).filter(Boolean);
  }

  /** Infer job type from title and body text. */
  private inferJobType(title: string, body: string): string | null {
    const text = `${title} ${body}`.toLowerCase();
    if (text.includes('stage') || text.includes('intern')) return 'Internship';
    if (text.includes('cdd') || text.includes('contrat')) return 'Contract';
    if (text.includes('cdi') || text.includes('temps complet') || text.includes('full time')) return 'Full-time';
    if (text.includes('temps partiel') || text.includes('part time')) return 'Part-time';
    if (text.includes('freelance') || text.includes('consultant')) return 'Freelance';
    return null;
  }

  /** Parse French date format DD-MM-YYYY to ISO string. */
  private parseFrenchDate(dateStr: string): string | null {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts;
    try {
      const d = new Date(`${year}-${month}-${day}`);
      if (isNaN(d.getTime())) return null;
      return d.toISOString();
    } catch {
      return null;
    }
  }
}

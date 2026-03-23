/**
 * MinaJobs scraper — Cameroon job board (French-first).
 *
 * Scrapes job listings from minajobs.net using cheerio.
 * The site uses a listings-block layout with <li class="spotlight"> cards.
 * Each card has desktop-listing-content and mobile-listing-content views.
 */

import { BaseScraper } from '../base';
import { deriveCategory } from '@/lib/externalJobs';
import type { ScrapedJob, ScraperConfig } from '../types';

const BASE_URL = 'https://minajobs.net';
const LISTING_PATH = '/offres-emplois-stages';
const cheerio = require('cheerio/slim') as typeof import('cheerio');

export class MinaJobsScraper extends BaseScraper {
  constructor(config?: Partial<ScraperConfig>) {
    super('minajobs', { maxPages: 5, delayMs: 2500, ...config });
  }

  protected async scrape(): Promise<ScrapedJob[]> {
    const allJobs: ScrapedJob[] = [];
    const seenUrls = new Set<string>();

    for (let page = 1; page <= this.config.maxPages; page++) {
      const url = page === 1
        ? `${BASE_URL}${LISTING_PATH}`
        : `${BASE_URL}${LISTING_PATH}?p=${page}`;

      try {
        const res = await this.fetchPage(url);
        const html = await res.text();
        const $ = cheerio.load(html);

        // Each job is an <li class="spotlight"> inside <ul class="listings-block">
        const jobItems = $('ul.listings-block li.spotlight');
        if (jobItems.length === 0) break;

        jobItems.each((_, el) => {
          const $el = $(el);
          const $link = $el.find('> a');
          const href = $link.attr('href') || '';

          // Use desktop-listing-content for structured data
          const $desktop = $el.find('.desktop-listing-content');
          const $content = $desktop.length > 0 ? $desktop : $el;

          // Title from .listing-title (strip "Nouveau" badge, take first text only)
          const $titleEl = $content.find('.listing-title').first();
          const titleRaw = this.clean($titleEl.text());
          const title = titleRaw.replace(/Nouveau\s*/i, '').replace(/New\s*/i, '').trim();

          // Company logo
          const logoPath = $content.find('.listing-logo img').attr('src') || null;

          // Info spans: company, location, date (in order under .listing-info)
          const infoSpans: string[] = [];
          $content.find('.listing-info span.opaque').each((_, span) => {
            infoSpans.push($(span).text().trim());
          });

          const company = infoSpans[0] || null;
          const locationText = infoSpans[1] || null;
          const dateText = infoSpans[2] || null;

          // Job type from .listing-type span
          const jobTypeRaw = $content.find('.listing-type span').text().trim() || null;

          if (!title || !href || seenUrls.has(href)) return;

          const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
          seenUrls.add(href);

          // Extract ID from URL path like /emplois-stage-recrutement/26755/slug
          const idMatch = href.match(/\/(\d+)\//);
          const externalId = idMatch ? idMatch[1] : href;

          const companyLogo = logoPath
            ? (logoPath.startsWith('http') ? logoPath : `${BASE_URL}${logoPath}`)
            : null;

          const location = this.normalizeLocation(locationText);

          allJobs.push({
            external_id: this.makeId(externalId),
            source: this.source,
            title,
            company_name: company,
            company_logo: companyLogo,
            location,
            salary: null,
            job_type: this.normalizeJobType(jobTypeRaw),
            category: deriveCategory(title),
            description: null,
            url: fullUrl,
            region: this.normalizeRegion(locationText),
            language: this.detectLanguage(title),
            is_cameroon_local: true,
            posted_at: this.parseRelativeDate(dateText),
            closing_at: null,
            fetched_at: new Date().toISOString(),
            contact_email: null,
            contact_phone: null,
            contact_whatsapp: null,
          });
        });

        // Check for next page
        const hasNext = $(`.pagination a[href*="p=${page + 1}"]`).length > 0
          || $('a.next-page').length > 0
          || $(`a[href*="p=${page + 1}"]`).length > 0;
        if (!hasNext) break;

        if (page < this.config.maxPages) {
          await this.delay();
        }
      } catch (err) {
        console.error(`[scraper:minajobs] Page ${page} error:`, err);
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
          if (details.email) job.contact_email = details.email;
          if (details.phone) job.contact_phone = details.phone;
          if (details.whatsapp) job.contact_whatsapp = details.whatsapp;
        }
        await this.delay(1500);
      } catch {
        // Non-fatal
      }
    }

    return allJobs;
  }

  /** Convert slug-style locations to readable format. */
  private normalizeLocation(loc: string | null): string | null {
    if (!loc) return null;
    return loc
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/\bCameroun\b/i, 'Cameroon')
      .trim();
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
      'cdd': 'Contract',
      'cdi': 'Full-time',
      'bénévolat': 'Volunteer',
      'intérim': 'Temporary',
    };
    // Also handle compound class-based types like "list-emplois-temps-complet-cameroun"
    for (const [key, value] of Object.entries(map)) {
      if (lower.includes(key.replace(/\s+/g, '-')) || lower.includes(key)) {
        return value;
      }
    }
    return type;
  }

  /** Parse relative dates like "11 hours ago" or "il y a 2 jours" to ISO strings. */
  private parseRelativeDate(text: string | null): string | null {
    if (!text) return null;

    const now = Date.now();
    const lower = text.toLowerCase().trim();

    // English patterns
    let match = lower.match(/(\d+)\s*(minute|hour|day|week|month)s?\s*ago/);
    if (!match) {
      // French patterns: "il y a 2 jours", "il y a 3 heures"
      match = lower.match(/il\s+y\s+a\s+(\d+)\s*(minute|heure|jour|semaine|mois)/);
    }
    if (!match) {
      // Simple French: "2 jours", "3 heures"
      match = lower.match(/(\d+)\s*(minute|heure|jour|semaine|mois)/);
    }

    if (!match) return null;

    const amount = parseInt(match[1], 10);
    const unit = match[2];

    const msMap: Record<string, number> = {
      'minute': 60 * 1000,
      'hour': 3600 * 1000,
      'heure': 3600 * 1000,
      'day': 86400 * 1000,
      'jour': 86400 * 1000,
      'week': 7 * 86400 * 1000,
      'semaine': 7 * 86400 * 1000,
      'month': 30 * 86400 * 1000,
      'mois': 30 * 86400 * 1000,
    };

    const ms = msMap[unit];
    if (!ms) return null;

    return new Date(now - amount * ms).toISOString();
  }
}

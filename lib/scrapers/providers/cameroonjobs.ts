/**
 * CameroonJobs.net scraper — Cameroon's main job aggregator.
 *
 * Uses the AJAX pagination endpoint (jobpagination.php?page=N) which
 * returns HTML fragments with div.attachment-block cards.
 * No anti-scraping protection. Server-rendered HTML.
 */

import { BaseScraper } from '../base';
import { deriveCategory } from '@/lib/externalJobs';
import type { ScrapedJob, ScraperConfig } from '../types';

const cheerio = require('cheerio/slim') as typeof import('cheerio');

const BASE_URL = 'https://www.cameroonjobs.net';

export class CameroonJobsScraper extends BaseScraper {
  constructor(config?: Partial<ScraperConfig>) {
    // More pages available (~88), but limit per run to be polite
    super('cameroonjobs', { maxPages: 10, delayMs: 2000, ...config });
  }

  protected async scrape(): Promise<ScrapedJob[]> {
    const allJobs: ScrapedJob[] = [];
    const seenUrls = new Set<string>();

    for (let page = 1; page <= this.config.maxPages; page++) {
      const url = `${BASE_URL}/jobpagination.php?page=${page}`;

      try {
        const res = await this.fetchPage(url);
        const html = await res.text();
        const $ = cheerio.load(html);

        const blocks = $('div.attachment-block');
        if (blocks.length === 0) break;

        blocks.each((_, el) => {
          const $el = $(el);

          // Title and URL
          const $titleLink = $el.find('h4.attachment-heading a');
          const title = $titleLink.text().trim();
          const href = $titleLink.attr('href') || '';
          if (!title || !href || seenUrls.has(href)) return;
          seenUrls.add(href);

          const jobUrl = href.startsWith('http') ? href : `${BASE_URL}/${href}`;

          // Logo
          const logoSrc = $el.find('img.attachment-img').attr('src') || null;
          const logo = logoSrc
            ? (logoSrc.startsWith('http') ? logoSrc : `${BASE_URL}/${logoSrc}`)
            : null;

          // Salary
          const salaryText = $el.find('.attachment-pushed > span.attachment-heading.pull-right').first().text().trim();
          const salary = salaryText.replace(/^Salary Range\s*:\s*/i, '').trim() || null;

          // Location from the gear icon span area
          const attachmentText = $el.find('.attachment-text').text();
          const locationMatch = attachmentText.match(/(?:fa-gear|fa-map)[\s\S]*?([\w\s]+\|[\w\s]+Region)/i);
          const locationRaw = locationMatch ? locationMatch[1].trim() : null;

          // Parse metadata spans
          const metaSpans: string[] = [];
          $el.find('.attachment-text p span.margin-right-10').each((_, span) => {
            metaSpans.push($(span).text().trim());
          });

          // Work mode (On Site / Remote / Hybrid)
          const workMode = this.extractField(metaSpans, /on site|remote|hybrid/i);

          // Job type (Full Time / Part Time / Internship / Contract)
          const jobTypeRaw = this.extractField(metaSpans, /full time|part time|internship|contract|fix term/i);
          const jobType = this.normalizeJobType(jobTypeRaw);

          // Closing date
          const closingMatch = attachmentText.match(/Closing date:\s*(\d{2}-\w{3}-\d{4})/i);
          const closingAt = closingMatch ? this.parseDateStr(closingMatch[1]) : null;

          // Posted date
          const postedMatch = attachmentText.match(/Posted on\s+(\d{2}-\w{3}-\d{4})/i);
          const postedAt = postedMatch ? this.parseDateStr(postedMatch[1]) : null;

          // Company from title parenthetical e.g. "Communications Assistant (WFP)"
          const company = this.extractCompany(title);

          // Location string
          const location = locationRaw
            ? locationRaw.replace(/\|/g, ',').replace(/\s+/g, ' ').trim()
            : 'Cameroon';

          allJobs.push({
            external_id: this.makeId(href),
            source: this.source,
            title,
            company_name: company,
            company_logo: logo,
            location,
            salary: salary === 'NEGOTIABLE' ? null : salary,
            job_type: jobType,
            category: deriveCategory(title),
            description: null,
            url: jobUrl,
            region: this.normalizeRegion(location),
            language: this.detectLanguage(title),
            is_cameroon_local: true,
            posted_at: postedAt,
            closing_at: closingAt,
            fetched_at: new Date().toISOString(),
          });
        });

        if (page < this.config.maxPages) {
          await this.delay();
        }
      } catch (err) {
        console.error(`[scraper:cameroonjobs] Page ${page} error:`, err);
        break;
      }
    }

    return allJobs;
  }

  /** Extract a matching field from an array of meta span texts. */
  private extractField(spans: string[], pattern: RegExp): string | null {
    for (const s of spans) {
      if (pattern.test(s)) return s.replace(/\|/g, '').trim();
    }
    return null;
  }

  /** Extract company from title parenthetical like "(WFP)" or "(UNICEF)". */
  private extractCompany(title: string): string | null {
    const match = title.match(/\(([^)]+)\)\s*$/);
    if (match) return match[1].trim();

    // Try "at COMPANY" pattern
    const atMatch = title.match(/\bat\s+(.+?)$/i);
    if (atMatch && atMatch[1].length < 50) return atMatch[1].trim();

    return null;
  }

  /** Normalize job type strings. */
  private normalizeJobType(type: string | null): string | null {
    if (!type) return null;
    const lower = type.toLowerCase();
    if (lower.includes('full time')) return 'Full-time';
    if (lower.includes('part time')) return 'Part-time';
    if (lower.includes('internship')) return 'Internship';
    if (lower.includes('fix term') || lower.includes('contract')) return 'Contract';
    if (lower.includes('freelance')) return 'Freelance';
    return type;
  }

  /** Parse date strings like "16-Mar-2026" to ISO. */
  private parseDateStr(dateStr: string): string | null {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null;
      return d.toISOString();
    } catch {
      return null;
    }
  }
}

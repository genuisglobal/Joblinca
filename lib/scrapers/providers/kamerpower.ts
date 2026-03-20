/**
 * KamerPower scraper — WordPress-based Cameroon job board.
 *
 * Scrapes job opportunity posts from kamerpower.com using cheerio.
 * The site uses a WordPress grid layout with article elements.
 */

import { BaseScraper } from '../base';
import { deriveCategory } from '@/lib/externalJobs';
import type { ScrapedJob, ScraperConfig } from '../types';

const BASE_URL = 'https://kamerpower.com/o/jobs';
const cheerio = require('cheerio/slim') as typeof import('cheerio');

export class KamerPowerScraper extends BaseScraper {
  constructor(config?: Partial<ScraperConfig>) {
    super('kamerpower', { maxPages: 5, delayMs: 3000, ...config });
  }

  protected async scrape(): Promise<ScrapedJob[]> {
    const allJobs: ScrapedJob[] = [];
    const seenUrls = new Set<string>();

    for (let page = 1; page <= this.config.maxPages; page++) {
      const url = page === 1 ? `${BASE_URL}/` : `${BASE_URL}/page/${page}/`;

      try {
        const res = await this.fetchPage(url);
        const html = await res.text();
        const $ = cheerio.load(html);

        const articles = $('article.grid-item');
        if (articles.length === 0) break;

        articles.each((_, el) => {
          const $el = $(el);
          const $titleLink = $el.find('h2.post-title a');
          const title = $titleLink.text().trim();
          const jobUrl = $titleLink.attr('href') || '';
          const dateStr = $el.find('p.post-date time.published').attr('datetime') || null;
          const thumbnail = $el.find('.post-thumbnail img').attr('data-src')
            || $el.find('.post-thumbnail img').attr('src')
            || null;

          // Categories from the post meta
          const categories: string[] = [];
          $el.find('p.post-category a').each((_, catEl) => {
            categories.push($(catEl).text().trim());
          });

          if (!title || !jobUrl || seenUrls.has(jobUrl)) return;
          seenUrls.add(jobUrl);

          // Skip non-job posts (exams, scholarships)
          const isJob = categories.some((c) =>
            c.toLowerCase().includes('job')
          ) || title.toLowerCase().includes('recruit');

          if (!isJob && categories.length > 0) return;

          // Extract company from title heuristics
          const company = this.extractCompany(title);
          const language = this.detectLanguage(title);

          allJobs.push({
            external_id: this.makeId(jobUrl),
            source: this.source,
            title,
            company_name: company,
            company_logo: thumbnail,
            location: 'Cameroon',
            salary: null,
            job_type: null,
            category: deriveCategory(title),
            description: null,
            url: jobUrl,
            region: this.extractRegion(title),
            language,
            is_cameroon_local: true,
            posted_at: dateStr || null,
            closing_at: null,
            fetched_at: new Date().toISOString(),
          });
        });

        // Check if there's a next page
        const hasNext = $('link[rel="next"]').length > 0
          || $('a.next').length > 0
          || $('a.nextpostslink').length > 0;

        if (!hasNext) break;

        if (page < this.config.maxPages) {
          await this.delay();
        }
      } catch (err) {
        console.error(`[scraper:kamerpower] Page ${page} error:`, err);
        break;
      }
    }

    return allJobs;
  }

  /** Try to extract company name from title like "CAMRAIL Recruitment of..." */
  private extractCompany(title: string): string | null {
    // Common patterns: "COMPANY Recruitment..." or "Recruitment at COMPANY"
    const patterns = [
      /^(.+?)\s+(?:Recruitment|Recrutement|is\s+(?:Hiring|Recruiting))/i,
      /(?:Recruitment|Recrutement)\s+(?:at|chez|à)\s+(.+?)(?:\s*[-–:,]|\s+\d)/i,
      /(?:at|chez|à)\s+(.+?)(?:\s*[-–:,]|\s*$)/i,
    ];

    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match?.[1]) {
        const company = match[1].trim();
        // Sanity check: company name shouldn't be too long
        if (company.length > 3 && company.length < 60) {
          return company;
        }
      }
    }

    return null;
  }

  /** Try to extract region from title text. */
  private extractRegion(title: string): string | null {
    return this.normalizeRegion(title);
  }
}

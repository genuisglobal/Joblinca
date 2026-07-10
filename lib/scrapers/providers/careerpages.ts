/**
 * Company career pages scraper — LLM-powered generic extraction.
 *
 * Company career pages have no common markup, so instead of per-site
 * selectors this provider fetches each page registered in
 * monitored_career_pages, reduces it to text + links, and asks gpt-4o-mini
 * to identify the job postings. Adding a new employer is a config row in
 * /admin/aggregation/career-pages, not code.
 *
 * Cost/politeness bounds:
 *   - a page is only re-checked after RECHECK_HOURS (so ~1 LLM call/page/day
 *     even though the dispatcher runs 4x/day)
 *   - detail-page description fetches are capped per run
 *
 * Requires OPENAI_API_KEY and Supabase service env; returns [] otherwise.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { BaseScraper } from '../base';
import { deriveCategory } from '@/lib/externalJobs';
import type { ScrapedJob, ScraperConfig } from '../types';

const cheerio = require('cheerio/slim') as typeof import('cheerio');

const MODEL = 'gpt-4o-mini';
const RECHECK_HOURS = 20;
const PAGES_PER_RUN_CAP = 40;
const MAX_LINKS_FOR_LLM = 120;
const MAX_TEXT_FOR_LLM = 3000;
const MAX_JOBS_PER_PAGE = 25;
const DETAIL_FETCH_BUDGET_PER_RUN = 25;

interface MonitoredPage {
  id: string;
  company_name: string;
  url: string;
  consecutive_failures: number;
}

interface ExtractedPosting {
  title: string;
  url: string | null;
  location: string | null;
  deadline: string | null;
  employment_type: string | null;
  description: string | null;
}

const SYSTEM_PROMPT = `You are given the text content and links of a company's careers/jobs web page (Cameroon; French or English). Identify the individual job postings currently listed. Return valid JSON:
{
  "jobs": [
    {
      "title": string (the job title),
      "url": string or null (the link to that specific posting, chosen from the provided links; null if none matches),
      "location": string or null (city/region if stated),
      "deadline": string "YYYY-MM-DD" or null (application deadline if stated),
      "employment_type": string or null (Full-time, Part-time, Internship, Contract, Temporary),
      "description": string or null (short description/requirements if present on this page, plain text)
    }
  ]
}
Only include real, currently-open job postings. Exclude navigation items, news, generic "join us" blurbs, expired postings, and categories. If the page lists no jobs, return {"jobs": []}.`;

export class CareerPagesScraper extends BaseScraper {
  constructor(config?: Partial<ScraperConfig>) {
    super('careerpages', { maxPages: 5, delayMs: 1500, timeoutMs: 20000, ...config });
  }

  private getSupabase(): SupabaseClient | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }

  protected async scrape(): Promise<ScrapedJob[]> {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('[scraper:careerpages] OPENAI_API_KEY not set — skipping');
      return [];
    }

    const supabase = this.getSupabase();
    if (!supabase) {
      console.warn('[scraper:careerpages] Supabase not configured — skipping');
      return [];
    }

    // maxPages scales the batch (dispatcher sends 6 → 30 pages, deep sweep 10 → 40)
    const batchSize = Math.min(this.config.maxPages * 5, PAGES_PER_RUN_CAP);
    const staleBefore = new Date(Date.now() - RECHECK_HOURS * 3_600_000).toISOString();

    const { data: pages, error } = await supabase
      .from('monitored_career_pages')
      .select('id, company_name, url, consecutive_failures')
      .eq('enabled', true)
      .or(`last_checked_at.is.null,last_checked_at.lt.${staleBefore}`)
      .order('last_checked_at', { ascending: true, nullsFirst: true })
      .limit(batchSize);

    if (error) {
      console.error('[scraper:careerpages] Failed to load monitored pages:', error.message);
      return [];
    }
    if (!pages || pages.length === 0) {
      return [];
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const allJobs: ScrapedJob[] = [];
    let detailBudget = DETAIL_FETCH_BUDGET_PER_RUN;

    for (const page of pages as MonitoredPage[]) {
      const nowIso = new Date().toISOString();
      try {
        const jobs = await this.scrapePage(openai, page);

        // Fill in missing descriptions from detail pages while budget lasts
        for (const job of jobs) {
          if (detailBudget <= 0) break;
          if (job.description || !job.url || job.url === page.url) continue;
          detailBudget--;
          const details = await this.fetchJobDetails(job.url);
          if (details) {
            if (details.description) job.description = details.description;
            if (details.email) job.contact_email = details.email;
            if (details.phone) job.contact_phone = details.phone;
            if (details.whatsapp) job.contact_whatsapp = details.whatsapp;
          }
          await this.delay(1000);
        }

        allJobs.push(...jobs);
        this.pagesScraped++;

        await supabase
          .from('monitored_career_pages')
          .update({
            last_checked_at: nowIso,
            last_jobs_found: jobs.length,
            consecutive_failures: 0,
            updated_at: nowIso,
          })
          .eq('id', page.id);

        await this.delay();
      } catch (err) {
        this.recordScrapeError(`${page.company_name} (${page.url})`, err);
        await supabase
          .from('monitored_career_pages')
          .update({
            last_checked_at: nowIso,
            consecutive_failures: page.consecutive_failures + 1,
            updated_at: nowIso,
          })
          .eq('id', page.id);
      }
    }

    return allJobs;
  }

  private async scrapePage(openai: OpenAI, page: MonitoredPage): Promise<ScrapedJob[]> {
    const res = await this.fetchPage(page.url, { retries: 1 });
    const html = await res.text();
    const $ = cheerio.load(html);
    $('script, style, noscript, svg').remove();

    // Collect candidate links (absolute URLs) for the LLM to pick from
    const links: string[] = [];
    const seenHrefs = new Set<string>();
    $('a[href]').each((_, el) => {
      if (links.length >= MAX_LINKS_FOR_LLM) return;
      const $el = $(el);
      const text = this.clean($el.text()).slice(0, 120);
      let href = ($el.attr('href') || '').trim();
      if (!text || !href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
        return;
      }
      try {
        href = new URL(href, page.url).toString();
      } catch {
        return;
      }
      if (seenHrefs.has(href)) return;
      seenHrefs.add(href);
      links.push(`[${text}](${href})`);
    });

    const pageText = this.clean($('body').text()).slice(0, MAX_TEXT_FOR_LLM);

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Company: ${page.company_name}\nPage URL: ${page.url}\n\nPAGE TEXT:\n${pageText}\n\nLINKS:\n${links.join('\n')}`,
        },
      ],
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices?.[0]?.message?.content?.trim();
    if (!raw) return [];

    let postings: ExtractedPosting[] = [];
    try {
      const parsed = JSON.parse(raw) as { jobs?: unknown };
      if (Array.isArray(parsed.jobs)) {
        postings = (parsed.jobs as ExtractedPosting[]).filter(
          (j) => j && typeof j.title === 'string' && j.title.trim().length >= 4
        );
      }
    } catch {
      return [];
    }

    return postings.slice(0, MAX_JOBS_PER_PAGE).map((posting) => {
      const title = posting.title.trim();
      const jobUrl = this.safeUrl(posting.url, page.url) || page.url;
      const location = posting.location?.trim() || 'Cameroon';
      const deadline =
        typeof posting.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(posting.deadline)
          ? `${posting.deadline}T23:59:59Z`
          : null;
      const description =
        typeof posting.description === 'string' && posting.description.trim().length >= 30
          ? posting.description.trim().slice(0, 2000)
          : null;

      return {
        // Job URLs on career pages are the most stable identity; fall back to
        // page+title when the posting has no dedicated link
        external_id: this.makeId(posting.url ? jobUrl : `${page.url}#${title.toLowerCase()}`),
        source: this.source,
        title,
        company_name: page.company_name,
        company_logo: null,
        location,
        salary: null,
        job_type: posting.employment_type?.trim() || null,
        category: deriveCategory(title, '', description || ''),
        description,
        url: jobUrl,
        region: this.normalizeRegion(location),
        language: this.detectLanguage(`${title} ${description || ''}`),
        is_cameroon_local: true,
        posted_at: null,
        closing_at: deadline,
        fetched_at: new Date().toISOString(),
        contact_email: null,
        contact_phone: null,
        contact_whatsapp: null,
      } satisfies ScrapedJob;
    });
  }

  private safeUrl(value: string | null, base: string): string | null {
    if (!value || typeof value !== 'string') return null;
    try {
      const url = new URL(value, base);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
    } catch {
      return null;
    }
  }
}

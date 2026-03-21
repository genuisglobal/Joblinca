/**
 * ReliefWeb API provider — scrapes humanitarian/NGO jobs in Cameroon.
 *
 * Uses the free ReliefWeb API (POST endpoint).
 * Docs: https://apidoc.rwlabs.org/
 *
 * IMPORTANT: Requires a pre-approved appname (since Nov 2025).
 * Register at: https://docs.google.com/forms/d/e/1FAIpQLScR5EE_SBhweLLg_2xMCnXNbT6md4zxqIB00OL0yZWyrqX_Nw/viewform
 * Set RELIEFWEB_APPNAME env var once approved.
 * Without it, the scraper will log a warning and return 0 jobs.
 */

import { BaseScraper } from '../base';
import { deriveCategory } from '@/lib/externalJobs';
import type { ScrapedJob, ScraperConfig } from '../types';

const API_BASE = 'https://api.reliefweb.int/v1/jobs';
const APPNAME = process.env.RELIEFWEB_APPNAME || 'joblinca-cameroon';
const PAGE_SIZE = 50;

interface ReliefWebJob {
  id: string;
  fields: {
    title?: string;
    body?: string;
    url?: string;
    how_to_apply?: string;
    status?: string;
    date?: {
      created?: string;
      closing?: string;
      changed?: string;
    };
    source?: Array<{
      name?: string;
      shortname?: string;
      homepage?: string;
    }>;
    country?: Array<{
      name?: string;
      iso3?: string;
    }>;
    city?: Array<{ name?: string }>;
    type?: Array<{ name?: string }>;
    career_categories?: Array<{ name?: string }>;
    experience?: Array<{ name?: string }>;
    theme?: Array<{ name?: string }>;
  };
}

export class ReliefWebScraper extends BaseScraper {
  constructor(config?: Partial<ScraperConfig>) {
    super('reliefweb', { maxPages: 3, delayMs: 500, ...config });
  }

  protected async scrape(): Promise<ScrapedJob[]> {
    if (!process.env.RELIEFWEB_APPNAME) {
      console.warn('[scraper:reliefweb] RELIEFWEB_APPNAME not set. Register at https://apidoc.reliefweb.int/parameters#appname');
      return [];
    }

    const allJobs: ScrapedJob[] = [];

    for (let page = 0; page < this.config.maxPages; page++) {
      const offset = page * PAGE_SIZE;
      const url = `${API_BASE}?appname=${APPNAME}`;

      const body = JSON.stringify({
        filter: { field: 'country', value: ['Cameroon'] },
        fields: {
          include: [
            'title', 'body', 'url', 'status',
            'date.created', 'date.closing',
            'source.name', 'source.shortname', 'source.homepage',
            'country.name', 'country.iso3',
            'city.name',
            'type.name',
            'career_categories.name',
            'experience.name',
          ],
        },
        sort: ['date.created:desc'],
        limit: PAGE_SIZE,
        offset,
      });

      try {
        const res = await this.fetchPage(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });

        const data = await res.json();
        const items: ReliefWebJob[] = data?.data || [];

        if (items.length === 0) break;

        for (const item of items) {
          const f = item.fields;
          if (!f.title || !f.url) continue;

          const company = f.source?.[0]?.name || null;
          const city = f.city?.[0]?.name || null;
          const careerCat = f.career_categories?.[0]?.name || null;
          const jobType = f.type?.[0]?.name || null;

          const location = city
            ? `${city}, Cameroon`
            : 'Cameroon';

          // Extract contacts from description/how_to_apply
          const contactText = `${f.body || ''} ${f.how_to_apply || ''}`;
          const contacts = this.extractContacts(contactText);

          allJobs.push({
            external_id: this.makeId(item.id),
            source: this.source,
            title: f.title,
            company_name: company,
            company_logo: null,
            location,
            salary: null,
            job_type: jobType,
            category: careerCat || deriveCategory(f.title, '', f.body || ''),
            description: f.body ? f.body.slice(0, 2000) : null,
            url: f.url,
            region: this.normalizeRegion(city),
            language: this.detectLanguage(`${f.title} ${f.body || ''}`),
            is_cameroon_local: true,
            posted_at: f.date?.created || null,
            closing_at: f.date?.closing || null,
            fetched_at: new Date().toISOString(),
            contact_email: contacts.email,
            contact_phone: contacts.phone,
            contact_whatsapp: contacts.whatsapp,
          });
        }

        // Stop if we got fewer than a full page
        if (items.length < PAGE_SIZE) break;

        if (page < this.config.maxPages - 1) {
          await this.delay();
        }
      } catch (err) {
        console.error(`[scraper:reliefweb] Page ${page} error:`, err);
        break;
      }
    }

    return allJobs;
  }
}

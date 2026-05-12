/**
 * WorkConnect CM scraper.
 *
 * Uses the public JSON endpoint exposed by the site frontend:
 *   GET https://www.workconnectjob.com/api/jobs?limit=N
 *
 * Verified on May 11, 2026.
 */

import { BaseScraper } from '../base';
import { deriveCategory } from '@/lib/externalJobs';
import type { ScrapedJob, ScraperConfig } from '../types';

const BASE_URL = 'https://www.workconnectjob.com';
const API_URL = `${BASE_URL}/api/jobs`;

type WorkConnectApiJob = {
  _id?: string;
  id?: string;
  title?: string;
  company?: string;
  description?: string;
  location?: string;
  minSalary?: number | string | null;
  maxSalary?: number | string | null;
  requirements?: string[] | string | null;
  deadline?: string | null;
  category?: string | null;
  type?: string | null;
  remote?: boolean;
  urgent?: boolean;
  status?: string | null;
  companyLogo?: string | null;
  createdAt?: string | null;
};

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function formatSalary(minSalary: unknown, maxSalary: unknown): string | null {
  const min = toNumber(minSalary);
  const max = toNumber(maxSalary);

  if (min && max) {
    return `${min.toLocaleString('en-US')} - ${max.toLocaleString('en-US')} XAF`;
  }

  if (min) {
    return `From ${min.toLocaleString('en-US')} XAF`;
  }

  if (max) {
    return `Up to ${max.toLocaleString('en-US')} XAF`;
  }

  return null;
}

function normalizeApiPayload(payload: unknown): WorkConnectApiJob[] {
  if (Array.isArray(payload)) {
    return payload as WorkConnectApiJob[];
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      return record.data as WorkConnectApiJob[];
    }
    if (Array.isArray(record.jobs)) {
      return record.jobs as WorkConnectApiJob[];
    }
  }

  return [];
}

function joinRequirements(requirements: WorkConnectApiJob['requirements']): string {
  if (Array.isArray(requirements)) {
    return requirements
      .map((item) => (item || '').trim())
      .filter(Boolean)
      .join('; ');
  }

  return typeof requirements === 'string' ? requirements.trim() : '';
}

function normalizeJobType(type: string | null | undefined): string | null {
  const value = (type || '').trim();
  if (!value) {
    return null;
  }

  const lower = value.toLowerCase();
  if (lower.includes('full')) return 'Full-time';
  if (lower.includes('part')) return 'Part-time';
  if (lower.includes('contract')) return 'Contract';
  if (lower.includes('intern')) return 'Internship';
  if (lower.includes('free')) return 'Freelance';
  if (lower.includes('temp')) return 'Temporary';
  return value;
}

export class WorkConnectScraper extends BaseScraper {
  constructor(config?: Partial<ScraperConfig>) {
    super('workconnect', { maxPages: 5, delayMs: 1200, ...config });
  }

  protected async scrape(): Promise<ScrapedJob[]> {
    const limit = Math.max(25, Math.min(1000, this.config.maxPages * 100));
    const res = await this.fetchPage(`${API_URL}?limit=${limit}`, {
      headers: {
        Accept: 'application/json',
      },
    });

    const payload = await res.json();
    const jobs = normalizeApiPayload(payload);
    const seenIds = new Set<string>();
    const allJobs: ScrapedJob[] = [];

    for (const job of jobs) {
      if (job.status && job.status !== 'approved') {
        continue;
      }

      const rawId = String(job._id || job.id || '').trim();
      const title = this.clean(job.title);
      if (!rawId || !title || seenIds.has(rawId)) {
        continue;
      }
      seenIds.add(rawId);

      const company = this.clean(job.company) || null;
      const description = this.clean(job.description) || null;
      const requirements = joinRequirements(job.requirements);
      const combinedText = [title, company, description, requirements].filter(Boolean).join(' ');
      const contacts = this.extractContacts([description, requirements].filter(Boolean).join('\n'));
      const location = this.clean(job.location) || (job.remote ? 'Remote' : 'Cameroon');
      const detailUrl = `${BASE_URL}/job-details/${rawId}`;

      allJobs.push({
        external_id: this.makeId(rawId),
        source: this.source,
        title,
        company_name: company,
        company_logo: job.companyLogo || null,
        location,
        salary: formatSalary(job.minSalary, job.maxSalary),
        job_type: normalizeJobType(job.type),
        category: this.clean(job.category) || deriveCategory(title),
        description: description || (requirements || null),
        url: detailUrl,
        region: this.normalizeRegion(location),
        language: this.detectLanguage(combinedText),
        is_cameroon_local: true,
        posted_at: job.createdAt || null,
        closing_at: job.deadline || null,
        fetched_at: new Date().toISOString(),
        contact_email: contacts.email,
        contact_phone: contacts.phone,
        contact_whatsapp: contacts.whatsapp,
      });
    }

    return allJobs;
  }
}

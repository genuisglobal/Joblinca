/**
 * Shared types for the Cameroon job scraper system.
 */

export interface ScrapedJob {
  external_id: string;
  source: string;
  title: string;
  company_name: string | null;
  company_logo: string | null;
  location: string | null;
  salary: string | null;
  job_type: string | null;
  category: string | null;
  description: string | null;
  url: string;
  region: string | null;
  language: 'fr' | 'en' | null;
  is_cameroon_local: boolean;
  posted_at: string | null;
  closing_at: string | null;
  fetched_at: string;
  /** Contact email extracted from the job posting */
  contact_email: string | null;
  /** Contact phone extracted from the job posting */
  contact_phone: string | null;
  /** WhatsApp number extracted from the job posting */
  contact_whatsapp: string | null;
}

export interface ScrapeResult {
  source: string;
  jobs: ScrapedJob[];
  errors: string[];
  duration_ms: number;
  pages_scraped: number;
}

export interface ScraperConfig {
  /** Max pages to scrape per run */
  maxPages: number;
  /** Delay between requests in ms */
  delayMs: number;
  /** Request timeout in ms */
  timeoutMs: number;
  /** Whether this scraper is enabled */
  enabled: boolean;
}

export const DEFAULT_SCRAPER_CONFIG: ScraperConfig = {
  maxPages: 5,
  delayMs: 2000,
  timeoutMs: 15000,
  enabled: true,
};

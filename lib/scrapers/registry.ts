/**
 * Scraper registry — orchestrates all Cameroon job scrapers.
 *
 * Each provider is instantiated and run in sequence with independent
 * error isolation so one failing scraper doesn't block others.
 */

import type { ScrapedJob, ScrapeResult, ScraperConfig } from './types';
import { ReliefWebScraper } from './providers/reliefweb';
import { KamerPowerScraper } from './providers/kamerpower';
import { MinaJobsScraper } from './providers/minajobs';
import { CameroonJobsScraper } from './providers/cameroonjobs';
import { JobInCamerScraper } from './providers/jobincamer';
import { EmploiCmScraper } from './providers/emploicm';
import { WorkConnectScraper } from './providers/workconnect';
import { KmerJobsScraper } from './providers/kmerjobs';
import { FacebookScraper } from './providers/facebook';
import { BaseScraper } from './base';
import { deduplicateCrossSources } from './dedup';
import {
  ALL_SCRAPER_SOURCE_SLUGS,
  AUTOMATED_SCRAPER_SOURCE_SLUGS,
  type ScraperSourceSlug,
} from './catalog';

export interface AggregateResult {
  total_jobs: number;
  results: ScrapeResult[];
  duration_ms: number;
}

const SCRAPER_FACTORIES: Record<
  ScraperSourceSlug,
  (config?: Partial<ScraperConfig>) => BaseScraper
> = {
  reliefweb: (config) => new ReliefWebScraper(config),
  kamerpower: (config) => new KamerPowerScraper(config),
  minajobs: (config) => new MinaJobsScraper(config),
  cameroonjobs: (config) => new CameroonJobsScraper(config),
  jobincamer: (config) => new JobInCamerScraper(config),
  emploicm: (config) => new EmploiCmScraper(config),
  workconnect: (config) => new WorkConnectScraper(config),
  kmerjobs: (config) => new KmerJobsScraper(config),
  facebook: (config) => new FacebookScraper(config),
};

/** Create all registered scrapers with optional config overrides per source. */
function createScrapers(overrides?: Record<string, Partial<ScraperConfig>>): BaseScraper[] {
  return AUTOMATED_SCRAPER_SOURCE_SLUGS.map((source) =>
    SCRAPER_FACTORIES[source](overrides?.[source])
  );
}

/**
 * Run all scrapers and return aggregated results.
 * Each scraper runs independently — failures are isolated.
 */
export async function runAllScrapers(
  overrides?: Record<string, Partial<ScraperConfig>>
): Promise<AggregateResult> {
  const start = Date.now();
  const scrapers = createScrapers(overrides);
  const results: ScrapeResult[] = [];

  for (const scraper of scrapers) {
    console.log(`[scrapers] Running ${scraper.source}...`);
    const result = await scraper.run();
    results.push(result);
    console.log(
      `[scrapers] ${scraper.source}: ${result.jobs.length} jobs, ${result.errors.length} errors, ${result.duration_ms}ms`
    );
  }

  const total_jobs = results.reduce((sum, r) => sum + r.jobs.length, 0);

  return {
    total_jobs,
    results,
    duration_ms: Date.now() - start,
  };
}

/**
 * Flatten all jobs from an aggregate result, with same-source deduplication.
 * Dedup key: normalized (title + company + source).
 */
export function deduplicateJobs(results: ScrapeResult[]): ScrapedJob[] {
  const seen = new Set<string>();
  const unique: ScrapedJob[] = [];

  for (const result of results) {
    for (const job of result.jobs) {
      const key = `${job.title.toLowerCase().trim()}|${(job.company_name || '').toLowerCase().trim()}|${job.source}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(job);
    }
  }

  return unique;
}

/**
 * Cross-source deduplication: detect the same job posted on multiple platforms.
 * Uses fuzzy title + company matching to identify duplicates and keeps the
 * most complete version. Re-exported from dedup module.
 */
export { deduplicateCrossSources } from './dedup';

/**
 * Run a single scraper by source name.
 * Useful for testing or manual triggers from admin UI.
 */
export async function runScraper(
  source: string,
  config?: Partial<ScraperConfig>
): Promise<ScrapeResult> {
  const factory = SCRAPER_FACTORIES[source as ScraperSourceSlug];
  if (!factory) {
    return {
      source,
      jobs: [],
      errors: [`Unknown scraper source: ${source}`],
      duration_ms: 0,
      pages_scraped: 0,
    };
  }

  return factory(config).run();
}

/** List all available scraper source names. */
export function listScraperSources(): string[] {
  return [...ALL_SCRAPER_SOURCE_SLUGS];
}

/** List sources that can run directly in bulk site-scraping flows. */
export function listAutomatedScraperSources(): string[] {
  return [...AUTOMATED_SCRAPER_SOURCE_SLUGS];
}

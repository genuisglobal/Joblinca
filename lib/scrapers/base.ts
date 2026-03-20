/**
 * Base scraper with retry, rate-limiting, and error handling.
 */

import type { ScrapedJob, ScrapeResult, ScraperConfig } from './types';
import { DEFAULT_SCRAPER_CONFIG } from './types';

export abstract class BaseScraper {
  readonly source: string;
  protected config: ScraperConfig;

  constructor(source: string, config?: Partial<ScraperConfig>) {
    this.source = source;
    this.config = { ...DEFAULT_SCRAPER_CONFIG, ...config };
  }

  /** Subclasses implement the actual scraping logic. */
  protected abstract scrape(): Promise<ScrapedJob[]>;

  /** Run the scraper with timing and error wrapping. */
  async run(): Promise<ScrapeResult> {
    const start = Date.now();
    const errors: string[] = [];

    if (!this.config.enabled) {
      return { source: this.source, jobs: [], errors: ['Scraper disabled'], duration_ms: 0, pages_scraped: 0 };
    }

    try {
      const jobs = await this.scrape();
      return {
        source: this.source,
        jobs,
        errors,
        duration_ms: Date.now() - start,
        pages_scraped: this.config.maxPages,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[scraper:${this.source}] Fatal error:`, message);
      return {
        source: this.source,
        jobs: [],
        errors: [message],
        duration_ms: Date.now() - start,
        pages_scraped: 0,
      };
    }
  }

  /** Fetch with timeout, retry, and user-agent. */
  protected async fetchPage(url: string, options?: RequestInit & { retries?: number }): Promise<Response> {
    const { retries = 2, ...fetchOpts } = options || {};
    const headers = {
      'User-Agent': 'Joblinca/1.0 (Cameroon Job Aggregator; contact@joblinca.com)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr,en;q=0.9',
      ...((fetchOpts.headers as Record<string, string>) || {}),
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

        const res = await fetch(url, {
          ...fetchOpts,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} from ${url}`);
        }

        return res;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < retries) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 8000);
          await this.delay(backoff);
        }
      }
    }

    throw lastError || new Error(`Failed to fetch ${url}`);
  }

  /** Rate-limit delay between requests. */
  protected delay(ms?: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms ?? this.config.delayMs));
  }

  /** Generate a deterministic external_id from source + key. */
  protected makeId(key: string): string {
    return `${this.source}:${key}`;
  }

  /** Detect language from text (simple heuristic). */
  protected detectLanguage(text: string): 'fr' | 'en' {
    const lower = text.toLowerCase();
    const frWords = ['recrutement', 'emploi', 'poste', 'offre', 'candidature', 'société', 'entreprise', 'profil', 'recherche', 'contrat', 'stage', 'avis', 'pourvoir'];
    const enWords = ['recruitment', 'hiring', 'position', 'vacancy', 'apply', 'company', 'opportunity', 'looking for', 'contract', 'internship', 'job'];

    let frScore = 0;
    let enScore = 0;
    for (const w of frWords) if (lower.includes(w)) frScore++;
    for (const w of enWords) if (lower.includes(w)) enScore++;

    return frScore > enScore ? 'fr' : 'en';
  }

  /** Map common Cameroon location strings to regions. */
  protected normalizeRegion(location: string | null): string | null {
    if (!location) return null;
    const lower = location.toLowerCase();

    const regionMap: Record<string, string> = {
      'douala': 'Littoral',
      'littoral': 'Littoral',
      'yaounde': 'Centre',
      'yaoundé': 'Centre',
      'centre': 'Centre',
      'bamenda': 'Nord-Ouest',
      'nord-ouest': 'Nord-Ouest',
      'northwest': 'Nord-Ouest',
      'buea': 'Sud-Ouest',
      'sud-ouest': 'Sud-Ouest',
      'southwest': 'Sud-Ouest',
      'limbe': 'Sud-Ouest',
      'bafoussam': 'Ouest',
      'ouest': 'Ouest',
      'west': 'Ouest',
      'garoua': 'Nord',
      'nord': 'Nord',
      'north': 'Nord',
      'maroua': 'Extrême-Nord',
      'extreme-nord': 'Extrême-Nord',
      'extrême-nord': 'Extrême-Nord',
      'far north': 'Extrême-Nord',
      'ngaoundéré': 'Adamaoua',
      'ngaoundere': 'Adamaoua',
      'adamaoua': 'Adamaoua',
      'bertoua': 'Est',
      'est': 'Est',
      'east': 'Est',
      'ebolowa': 'Sud',
      'sud': 'Sud',
      'south': 'Sud',
      'kribi': 'Sud',
    };

    for (const [key, region] of Object.entries(regionMap)) {
      if (lower.includes(key)) return region;
    }

    if (lower.includes('cameroun') || lower.includes('cameroon') || lower.includes('tout le')) {
      return 'National';
    }

    return null;
  }
}

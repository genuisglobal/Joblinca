/**
 * Base scraper with retry, rate-limiting, and error handling.
 */

import type { ScrapedJob, ScrapeResult, ScraperConfig } from './types';
import { DEFAULT_SCRAPER_CONFIG } from './types';

/** Decode common HTML entities that cheerio may leave behind. */
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
  '&nbsp;': ' ', '&ndash;': '\u2013', '&mdash;': '\u2014',
  '&laquo;': '\u00AB', '&raquo;': '\u00BB',
  '&eacute;': '\u00E9', '&egrave;': '\u00E8', '&ecirc;': '\u00EA',
  '&agrave;': '\u00E0', '&acirc;': '\u00E2', '&ocirc;': '\u00F4',
  '&ucirc;': '\u00FB', '&ugrave;': '\u00F9', '&iuml;': '\u00EF',
  '&ccedil;': '\u00E7', '&Eacute;': '\u00C9', '&Egrave;': '\u00C8',
};

function decodeHtmlEntities(text: string): string {
  let result = text;
  // Named entities
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    result = result.replaceAll(entity, char);
  }
  // Numeric entities: &#xe9; &#233; etc.
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  result = result.replace(/&#(\d+);/g, (_, dec) =>
    String.fromCharCode(parseInt(dec, 10))
  );
  return result;
}

export abstract class BaseScraper {
  readonly source: string;
  protected config: ScraperConfig;

  constructor(source: string, config?: Partial<ScraperConfig>) {
    this.source = source;
    this.config = { ...DEFAULT_SCRAPER_CONFIG, ...config };
  }

  /** Clean text: decode HTML entities, collapse whitespace. */
  protected clean(text: string | null | undefined): string {
    if (!text) return '';
    return decodeHtmlEntities(text).replace(/\s+/g, ' ').trim();
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

  /** Detect language from text (heuristic for French vs English). */
  protected detectLanguage(text: string): 'fr' | 'en' {
    const lower = text.toLowerCase();

    // French indicators — verbs, articles, prepositions, and job-specific terms
    const frWords = [
      // Common French articles/prepositions (strong signal when combined)
      'recrute', 'recrutement', 'recherche', 'cherche',
      'emploi', 'offre', 'poste', 'candidature', 'pourvoir',
      'société', 'societe', 'entreprise', 'agence',
      'contrat', 'stage', 'mission', 'disponible',
      'profil', 'expérience', 'experience', 'compétences', 'competences',
      'candidat', 'diplôme', 'diplome', 'formation',
      'travail', 'salaire', 'rémunération', 'remuneration',
      'envoyez', 'envoyer', 'postuler', 'postulez',
      'responsable', 'directeur', 'gestionnaire', 'comptable',
      'commercial', 'technicien', 'ingénieur', 'ingenieur',
      'secrétaire', 'secretaire', 'chauffeur', 'caissier',
      'avis', 'appel', 'urgent',
    ];

    // French structural words — articles/prepositions that strongly indicate French text
    const frStructural = [
      ' des ', ' les ', ' une ', ' pour ', ' dans ', ' aux ',
      ' sur ', ' est ', ' sont ', ' avec ', ' cette ', ' votre ',
      ' nous ', ' notre ', ' leur ', " l'", " d'", " n'", " s'", " qu'",
    ];

    const enWords = [
      'recruitment', 'hiring', 'position', 'vacancy', 'apply',
      'company', 'opportunity', 'looking for', 'contract', 'internship',
      'job', 'requirements', 'required', 'experience', 'qualified',
      'candidate', 'resume', 'salary', 'deadline', 'submit',
      'responsible', 'manager', 'officer', 'engineer', 'accountant',
      'secretary', 'driver', 'assistant', 'supervisor',
      'the ', 'this ', 'that ', 'with ', 'from ', 'have ',
    ];

    let frScore = 0;
    let enScore = 0;
    for (const w of frWords) if (lower.includes(w)) frScore++;
    for (const w of frStructural) if (lower.includes(w)) frScore += 2; // structural words are strong signals
    for (const w of enWords) if (lower.includes(w)) enScore++;

    // Default to French for Cameroon job boards (bilingual country, French-majority)
    return enScore > frScore ? 'en' : 'fr';
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

  /**
   * Extract contact info (emails, phones, WhatsApp) from text.
   * Works on HTML body text or plain text from job detail pages.
   */
  protected extractContacts(text: string): {
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
  } {
    let email: string | null = null;
    let phone: string | null = null;
    let whatsapp: string | null = null;

    // Email extraction — skip common non-contact emails
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const emails = text.match(emailRegex) || [];
    const skipDomains = ['example.com', 'test.com', 'sentry.io', 'w3.org', 'schema.org', 'googleapis.com'];
    for (const e of emails) {
      const domain = e.split('@')[1]?.toLowerCase();
      if (domain && !skipDomains.some((d) => domain.includes(d))) {
        email = e.toLowerCase();
        break;
      }
    }

    // Phone extraction — Cameroon numbers: +237, 6XX XXX XXX, 2XX XXX XXX
    const phonePatterns = [
      /(?:\+237[\s.-]?)(\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d)/g,
      /\b(6\d{1}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2})\b/g,
      /\b(2\d{1}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2})\b/g,
      /(?:Tel|Tél|Phone|Téléphone|Contact|Appel|Call)[\s:]*(?:\+?237[\s.-]?)?(\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d)/gi,
    ];

    for (const pattern of phonePatterns) {
      const match = pattern.exec(text);
      if (match) {
        const raw = (match[0].includes('+237') ? match[0] : match[1]).replace(/[\s.-]/g, '');
        if (raw.length >= 9) {
          phone = raw.startsWith('+') ? raw : raw.startsWith('237') ? `+${raw}` : `+237${raw}`;
          break;
        }
      }
    }

    // WhatsApp extraction
    const waPatterns = [
      /whatsapp[\s:]*(?:\+?237[\s.-]?)?(\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d)/gi,
      /wa\.me\/(\d+)/gi,
    ];

    for (const pattern of waPatterns) {
      const match = pattern.exec(text);
      if (match) {
        const raw = match[1].replace(/[\s.-]/g, '');
        if (raw.length >= 9) {
          whatsapp = raw.startsWith('237') ? `+${raw}` : raw.length === 9 ? `+237${raw}` : `+${raw}`;
          break;
        }
      }
    }

    return { email, phone, whatsapp };
  }

  /**
   * Fetch a job detail page and extract description + contacts.
   * Returns null if fetch fails (non-fatal).
   */
  protected async fetchJobDetails(
    jobUrl: string
  ): Promise<{ description: string | null; email: string | null; phone: string | null; whatsapp: string | null } | null> {
    try {
      const res = await this.fetchPage(jobUrl, { retries: 1 });
      const html = await res.text();
      const cheerio = require('cheerio/slim') as typeof import('cheerio');
      const $ = cheerio.load(html);

      // Remove scripts and styles for cleaner text
      $('script, style, nav, header, footer').remove();
      const bodyText = $('body').text().replace(/\s+/g, ' ');

      // Try common description selectors
      const descriptionSelectors = [
        'article .entry-content',
        '.job-description',
        '.post-content',
        '.field-name-body',
        '.job-detail-content',
        'article .content',
        '.description',
        'main .content',
      ];

      let description: string | null = null;
      for (const selector of descriptionSelectors) {
        const el = $(selector);
        if (el.length > 0) {
          description = this.clean(el.text()).slice(0, 2000);
          break;
        }
      }

      const contacts = this.extractContacts(bodyText);

      return {
        description,
        ...contacts,
      };
    } catch {
      return null;
    }
  }
}

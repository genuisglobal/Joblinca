export type ScraperSourceType = 'api' | 'html' | 'manual';
export type ScraperExecutionKind = 'site' | 'facebook';

export interface ScraperSourceCatalogEntry {
  slug: string;
  label: string;
  sourceType: ScraperSourceType;
  baseUrl: string;
  trustTier: number;
  executionKind: ScraperExecutionKind;
  retireLegacyExternalFeed?: boolean;
  /** Set false to retire a source (dead site, etc.) without deleting its code */
  enabled?: boolean;
}

type SourceOption = {
  value: string;
  label: string;
};

export const FACEBOOK_SCRAPER_SOURCE_SLUG = 'facebook';

export const SCRAPER_SOURCE_CATALOG = [
  {
    slug: 'reliefweb',
    label: 'ReliefWeb',
    sourceType: 'api',
    baseUrl: 'https://reliefweb.int',
    trustTier: 90,
    executionKind: 'site',
    retireLegacyExternalFeed: true,
  },
  {
    slug: 'kamerpower',
    label: 'KamerPower',
    sourceType: 'html',
    baseUrl: 'https://kamerpower.com',
    trustTier: 60,
    executionKind: 'site',
    retireLegacyExternalFeed: true,
  },
  {
    slug: 'minajobs',
    label: 'MinaJobs',
    sourceType: 'html',
    baseUrl: 'https://minajobs.net',
    trustTier: 60,
    executionKind: 'site',
    retireLegacyExternalFeed: true,
  },
  {
    slug: 'cameroonjobs',
    label: 'CameroonJobs',
    sourceType: 'html',
    baseUrl: 'https://www.cameroonjobs.net',
    trustTier: 70,
    executionKind: 'site',
    retireLegacyExternalFeed: true,
  },
  {
    slug: 'jobincamer',
    label: 'JobInCamer',
    sourceType: 'html',
    baseUrl: 'https://www.jobincamer.com',
    trustTier: 65,
    executionKind: 'site',
    retireLegacyExternalFeed: true,
  },
  {
    slug: 'emploicm',
    label: 'Emploi.cm',
    sourceType: 'html',
    baseUrl: 'https://www.emploi.cm',
    trustTier: 75,
    executionKind: 'site',
    retireLegacyExternalFeed: true,
  },
  {
    slug: 'workconnect',
    label: 'WorkConnect CM',
    sourceType: 'api',
    baseUrl: 'https://www.workconnectjob.com',
    trustTier: 80,
    executionKind: 'site',
    retireLegacyExternalFeed: false,
  },
  {
    slug: 'kmerjobs',
    label: 'KmerJobs',
    sourceType: 'api',
    baseUrl: 'https://www.kmerjobs.com',
    trustTier: 72,
    executionKind: 'site',
    retireLegacyExternalFeed: false,
    // Retired 2026-07: kmerjobs.com no longer resolves (NXDOMAIN).
    // Re-enable if the site comes back.
    enabled: false,
  },
  {
    // First-party employer pages registered in /admin/aggregation/career-pages;
    // extraction is LLM-based so adding an employer is config, not code
    slug: 'careerpages',
    label: 'Company Career Pages',
    sourceType: 'html',
    baseUrl: 'https://joblinca.com/admin/aggregation/career-pages',
    trustTier: 85,
    executionKind: 'site',
    retireLegacyExternalFeed: false,
  },
  {
    slug: FACEBOOK_SCRAPER_SOURCE_SLUG,
    label: 'Facebook Groups',
    sourceType: 'manual',
    baseUrl: 'https://facebook.com',
    trustTier: 30,
    executionKind: 'facebook',
    retireLegacyExternalFeed: false,
  },
] as const satisfies readonly ScraperSourceCatalogEntry[];

export type ScraperSourceSlug = (typeof SCRAPER_SOURCE_CATALOG)[number]['slug'];

function toSlugs(
  entries: readonly ScraperSourceCatalogEntry[]
): ScraperSourceSlug[] {
  return entries.map((entry) => entry.slug as ScraperSourceSlug);
}

function toOptions(
  entries: readonly ScraperSourceCatalogEntry[]
): SourceOption[] {
  return entries.map((entry) => ({
    value: entry.slug,
    label: entry.label,
  }));
}

// Widen past the `as const` narrowing so optional fields are accessible
const CATALOG_ENTRIES: readonly ScraperSourceCatalogEntry[] = SCRAPER_SOURCE_CATALOG;

export const ACTIVE_SCRAPER_SOURCE_CATALOG = CATALOG_ENTRIES.filter(
  (entry) => entry.enabled !== false
);

export const AUTOMATED_SCRAPER_SOURCE_CATALOG = CATALOG_ENTRIES.filter(
  (entry) => entry.executionKind === 'site' && entry.enabled !== false
);

export const AUTOMATED_SCRAPER_SOURCE_SLUGS = toSlugs(
  AUTOMATED_SCRAPER_SOURCE_CATALOG
);

export const ALL_SCRAPER_SOURCE_SLUGS = toSlugs(SCRAPER_SOURCE_CATALOG);

export const AUTOMATED_SCRAPER_SOURCE_OPTIONS = toOptions(
  AUTOMATED_SCRAPER_SOURCE_CATALOG
);

export const ADMIN_RUN_SCRAPER_SOURCE_OPTIONS = [
  ...AUTOMATED_SCRAPER_SOURCE_OPTIONS,
  {
    value: FACEBOOK_SCRAPER_SOURCE_SLUG,
    label: 'Facebook Groups',
  },
] satisfies SourceOption[];

export const LEGACY_EXTERNAL_FEED_RETIRING_SOURCE_SLUGS =
  toSlugs(
    SCRAPER_SOURCE_CATALOG.filter((entry) => entry.retireLegacyExternalFeed)
  );

export function getScraperSourceCatalogEntry(
  slug: string
): ScraperSourceCatalogEntry | null {
  return SCRAPER_SOURCE_CATALOG.find((entry) => entry.slug === slug) || null;
}

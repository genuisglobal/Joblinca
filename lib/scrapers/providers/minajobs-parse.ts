/**
 * Pure helpers for the MinaJobs scraper (no I/O, unit-tested in
 * tests/minajobs-parse.test.js).
 *
 * 2026-11: minajobs.net now 301s to cm.minajobs.net, a Nuxt app. The old
 * /offres-emplois-stages listing (ul.listings-block li.spotlight) is gone, so
 * the scraper "completed" with 0 jobs every run. The new site's server-rendered
 * HTML only contains the 10 featured cards, but the page itself loads its
 * listing from a public JSON API, which we now use directly:
 *   GET /api/jobs?page=N&limit=30  -> { items, total, page, pageSize }
 *   GET /api/jobs/{slug}           -> item + description (Portable Text) + applyEmail
 */

export const MINAJOBS_BASE_URL = 'https://cm.minajobs.net';

export interface MinaJobsListItem {
  number: number;
  slug: string;
  title: string;
  featured?: boolean;
  publishedAt?: string | null;
  deadline?: string | null;
  salary?: string | null;
  category?: { slug?: string; title?: string } | null;
  city?: { slug?: string; title?: string } | null;
  company?: { name?: string | null; logo?: string | null; website?: string | null } | null;
  type?: { slug?: string; title?: string } | null;
}

export interface MinaJobsListResponse {
  items: MinaJobsListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MinaJobsDetail extends MinaJobsListItem {
  description?: unknown;
  applyEmail?: string | null;
  applyInstructions?: string | null;
  applyUrl?: string | null;
}

export function isListResponse(body: unknown): body is MinaJobsListResponse {
  return !!body && typeof body === 'object' && Array.isArray((body as MinaJobsListResponse).items);
}

export function jobUrl(slug: string): string {
  return `${MINAJOBS_BASE_URL}/emplois/${slug}`;
}

/** Flatten Sanity Portable Text blocks (or a plain string) to readable text. */
export function portableTextToPlain(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (!Array.isArray(value)) return '';

  const lines: string[] = [];
  for (const block of value) {
    if (!block || typeof block !== 'object') continue;
    const children = (block as { children?: unknown }).children;
    if (!Array.isArray(children)) continue;
    const text = children
      .map((c) => (c && typeof c === 'object' && typeof (c as { text?: unknown }).text === 'string' ? (c as { text: string }).text : ''))
      .join('')
      .trim();
    if (!text) continue;
    const listItem = (block as { listItem?: unknown }).listItem;
    lines.push(listItem ? `• ${text}` : text);
  }
  return lines.join('\n');
}

import { createHash } from 'crypto';

const HASH_SKIP_WORDS = new Set([
  'recrutement',
  'recruitment',
  'hiring',
  'avis',
  'offre',
  'de',
  'du',
  'un',
  'une',
  'des',
  'le',
  'la',
  'les',
  'et',
  'a',
  'the',
  'an',
  'for',
  'of',
  'at',
  'and',
  'is',
  'are',
  'looking',
  'recherche',
  'cherche',
  'recrute',
]);

const SIGNIFICANT_WORD_SKIP_WORDS = new Set([...HASH_SKIP_WORDS, 'ngo', 'ong']);
const COMPANY_SUFFIX_PATTERN =
  /\b(sarl|sa|sas|ltd|llc|inc|gmbh|plc|co|corp|group|international)\b/g;
const TRACKING_PARAM_NAMES = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'source',
  'src',
]);

export interface JobDedupInput {
  title: string;
  companyName?: string | null;
  urls?: Array<string | null | undefined>;
}

export interface JobIdentity {
  title: string;
  companyName: string | null;
  normalizedTitle: string;
  normalizedCompany: string;
  titleWords: string[];
  companyWords: string[];
  urls: string[];
  textHash: string;
  textKey: string;
}

export interface JobDuplicateMatch {
  duplicate: boolean;
  reason: 'none' | 'exact_url' | 'exact_text' | 'fuzzy';
  titleSimilarity: number;
  companySimilarity: number;
  score: number;
  sharedUrl: string | null;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHashText(text: string | null | undefined): string {
  return normalizeText(text || '')
    .split(' ')
    .filter((word) => word.length > 1 && !HASH_SKIP_WORDS.has(word))
    .join(' ');
}

function significantWords(text: string | null | undefined): string[] {
  return normalizeText(text || '')
    .split(' ')
    .filter((word) => word.length > 1 && !SIGNIFICANT_WORD_SKIP_WORDS.has(word));
}

export function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) {
    return '';
  }

  return normalizeText(name)
    .replace(COMPANY_SUFFIX_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeUrlForDedup(rawUrl: string | null | undefined): string | null {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return trimmed;
    }

    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = (parsed.pathname || '/').replace(/\/+/g, '/').replace(/\/$/, '') || '/';

    const params = [...parsed.searchParams.entries()]
      .filter(([key]) => {
        const lower = key.toLowerCase();
        return !lower.startsWith('utm_') && !TRACKING_PARAM_NAMES.has(lower);
      })
      .sort(([a], [b]) => a.localeCompare(b));

    const query = params.length
      ? `?${params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')}`
      : '';

    return `${host}${pathname}${query}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

export function buildDiscoveredJobTextHash(
  title: string,
  companyName?: string | null
): string {
  const normalized = `${normalizeHashText(title)}|${normalizeHashText(companyName)}`;
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

export function buildJobIdentity(input: JobDedupInput): JobIdentity {
  const title = (input.title || '').trim();
  const companyName = (input.companyName || '').trim() || null;
  const urls = [...new Set((input.urls || []).map(normalizeUrlForDedup).filter(Boolean) as string[])];
  const titleWords = significantWords(title);
  const normalizedCompany = normalizeCompanyName(companyName);
  const companyWords = normalizedCompany ? normalizedCompany.split(' ').filter(Boolean) : [];

  return {
    title,
    companyName,
    normalizedTitle: normalizeText(title),
    normalizedCompany,
    titleWords,
    companyWords,
    urls,
    textHash: buildDiscoveredJobTextHash(title, companyName),
    textKey: `${titleWords.join(' ')}|${companyWords.join(' ')}`,
  };
}

export function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);

  if (setA.size === 0 && setB.size === 0) {
    return 1;
  }

  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) {
      intersection++;
    }
  }

  return intersection / (setA.size + setB.size - intersection);
}

export function compareJobIdentity(a: JobIdentity, b: JobIdentity): JobDuplicateMatch {
  const sharedUrl = a.urls.find((url) => b.urls.includes(url)) || null;
  if (sharedUrl) {
    return {
      duplicate: true,
      reason: 'exact_url',
      titleSimilarity: 1,
      companySimilarity: 1,
      score: 1,
      sharedUrl,
    };
  }

  if (a.textHash === b.textHash && a.textKey.length > 0 && b.textKey.length > 0) {
    return {
      duplicate: true,
      reason: 'exact_text',
      titleSimilarity: 1,
      companySimilarity: 1,
      score: 0.98,
      sharedUrl: null,
    };
  }

  const titleSimilarity = jaccardSimilarity(a.titleWords, b.titleWords);
  if (titleSimilarity < 0.5) {
    return {
      duplicate: false,
      reason: 'none',
      titleSimilarity,
      companySimilarity: 0,
      score: titleSimilarity,
      sharedUrl: null,
    };
  }

  const companySimilarity =
    a.companyWords.length > 0 && b.companyWords.length > 0
      ? jaccardSimilarity(a.companyWords, b.companyWords)
      : a.companyWords.length === 0 && b.companyWords.length === 0
        ? 1
        : 0;

  const duplicate = (titleSimilarity >= 0.65 && companySimilarity >= 0.5) || titleSimilarity >= 0.85;

  return {
    duplicate,
    reason: duplicate ? 'fuzzy' : 'none',
    titleSimilarity,
    companySimilarity,
    score: duplicate ? Math.max(titleSimilarity, companySimilarity * 0.8) : titleSimilarity,
    sharedUrl: null,
  };
}

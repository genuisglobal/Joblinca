/**
 * Live AI-training job openings that a person in Cameroon can actually take.
 *
 * The "AI Training & Data Work" tab started as hand-picked platform sign-up
 * cards (see AI_TRAINING_PLATFORMS in externalJobs.ts). This adds real, dated
 * openings from the public job boards of AI-data vendors.
 *
 * Eligibility is the whole point, and it is strict on purpose. Checked
 * against the live boards on 2026-10-03, almost every AI-data posting is tied
 * to a country ("French (France) | Paris", "Remote - Nigeria", "Riyadh") or a
 * language Cameroonians don't speak ("Czech Language Transcription | Any").
 * A posting is kept only when ALL of these hold:
 *
 *   1. It is AI-data work (annotation, rating, evaluation, transcription,
 *      speech/voice data, AI training/tutoring), not a staff job at the vendor.
 *   2. Its location is open worldwide ("Any", "Worldwide", "Remote - Non-US",
 *      bare "Remote") or names Cameroon or Africa. A missing location is not
 *      treated as eligible.
 *   3. Its title names no country other than Cameroon — "Remote" plus
 *      "(USA)" in the title is a US-residents role.
 *   4. If its title names a language, it is one spoken in Cameroon (French,
 *      English, Pidgin, Fulfulde, ...).
 *
 * The rules are deliberately dependency-free so tests can load this file
 * directly.
 */

import type { ExternalJob } from './externalJobs';

export const AI_TRAINING_CATEGORY = 'AI Training & Data Work';

/** One source slug for every live opening, so stale rows can be cleared as a set. */
export const AI_TRAINING_OPENINGS_SOURCE = 'ai-training-openings';

// ── 1. Is this AI-data work? ─────────────────────────────────────────────

const AI_WORK_PATTERN =
  // "gig"/"pay-by-task": Appen's country-targeted task postings (the ones it
  // runs for Central African countries) are titled "Gig Guru Wanted: ...
  // Pay-by-Task Opportunities in <country>".
  /annotat|label(l)?ing|\blabeler\b|\brater\b|evaluat|transcri|voice record|speech|data (collect|valid|specialist|contributor)|\bai (trainer|tutor|training|data|conversation|content|writ)|\bllm\b|rlhf|for ai training|ai model|\bgig\b|pay-by-task/i;

/** Staff roles that match the work words but aren't the work itself. */
const STAFF_ROLE_PATTERN =
  /\b(manager|director|recruit(er|ing)|engineer|scientist|account|sales|operations lead|program|product|head of|vp\b|analyst|accountant|coordinator)\b/i;

export function isAiTrainingWork(title: string): boolean {
  return AI_WORK_PATTERN.test(title) && !STAFF_ROLE_PATTERN.test(title);
}

// ── 2. Is the location open to someone in Cameroon? ──────────────────────

const OPEN_LOCATION = new Set([
  'any',
  'anywhere',
  'worldwide',
  'global',
  'international',
  'remote',
  'fully remote',
  'remote - global',
  'global - remote',
  'remote (global)',
  'remote - worldwide',
  'remote - anywhere',
  'remote - non-us',
  'remote, non-us',
  'non-us',
]);

export function isLocationOpenToCameroon(raw: string | null | undefined): boolean {
  const location = String(raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!location) return false;
  if (/cameroon|cameroun|\bafrica\b|afrique/.test(location)) return true;
  // Multi-location strings ("Any / Any", "Remote; Worldwide"): any open part counts.
  return location.split(/\s*[\/;|]\s*/).some((part) => OPEN_LOCATION.has(part.trim()));
}

// ── 3. Does the title tie it to another country? ─────────────────────────

const OTHER_COUNTRIES = [
  'usa', 'u\\.s\\.', 'united states', 'canada', 'mexico', 'brazil', 'argentina', 'chile', 'colombia', 'peru',
  'costa rica', 'latam', 'united kingdom', 'uk', 'ireland', 'france', 'germany', 'spain', 'portugal', 'italy',
  'netherlands', 'belgium', 'switzerland', 'austria', 'poland', 'czechia', 'czech republic', 'sweden', 'norway',
  'denmark', 'finland', 'greece', 'turkey', 'russia', 'ukraine', 'georgia', 'india', 'pakistan', 'bangladesh',
  'china', 'taiwan', 'hong kong', 'japan', 'korea', 'south korea', 'vietnam', 'thailand', 'malaysia', 'singapore',
  'indonesia', 'philippines', 'australia', 'new zealand', 'saudi arabia', 'uae', 'united arab emirates', 'qatar',
  'bahrain', 'egypt', 'morocco', 'nigeria', 'ghana', 'kenya', 'south africa', 'ethiopia', 'senegal', 'ivory coast',
  "cote d'ivoire", 'drc', 'congo', 'myanmar', 'laos', 'kazakhstan', 'israel',
];
const OTHER_COUNTRY_PATTERN = new RegExp(`\\b(${OTHER_COUNTRIES.join('|')})\\b`, 'i');

export function titleNamesOtherCountry(title: string): boolean {
  return OTHER_COUNTRY_PATTERN.test(title);
}

// ── 4. If a language is required, is it one spoken in Cameroon? ──────────

const CAMEROON_LANGUAGES = [
  'french', 'english', 'pidgin', 'fulfulde', 'fula', 'fulani', 'ewondo', 'duala', 'douala', 'bassa',
  'bamileke', 'medumba', 'ghomala', 'bulu', 'hausa', 'camfranglais',
];
const OTHER_LANGUAGES = [
  'arabic', 'chinese', 'mandarin', 'cantonese', 'japanese', 'korean', 'hindi', 'bengali', 'urdu', 'punjabi',
  'tamil', 'telugu', 'marathi', 'gujarati', 'kannada', 'malayalam', 'thai', 'vietnamese', 'lao', 'khmer',
  'burmese', 'indonesian', 'malay', 'tagalog', 'filipino', 'spanish', 'portuguese', 'italian', 'german', 'dutch',
  'danish', 'swedish', 'norwegian', 'finnish', 'icelandic', 'polish', 'czech', 'slovak', 'hungarian', 'romanian',
  'bulgarian', 'croatian', 'serbian', 'bosnian', 'slovenian', 'greek', 'turkish', 'russian', 'ukrainian',
  'georgian', 'armenian', 'hebrew', 'persian', 'farsi', 'kazakh', 'uzbek', 'swahili', 'amharic', 'somali',
  'yoruba', 'igbo', 'zulu', 'xhosa', 'afrikaans', 'wolof', 'lingala', 'kinyarwanda', 'twi', 'akan',
];
const wordPattern = (words: string[]) => new RegExp(`\\b(${words.join('|')})\\b`, 'i');
const CAMEROON_LANGUAGE_PATTERN = wordPattern(CAMEROON_LANGUAGES);
const OTHER_LANGUAGE_PATTERN = wordPattern(OTHER_LANGUAGES);

export function languageFitsCameroon(title: string): boolean {
  if (CAMEROON_LANGUAGE_PATTERN.test(title)) return true;
  return !OTHER_LANGUAGE_PATTERN.test(title);
}

// ── The combined rule ────────────────────────────────────────────────────

export type EligibilityVerdict =
  | { eligible: true }
  | { eligible: false; reason: 'not_ai_work' | 'location' | 'country_in_title' | 'language' };

export function evaluateCameroonEligibility(title: string, location: string | null | undefined): EligibilityVerdict {
  if (!isAiTrainingWork(title)) return { eligible: false, reason: 'not_ai_work' };
  if (!isLocationOpenToCameroon(location)) return { eligible: false, reason: 'location' };
  // A "Cameroon" posting can mention Cameroon in the title; other countries can't.
  if (!/cameroon|cameroun/i.test(String(location)) && titleNamesOtherCountry(title)) {
    return { eligible: false, reason: 'country_in_title' };
  }
  if (!languageFitsCameroon(title)) return { eligible: false, reason: 'language' };
  return { eligible: true };
}

// ── Live boards ──────────────────────────────────────────────────────────
//
// Public, unauthenticated ATS endpoints of AI-data vendors whose boards carry
// contributor (not just staff) postings. Each board's slug was confirmed live
// on 2026-10-03. Most of their postings are country-locked and will be
// filtered out; what survives is the point.

type BoardKind = 'lever' | 'greenhouse' | 'workable';

interface AiDataBoard {
  kind: BoardKind;
  slug: string;
  company: string;
}

export const AI_DATA_BOARDS: AiDataBoard[] = [
  { kind: 'lever', slug: 'appen', company: 'Appen' },
  { kind: 'lever', slug: 'rws', company: 'RWS TrainAI' },
  { kind: 'greenhouse', slug: 'remotasks', company: 'Remotasks (Scale AI)' },
  { kind: 'greenhouse', slug: 'toloka', company: 'Toloka' },
  { kind: 'workable', slug: 'cloudfactory', company: 'CloudFactory' },
];

interface BoardPosting {
  id: string;
  title: string;
  location: string;
  url: string;
  commitment: string | null;
}

const USER_AGENT = 'Joblinca/1.0 (Cameroon Job Aggregator; contact@joblinca.com)';

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    // Boards change a few times a day at most; the refresh cron runs less often than this.
    next: { revalidate: 3600 },
  } as RequestInit);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function fetchBoard(board: AiDataBoard): Promise<BoardPosting[]> {
  if (board.kind === 'lever') {
    const data = (await getJson(`https://api.lever.co/v0/postings/${board.slug}?mode=json`)) as any[];
    return (Array.isArray(data) ? data : []).map((p) => ({
      id: String(p.id),
      title: String(p.text ?? ''),
      location: [p.categories?.location, ...(p.categories?.allLocations ?? [])].filter(Boolean).join(' / '),
      url: String(p.hostedUrl ?? ''),
      commitment: p.categories?.commitment ?? null,
    }));
  }
  if (board.kind === 'greenhouse') {
    const data = (await getJson(`https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs`)) as any;
    return (data?.jobs ?? []).map((p: any) => ({
      id: String(p.id),
      title: String(p.title ?? ''),
      location: String(p.location?.name ?? ''),
      url: String(p.absolute_url ?? ''),
      commitment: null,
    }));
  }
  const data = (await getJson(`https://apply.workable.com/api/v1/widget/accounts/${board.slug}`)) as any;
  return (data?.jobs ?? []).map((p: any) => ({
    id: String(p.shortcode ?? p.id ?? p.url),
    title: String(p.title ?? ''),
    // Workable gives a country, or only a remote flag; a bare remote flag
    // is not evidence the role is open worldwide, so it stays empty.
    location: String(p.country ?? ''),
    url: String(p.url ?? p.application_url ?? ''),
    commitment: p.employment_type ?? null,
  }));
}

/**
 * Fetch every board and keep only postings open to Cameroon.
 *
 * Throws when every board failed, so the caller can tell "nothing eligible
 * today" (clear stale rows) from "couldn't check" (keep what's there).
 */
export async function fetchAiTrainingOpenings(): Promise<ExternalJob[]> {
  const settled = await Promise.allSettled(AI_DATA_BOARDS.map((board) => fetchBoard(board)));
  if (settled.every((result) => result.status === 'rejected')) {
    throw new Error('Every AI-data board failed to respond.');
  }

  const now = new Date().toISOString();
  const openings: ExternalJob[] = [];
  settled.forEach((result, index) => {
    if (result.status !== 'fulfilled') {
      console.error(`[ai-training] ${AI_DATA_BOARDS[index].slug} failed:`, result.reason);
      return;
    }
    const board = AI_DATA_BOARDS[index];
    for (const posting of result.value) {
      if (!posting.url || !posting.title) continue;
      if (!evaluateCameroonEligibility(posting.title, posting.location).eligible) continue;
      openings.push({
        external_id: `${board.slug}:${posting.id}`,
        source: AI_TRAINING_OPENINGS_SOURCE,
        title: posting.title,
        company_name: board.company,
        company_logo: undefined,
        location: posting.location,
        salary: null,
        job_type: posting.commitment || 'Contract · remote',
        category: AI_TRAINING_CATEGORY,
        description: undefined,
        url: posting.url,
        fetched_at: now,
      });
    }
  });
  return openings;
}

// ── Mercor ───────────────────────────────────────────────────────────────
//
// Mercor runs the largest open marketplace of expert AI-training contracts
// (STEM, medicine, law, finance, software, language & audio; $30-250/hr).
// On 2026-10-03, 208 of its 319 listings were open to Cameroon.
//
// Its robots.txt disallows /api/ but allows the sitemap and the job pages,
// so this reads only those: sitemap → page. Never the internal API.
//
// Eligibility comes from the listing record the page renders from
// (workArrangement, eligibleLocation, ineligibleLocation, ...), NOT from
// the page's schema.org JobPosting block: that block labels open-to-all
// roles "US" (checked 2026-10-03 — "Multimodal Image Expert" says US in
// JSON-LD but its record is open everywhere except 7 sanctioned countries),
// and trusting it hid every eligible role. JSON-LD is used for title/pay.

export const MERCOR_SOURCE = 'mercor';
const MERCOR_SITEMAP = 'https://work.mercor.com/sitemap.xml';
const MERCOR_CONCURRENCY = 6;
/** Stop starting new page fetches after this; the refresh cron has 300s for everything. */
const MERCOR_TIME_BUDGET_MS = 60_000;

/** The subset of schema.org JobPosting that Mercor's pages carry and we use. */
export interface JobPostingLd {
  '@type'?: string;
  title?: string;
  url?: string;
  datePosted?: string;
  validThrough?: string;
  employmentType?: string | string[];
  jobLocationType?: string;
  applicantLocationRequirements?: Array<{ name?: string }> | { name?: string };
  hiringOrganization?: { name?: string };
  baseSalary?: { currency?: string; value?: { minValue?: number; maxValue?: number; value?: number; unitText?: string } };
}

const CAMEROON_ISO3 = 'CMR';

export interface MercorEligibility {
  workArrangement: string | null;
  eligibleLocation: string[] | null;
  eligibleResidenceLocation: string[] | null;
  ineligibleLocation: string[] | null;
  ineligibleResidenceLocation: string[] | null;
  disableApplications: boolean;
  isPrivate: boolean;
}

/** Reads the listing record's eligibility fields out of a Mercor job page. Null if any is missing. */
export function extractMercorEligibility(html: string): MercorEligibility | null {
  const field = (name: string) => html.match(new RegExp(`"${name}":(null|true|false|"[^"]*"|\\[[^\\]]*\\])`))?.[1];
  const raw = {
    workArrangement: field('workArrangement'),
    eligibleLocation: field('eligibleLocation'),
    eligibleResidenceLocation: field('eligibleResidenceLocation'),
    ineligibleLocation: field('ineligibleLocation'),
    ineligibleResidenceLocation: field('ineligibleResidenceLocation'),
    disableApplications: field('disableApplications'),
    isPrivate: field('isPrivate'),
  };
  if (Object.values(raw).some((v) => v === undefined)) return null;
  try {
    const parse = (v: string | undefined) => JSON.parse(v as string);
    return {
      workArrangement: parse(raw.workArrangement),
      eligibleLocation: parse(raw.eligibleLocation),
      eligibleResidenceLocation: parse(raw.eligibleResidenceLocation),
      ineligibleLocation: parse(raw.ineligibleLocation),
      ineligibleResidenceLocation: parse(raw.ineligibleResidenceLocation),
      disableApplications: parse(raw.disableApplications) === true,
      isPrivate: parse(raw.isPrivate) === true,
    };
  } catch {
    return null;
  }
}

/**
 * Open to someone living in Cameroon: remote, accepting applications, and
 * every allow-list either empty or containing CMR, with CMR in no deny-list.
 */
export function mercorListingOpenToCameroon(e: MercorEligibility, title: string): boolean {
  if (e.workArrangement !== 'remote' || e.disableApplications || e.isPrivate) return false;
  const allows = (list: string[] | null) => !list || list.length === 0 || list.includes(CAMEROON_ISO3);
  const denies = (list: string[] | null) => Array.isArray(list) && list.includes(CAMEROON_ISO3);
  if (!allows(e.eligibleLocation) || !allows(e.eligibleResidenceLocation)) return false;
  if (denies(e.ineligibleLocation) || denies(e.ineligibleResidenceLocation)) return false;
  return languageFitsCameroon(title);
}

export function extractJobPostingLd(html: string): JobPostingLd | null {
  const scripts = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g);
  for (const match of scripts) {
    try {
      const parsed = JSON.parse(match[1]);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      const posting = candidates.find((c) => c && c['@type'] === 'JobPosting');
      if (posting) return posting as JobPostingLd;
    } catch {
      // A malformed block elsewhere on the page shouldn't hide the posting.
    }
  }
  return null;
}

export function formatJobPostingPay(ld: JobPostingLd): string | null {
  const value = ld.baseSalary?.value;
  if (!value) return null;
  const min = value.minValue ?? value.value;
  const max = value.maxValue ?? value.value;
  if (typeof min !== 'number') return null;
  const symbol = (ld.baseSalary?.currency ?? 'USD').toUpperCase() === 'USD' ? '$' : `${ld.baseSalary?.currency} `;
  const unit = String(value.unitText ?? '').toUpperCase();
  const suffix = unit === 'HOUR' ? '/hr' : unit === 'DAY' ? '/day' : unit === 'WEEK' ? '/wk' : unit === 'MONTH' ? '/mo' : '';
  const range = typeof max === 'number' && max !== min ? `${symbol}${min}–${max}` : `${symbol}${min}`;
  return `${range}${suffix}`;
}

/** Listing pages from the sitemap, newest first (the budget may not reach them all). */
export function parseMercorSitemap(xml: string): string[] {
  const entries = Array.from(xml.matchAll(/<url>([\s\S]*?)<\/url>/g)).map((m) => {
    const loc = m[1].match(/<loc>([^<]+)<\/loc>/)?.[1] ?? '';
    const lastmod = m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? '';
    return { loc, lastmod };
  });
  return entries
    .filter((e) => /^https:\/\/work\.mercor\.com\/jobs\/list_[A-Za-z0-9]+/.test(e.loc))
    .sort((a, b) => b.lastmod.localeCompare(a.lastmod))
    .map((e) => e.loc);
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xml' },
    signal: AbortSignal.timeout(15_000),
    next: { revalidate: 3600 },
  } as RequestInit);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}

/**
 * Throws if the sitemap can't be read, so stale Mercor rows are kept rather
 * than cleared. Individual page failures just skip that listing.
 */
export async function fetchMercorAiTrainingJobs(): Promise<ExternalJob[]> {
  const pages = parseMercorSitemap(await getText(MERCOR_SITEMAP));
  const deadline = Date.now() + MERCOR_TIME_BUDGET_MS;
  const fetchedAt = new Date().toISOString();
  const openings: ExternalJob[] = [];
  let next = 0;

  async function worker() {
    while (next < pages.length && Date.now() < deadline) {
      const url = pages[next++];
      try {
        const html = await getText(url);
        const ld = extractJobPostingLd(html);
        const eligibility = extractMercorEligibility(html);
        if (!ld?.title || !eligibility) continue; // can't verify → don't list
        if (ld.validThrough && new Date(ld.validThrough).getTime() < Date.now()) continue;
        if (!mercorListingOpenToCameroon(eligibility, ld.title)) continue;
        const listingId = url.match(/\/jobs\/(list_[A-Za-z0-9]+)/)?.[1] ?? url;
        openings.push({
          external_id: listingId,
          source: MERCOR_SOURCE,
          title: String(ld.title),
          // Most Mercor clients are confidential; the page shows no company.
          company_name: ld.hiringOrganization?.name?.trim() || 'Mercor',
          company_logo: undefined,
          location: 'Remote — open to Cameroon',
          salary: formatJobPostingPay(ld),
          job_type: 'Contract · remote · expert AI training',
          category: AI_TRAINING_CATEGORY,
          description: undefined,
          url,
          fetched_at: fetchedAt,
        });
      } catch {
        // One slow or missing page shouldn't sink the rest.
      }
    }
  }

  await Promise.all(Array.from({ length: MERCOR_CONCURRENCY }, worker));
  if (next < pages.length) {
    console.warn(`[ai-training] Mercor: time budget reached after ${next}/${pages.length} pages.`);
  }
  return openings;
}

/**
 * General remote feeds (Remotive, RemoteOK, ...) occasionally carry an
 * AI-training posting. Re-file the ones that pass the same rules into the
 * AI tab; everything else is left exactly as it was.
 */
export function refileEligibleAiTrainingJobs(jobs: ExternalJob[]): ExternalJob[] {
  return jobs.map((job) =>
    job.category !== AI_TRAINING_CATEGORY &&
    evaluateCameroonEligibility(job.title, job.location).eligible
      ? { ...job, category: AI_TRAINING_CATEGORY }
      : job
  );
}

/**
 * Pure helpers that turn Apify Facebook search/page results into recruiter
 * leads. No I/O here so the rules are unit-testable.
 *
 * Privacy rule: only public business Pages become leads. Personal profiles,
 * groups and posts are dropped at every step.
 */

export interface FacebookPageLead {
  page_url: string;
  page_id: string | null;
  name: string;
  categories: string[];
  intro: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  address: string | null;
  followers: number | null;
  recruiter_signal: boolean;
}

/** Keywords for the weekly Page search (EN + FR, Cameroon market). */
export const LEAD_SEARCH_KEYWORDS = [
  'recrutement Cameroun',
  'cabinet de recrutement Douala',
  'cabinet de recrutement Yaoundé',
  'recruitment agency Cameroon',
  'offres d\'emploi Cameroun',
  'ressources humaines Douala',
  'agence d\'intérim Cameroun',
];

const NON_PAGE_PATH = /^\/(?:groups|events|watch|reel|reels|photo|photos|videos|marketplace|stories|hashtag|search|share|login|people|profile\.php|permalink\.php|story\.php|[^/]+\/(?:posts|videos|photos|reels))\b/i;

/**
 * Canonical https://www.facebook.com/<slug> for a business Page URL, or null
 * for anything that is not a Page (profiles, groups, posts, other hosts).
 */
export function canonicalFacebookPageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!/(^|\.)facebook\.com$/.test(host) && host !== 'fb.com') return null;

  const path = url.pathname.replace(/\/+$/, '');
  if (!path || path === '/') return null;
  if (NON_PAGE_PATH.test(path)) return null;

  // "/pages/Name/123" is the legacy Page form; keep it whole.
  if (/^\/pages\//i.test(path)) return `https://www.facebook.com${path}`;

  const slug = path.split('/')[1];
  if (!slug || !/^[A-Za-z0-9.\-_]{2,100}$/.test(slug)) return null;
  return `https://www.facebook.com/${slug}`;
}

function firstString(item: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** Page URLs from a facebook-search-scraper dataset, de-duplicated. */
export function extractSearchPageUrls(items: unknown[]): string[] {
  const urls = new Set<string>();
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    // Skip anything the actor labels as a person.
    const type = String(item.type || item.resultType || '').toLowerCase();
    if (type === 'profile' || type === 'person' || type === 'user') continue;
    for (const key of ['pageUrl', 'facebookUrl', 'url', 'profileUrl', 'link']) {
      const page = canonicalFacebookPageUrl(item[key]);
      if (page) {
        urls.add(page);
        break;
      }
    }
  }
  return [...urls];
}

// Unicode-aware boundaries: plain \b treats "é" as a non-word char, so
// "Yaoundé." would not match.
const CAMEROON_TEXT = /(?<!\p{L})(cameroon|cameroun|kamerun|douala|yaound[eé]|bamenda|buea|limb[eé]|bafoussam|garoua|maroua|kribi|ngaound[eé]r[eé]|bertoua|ebolowa|kumba|dschang|nkongsamba|edea|édéa)(?!\p{L})/iu;

const RECRUITER_TEXT = /(recrut|recruit|staffing|headhunt|chasseur de t[eê]te|emploi|jobs?\b|carri[eè]re|career|ressources humaines|human resources|\bhr\b|\brh\b|int[eé]rim|placement|talent|hiring|embauche|manpower|outsourcing)/i;

/** Digits only, Cameroon numbers to +237XXXXXXXXX; null if not Cameroonian. */
export function cameroonPhone(raw: string | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('237') && digits.length === 12) digits = digits.slice(3);
  if (digits.length === 9 && /^[62]/.test(digits)) return `+237${digits}`;
  return null;
}

function extractWhatsApp(texts: string[]): string | null {
  for (const text of texts) {
    const match = text.match(/(?:wa\.me\/|whatsapp\.com\/send\?phone=)\+?(\d{8,15})/i);
    if (match) return `+${match[1]}`;
  }
  return null;
}

function extractEmail(texts: string[]): string | null {
  for (const text of texts) {
    const match = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    if (match) return match[0].toLowerCase();
  }
  return null;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim());
  }
  return typeof value === 'string' && value.trim() ? [value.trim()] : [];
}

/**
 * Map one facebook-pages-scraper item to a lead. Returns null when the item is
 * not a Cameroon business Page or has no way to contact it.
 */
export function mapPageItemToLead(raw: unknown): FacebookPageLead | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;

  const pageUrl =
    canonicalFacebookPageUrl(item.pageUrl) ||
    canonicalFacebookPageUrl(item.facebookUrl) ||
    canonicalFacebookPageUrl(item.url);
  const name = firstString(item, ['title', 'pageName', 'name']);
  if (!pageUrl || !name) return null;

  const categories = toStringArray(item.categories).slice(0, 10);
  const intro = firstString(item, ['intro', 'about_me', 'description']);
  const info = toStringArray(item.info);
  const websites = toStringArray(item.websites);
  const address = firstString(item, ['address']);
  const texts = [intro || '', ...info, ...websites];

  const email = (firstString(item, ['email']) || extractEmail(texts) || '').toLowerCase() || null;
  const rawPhone = firstString(item, ['phone']);
  const phone = cameroonPhone(rawPhone) || rawPhone;
  const whatsapp = extractWhatsApp(texts);
  const website = websites.find((w) => !/facebook\.com|wa\.me|instagram\.com/i.test(w)) || firstString(item, ['website']);

  if (!email && !phone && !whatsapp && !website) return null;

  const locationText = [name, address || '', intro || '', ...info].join(' ');
  const inCameroon =
    Boolean(cameroonPhone(rawPhone)) ||
    Boolean(whatsapp && whatsapp.startsWith('+237')) ||
    CAMEROON_TEXT.test(locationText) ||
    /\.cm(\/|$)/i.test(website || '');
  if (!inCameroon) return null;

  const followersRaw = item.followers ?? item.likes;
  const followers =
    typeof followersRaw === 'number' && Number.isFinite(followersRaw) ? Math.round(followersRaw) : null;

  return {
    page_url: pageUrl,
    page_id: firstString(item, ['pageId', 'facebookId', 'id']),
    name: name.slice(0, 200),
    categories,
    intro: intro ? intro.slice(0, 1000) : null,
    email,
    phone,
    whatsapp,
    website,
    address: address ? address.slice(0, 300) : null,
    followers,
    recruiter_signal: RECRUITER_TEXT.test([name, ...categories, intro || ''].join(' ')),
  };
}

/**
 * Shared heuristics for Facebook/short-form social job posts.
 */

const JOB_KEYWORDS = [
  'recrut',
  'emploi',
  'offre',
  'poste',
  'job',
  'hiring',
  'vacancy',
  'apply',
  'postule',
  'candidature',
  'stage',
  'intern',
  'opportunit',
  'cherche',
  'recherche',
  'urgent',
  'travail',
];

const CONTACT_SIGNAL_REGEX = /(?:@|wa\.me\/|whatsapp|\+237|\bcv\b|\bemail\b|\bcontact\b)/i;

export function normalizeFacebookPostText(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

export function looksLikeJobSnippet(text: string): boolean {
  const normalized = normalizeFacebookPostText(text).toLowerCase();
  if (!normalized || normalized.length < 8) {
    return false;
  }

  if (JOB_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return true;
  }

  return CONTACT_SIGNAL_REGEX.test(normalized);
}

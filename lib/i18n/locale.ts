export type Locale = 'en' | 'fr';

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE_NAME = 'lang';

export function normalizeLocale(value: unknown): Locale | null {
  return value === 'en' || value === 'fr' ? value : null;
}

export function getPreferredLocaleFromAcceptLanguage(
  value: string | null | undefined
): Locale {
  if (!value) {
    return DEFAULT_LOCALE;
  }

  const lower = value.toLowerCase();
  if (lower.includes('fr')) {
    return 'fr';
  }

  return DEFAULT_LOCALE;
}

export function resolveLocalePreference({
  queryLocale,
  cookieLocale,
  profileLocale,
  acceptLanguage,
}: {
  queryLocale?: unknown;
  cookieLocale?: unknown;
  profileLocale?: unknown;
  acceptLanguage?: string | null;
}): Locale {
  return (
    normalizeLocale(queryLocale) ||
    normalizeLocale(cookieLocale) ||
    normalizeLocale(profileLocale) ||
    getPreferredLocaleFromAcceptLanguage(acceptLanguage)
  );
}

export function detectContentLanguage(text: string | null | undefined): Locale | null {
  if (!text) {
    return null;
  }

  const lower = text.toLowerCase();
  const frWords = [
    'recrutement',
    'emploi',
    'poste',
    'offre',
    'candidature',
    'societe',
    'société',
    'entreprise',
    'profil',
    'recherche',
    'contrat',
    'stage',
    'pourvoir',
    'mission',
    'disponible',
    'francais',
    'français',
  ];
  const enWords = [
    'recruitment',
    'hiring',
    'position',
    'vacancy',
    'apply',
    'company',
    'opportunity',
    'looking for',
    'contract',
    'internship',
    'job',
    'available',
    'english',
    'requirements',
  ];

  let frScore = 0;
  let enScore = 0;

  for (const word of frWords) {
    if (lower.includes(word)) {
      frScore += 1;
    }
  }

  for (const word of enWords) {
    if (lower.includes(word)) {
      enScore += 1;
    }
  }

  if (frScore === 0 && enScore === 0) {
    return null;
  }

  return frScore > enScore ? 'fr' : 'en';
}

export function getLocalePreferenceRank(
  contentLocale: string | null | undefined,
  preferredLocale: Locale
): number {
  const normalized = normalizeLocale(contentLocale);

  if (normalized === preferredLocale) {
    return 0;
  }

  if (!normalized) {
    return 1;
  }

  return 2;
}

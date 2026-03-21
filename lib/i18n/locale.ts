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

  // French keyword indicators
  const frWords = [
    'recrute', 'recrutement', 'recherche', 'cherche',
    'emploi', 'offre', 'poste', 'candidature', 'pourvoir',
    'société', 'societe', 'entreprise', 'agence',
    'contrat', 'stage', 'mission', 'disponible',
    'profil', 'expérience', 'compétences', 'competences',
    'candidat', 'diplôme', 'diplome', 'formation',
    'travail', 'salaire', 'rémunération', 'remuneration',
    'envoyez', 'envoyer', 'postuler', 'postulez',
    'responsable', 'directeur', 'gestionnaire', 'comptable',
    'commercial', 'technicien', 'ingénieur', 'ingenieur',
    'secrétaire', 'secretaire', 'chauffeur', 'caissier',
    'francais', 'français',
  ];

  // French structural words — articles/prepositions that strongly indicate French
  const frStructural = [
    ' des ', ' les ', ' une ', ' pour ', ' dans ', ' aux ',
    ' sur ', ' est ', ' sont ', ' avec ', ' cette ', ' votre ',
    ' nous ', ' notre ', ' leur ', " l'", " d'", " n'", " s'", " qu'",
  ];

  const enWords = [
    'recruitment', 'hiring', 'position', 'vacancy', 'apply',
    'company', 'opportunity', 'looking for', 'contract', 'internship',
    'job', 'available', 'english', 'requirements', 'required',
    'qualified', 'candidate', 'resume', 'salary', 'deadline',
    'submit', 'manager', 'officer', 'engineer', 'accountant',
  ];

  let frScore = 0;
  let enScore = 0;

  for (const word of frWords) {
    if (lower.includes(word)) {
      frScore += 1;
    }
  }

  for (const phrase of frStructural) {
    if (lower.includes(phrase)) {
      frScore += 2; // structural words are strong language signals
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

  // Default to French on tie — Cameroon is French-majority
  return enScore > frScore ? 'en' : 'fr';
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

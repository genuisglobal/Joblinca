/**
 * Deterministic EN/FR detection for inbound WhatsApp text.
 *
 * Runs before (and as the fallback for) the AI intent resolver, so the agent
 * can pick a reply language without spending a model call. Cameroon is
 * bilingual and a good share of inbound traffic is French, while every prompt
 * in the agent was written in English.
 *
 * Deliberately conservative: it returns null rather than guessing. "1", "ok",
 * "merci" on its own is not enough signal to switch someone's language, and
 * flip-flopping mid-conversation is worse than staying put. A null result means
 * "keep whatever this lead already had".
 */

export type WaLanguage = 'en' | 'fr';

/**
 * Words that only really appear in one of the two languages in this context.
 * Deliberately excludes cross-language traps: "menu", "position", "distance",
 * "message", "important", "date", "situation", "commercial" all read the same
 * in both. "non" is skipped too -- it is French for "no" but also the English
 * prefix people type in "non-profit".
 */
const FRENCH_MARKERS = [
  'je', 'jai', 'suis', 'cherche', 'recherche', 'besoin', 'veux', 'voudrais',
  'travail', 'emploi', 'boulot', 'poste', 'stage', 'stagiaire',
  'bonjour', 'bonsoir', 'salut', 'merci', 'sil', 'vous', 'plait', 'svp',
  'pour', 'avec', 'dans', 'une', 'des', 'les', 'mon', 'ma', 'mes',
  'ville', 'quartier', 'recrutement', 'embauche', 'entreprise', 'societe',
  'candidature', 'postuler', 'salaire', 'experience', 'diplome',
  'aide', 'aidez', 'comment', 'quel', 'quelle', 'ou', 'est', 'ce', 'que',
  'disponible', 'urgent', 'maintenant', 'semaine', 'mois', 'jour',
];

const ENGLISH_MARKERS = [
  'i', 'im', 'need', 'want', 'looking', 'search', 'searching',
  'job', 'jobs', 'work', 'working', 'hire', 'hiring', 'vacancy', 'vacancies',
  'internship', 'intern', 'trainee',
  'hello', 'hi', 'hey', 'thanks', 'thank', 'please',
  'the', 'and', 'with', 'for', 'any', 'have', 'can', 'you', 'me', 'my',
  'town', 'city', 'company', 'apply', 'application', 'salary', 'experience',
  'help', 'how', 'what', 'where', 'available', 'now', 'week', 'month', 'day',
];

/**
 * Accented characters common in French and effectively absent from English
 * input typed on a phone. A single one of these is strong evidence on its own.
 */
const FRENCH_ACCENT_PATTERN = /[àâäçéèêëîïôöùûüÿœ]/i;

/** Strip accents so "cherché" still matches the "cherche" marker. */
function deaccent(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function tokenize(value: string): string[] {
  return deaccent(value)
    .toLowerCase()
    .replace(/['`’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export interface LanguageDetection {
  language: WaLanguage | null;
  /** 0-1. How lopsided the marker counts were; callers may ignore weak reads. */
  confidence: number;
  frenchHits: number;
  englishHits: number;
}

/**
 * Detect the language of an inbound message.
 *
 * Returns `language: null` when there is not enough signal -- too short, all
 * digits, or an even split. Callers should treat null as "no opinion" and fall
 * back to the lead's stored language.
 */
export function detectLanguage(input: string): LanguageDetection {
  const raw = (input || '').trim();
  const empty: LanguageDetection = {
    language: null,
    confidence: 0,
    frenchHits: 0,
    englishHits: 0,
  };

  if (!raw) return empty;

  // Menu choices, "next", pure numbers: no linguistic content to read.
  if (/^[\d\s.,/-]+$/.test(raw)) return empty;

  const tokens = tokenize(raw);
  if (tokens.length === 0) return empty;

  let frenchHits = tokens.filter((token) => FRENCH_MARKERS.includes(token)).length;
  const englishHits = tokens.filter((token) => ENGLISH_MARKERS.includes(token)).length;

  // A French accent is worth a couple of markers -- English phone input very
  // rarely carries one, so it is a high-precision signal.
  const hasAccent = FRENCH_ACCENT_PATTERN.test(raw);
  if (hasAccent) frenchHits += 2;

  const total = frenchHits + englishHits;
  if (total === 0) return empty;

  // A lone weak marker on a short message is noise ("ma", "des", "for"). Demand
  // either an accent, two hits, or a decisive margin before committing.
  if (total === 1 && !hasAccent && tokens.length <= 2) {
    return { language: null, confidence: 0, frenchHits, englishHits };
  }

  if (frenchHits === englishHits) {
    return { language: null, confidence: 0, frenchHits, englishHits };
  }

  const language: WaLanguage = frenchHits > englishHits ? 'fr' : 'en';
  const confidence = Math.abs(frenchHits - englishHits) / total;

  return { language, confidence, frenchHits, englishHits };
}

/**
 * Pick the language to reply in, given a fresh detection and what we already
 * knew about this lead.
 *
 * Order: a confident read of the message they just sent, then their stored
 * preference, then English. The stored preference is what stops a mid-thread
 * "ok" or "2" from bouncing a French speaker back into English.
 */
export function resolveReplyLanguage(
  detected: WaLanguage | null,
  storedLanguage: WaLanguage | null | undefined
): WaLanguage {
  if (detected) return detected;
  if (storedLanguage === 'en' || storedLanguage === 'fr') return storedLanguage;
  return 'en';
}

export function normalizeWaLanguage(value: unknown): WaLanguage | null {
  return value === 'en' || value === 'fr' ? value : null;
}

import type { Locale } from './locale';

export type LocalizedField<T = string> = {
  value: T | null;
  served_language: Locale | 'fallback';
};

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function pickLocalized<T extends Record<string, unknown>>(
  source: T,
  baseKey: keyof T & string,
  locale: Locale
): LocalizedField {
  if (locale === 'fr') {
    const frValue = source[`${baseKey}_fr` as keyof T];
    if (isNonEmpty(frValue)) {
      return { value: frValue, served_language: 'fr' };
    }
  }

  const baseValue = source[baseKey];
  if (isNonEmpty(baseValue)) {
    return {
      value: baseValue,
      served_language: locale === 'fr' ? 'fallback' : 'en',
    };
  }

  return { value: null, served_language: 'fallback' };
}

export function localizedString<T extends Record<string, unknown>>(
  source: T,
  baseKey: keyof T & string,
  locale: Locale,
  defaultValue: string = ''
): string {
  return pickLocalized(source, baseKey, locale).value ?? defaultValue;
}

export type ChallengeQuestionRaw = {
  id?: string;
  question?: string;
  question_fr?: string;
  options?: string[];
  options_fr?: string[];
  correct_index?: number;
  explanation?: string;
  explanation_fr?: string;
};

export type LocalizedChallengeQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  served_language: Locale | 'fallback' | 'mixed';
};

function localizeOptions(
  question: ChallengeQuestionRaw,
  locale: Locale
): { options: string[]; servedAllFromTarget: boolean } {
  const base = Array.isArray(question.options) ? question.options : [];
  if (locale !== 'fr') {
    return { options: base, servedAllFromTarget: true };
  }

  const fr = Array.isArray(question.options_fr) ? question.options_fr : [];
  if (fr.length === base.length && fr.every(isNonEmpty)) {
    return { options: fr, servedAllFromTarget: true };
  }

  return { options: base, servedAllFromTarget: false };
}

export function localizeChallengeQuestion(
  question: ChallengeQuestionRaw,
  locale: Locale,
  fallbackId: string
): LocalizedChallengeQuestion {
  const prompt = pickLocalized(question, 'question', locale);
  const explanation = pickLocalized(question, 'explanation', locale);
  const { options, servedAllFromTarget } = localizeOptions(question, locale);

  const promptFromTarget = prompt.served_language === locale;
  const explanationFromTarget =
    explanation.value == null || explanation.served_language === locale;

  let served: LocalizedChallengeQuestion['served_language'];
  if (locale !== 'fr') {
    served = 'en';
  } else if (promptFromTarget && servedAllFromTarget && explanationFromTarget) {
    served = 'fr';
  } else if (!promptFromTarget && !servedAllFromTarget) {
    served = 'fallback';
  } else {
    served = 'mixed';
  }

  return {
    id: isNonEmpty(question.id) ? question.id : fallbackId,
    prompt: prompt.value ?? '',
    options,
    correct_index: typeof question.correct_index === 'number' ? question.correct_index : -1,
    explanation: explanation.value,
    served_language: served,
  };
}

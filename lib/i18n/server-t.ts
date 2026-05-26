import en from './translations/en';
import fr from './translations/fr';
import type { Locale } from './locale';

const dictionaries: Record<Locale, Record<string, string>> = { en, fr };

export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>
): string {
  let value = dictionaries[locale]?.[key] ?? dictionaries.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return value;
}

export function getServerT(locale: Locale) {
  return (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
}

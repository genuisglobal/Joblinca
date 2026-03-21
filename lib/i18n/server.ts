import { cookies, headers } from 'next/headers';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  type Locale,
  getPreferredLocaleFromAcceptLanguage,
  normalizeLocale,
} from './locale';

export function getRequestLocale(): Locale {
  const cookieLocale = normalizeLocale(cookies().get(LOCALE_COOKIE_NAME)?.value);
  if (cookieLocale) {
    return cookieLocale;
  }

  const headerLocale = getPreferredLocaleFromAcceptLanguage(
    headers().get('accept-language')
  );

  return headerLocale || DEFAULT_LOCALE;
}

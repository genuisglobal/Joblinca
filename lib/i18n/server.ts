import { cookies, headers } from 'next/headers';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  LOCALE_REQUEST_HEADER,
  type Locale,
  getPreferredLocaleFromAcceptLanguage,
  normalizeLocale,
} from './locale';

export function getRequestLocale(): Locale {
  const headerLocale = normalizeLocale(headers().get(LOCALE_REQUEST_HEADER));
  if (headerLocale) {
    return headerLocale;
  }

  const cookieLocale = normalizeLocale(cookies().get(LOCALE_COOKIE_NAME)?.value);
  if (cookieLocale) {
    return cookieLocale;
  }

  const acceptLanguageLocale = getPreferredLocaleFromAcceptLanguage(
    headers().get('accept-language')
  );

  return acceptLanguageLocale || DEFAULT_LOCALE;
}

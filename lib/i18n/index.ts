export { LanguageProvider, useTranslation } from "./context";
export { T } from "./T";
export {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  LOCALE_PREFERENCE_COOKIE_NAME,
  LOCALE_REQUEST_HEADER,
  addLocalePrefix,
  hasExplicitLocalePreference,
  getPathLocale,
  stripLocalePrefix,
} from "./locale";
export type { Locale } from "./locale";
export {
  pickLocalized,
  localizedString,
  localizeChallengeQuestion,
} from "./localized";
export type {
  LocalizedField,
  ChallengeQuestionRaw,
  LocalizedChallengeQuestion,
} from "./localized";

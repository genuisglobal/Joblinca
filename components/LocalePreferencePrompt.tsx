'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Languages } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import {
  LOCALE_PREFERENCE_COOKIE_NAME,
  addLocalePrefix,
  stripLocalePrefix,
  type Locale,
} from '@/lib/i18n/locale';

function hasStoredLocalePreference() {
  if (typeof window === 'undefined') {
    return true;
  }

  const cookieSet = document.cookie
    .split(';')
    .some((entry) => entry.trim() === `${LOCALE_PREFERENCE_COOKIE_NAME}=1`);
  const storageSet = localStorage.getItem(LOCALE_PREFERENCE_COOKIE_NAME) === '1';

  return cookieSet || storageSet;
}

export default function LocalePreferencePrompt({
  initialHasExplicitPreference,
}: {
  initialHasExplicitPreference: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { locale, setLocale, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(!initialHasExplicitPreference);
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);

  useEffect(() => {
    if (initialHasExplicitPreference) {
      setIsOpen(false);
      return;
    }

    setIsOpen(!hasStoredLocalePreference());
  }, [initialHasExplicitPreference]);

  async function handleSelect(nextLocale: Locale) {
    setPendingLocale(nextLocale);

    try {
      await setLocale(nextLocale);
      setIsOpen(false);

      const currentPath = stripLocalePrefix(pathname || '/');
      const query = searchParams.toString();
      const nextPath = addLocalePrefix(currentPath, nextLocale);

      router.replace(query ? `${nextPath}?${query}` : nextPath);
    } finally {
      setPendingLocale(null);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950 shadow-2xl">
        <div className="border-b border-neutral-800 bg-gradient-to-r from-blue-950/80 to-emerald-950/70 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
              <Languages className="h-5 w-5 text-blue-200" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                {t('localePrompt.title')}
              </h2>
              <p className="mt-1 text-sm text-neutral-300">
                {t('localePrompt.description')}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-6 md:grid-cols-2">
          <button
            type="button"
            onClick={() => handleSelect('en')}
            disabled={Boolean(pendingLocale)}
            className={`rounded-2xl border px-5 py-5 text-left transition-colors ${
              locale === 'en'
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-neutral-800 bg-neutral-900 hover:border-neutral-700 hover:bg-neutral-800'
            } disabled:cursor-not-allowed disabled:opacity-70`}
          >
            <p className="text-base font-semibold text-white">
              {t('localePrompt.englishTitle')}
            </p>
            <p className="mt-2 text-sm text-neutral-400">
              {t('localePrompt.englishDescription')}
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleSelect('fr')}
            disabled={Boolean(pendingLocale)}
            className={`rounded-2xl border px-5 py-5 text-left transition-colors ${
              locale === 'fr'
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-neutral-800 bg-neutral-900 hover:border-neutral-700 hover:bg-neutral-800'
            } disabled:cursor-not-allowed disabled:opacity-70`}
          >
            <p className="text-base font-semibold text-white">
              {t('localePrompt.frenchTitle')}
            </p>
            <p className="mt-2 text-sm text-neutral-400">
              {t('localePrompt.frenchDescription')}
            </p>
          </button>
        </div>

        <div className="border-t border-neutral-800 px-6 py-4">
          <p className="text-xs text-neutral-500">
            {pendingLocale ? t('localePrompt.saving') : t('localePrompt.note')}
          </p>
        </div>
      </div>
    </div>
  );
}

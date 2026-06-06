'use client';

import { useEffect } from 'react';
import { LanguageProvider, type Locale } from '@/lib/i18n';
import LocalePreferencePrompt from '@/components/LocalePreferencePrompt';

export default function ClientLayout({
  children,
  initialLocale,
  initialHasExplicitLocalePreference,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
  initialHasExplicitLocalePreference: boolean;
}) {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Service worker registration failed — non-critical
      });
    }
  }, []);

  return (
    <LanguageProvider initialLocale={initialLocale}>
      {children}
      <LocalePreferencePrompt
        initialHasExplicitPreference={initialHasExplicitLocalePreference}
      />
    </LanguageProvider>
  );
}

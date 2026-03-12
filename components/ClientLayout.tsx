'use client';

import { useEffect } from 'react';
import { LanguageProvider } from '@/lib/i18n';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Service worker registration failed — non-critical
      });
    }
  }, []);

  return (
    <LanguageProvider>
      {children}
    </LanguageProvider>
  );
}

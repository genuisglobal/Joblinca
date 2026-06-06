'use client';

/**
 * Top-level error boundary. Unlike app/error.tsx, this catches errors thrown by
 * the ROOT layout itself (app/layout.tsx) and the client chrome it renders
 * (NavBar, providers) — the gap that previously produced a blank
 * "Application error: a client-side exception has occurred" screen.
 *
 * It replaces the entire document, so it must render its own <html>/<body> and
 * cannot rely on any app provider/styling that may itself be the thing that broke.
 */

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: 'global-error' } });
    // eslint-disable-next-line no-console
    console.error('GlobalError:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f172a',
          color: '#e5e7eb',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          padding: '1rem',
        }}
      >
        <div
          style={{
            maxWidth: '28rem',
            width: '100%',
            backgroundColor: '#1f2937',
            borderRadius: '1rem',
            padding: '2rem',
            textAlign: 'center',
            boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>⚠</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#9ca3af', margin: '0 0 1.5rem' }}>
            The app hit an unexpected error. You can try again or return to the
            home page.
          </p>
          {error?.digest && (
            <p style={{ color: '#6b7280', fontSize: '0.75rem', margin: '0 0 1rem' }}>
              Reference: {error.digest}
            </p>
          )}
          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={() => reset()}
              style={{
                padding: '0.625rem 1.5rem',
                backgroundColor: '#0284c7',
                color: '#fff',
                fontWeight: 500,
                borderRadius: '0.5rem',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: '0.625rem 1.5rem',
                backgroundColor: '#374151',
                color: '#fff',
                fontWeight: 500,
                borderRadius: '0.5rem',
                textDecoration: 'none',
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}

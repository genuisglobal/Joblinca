'use client';

/**
 * Reusable client-side error boundary.
 *
 * React's `error.tsx` route boundaries only wrap a route's page slot — they do
 * NOT catch errors thrown by sibling components rendered directly in a layout
 * (e.g. the NavBar in the root layout) or by client providers. Wrap those
 * subtrees in <ErrorBoundary> so one crashing widget can't blank the whole app.
 *
 * Kept dependency-free (no i18n) on purpose: it must stay functional even when
 * the thing that crashed is a provider the rest of the app relies on.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Fallback UI. If a function, receives the error and a reset callback.
   * If omitted, a minimal inline notice is shown so the rest of the page
   * stays usable. Pass `fallback={null}` to render nothing on error.
   */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /** Short label included in error logs to identify where it failed. */
  label?: string;
  /** Called after an error is caught (for custom logging/telemetry). */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const label = this.props.label ? `[${this.props.label}] ` : '';
    // eslint-disable-next-line no-console
    console.error(`${label}ErrorBoundary caught:`, error, info.componentStack);

    Sentry.captureException(error, {
      tags: { boundary: this.props.label || 'unlabeled' },
      extra: { componentStack: info.componentStack },
    });

    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { fallback } = this.props;

    if (typeof fallback === 'function') {
      return fallback(error, this.reset);
    }
    if (fallback !== undefined) {
      return fallback;
    }

    // Default: unobtrusive inline notice so surrounding content keeps working.
    return (
      <div
        role="alert"
        className="m-2 rounded-lg border border-red-700/60 bg-red-900/20 px-4 py-3 text-sm text-red-200"
      >
        <span className="font-medium">This section failed to load.</span>{' '}
        <button
          type="button"
          onClick={this.reset}
          className="underline underline-offset-2 hover:text-white"
        >
          Retry
        </button>
      </div>
    );
  }
}

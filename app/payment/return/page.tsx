'use client';

/**
 * /payment/return
 *
 * PayUnit redirects users here after a hosted-page payment attempt.
 * Query params:  ?tx=<internal-transaction-uuid>
 *
 * We poll /api/payments/:id/status until we get a terminal state,
 * then show the appropriate success / failure UI.
 */

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

type Stage = 'loading' | 'success' | 'failed' | 'not_found';

export default function PaymentReturnPage() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const txId         = searchParams.get('tx');

  const [stage,    setStage]    = useState<Stage>('loading');
  const [amount,   setAmount]   = useState<number | null>(null);
  const [currency, setCurrency] = useState('XAF');
  const [attempts, setAttempts] = useState(0);

  const MAX_ATTEMPTS = 36; // 3 minutes at 5-second intervals

  const checkStatus = useCallback(async () => {
    if (!txId) {
      setStage('not_found');
      return;
    }

    try {
      const res  = await fetch(`/api/payments/${txId}/status`);
      if (res.status === 404) {
        setStage('not_found');
        return;
      }

      const data = await res.json();

      if (data.status === 'completed') {
        setAmount(data.amount ?? null);
        setCurrency(data.currency ?? 'XAF');
        setStage('success');
        return;
      }

      if (data.status === 'failed') {
        setStage('failed');
        return;
      }

      // Still pending
      setAttempts(prev => {
        const next = prev + 1;
        if (next >= MAX_ATTEMPTS) {
          setStage('failed');
        }
        return next;
      });
    } catch {
      // Network error — keep polling
      setAttempts(prev => prev + 1);
    }
  }, [txId]);

  useEffect(() => {
    if (!txId) {
      setStage('not_found');
      return;
    }

    checkStatus();
    const timer = setInterval(() => {
      setAttempts(prev => {
        if (prev >= MAX_ATTEMPTS) {
          clearInterval(timer);
          return prev;
        }
        return prev;
      });
      checkStatus();
    }, 5000);

    return () => clearInterval(timer);
  }, [txId, checkStatus]);

  // Stop polling when terminal state reached
  useEffect(() => {
    if (stage === 'success' || stage === 'failed' || stage === 'not_found') {
      // Nothing to clear — useEffect cleanup handles the interval
    }
  }, [stage]);

  if (stage === 'loading') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-blue-900/30 flex items-center justify-center mx-auto mb-6 animate-pulse">
            <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">Confirming your payment…</h1>
          <p className="text-gray-400 text-sm">
            Please wait while we verify your payment with the network.
            This usually takes less than a minute.
          </p>
          {attempts > 3 && (
            <p className="text-gray-500 text-xs mt-4">
              Still checking… ({attempts * 5}s elapsed)
            </p>
          )}
        </div>
      </div>
    );
  }

  if (stage === 'success') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-green-900/30 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Payment Successful</h1>
          {amount !== null && (
            <p className="text-gray-300 mb-1">
              <span className="text-green-400 font-semibold">
                {amount.toLocaleString()} {currency}
              </span>{' '}
              received
            </p>
          )}
          <p className="text-gray-400 text-sm mb-8">
            Your account has been updated. You can now access your new features.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/dashboard"
              className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
            >
              Go to Dashboard
            </Link>
            <Link
              href="/pricing"
              className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
            >
              View Plans
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'failed') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-red-900/30 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Payment Not Confirmed</h1>
          <p className="text-gray-400 text-sm mb-8">
            We could not confirm your payment. If money was deducted from your account,
            please contact us with your reference number so we can resolve it manually.
          </p>
          {txId && (
            <p className="text-xs text-gray-600 mb-6 font-mono">
              Ref: {txId.substring(0, 16)}…
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => router.back()}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Try Again
            </button>
            <Link
              href="/"
              className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
            >
              Go Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // not_found
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <h1 className="text-xl font-bold text-white mb-2">Transaction Not Found</h1>
        <p className="text-gray-400 text-sm mb-6">
          We could not find this transaction. Please check your dashboard for your payment status.
        </p>
        <Link
          href="/dashboard"
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}

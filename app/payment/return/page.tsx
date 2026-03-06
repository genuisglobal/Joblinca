'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

type Stage = 'loading' | 'failed' | 'not_found';

interface StatusResponse {
  status: 'pending' | 'completed' | 'failed';
  amount: number | null;
  currency: string | null;
  plan_slug: string | null;
  plan_name: string | null;
  payment_phone: string | null;
  job_id: string | null;
  add_on_slugs: string[];
}

const MAX_ATTEMPTS = 60; // 5 minutes at 5-second intervals
const POLL_INTERVAL_MS = 5000;

function toLocalPhone(raw: string | null): string {
  if (!raw) return '';
  return raw.replace(/^\+?237/, '');
}

export default function PaymentReturnPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const txId = searchParams.get('tx');

  const [stage, setStage] = useState<Stage>('loading');
  const [attempts, setAttempts] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [phone, setPhone] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');

  const checkStatus = useCallback(async () => {
    if (!txId) {
      setStage('not_found');
      return;
    }

    try {
      const res = await fetch(`/api/payments/${txId}/status`);
      if (res.status === 404) {
        setStage('not_found');
        return;
      }

      const data = (await res.json()) as StatusResponse;
      setStatusData(data);
      setPhone((prev) => prev || toLocalPhone(data.payment_phone));

      if (data.status === 'completed') {
        router.replace(`/payment/subscription-active?tx=${encodeURIComponent(txId)}`);
        return;
      }

      if (data.status === 'failed') {
        setStage('failed');
        return;
      }

      setAttempts((prev) => {
        const next = prev + 1;
        if (next >= MAX_ATTEMPTS) {
          setTimedOut(true);
          setStage('failed');
        }
        return next;
      });
    } catch {
      setAttempts((prev) => {
        const next = prev + 1;
        if (next >= MAX_ATTEMPTS) {
          setTimedOut(true);
          setStage('failed');
        }
        return next;
      });
    }
  }, [router, txId]);

  useEffect(() => {
    if (!txId) {
      setStage('not_found');
      return;
    }

    checkStatus();
    const timer = setInterval(() => {
      setAttempts((prev) => {
        if (prev >= MAX_ATTEMPTS) {
          clearInterval(timer);
          return prev;
        }
        return prev;
      });
      checkStatus();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [checkStatus, txId]);

  async function retryPayment(gateway: 'CM_MTNMOMO' | 'CM_ORANGE') {
    if (!statusData?.plan_slug) {
      setRetryError('Plan details were not found for this transaction. Please retry from Pricing.');
      return;
    }

    if (!phone.trim()) {
      setRetryError('Please enter your phone number.');
      return;
    }

    setRetrying(true);
    setRetryError('');

    try {
      const body: Record<string, unknown> = {
        plan_slug: statusData.plan_slug,
        phone_number: phone.trim(),
        gateway,
      };

      if (statusData.job_id) {
        body.job_id = statusData.job_id;
      }

      if (statusData.add_on_slugs?.length) {
        body.add_on_slugs = statusData.add_on_slugs;
      }

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setRetryError(data.error || 'Retry failed. Please try again.');
        return;
      }

      if (data.checkout_url) {
        window.location.assign(data.checkout_url);
        return;
      }

      router.replace(`/payment/return?tx=${encodeURIComponent(data.transaction_id)}`);
    } catch {
      setRetryError('Retry failed. Please try again.');
    } finally {
      setRetrying(false);
    }
  }

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
          <h1 className="text-xl font-semibold text-white mb-2">Confirming your payment...</h1>
          <p className="text-gray-400 text-sm">
            Please wait while we verify your payment with the network.
          </p>
          {attempts > 3 && (
            <p className="text-gray-500 text-xs mt-4">
              Still checking... ({attempts * 5}s elapsed)
            </p>
          )}
        </div>
      </div>
    );
  }

  if (stage === 'failed') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              {timedOut ? 'Payment Still Pending' : 'Payment Not Confirmed'}
            </h1>
            <p className="text-gray-400 text-sm">
              {timedOut
                ? 'The network took too long to confirm. You can retry with an edited number.'
                : 'You can edit your number and retry now.'}
            </p>
            {txId && (
              <p className="text-xs text-gray-600 mt-3 font-mono">
                Ref: {txId.substring(0, 16)}...
              </p>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Phone Number</label>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm bg-gray-900 px-3 py-2.5 rounded-lg border border-gray-700">
                  +237
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="6XXXXXXXX"
                  maxLength={9}
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
              {statusData?.plan_name && (
                <p className="text-xs text-gray-500 mt-1">
                  Retrying plan: {statusData.plan_name}
                </p>
              )}
            </div>

            {retryError && (
              <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
                <p className="text-sm text-red-400">{retryError}</p>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                onClick={() => retryPayment('CM_MTNMOMO')}
                disabled={retrying}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                {retrying ? 'Retrying...' : 'Retry with MTN'}
              </button>
              <button
                onClick={() => retryPayment('CM_ORANGE')}
                disabled={retrying}
                className="w-full py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                {retrying ? 'Retrying...' : 'Retry with Orange'}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link
                href="/pricing"
                className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-center text-sm font-medium transition-colors"
              >
                Go to Pricing
              </Link>
              <Link
                href="/"
                className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-center text-sm font-medium transition-colors"
              >
                Go Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

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

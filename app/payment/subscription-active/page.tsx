'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface SubscriptionData {
  isActive: boolean;
  plan: {
    id: string;
    slug: string;
    name: string;
    role: string;
    plan_type: string;
    features: unknown[];
  } | null;
  expiresAt: string | null;
  daysRemaining: number;
  subscriptionId: string | null;
}

interface PaymentStatusData {
  status: 'pending' | 'completed' | 'failed';
  amount: number | null;
  currency: string | null;
  plan_name: string | null;
}

export default function SubscriptionActivePage() {
  const searchParams = useSearchParams();
  const txId = searchParams.get('tx');

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [payment, setPayment] = useState<PaymentStatusData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let attempts = 0;

    async function fetchData(): Promise<{
      sub: SubscriptionData | null;
      pay: PaymentStatusData | null;
    }> {
      const [subRes, paymentRes] = await Promise.all([
        fetch('/api/subscriptions/me'),
        txId ? fetch(`/api/payments/${txId}/status`) : Promise.resolve(null),
      ]);

      const subJson = (await subRes.json()) as SubscriptionData;
      const paymentJson = paymentRes
        ? ((await paymentRes.json()) as PaymentStatusData)
        : null;

      if (!cancelled) {
        setSubscription(subJson);
        setPayment(paymentJson);
        setFailed(paymentJson?.status === 'failed');
        setLoading(false);
      }

      return { sub: subJson, pay: paymentJson };
    }

    async function initialLoad() {
      try {
        const { sub, pay } = await fetchData();

        if (!txId || cancelled) {
          setSyncing(false);
          return;
        }

        if (sub?.isActive || pay?.status === 'failed') {
          setSyncing(false);
          return;
        }

        setSyncing(true);
        pollTimer = setInterval(async () => {
          attempts += 1;

          try {
            const { sub: latestSub, pay: latestPay } = await fetchData();

            if (attempts >= 12 || latestSub?.isActive || latestPay?.status === 'failed') {
              if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
              }
              if (!cancelled) {
                setSyncing(false);
              }
            }
          } catch {
            if (attempts >= 12 && !cancelled) {
              if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
              }
              setSyncing(false);
            }
          }
        }, 5000);
      } catch {
        if (!cancelled) {
          setLoading(false);
          setSyncing(false);
        }
      }
    }

    initialLoad();

    return () => {
      cancelled = true;
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, [txId]);

  const planName = useMemo(() => {
    return subscription?.plan?.name || payment?.plan_name || 'Premium Plan';
  }, [payment?.plan_name, subscription?.plan?.name]);

  const expiryLabel = useMemo(() => {
    if (!subscription?.isActive) {
      return 'Syncing...';
    }
    if (!subscription.expiresAt) {
      return 'No expiry';
    }
    return new Date(subscription.expiresAt).toLocaleDateString();
  }, [subscription]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-green-900/30 flex items-center justify-center mx-auto mb-6 animate-pulse">
            <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">Activating your subscription...</h1>
          <p className="text-gray-400 text-sm">Please wait while we complete final checks.</p>
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-gray-800 border border-gray-700 rounded-xl p-6 text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Payment Not Confirmed</h1>
          <p className="text-gray-400 text-sm mb-6">
            We could not confirm this payment. You can retry from Pricing or return to your dashboard.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/pricing"
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Retry Payment
            </Link>
            <Link
              href="/dashboard"
              className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-lg w-full bg-gray-800 border border-gray-700 rounded-xl p-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-green-900/30 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Subscription Active</h1>
          <p className="text-gray-400 text-sm">
            Your payment was received and your account is now upgraded.
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Plan</span>
            <span className="text-white font-medium">{planName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Expiry date</span>
            <span className="text-white font-medium">{expiryLabel}</span>
          </div>
          {payment?.amount !== null && payment?.amount !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">Amount paid</span>
              <span className="text-green-400 font-semibold">
                {payment.amount.toLocaleString()} {payment.currency || 'XAF'}
              </span>
            </div>
          )}
          {txId && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">Reference</span>
              <span className="text-xs text-gray-300 font-mono">{txId.substring(0, 16)}...</span>
            </div>
          )}
        </div>

        {syncing && (
          <p className="text-xs text-gray-500 text-center mb-4">
            Syncing final subscription details...
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            href="/dashboard"
            className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors text-center"
          >
            Dashboard
          </Link>
          <Link
            href="/"
            className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors text-center"
          >
            Homepage
          </Link>
          <Link
            href="/dashboard/subscription"
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-center"
          >
            Billing
          </Link>
        </div>
      </div>
    </div>
  );
}

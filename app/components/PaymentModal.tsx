'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  calculateChargeBreakdown,
  getProcessingFeePercentClient,
} from '@/lib/payments/fees';

interface Plan {
  id: string;
  slug: string;
  name: string;
  amount_xaf: number;
  duration_days: number | null;
}

interface PaymentModalProps {
  plan: Plan;
  jobId?: string;
  addOnSlugs?: string[];
  onClose: () => void;
  onSuccess?: () => void;
}

type PaymentStatus =
  | 'idle'
  | 'validating'
  | 'processing'
  | 'polling'
  | 'success'
  | 'failed';

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const FALLBACK_REDIRECT_MS = 60 * 1000;

export default function PaymentModal({
  plan,
  jobId,
  addOnSlugs,
  onClose,
  onSuccess,
}: PaymentModalProps) {
  const [phone, setPhone] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoResult, setPromoResult] = useState<{
    valid: boolean;
    discount_amount: number;
    final_amount: number;
    processing_fee_percent?: number;
    processing_fee_amount?: number;
    total_amount?: number;
    reason?: string;
  } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [error, setError] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [carrier, setCarrier] = useState('');

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopPollingRef = useRef(false);

  const subtotalAmount = promoResult?.valid ? promoResult.final_amount : plan.amount_xaf;
  const configuredFeePercent = getProcessingFeePercentClient();
  const activeFeePercent =
    promoResult?.valid && typeof promoResult.processing_fee_percent === 'number'
      ? promoResult.processing_fee_percent
      : configuredFeePercent;
  const computedCharge = calculateChargeBreakdown(subtotalAmount, activeFeePercent);
  const processingFeeAmount =
    promoResult?.valid && typeof promoResult.processing_fee_amount === 'number'
      ? promoResult.processing_fee_amount
      : computedCharge.processingFeeAmount;
  const totalAmount =
    promoResult?.valid && typeof promoResult.total_amount === 'number'
      ? promoResult.total_amount
      : computedCharge.totalAmount;
  const feePercentLabel = Number.isInteger(activeFeePercent)
    ? String(activeFeePercent)
    : activeFeePercent.toFixed(2);

  const clearTimers = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  const goToTrackingPage = useCallback((txId: string) => {
    window.location.assign(`/payment/return?tx=${encodeURIComponent(txId)}`);
  }, []);

  const goToSubscriptionActivePage = useCallback((txId: string) => {
    window.location.assign(
      `/payment/subscription-active?tx=${encodeURIComponent(txId)}`
    );
  }, []);

  useEffect(() => {
    return () => {
      stopPollingRef.current = true;
      clearTimers();
    };
  }, [clearTimers]);

  // Auto-detect carrier from phone number (buttons still allow manual override).
  useEffect(() => {
    const cleaned = phone.replace(/[\s\-()]/g, '').replace(/^\+?237/, '');
    if (cleaned.length < 3) {
      setCarrier('');
      return;
    }
    const prefix3 = cleaned.substring(0, 3);
    const prefix2 = cleaned.substring(0, 2);
    const prefixNum = parseInt(prefix3, 10);

    if (
      prefix2 === '67' ||
      (prefixNum >= 650 && prefixNum <= 654) ||
      (prefixNum >= 680 && prefixNum <= 689)
    ) {
      setCarrier('MTN MoMo');
    } else if (prefix2 === '69' || (prefixNum >= 655 && prefixNum <= 659)) {
      setCarrier('Orange Money');
    } else {
      setCarrier('');
    }
  }, [phone]);

  async function validatePromo() {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoResult(null);
    try {
      const res = await fetch('/api/promo-codes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCode, plan_slug: plan.slug }),
      });
      const data = await res.json();
      setPromoResult(data);
    } catch {
      setPromoResult({
        valid: false,
        discount_amount: 0,
        final_amount: plan.amount_xaf,
        reason: 'Validation failed',
      });
    } finally {
      setPromoLoading(false);
    }
  }

  const pollStatus = useCallback(
    async (txId: string) => {
      clearTimers();
      stopPollingRef.current = false;
      const startedAt = Date.now();

      fallbackTimerRef.current = setTimeout(() => {
        if (!stopPollingRef.current) {
          goToTrackingPage(txId);
        }
      }, FALLBACK_REDIRECT_MS);

      const poll = async () => {
        if (stopPollingRef.current) {
          return;
        }

        if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
          stopPollingRef.current = true;
          clearTimers();
          setStatus('failed');
          setError(
            'Payment timed out. You can edit your number and retry, or continue tracking this payment.'
          );
          return;
        }

        try {
          const res = await fetch(`/api/payments/${txId}/status`);
          const data = await res.json();

          if (data.status === 'completed') {
            stopPollingRef.current = true;
            clearTimers();
            setStatus('success');
            onSuccess?.();
            goToSubscriptionActivePage(txId);
            return;
          }

          if (data.status === 'failed') {
            stopPollingRef.current = true;
            clearTimers();
            setStatus('failed');
            setError(
              'Payment was not confirmed. Edit your number if needed and retry.'
            );
            return;
          }
        } catch {
          // Ignore and continue polling.
        }

        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      };

      await poll();
    },
    [clearTimers, goToSubscriptionActivePage, goToTrackingPage, onSuccess]
  );

  async function handlePayment(gatewayOverride?: string) {
    if (!phone.trim()) {
      setError('Please enter your phone number');
      return;
    }

    stopPollingRef.current = false;
    clearTimers();
    setError('');
    setStatus('processing');

    try {
      const body: Record<string, unknown> = {
        plan_slug: plan.slug,
        phone_number: phone,
      };
      if (promoCode.trim() && promoResult?.valid) {
        body.promo_code = promoCode.trim();
      }
      if (gatewayOverride) {
        body.gateway = gatewayOverride;
      }
      if (jobId) {
        body.job_id = jobId;
      }
      if (addOnSlugs && addOnSlugs.length > 0) {
        body.add_on_slugs = addOnSlugs;
      }

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus('failed');
        setError(data.error || 'Payment failed');
        return;
      }

      if (data.checkout_url) {
        window.location.assign(data.checkout_url);
        return;
      }

      setTransactionId(data.transaction_id);
      setStatus('polling');
      await pollStatus(data.transaction_id);
    } catch {
      setStatus('failed');
      setError('Something went wrong. Please try again.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Complete Payment</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            disabled={status === 'processing' || status === 'polling'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-sm text-gray-400">Plan</p>
            <p className="text-white font-medium">{plan.name}</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-white">
                {totalAmount.toLocaleString()} CFA
              </span>
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex items-center justify-between text-gray-400">
                <span>Base price</span>
                <span>{plan.amount_xaf.toLocaleString()} CFA</span>
              </div>
              {promoResult?.valid && promoResult.discount_amount > 0 && (
                <div className="flex items-center justify-between text-green-400">
                  <span>Discount</span>
                  <span>-{promoResult.discount_amount.toLocaleString()} CFA</span>
                </div>
              )}
              <div className="flex items-center justify-between text-gray-300">
                <span>Subtotal</span>
                <span>{subtotalAmount.toLocaleString()} CFA</span>
              </div>
              <div className="flex items-center justify-between text-gray-300">
                <span>Processing fee ({feePercentLabel}%)</span>
                <span>+{processingFeeAmount.toLocaleString()} CFA</span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-700 pt-2 text-white font-semibold">
                <span>Total to pay</span>
                <span>{totalAmount.toLocaleString()} CFA</span>
              </div>
            </div>
          </div>

          {status === 'success' ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-1">Payment Confirmed</h3>
              <p className="text-gray-400 text-sm">
                Redirecting you to your active subscription page...
              </p>
            </div>
          ) : status === 'polling' ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-1">Waiting for Payment</h3>
              <p className="text-gray-400 text-sm">
                Check your phone for the {carrier || 'Mobile Money'} prompt and approve the payment.
              </p>
              <p className="text-xs text-gray-500 mt-2">
                If confirmation takes longer than 1 minute, we will continue this flow on a dedicated tracking page.
              </p>
              {transactionId && (
                <p className="text-xs text-gray-600 mt-2">
                  Ref: {transactionId.substring(0, 8)}
                </p>
              )}
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  Phone Number
                </label>
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
                    disabled={status === 'processing'}
                  />
                </div>
                {carrier && (
                  <p className="text-xs text-gray-500 mt-1">
                    Detected: {carrier}. You can still choose a different network below.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  Promo Code (optional)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => {
                      setPromoCode(e.target.value.toUpperCase());
                      setPromoResult(null);
                    }}
                    placeholder="ENTER CODE"
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none uppercase"
                    disabled={status === 'processing'}
                  />
                  <button
                    onClick={validatePromo}
                    disabled={!promoCode.trim() || promoLoading || status === 'processing'}
                    className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {promoLoading ? 'Checking...' : 'Apply'}
                  </button>
                </div>
                {promoResult && (
                  <p
                    className={`text-xs mt-1 ${
                      promoResult.valid ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {promoResult.valid
                      ? `Discount applied: -${promoResult.discount_amount.toLocaleString()} CFA`
                      : promoResult.reason || 'Invalid promo code'}
                  </p>
                )}
              </div>

              {error && (
                <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 space-y-2">
                  <p className="text-sm text-red-400">{error}</p>
                  {transactionId && (
                    <button
                      type="button"
                      onClick={() => goToTrackingPage(transactionId)}
                      className="text-xs text-blue-300 hover:text-blue-200 underline"
                    >
                      Continue tracking this payment
                    </button>
                  )}
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  onClick={() => handlePayment('CM_MTNMOMO')}
                  disabled={status === 'processing' || !phone.trim()}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {status === 'processing' ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Processing...
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center justify-center h-6 w-6 rounded bg-white/10">
                        <img
                          src="/partners/mtn.png"
                          alt="MTN"
                          className="h-4 w-4 object-contain"
                        />
                      </span>
                      Pay {totalAmount.toLocaleString()} CFA with MTN
                    </>
                  )}
                </button>
                <button
                  onClick={() => handlePayment('CM_ORANGE')}
                  disabled={status === 'processing' || !phone.trim()}
                  className="w-full py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {status === 'processing' ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Processing...
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center justify-center h-6 w-6 rounded bg-white/10">
                        <img
                          src="/partners/orange.png"
                          alt="Orange"
                          className="h-4 w-4 object-contain"
                        />
                      </span>
                      Pay {totalAmount.toLocaleString()} CFA with Orange
                    </>
                  )}
                </button>
              </div>

              <p className="text-xs text-gray-500 text-center">
                Secure payment via Payunit (MTN MoMo / Orange Money)
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

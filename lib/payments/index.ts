/**
 * Payment orchestration layer.
 *
 * Coordinates between pricing plans, promo code validation, Payunit,
 * and the transactions / subscriptions tables.
 */

import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  buildPayunitTransactionId,
  getPayunitRuntimeInfo,
  initializePayment,
  makePayment,
  normalizePhone,
  resolveGateway,
  shouldUseHostedCheckoutFallback,
} from './payunit';
import {
  calculateChargeBreakdown,
  getProcessingFeePercentServer,
} from './fees';
import { getPayableHireFee } from '@/lib/vetting/hires';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubscriptionPaymentParams {
  userId: string;
  planSlug: string;
  phoneNumber: string;
  promoCode?: string;
  gateway?: string;
}

export interface JobTierPaymentParams {
  userId: string;
  jobId: string;
  planSlug: string;
  phoneNumber: string;
  addOnSlugs?: string[];
  promoCode?: string;
  gateway?: string;
}

export interface PaymentResult {
  transactionId: string;
  reference: string;
  amount: number;
  originalAmount: number;
  discountAmount: number;
  subtotalAmount: number;
  processingFeeAmount: number;
  processingFeePercent: number;
  currency: string;
  checkoutUrl?: string;
}

export interface PromoValidationResult {
  valid: boolean;
  discount_type?: string;
  discount_value?: number;
  max_discount?: number;
  promo_code_id?: string;
  reason?: string;
}

export interface DiscountResult {
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
}

const RECRUITER_PER_JOB_BASE_PLAN_SLUGS = new Set([
  'job_tier1_diy',
  'job_tier2_shortlist',
  'job_tier2_pay_per_result',
]);

const ALLOWED_ADD_ONS_BY_BASE_PLAN: Record<string, string[]> = {
  job_tier1_diy: ['job_tier1_featured'],
  job_tier2_shortlist: [],
  job_tier2_pay_per_result: [],
};

function logHostedCheckoutFallback(
  flow: 'subscription' | 'job_tier' | 'hire_fee',
  internalTransactionId: string,
  payunitTransactionId: string,
  gateway: string,
  checkoutUrl: string,
  error: unknown
) {
  console.warn('Payunit makepayment failed; using hosted checkout fallback', {
    flow,
    internalTransactionId,
    payunitTransactionId,
    gateway,
    checkoutUrl,
    error: error instanceof Error ? error.message : 'Unknown error',
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function normalizeUrlEnv(value?: string): string | null {
  const normalized = (value || '').trim();
  if (!normalized) {
    return null;
  }

  return normalized.replace(/\/+$/, '');
}

function buildPayunitUrls(transactionId: string) {
  const appUrl = normalizeUrlEnv(process.env.NEXT_PUBLIC_APP_URL) || 'http://localhost:3000';
  const notifyUrl =
    normalizeUrlEnv(process.env.PAYUNIT_NOTIFY_URL) ||
    `${appUrl}/api/payments/webhook`;
  const configuredReturnUrl = normalizeUrlEnv(process.env.PAYUNIT_RETURN_URL);

  return {
    notifyUrl,
    returnUrl:
      configuredReturnUrl ||
      `${appUrl}/payment/return?tx=${transactionId}`,
  };
}

// ---------------------------------------------------------------------------
// Discount calculation
// ---------------------------------------------------------------------------

export function calculateDiscount(
  amount: number,
  promo: PromoValidationResult
): DiscountResult {
  if (!promo.valid || !promo.discount_type || !promo.discount_value) {
    return { originalAmount: amount, discountAmount: 0, finalAmount: amount };
  }

  let discount = 0;
  if (promo.discount_type === 'percentage') {
    discount = Math.round((amount * promo.discount_value) / 100);
  } else {
    discount = promo.discount_value;
  }

  // Cap at max_discount if specified
  if (promo.max_discount && discount > promo.max_discount) {
    discount = promo.max_discount;
  }

  // Never discount more than the total
  if (discount > amount) {
    discount = amount;
  }

  return {
    originalAmount: amount,
    discountAmount: discount,
    finalAmount: amount - discount,
  };
}

// ---------------------------------------------------------------------------
// Promo code validation (calls DB function)
// ---------------------------------------------------------------------------

export async function validatePromoCode(
  code: string,
  planSlug: string,
  userId: string
): Promise<PromoValidationResult> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc('validate_promo_code', {
    p_code: code,
    p_plan_slug: planSlug,
    p_user_id: userId,
  });

  if (error) {
    return { valid: false, reason: 'Failed to validate promo code' };
  }

  return data as PromoValidationResult;
}

// ---------------------------------------------------------------------------
// Initiate subscription payment
// ---------------------------------------------------------------------------

export async function initiateSubscriptionPayment(
  params: SubscriptionPaymentParams
): Promise<PaymentResult> {
  const supabase = createServiceSupabaseClient();

  // 1. Fetch the plan
  const { data: plan, error: planError } = await supabase
    .from('pricing_plans')
    .select('*')
    .eq('slug', params.planSlug)
    .eq('is_active', true)
    .single();

  if (planError || !plan) {
    throw new Error('Plan not found or inactive');
  }

  // 2. Validate promo code if provided
  let promoResult: PromoValidationResult = { valid: false };
  if (params.promoCode) {
    promoResult = await validatePromoCode(
      params.promoCode,
      params.planSlug,
      params.userId
    );
    if (!promoResult.valid) {
      throw new Error(promoResult.reason || 'Invalid promo code');
    }
  }

  // 3. Calculate final amount
  const { originalAmount, discountAmount, finalAmount } = calculateDiscount(
    plan.amount_xaf,
    promoResult
  );

  const processingFeePercent = getProcessingFeePercentServer();
  const charge = calculateChargeBreakdown(finalAmount, processingFeePercent);

  if (charge.totalAmount <= 0) {
    throw new Error('Final amount must be greater than zero');
  }

  // 4. Create pending transaction
  const phone = normalizePhone(params.phoneNumber);
  const gateway = resolveGateway(phone, params.gateway);
  const payunitRuntime = getPayunitRuntimeInfo();
  const metadata = {
    plan_slug: params.planSlug,
    plan_type: plan.plan_type,
    role: plan.role,
    billing: {
      subtotal_amount: charge.subtotalAmount,
      processing_fee_percent: charge.processingFeePercent,
      processing_fee_amount: charge.processingFeeAmount,
      total_amount: charge.totalAmount,
    },
    payunit: {
      stage: 'created',
      gateway,
      proxy_enabled: payunitRuntime.proxyEnabled,
      proxy_configured: payunitRuntime.proxyConfigured,
      proxy_in_use: payunitRuntime.proxyInUse,
      proxy_target: payunitRuntime.proxyTarget,
      mode: payunitRuntime.mode,
      base_url: payunitRuntime.baseUrl,
    },
  };

  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .insert({
      user_id: params.userId,
      amount: charge.totalAmount,
      currency: 'XAF',
      description: `Subscription: ${plan.name}`,
      status: 'pending',
      provider: 'payunit',
      plan_id: plan.id,
      promo_code_id: promoResult.valid ? promoResult.promo_code_id : null,
      payment_phone: phone,
      original_amount: originalAmount,
      discount_amount: discountAmount,
      metadata,
    })
    .select('id')
    .single();

  if (txError || !transaction) {
    throw new Error('Failed to create transaction record');
  }

  const { notifyUrl, returnUrl } = buildPayunitUrls(transaction.id);
  const payunitTransactionId = buildPayunitTransactionId(transaction.id);

  // 5. Initialize Payunit transaction
  let initResult;

  try {
    initResult = await initializePayment({
      amount: charge.totalAmount,
      currency: 'XAF',
      transactionId: payunitTransactionId,
      returnUrl,
      notifyUrl,
      paymentCountry: 'CM',
    });
  } catch (error) {
    await supabase
      .from('transactions')
      .update({
        metadata: {
          ...metadata,
          payunit: {
            ...(metadata.payunit as Record<string, unknown>),
            stage: 'initialize_failed',
            last_error: getErrorMessage(error),
          },
        },
      })
      .eq('id', transaction.id);

    throw error;
  }

  if (initResult.providers?.length) {
    const supported = initResult.providers.some(
      (provider) => provider.shortcode === gateway
    );
    if (!supported) {
      throw new Error(`Payment gateway ${gateway} is not available.`);
    }
  }

  const payunitMetadata = {
    ...(metadata.payunit as Record<string, unknown>),
    stage: 'initialized',
    transaction_id: payunitTransactionId,
    gateway,
    transaction_url: initResult.transaction_url,
  };

  // 6. Store Payunit reference immediately so hosted checkout/webhooks can reconcile
  await supabase
    .from('transactions')
    .update({
      provider_reference: payunitTransactionId,
      metadata: {
        ...metadata,
        payunit: payunitMetadata,
      },
    })
    .eq('id', transaction.id);

  // 7. Trigger mobile money push. If the direct push is blocked upstream,
  // fall back to Payunit's hosted checkout page instead of failing the flow.
  try {
    const payunitResult = await makePayment({
      amount: charge.totalAmount,
      currency: 'XAF',
      transactionId: payunitTransactionId,
      phoneNumber: phone,
      returnUrl,
      notifyUrl,
      gateway,
      paymentType: 'button',
    });

    await supabase
      .from('transactions')
      .update({
        metadata: {
          ...metadata,
          payunit: {
            ...payunitMetadata,
            gateway: payunitResult.gateway || gateway,
            t_id: payunitResult.t_id,
            payment_status: payunitResult.payment_status,
          },
        },
      })
      .eq('id', transaction.id);
  } catch (error) {
    await supabase
      .from('transactions')
      .update({
        metadata: {
          ...metadata,
          payunit: {
            ...payunitMetadata,
            stage: 'makepayment_failed',
            last_error: getErrorMessage(error),
          },
        },
      })
      .eq('id', transaction.id);

    if (initResult.transaction_url && shouldUseHostedCheckoutFallback(error)) {
      logHostedCheckoutFallback(
        'subscription',
        transaction.id,
        payunitTransactionId,
        gateway,
        initResult.transaction_url,
        error
      );

      return {
        transactionId: transaction.id,
        reference: payunitTransactionId,
        amount: charge.totalAmount,
        originalAmount,
        discountAmount,
        subtotalAmount: charge.subtotalAmount,
        processingFeeAmount: charge.processingFeeAmount,
        processingFeePercent: charge.processingFeePercent,
        currency: 'XAF',
        checkoutUrl: initResult.transaction_url,
      };
    }

    throw error;
  }

  return {
    transactionId: transaction.id,
    reference: payunitTransactionId,
    amount: charge.totalAmount,
    originalAmount,
    discountAmount,
    subtotalAmount: charge.subtotalAmount,
    processingFeeAmount: charge.processingFeeAmount,
    processingFeePercent: charge.processingFeePercent,
    currency: 'XAF',
  };
}

// ---------------------------------------------------------------------------
// Initiate job tier payment
// ---------------------------------------------------------------------------

export async function initiateJobTierPayment(
  params: JobTierPaymentParams
): Promise<PaymentResult> {
  const supabase = createServiceSupabaseClient();

  // 1. Fetch the main plan
  const { data: plan, error: planError } = await supabase
    .from('pricing_plans')
    .select('*')
    .eq('slug', params.planSlug)
    .eq('is_active', true)
    .single();

  if (planError || !plan) {
    throw new Error('Plan not found or inactive');
  }
  if (plan.role !== 'recruiter' || plan.plan_type !== 'per_job') {
    throw new Error('Invalid recruiter job tier plan');
  }
  if (!RECRUITER_PER_JOB_BASE_PLAN_SLUGS.has(plan.slug)) {
    throw new Error('This recruiter plan is not available');
  }

  const requestedAddOnSlugs = Array.from(
    new Set(
      (params.addOnSlugs || [])
        .map((slug) => String(slug || '').trim())
        .filter(Boolean)
    )
  );
  const allowedAddOnSlugs = new Set(ALLOWED_ADD_ONS_BY_BASE_PLAN[plan.slug] || []);
  const invalidAddOns = requestedAddOnSlugs.filter(
    (slug) => !allowedAddOnSlugs.has(slug)
  );
  if (invalidAddOns.length > 0) {
    throw new Error('Selected add-ons are not available for this plan');
  }

  // 2. Fetch add-on plans if any
  let totalAmount = plan.amount_xaf;
  const addOnIds: string[] = [];

  if (requestedAddOnSlugs.length > 0) {
    const { data: addOns } = await supabase
      .from('pricing_plans')
      .select('*')
      .in('slug', requestedAddOnSlugs)
      .eq('is_active', true)
      .eq('role', 'recruiter')
      .eq('plan_type', 'per_job');

    if (!addOns || addOns.length !== requestedAddOnSlugs.length) {
      throw new Error('One or more add-ons are no longer available');
    }

    for (const addOn of addOns) {
      totalAmount += addOn.amount_xaf;
      addOnIds.push(addOn.id);
    }
  }

  // 3. Validate promo code if provided
  let promoResult: PromoValidationResult = { valid: false };
  if (params.promoCode) {
    promoResult = await validatePromoCode(
      params.promoCode,
      params.planSlug,
      params.userId
    );
    if (!promoResult.valid) {
      throw new Error(promoResult.reason || 'Invalid promo code');
    }
  }

  // 4. Calculate final amount
  const { originalAmount, discountAmount, finalAmount } = calculateDiscount(
    totalAmount,
    promoResult
  );

  const processingFeePercent = getProcessingFeePercentServer();
  const charge = calculateChargeBreakdown(finalAmount, processingFeePercent);

  if (charge.totalAmount <= 0) {
    throw new Error('Final amount must be greater than zero');
  }

  return chargeWithPayunit({
    flow: 'job_tier',
    userId: params.userId,
    phoneNumber: params.phoneNumber,
    gateway: params.gateway,
    charge,
    originalAmount,
    discountAmount,
    transaction: {
      description: `Job Tier: ${plan.name}`,
      plan_id: plan.id,
      job_id: params.jobId,
      promo_code_id: promoResult.valid ? promoResult.promo_code_id : null,
    },
    metadata: {
      plan_slug: params.planSlug,
      plan_type: plan.plan_type,
      role: plan.role,
      add_on_slugs: requestedAddOnSlugs,
      add_on_ids: addOnIds,
    },
  });
}

// ---------------------------------------------------------------------------
// Pay a hire fee (pay-per-result balance or success fee)
// ---------------------------------------------------------------------------

export interface HireFeePaymentParams {
  userId: string;
  hireFeeId: string;
  phoneNumber: string;
  gateway?: string;
}

export async function initiateHireFeePayment(
  params: HireFeePaymentParams
): Promise<PaymentResult> {
  const fee = await getPayableHireFee(
    createServiceSupabaseClient(),
    params.hireFeeId,
    params.userId
  );

  const charge = calculateChargeBreakdown(fee.amountXaf, getProcessingFeePercentServer());

  return chargeWithPayunit({
    flow: 'hire_fee',
    userId: params.userId,
    phoneNumber: params.phoneNumber,
    gateway: params.gateway,
    charge,
    originalAmount: fee.amountXaf,
    discountAmount: 0,
    transaction: {
      description:
        fee.feeType === 'success_fee' ? 'Success fee: shortlist hire' : 'Pay-per-result balance',
      job_id: fee.jobId,
    },
    metadata: {
      flow: 'hire_fee',
      hire_fee_id: fee.id,
      fee_type: fee.feeType,
    },
  });
}

// ---------------------------------------------------------------------------
// Shared PayUnit charge: pending transaction, initialise, mobile money push
// (hosted checkout fallback). Used by job tiers and hire fees.
// ---------------------------------------------------------------------------

interface PayunitChargeParams {
  flow: 'job_tier' | 'hire_fee';
  userId: string;
  phoneNumber: string;
  gateway?: string;
  charge: ReturnType<typeof calculateChargeBreakdown>;
  originalAmount: number;
  discountAmount: number;
  /** Extra transaction columns (description, plan_id, job_id, promo_code_id). */
  transaction: Record<string, unknown>;
  /** Flow-specific metadata; billing and payunit details are added here. */
  metadata: Record<string, unknown>;
}

async function chargeWithPayunit(params: PayunitChargeParams): Promise<PaymentResult> {
  const supabase = createServiceSupabaseClient();
  const charge = params.charge;
  const originalAmount = params.originalAmount;
  const discountAmount = params.discountAmount;
  const phone = normalizePhone(params.phoneNumber);
  const gateway = resolveGateway(phone, params.gateway);
  const payunitRuntime = getPayunitRuntimeInfo();
  const metadata = {
    ...params.metadata,
    billing: {
      subtotal_amount: charge.subtotalAmount,
      processing_fee_percent: charge.processingFeePercent,
      processing_fee_amount: charge.processingFeeAmount,
      total_amount: charge.totalAmount,
    },
    payunit: {
      stage: 'created',
      gateway,
      proxy_enabled: payunitRuntime.proxyEnabled,
      proxy_configured: payunitRuntime.proxyConfigured,
      proxy_in_use: payunitRuntime.proxyInUse,
      proxy_target: payunitRuntime.proxyTarget,
      mode: payunitRuntime.mode,
      base_url: payunitRuntime.baseUrl,
    },
  };

  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .insert({
      ...params.transaction,
      user_id: params.userId,
      amount: charge.totalAmount,
      currency: 'XAF',
      status: 'pending',
      provider: 'payunit',
      payment_phone: phone,
      original_amount: originalAmount,
      discount_amount: discountAmount,
      metadata,
    })
    .select('id')
    .single();

  if (txError || !transaction) {
    throw new Error('Failed to create transaction record');
  }

  const { notifyUrl, returnUrl } = buildPayunitUrls(transaction.id);
  const payunitTransactionId = buildPayunitTransactionId(transaction.id);

  // 6. Initialize Payunit transaction
  let initResult;

  try {
    initResult = await initializePayment({
      amount: charge.totalAmount,
      currency: 'XAF',
      transactionId: payunitTransactionId,
      returnUrl,
      notifyUrl,
      paymentCountry: 'CM',
    });
  } catch (error) {
    await supabase
      .from('transactions')
      .update({
        metadata: {
          ...metadata,
          payunit: {
            ...(metadata.payunit as Record<string, unknown>),
            stage: 'initialize_failed',
            last_error: getErrorMessage(error),
          },
        },
      })
      .eq('id', transaction.id);

    throw error;
  }

  if (initResult.providers?.length) {
    const supported = initResult.providers.some(
      (provider) => provider.shortcode === gateway
    );
    if (!supported) {
      throw new Error(`Payment gateway ${gateway} is not available.`);
    }
  }

  const payunitMetadata = {
    ...(metadata.payunit as Record<string, unknown>),
    stage: 'initialized',
    transaction_id: payunitTransactionId,
    gateway,
    transaction_url: initResult.transaction_url,
  };

  // 7. Store Payunit reference immediately so hosted checkout/webhooks can reconcile
  await supabase
    .from('transactions')
    .update({
      provider_reference: payunitTransactionId,
      metadata: {
        ...metadata,
        payunit: payunitMetadata,
      },
    })
    .eq('id', transaction.id);

  // 8. Trigger mobile money push. If the direct push is blocked upstream,
  // fall back to Payunit's hosted checkout page instead of failing the flow.
  try {
    const payunitResult = await makePayment({
      amount: charge.totalAmount,
      currency: 'XAF',
      transactionId: payunitTransactionId,
      phoneNumber: phone,
      returnUrl,
      notifyUrl,
      gateway,
      paymentType: 'button',
    });

    await supabase
      .from('transactions')
      .update({
        metadata: {
          ...metadata,
          payunit: {
            ...payunitMetadata,
            gateway: payunitResult.gateway || gateway,
            t_id: payunitResult.t_id,
            payment_status: payunitResult.payment_status,
          },
        },
      })
      .eq('id', transaction.id);
  } catch (error) {
    await supabase
      .from('transactions')
      .update({
        metadata: {
          ...metadata,
          payunit: {
            ...payunitMetadata,
            stage: 'makepayment_failed',
            last_error: getErrorMessage(error),
          },
        },
      })
      .eq('id', transaction.id);

    if (initResult.transaction_url && shouldUseHostedCheckoutFallback(error)) {
      logHostedCheckoutFallback(
        params.flow,
        transaction.id,
        payunitTransactionId,
        gateway,
        initResult.transaction_url,
        error
      );

      return {
        transactionId: transaction.id,
        reference: payunitTransactionId,
        amount: charge.totalAmount,
        originalAmount,
        discountAmount,
        subtotalAmount: charge.subtotalAmount,
        processingFeeAmount: charge.processingFeeAmount,
        processingFeePercent: charge.processingFeePercent,
        currency: 'XAF',
        checkoutUrl: initResult.transaction_url,
      };
    }

    throw error;
  }

  return {
    transactionId: transaction.id,
    reference: payunitTransactionId,
    amount: charge.totalAmount,
    originalAmount,
    discountAmount,
    subtotalAmount: charge.subtotalAmount,
    processingFeeAmount: charge.processingFeeAmount,
    processingFeePercent: charge.processingFeePercent,
    currency: 'XAF',
  };
}

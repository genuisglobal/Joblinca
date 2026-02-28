/**
 * Payment orchestration layer.
 *
 * Coordinates between pricing plans, promo code validation, Payunit,
 * and the transactions / subscriptions tables.
 */

import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  buildPayunitTransactionId,
  initializePayment,
  makePayment,
  normalizePhone,
  resolveGateway,
  shouldUseHostedCheckoutFallback,
} from './payunit';

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

  if (finalAmount <= 0) {
    throw new Error('Final amount must be greater than zero');
  }

  // 4. Create pending transaction
  const phone = normalizePhone(params.phoneNumber);
  const gateway = resolveGateway(phone, params.gateway);
  const metadata = {
    plan_slug: params.planSlug,
    plan_type: plan.plan_type,
    role: plan.role,
  };

  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .insert({
      user_id: params.userId,
      amount: finalAmount,
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const notifyUrl = `${appUrl}/api/payments/webhook`;
  const returnUrl = `${appUrl}/payment/return?tx=${transaction.id}`;
  const payunitTransactionId = buildPayunitTransactionId(transaction.id);

  // 5. Initialize Payunit transaction
  const initResult = await initializePayment({
    amount: finalAmount,
    currency: 'XAF',
    transactionId: payunitTransactionId,
    returnUrl,
    notifyUrl,
    paymentCountry: 'CM',
  });

  if (initResult.providers?.length) {
    const supported = initResult.providers.some(
      (provider) => provider.shortcode === gateway
    );
    if (!supported) {
      throw new Error(`Payment gateway ${gateway} is not available.`);
    }
  }

  const payunitMetadata = {
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
      amount: finalAmount,
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
    if (initResult.transaction_url && shouldUseHostedCheckoutFallback(error)) {
      return {
        transactionId: transaction.id,
        reference: payunitTransactionId,
        amount: finalAmount,
        originalAmount,
        discountAmount,
        currency: 'XAF',
        checkoutUrl: initResult.transaction_url,
      };
    }

    throw error;
  }

  return {
    transactionId: transaction.id,
    reference: payunitTransactionId,
    amount: finalAmount,
    originalAmount,
    discountAmount,
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

  // 2. Fetch add-on plans if any
  let totalAmount = plan.amount_xaf;
  const addOnIds: string[] = [];

  if (params.addOnSlugs && params.addOnSlugs.length > 0) {
    const { data: addOns } = await supabase
      .from('pricing_plans')
      .select('*')
      .in('slug', params.addOnSlugs)
      .eq('is_active', true);

    if (addOns) {
      for (const addOn of addOns) {
        totalAmount += addOn.amount_xaf;
        addOnIds.push(addOn.id);
      }
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

  if (finalAmount <= 0) {
    throw new Error('Final amount must be greater than zero');
  }

  // 5. Create pending transaction
  const phone = normalizePhone(params.phoneNumber);
  const gateway = resolveGateway(phone, params.gateway);
  const metadata = {
    plan_slug: params.planSlug,
    plan_type: plan.plan_type,
    role: plan.role,
    add_on_slugs: params.addOnSlugs || [],
    add_on_ids: addOnIds,
  };

  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .insert({
      user_id: params.userId,
      amount: finalAmount,
      currency: 'XAF',
      description: `Job Tier: ${plan.name}`,
      status: 'pending',
      provider: 'payunit',
      plan_id: plan.id,
      job_id: params.jobId,
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const notifyUrl = `${appUrl}/api/payments/webhook`;
  const returnUrl = `${appUrl}/payment/return?tx=${transaction.id}`;
  const payunitTransactionId = buildPayunitTransactionId(transaction.id);

  // 6. Initialize Payunit transaction
  const initResult = await initializePayment({
    amount: finalAmount,
    currency: 'XAF',
    transactionId: payunitTransactionId,
    returnUrl,
    notifyUrl,
    paymentCountry: 'CM',
  });

  if (initResult.providers?.length) {
    const supported = initResult.providers.some(
      (provider) => provider.shortcode === gateway
    );
    if (!supported) {
      throw new Error(`Payment gateway ${gateway} is not available.`);
    }
  }

  const payunitMetadata = {
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
      amount: finalAmount,
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
    if (initResult.transaction_url && shouldUseHostedCheckoutFallback(error)) {
      return {
        transactionId: transaction.id,
        reference: payunitTransactionId,
        amount: finalAmount,
        originalAmount,
        discountAmount,
        currency: 'XAF',
        checkoutUrl: initResult.transaction_url,
      };
    }

    throw error;
  }

  return {
    transactionId: transaction.id,
    reference: payunitTransactionId,
    amount: finalAmount,
    originalAmount,
    discountAmount,
    currency: 'XAF',
  };
}

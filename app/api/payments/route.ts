import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  initiateSubscriptionPayment,
  initiateJobTierPayment,
  initiateHireFeePayment,
  type PaymentResult,
} from '@/lib/payments/index';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { VettingError } from '@/lib/vetting/service';
import { rateLimit, getRateLimitIdentifier } from '@/lib/rate-limit';

/**
 * POST /api/payments
 * Body: { plan_slug, phone_number, promo_code?, job_id?, add_on_slugs?, gateway? }
 * Auth: requires authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Rate limit: 10 payment attempts per minute per user
    const limit = await rateLimit(
      getRateLimitIdentifier(request, user.id),
      { requests: 10, window: '1m' }
    );
    if (!limit.allowed) return limit.response!;

    const body = await request.json();
    const { plan_slug, phone_number, promo_code, job_id, add_on_slugs, gateway, hire_fee_id } = body;

    let result;

    if (hire_fee_id) {
      // Hire fee (pay-per-result balance or success fee): fixed amount, no plan or promo.
      if (!phone_number) {
        return NextResponse.json({ error: 'phone_number is required' }, { status: 400 });
      }
      try {
        result = await initiateHireFeePayment({
          userId: user.id,
          hireFeeId: String(hire_fee_id),
          phoneNumber: phone_number,
          gateway,
        });
      } catch (err) {
        if (err instanceof VettingError) {
          return NextResponse.json({ error: err.message }, { status: err.status });
        }
        throw err;
      }
      return NextResponse.json(paymentResponse(result), { status: 201 });
    }

    if (!plan_slug || !phone_number) {
      return NextResponse.json(
        { error: 'plan_slug and phone_number are required' },
        { status: 400 }
      );
    }

    if (job_id) {
      // A per-job plan buys work on that job (e.g. a shortlist), so it must be the caller's job.
      const { data: job } = await createServiceSupabaseClient()
        .from('jobs')
        .select('recruiter_id')
        .eq('id', job_id)
        .maybeSingle();
      if (!job || job.recruiter_id !== user.id) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      // Per-job tier payment
      result = await initiateJobTierPayment({
        userId: user.id,
        jobId: job_id,
        planSlug: plan_slug,
        phoneNumber: phone_number,
        addOnSlugs: add_on_slugs,
        promoCode: promo_code,
        gateway,
      });
    } else {
      // Subscription payment
      result = await initiateSubscriptionPayment({
        userId: user.id,
        planSlug: plan_slug,
        phoneNumber: phone_number,
        promoCode: promo_code,
        gateway,
      });
    }

    return NextResponse.json(paymentResponse(result), { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Payment initiation failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function paymentResponse(result: PaymentResult) {
  return {
    transaction_id: result.transactionId,
    reference: result.reference,
    amount: result.amount,
    original_amount: result.originalAmount,
    discount_amount: result.discountAmount,
    subtotal_amount: result.subtotalAmount,
    processing_fee_amount: result.processingFeeAmount,
    processing_fee_percent: result.processingFeePercent,
    currency: result.currency,
    checkout_url: result.checkoutUrl || null,
  };
}

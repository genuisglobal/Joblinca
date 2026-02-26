import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  initiateSubscriptionPayment,
  initiateJobTierPayment,
} from '@/lib/payments/index';

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

    const body = await request.json();
    const { plan_slug, phone_number, promo_code, job_id, add_on_slugs, gateway } = body;

    if (!plan_slug || !phone_number) {
      return NextResponse.json(
        { error: 'plan_slug and phone_number are required' },
        { status: 400 }
      );
    }

    let result;

    if (job_id) {
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

    return NextResponse.json(
      {
        transaction_id: result.transactionId,
        reference: result.reference,
        amount: result.amount,
        original_amount: result.originalAmount,
        discount_amount: result.discountAmount,
        currency: result.currency,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Payment initiation failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

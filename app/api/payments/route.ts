import { NextResponse, type NextRequest } from 'next/server';

// Stub route for payment initiation and webhook verification.

/**
 * POST /api/payments
 * Body: { amount: number, currency: string, description: string }
 * Returns: checkoutUrl – a redirect URL provided by the aggregator.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { amount, currency = 'XAF', description } = body;
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }
  // TODO: Integrate with payment aggregator API using PAYMENT_AGGREGATOR_URL & KEY.
  // For now, return a dummy checkout URL.
  const checkoutUrl = `https://payments.example.com/checkout?amount=${amount}&currency=${currency}`;
  return NextResponse.json({ checkoutUrl }, { status: 201 });
}
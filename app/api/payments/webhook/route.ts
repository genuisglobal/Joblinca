import { NextResponse, type NextRequest } from 'next/server';

/**
 * Payment webhook endpoint.
 * Providers call this URL when a transaction status changes.
 * You must validate the signature using the provider's secret before processing.
 */
export async function POST(request: NextRequest) {
  // TODO: implement payment webhook verification and transaction ledger update
  return NextResponse.json({ message: 'Payment webhook not implemented' }, { status: 501 });
}
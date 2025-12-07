import { NextResponse, type NextRequest } from 'next/server';

/**
 * SMS webhook handler.  Your SMS provider will POST inbound messages here.
 * Use this to parse responses from candidates and send job alerts.
 */
export async function POST(request: NextRequest) {
  const bodyText = await request.text();
  console.log('Received SMS payload', bodyText);
  return new NextResponse('OK', { status: 200 });
}
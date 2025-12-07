import { NextResponse, type NextRequest } from 'next/server';

/**
 * WhatsApp webhook handler.  Meta will POST events here.  You must verify the
 * signature using your WhatsApp token and respond to the message as needed.
 */
export async function POST(request: NextRequest) {
  // TODO: verify X-Hub-Signature-256 header
  const body = await request.json();
  // For now, log the inbound message and return 200 OK
  console.log('Received WhatsApp message', body);
  return new NextResponse('OK', { status: 200 });
}
/**
 * Payment helper for interacting with the aggregator API.  The aggregator is a
 * generic REST service that initiates mobile money transactions and returns
 * checkout URLs.  Configure your aggregator endpoint and secret key via
 * environment variables.  Future phases may integrate with MTN MoMo and
 * Orange Money directly.
 */
export async function initiatePayment(amount: number, currency: string, description: string) {
  const baseUrl = process.env.PAYMENT_AGGREGATOR_URL;
  const apiKey = process.env.PAYMENT_AGGREGATOR_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('Payment provider not configured');
  }
  const res = await fetch(`${baseUrl}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ amount, currency, description }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Payment initiation failed: ${text}`);
  }
  return res.json();
}
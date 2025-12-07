/**
 * SMS messaging helper.  Supports configurable REST providers such as Web2SMS237
 * or Africa’s Talking.  Configure the provider URL and API key via environment
 * variables.
 */
export async function sendSms(to: string, message: string) {
  const url = process.env.SMS_PROVIDER_URL;
  const apiKey = process.env.SMS_PROVIDER_API_KEY;
  if (!url || !apiKey) {
    throw new Error('SMS provider credentials not configured');
  }
  const payload = {
    to,
    message,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to send SMS: ${text}`);
  }
  return res.json();
}
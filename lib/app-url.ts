import { headers } from 'next/headers';

export function getRequestBaseUrl() {
  const headerStore = headers();
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host');
  const proto =
    headerStore.get('x-forwarded-proto') ??
    (host?.includes('localhost') || host?.startsWith('127.0.0.1') ? 'http' : 'https');

  if (host) {
    return `${proto}://${host}`;
  }

  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://joblinca.com')
  ).replace(/\/$/, '');
}

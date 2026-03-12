import { WifiOff } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'Offline',
};

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-950 px-6">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-neutral-800">
          <WifiOff className="h-10 w-10 text-neutral-500" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">You&apos;re offline</h1>
        <p className="text-neutral-400 mb-6">
          It looks like you&apos;ve lost your internet connection. Check your connection and try again.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-3 font-semibold text-white hover:bg-primary-500 transition-colors"
        >
          Try Again
        </Link>
      </div>
    </main>
  );
}

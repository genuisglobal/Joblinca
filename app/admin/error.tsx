'use client';

import { useEffect } from 'react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error.message);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
        <div className="text-5xl mb-4">⚠</div>
        <h1 className="text-2xl font-bold text-white mb-2">Admin Error</h1>
        <p className="text-gray-400 mb-6">
          Something went wrong in the admin area. Please try again or head back
          to the admin dashboard.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-lg transition-colors"
          >
            Try again
          </button>
          <a
            href="/admin"
            className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
          >
            Go back to Admin
          </a>
        </div>
      </div>
    </div>
  );
}

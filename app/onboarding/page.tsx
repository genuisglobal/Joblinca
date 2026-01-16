'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { OnboardingStatus } from '@/lib/onboarding/types';
import OnboardingWizard from './components/OnboardingWizard';

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const redirectedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);

  useEffect(() => {
    let mounted = true;

    async function resolveUserIdWithRetry(): Promise<string | null> {
      // Quick local check
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUserId = sessionData?.session?.user?.id ?? null;
      if (sessionUserId) return sessionUserId;

      // Authoritative check
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id) return userData.user.id;

      // Retry after delay
      await new Promise((r) => setTimeout(r, 350));
      const { data: sessionData2 } = await supabase.auth.getSession();
      const sessionUserId2 = sessionData2?.session?.user?.id ?? null;
      if (sessionUserId2) return sessionUserId2;

      const { data: userData2 } = await supabase.auth.getUser();
      if (userData2?.user?.id) return userData2.user.id;

      return null;
    }

    async function loadOnboardingStatus() {
      setLoading(true);
      setError(null);

      const userId = await resolveUserIdWithRetry();
      if (!mounted) return;

      if (!userId) {
        setLoading(false);
        setError('Session not found. Please log in again.');
        router.replace('/auth/login');
        return;
      }

      try {
        // Fetch onboarding status from API
        const response = await fetch('/api/onboarding/status');

        if (!response.ok) {
          if (response.status === 401) {
            router.replace('/auth/login');
            return;
          }
          throw new Error('Failed to load onboarding status');
        }

        const data: OnboardingStatus = await response.json();

        if (!mounted) return;

        // If onboarding is already completed or skipped, redirect to dashboard
        if ((data.isCompleted || data.isSkipped) && !redirectedRef.current) {
          redirectedRef.current = true;
          router.replace('/dashboard');
          return;
        }

        setStatus(data);
        setLoading(false);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load profile');
        setLoading(false);
      }
    }

    loadOnboardingStatus();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        router.replace('/auth/login');
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, router]);

  // Loading state
  if (loading) {
    return (
      <main className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-400">Loading your profile...</p>
        </div>
      </main>
    );
  }

  // Error state
  if (error) {
    return (
      <main className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-100 mb-2">
            Something went wrong
          </h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </main>
    );
  }

  // No status loaded
  if (!status) {
    return null;
  }

  // Render the wizard
  return <OnboardingWizard initialStatus={status} />;
}

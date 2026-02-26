'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkAuthAndRedirect() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (!mounted) return;

        if (authError || !user) {
          router.replace('/auth/login');
          return;
        }

        // Fetch profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, role, onboarding_completed, onboarding_skipped')
          .eq('id', user.id)
          .single();

        if (!mounted) return;

        if (!profile || profileError) {
          router.replace('/onboarding');
          return;
        }

        // Check if onboarding is completed or skipped
        const hasCompletedOnboarding = profile.onboarding_completed || profile.onboarding_skipped;

        if (!hasCompletedOnboarding) {
          router.replace('/onboarding');
          return;
        }

        // Redirect to role-specific dashboard
        if (profile.role === 'admin') {
          router.replace('/admin');
        } else if (profile.role === 'recruiter') {
          router.replace('/dashboard/recruiter');
        } else if (profile.role === 'talent') {
          router.replace('/dashboard/talent');
        } else {
          router.replace('/dashboard/job-seeker');
        }
      } catch (err) {
        console.error('Dashboard auth error:', err);
        if (mounted) {
          router.replace('/auth/login');
        }
      }
    }

    checkAuthAndRedirect();

    return () => {
      mounted = false;
    };
  }, [supabase, router]);

  // Loading state while checking auth
  if (loading) {
    return (
      <main className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </main>
    );
  }

  return null;
}

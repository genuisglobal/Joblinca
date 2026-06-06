'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ACTIVE_ADMIN_TYPES, type AdminType } from '@/lib/admin-types';
import { createClient } from '@/lib/supabase/client';
import { useTranslation } from '@/lib/i18n';
import { addLocalePrefix } from '@/lib/i18n/locale';

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const { locale, t } = useTranslation();

  const localizedPath = useCallback(
    (href: string) => addLocalePrefix(href, locale),
    [locale]
  );

  useEffect(() => {
    let mounted = true;

    async function checkAuthAndRedirect() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (!mounted) return;

        if (authError || !user) {
          router.replace(localizedPath('/auth/login'));
          return;
        }

        // Fetch profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, role, admin_type, onboarding_completed, onboarding_skipped')
          .eq('id', user.id)
          .single();

        if (!mounted) return;

        if (!profile || profileError) {
          router.replace(localizedPath('/onboarding'));
          return;
        }

        // Check if onboarding is completed or skipped
        const hasCompletedOnboarding = profile.onboarding_completed || profile.onboarding_skipped;

        if (!hasCompletedOnboarding) {
          router.replace(localizedPath('/onboarding'));
          return;
        }

        // Redirect to role-specific dashboard
        if (profile.role === 'admin') {
          const isActiveAdmin = Boolean(
            profile.admin_type &&
            ACTIVE_ADMIN_TYPES.includes(profile.admin_type as AdminType)
          );
          router.replace(localizedPath(isActiveAdmin ? '/admin' : '/jobs'));
        } else if (profile.role === 'field_agent') {
          router.replace(localizedPath('/dashboard/field-agent'));
        } else if (profile.role === 'recruiter') {
          router.replace(localizedPath('/dashboard/recruiter'));
        } else if (profile.role === 'talent') {
          router.replace(localizedPath('/dashboard/talent'));
        } else {
          router.replace(localizedPath('/dashboard/job-seeker'));
        }
      } catch (err) {
        console.error('Dashboard auth error:', err);
        if (mounted) {
          router.replace(localizedPath('/auth/login'));
        }
      }
    }

    checkAuthAndRedirect();

    return () => {
      mounted = false;
    };
  }, [supabase, router, localizedPath]);

  // Loading state while checking auth
  if (loading) {
    return (
      <main className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-400">{t('common.loading')}</p>
        </div>
      </main>
    );
  }

  return null;
}

'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { OnboardingStatus, Role, RecruiterType, getStepsForRole } from '@/lib/onboarding/types';
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

    async function loadOnboardingStatus() {
      setLoading(true);
      setError(null);

      try {
        // Get user directly from client-side Supabase
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (!mounted) return;

        if (authError || !user) {
          // Wait a bit and retry once
          await new Promise(r => setTimeout(r, 500));
          const { data: { user: retryUser }, error: retryError } = await supabase.auth.getUser();

          if (!mounted) return;

          if (retryError || !retryUser) {
            setLoading(false);
            setError('Session not found. Please log in again.');
            router.replace('/auth/login');
            return;
          }

          // Use retry user
          await fetchProfileAndSetStatus(retryUser.id, retryUser.user_metadata?.role);
        } else {
          await fetchProfileAndSetStatus(user.id, user.user_metadata?.role);
        }
      } catch (err) {
        if (!mounted) return;
        console.error('Onboarding load error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load profile');
        setLoading(false);
      }
    }

    async function fetchProfileAndSetStatus(userId: string, metadataRole?: string) {
      if (!mounted) return;

      // Fetch profile directly using client-side Supabase
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!mounted) return;

      if (profileError || !profile) {
        setError('Profile not found. Please contact support.');
        setLoading(false);
        return;
      }

      // Determine role
      const role: Role = (metadataRole as Role) || (profile.role === 'candidate' ? 'job_seeker' : profile.role as Role);
      const steps = getStepsForRole(role);

      // Check if already completed or skipped
      if ((profile.onboarding_completed || profile.onboarding_skipped) && !redirectedRef.current) {
        redirectedRef.current = true;
        router.replace('/dashboard');
        return;
      }

      // Build saved data from profile
      const savedData = {
        firstName: profile.first_name || '',
        lastName: profile.last_name || '',
        phone: profile.phone || '',
        avatarUrl: profile.avatar_url || profile.profile_image_url || null,
        gender: profile.sex || null,
        residenceLocation: profile.residence_location || null,
        resumeUrl: null as string | null,
        locationInterests: [] as string[],
        schoolName: '',
        graduationYear: null as number | null,
        fieldOfStudy: '',
        skills: [] as { name: string; rating: number }[],
        recruiterType: null as RecruiterType | null,
        companyName: '',
        companyLogoUrl: null as string | null,
        contactEmail: '',
      };

      // Fetch role-specific data
      if (role === 'job_seeker' || profile.role === 'candidate') {
        const { data: jsProfile } = await supabase
          .from('job_seeker_profiles')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (jsProfile) {
          savedData.resumeUrl = jsProfile.resume_url || null;
          savedData.locationInterests = jsProfile.location_interests || [];
        }
      } else if (role === 'talent') {
        const { data: talentProfile } = await supabase
          .from('talent_profiles')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (talentProfile) {
          savedData.resumeUrl = talentProfile.resume_url || null;
          savedData.locationInterests = talentProfile.location_interests || [];
          savedData.schoolName = talentProfile.school_name || '';
          savedData.graduationYear = talentProfile.graduation_year || null;
          savedData.fieldOfStudy = talentProfile.field_of_study || '';
          savedData.skills = talentProfile.skills || [];
        }
      } else if (role === 'recruiter') {
        const { data: recruiterProfile } = await supabase
          .from('recruiter_profiles')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (recruiterProfile) {
          savedData.recruiterType = recruiterProfile.recruiter_type || null;
          savedData.companyName = recruiterProfile.company_name || '';
          savedData.companyLogoUrl = recruiterProfile.company_logo_url || null;
          savedData.contactEmail = recruiterProfile.contact_email || '';
        }
      }

      if (!mounted) return;

      setStatus({
        role,
        currentStep: profile.onboarding_step || 0,
        totalSteps: steps.length,
        isCompleted: profile.onboarding_completed || false,
        isSkipped: profile.onboarding_skipped || false,
        savedData,
      });
      setLoading(false);
    }

    loadOnboardingStatus();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;
      // Only redirect on explicit sign out, not on other events
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

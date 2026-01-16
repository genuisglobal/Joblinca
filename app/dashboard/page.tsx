import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, role, onboarding_completed, onboarding_skipped')
    .eq('id', user.id)
    .single();

  if (!profile || profileError) {
    redirect('/onboarding');
  }

  // Check if onboarding is completed or skipped
  const hasCompletedOnboarding =
    profile.onboarding_completed || profile.onboarding_skipped;

  if (!hasCompletedOnboarding) {
    redirect('/onboarding');
  }

  // Redirect to role-specific dashboard
  if (profile.role === 'recruiter') {
    redirect('/dashboard/recruiter');
  } else if (profile.role === 'talent') {
    redirect('/dashboard/talent');
  } else {
    redirect('/dashboard/job-seeker');
  }
}
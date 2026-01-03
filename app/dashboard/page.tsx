import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();
  // Check if the user is logged in server-side.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Not logged in, redirect to login page.
    redirect('/auth/login');
  }
  // Fetch the user's profile to determine role and onboarding status
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', user.id)
    .single();
  if (!profile || profileError) {
    redirect('/onboarding');
  }
  // Determine if role-specific required fields are present
  let requireOnboarding = false;
  if (profile.role === 'job_seeker') {
    const { data, error } = await supabase
      .from('job_seeker_profiles')
      .select('location, headline, resume_url')
      .eq('user_id', user.id)
      .single();
    if (error || !data || !data.location || !data.headline || !data.resume_url) {
      requireOnboarding = true;
    }
  } else if (profile.role === 'talent') {
    const { data, error } = await supabase
      .from('talent_profiles')
      .select('school_status, portfolio')
      .eq('user_id', user.id)
      .single();
    if (error || !data || !data.school_status || !data.portfolio) {
      requireOnboarding = true;
    }
  } else if (profile.role === 'recruiter') {
    const { data, error } = await supabase
      .from('recruiter_profiles')
      .select('company_name, contact_email, contact_phone')
      .eq('user_id', user.id)
      .single();
    if (error || !data || !data.company_name || !data.contact_email || !data.contact_phone) {
      requireOnboarding = true;
    }
  }
  if (requireOnboarding) {
    redirect('/onboarding');
  }
  return (
    <main className="p-6">
      <h1 className="text-3xl font-bold mb-4">Dashboard</h1>
      <p>Welcome back, {profile.full_name ?? user.email}!</p>
      <p className="mt-4">
        Use the navigation to manage jobs, applications, vetting requests,
        subscriptions and more.
      </p>
    </main>
  );
}
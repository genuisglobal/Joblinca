import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ProfileForm from './ProfileForm';

export default async function RecruiterProfilePage() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Fetch profile data
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const { data: recruiterProfile } = await supabase
    .from('recruiter_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">Edit Profile</h1>

      <ProfileForm
        profile={{
          firstName: profile?.first_name || '',
          lastName: profile?.last_name || '',
          fullName: profile?.full_name || '',
          phone: profile?.phone || '',
          avatarUrl: profile?.avatar_url || '',
          companyName: recruiterProfile?.company_name || '',
          companyDescription: recruiterProfile?.company_description || '',
          contactEmail: recruiterProfile?.contact_email || user.email || '',
          contactPhone: recruiterProfile?.contact_phone || '',
          website: recruiterProfile?.website || '',
          companyLogoUrl: recruiterProfile?.company_logo_url || '',
        }}
      />
    </div>
  );
}

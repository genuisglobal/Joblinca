import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ProfileForm from './ProfileForm';

export default async function TalentProfilePage() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const { data: talentProfile } = await supabase
    .from('talent_profiles')
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
          phone: profile?.phone || '',
          avatarUrl: profile?.avatar_url || '',
          schoolName: talentProfile?.school_name || '',
          graduationYear: talentProfile?.graduation_year || null,
          fieldOfStudy: talentProfile?.field_of_study || '',
          portfolio: talentProfile?.portfolio || '',
          skills: talentProfile?.skills || [],
        }}
      />
    </div>
  );
}

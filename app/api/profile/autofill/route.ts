import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET: Fetch user profile data for autofilling application forms
export async function GET() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name, phone')
    .eq('id', user.id)
    .single();

  // Fetch talent profile (for job seekers and talents)
  const { data: talentProfile } = await supabase
    .from('talent_profiles')
    .select('school_name, graduation_year, field_of_study, portfolio, skills')
    .eq('user_id', user.id)
    .single();

  // Combine data for autofill
  const autofillData = {
    firstName: profile?.first_name || '',
    lastName: profile?.last_name || '',
    phone: profile?.phone || '',
    schoolName: talentProfile?.school_name || '',
    graduationYear: talentProfile?.graduation_year || null,
    fieldOfStudy: talentProfile?.field_of_study || '',
    portfolio: talentProfile?.portfolio || '',
    skills: talentProfile?.skills || [],
    email: user.email || '',
  };

  return NextResponse.json(autofillData);
}

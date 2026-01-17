import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getStepsForRole, Role } from '@/lib/onboarding/types';

/**
 * GET /api/onboarding/status
 * Returns the current onboarding status and saved data for the authenticated user.
 */
export async function GET() {
  try {
    const supabase = createServerSupabaseClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get profile data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    // Get the original role from user metadata (set during registration)
    // This is needed because job_seeker and talent are mapped to 'candidate' in profiles
    const metadataRole = user.user_metadata?.role as Role | undefined;
    const role: Role = metadataRole || (profile.role === 'candidate' ? 'job_seeker' : profile.role as Role);
    const steps = getStepsForRole(role);

    // Get role-specific data
    let roleData: Record<string, unknown> = {};

    if (role === 'job_seeker' || profile.role === 'candidate') {
      const { data } = await supabase
        .from('job_seeker_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
      roleData = data || {};
    } else if (role === 'talent') {
      const { data } = await supabase
        .from('talent_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
      roleData = data || {};
    } else if (role === 'recruiter') {
      const { data } = await supabase
        .from('recruiter_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
      roleData = data || {};
    }

    // Combine profile and role-specific data
    const savedData = {
      firstName: profile.first_name || '',
      lastName: profile.last_name || '',
      phone: profile.phone || '',
      avatarUrl: profile.avatar_url || profile.profile_image_url || null,
      gender: profile.sex || null,
      residenceLocation: profile.residence_location || null,
      // Role-specific fields
      resumeUrl: roleData.resume_url || null,
      locationInterests: roleData.location_interests || [],
      schoolName: roleData.school_name || '',
      graduationYear: roleData.graduation_year || null,
      fieldOfStudy: roleData.field_of_study || '',
      skills: roleData.skills || [],
      recruiterType: roleData.recruiter_type || null,
      companyName: roleData.company_name || '',
      companyLogoUrl: roleData.company_logo_url || null,
      contactEmail: roleData.contact_email || '',
    };

    return NextResponse.json({
      role,
      currentStep: profile.onboarding_step || 0,
      totalSteps: steps.length,
      isCompleted: profile.onboarding_completed || false,
      isSkipped: profile.onboarding_skipped || false,
      savedData,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { saveStepRequestSchema } from '@/lib/onboarding/schemas';
import { Role } from '@/lib/onboarding/types';

/**
 * POST /api/onboarding/save-step
 * Saves data for a specific onboarding step and updates progress.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate request body
    const parseResult = saveStepRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { step, data } = parseResult.data;

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

    // Get current profile to know the role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
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

    // Build profile updates
    const profileUpdates: Record<string, unknown> = {
      onboarding_step: step + 1,
      updated_at: new Date().toISOString(),
    };

    // Map incoming data to profile columns
    if (data.firstName !== undefined) profileUpdates.first_name = data.firstName;
    if (data.lastName !== undefined) profileUpdates.last_name = data.lastName;
    if (data.phone !== undefined) profileUpdates.phone = data.phone;
    if (data.avatarUrl !== undefined) profileUpdates.avatar_url = data.avatarUrl;
    if (data.gender !== undefined) profileUpdates.sex = data.gender;
    if (data.residenceLocation !== undefined) profileUpdates.residence_location = data.residenceLocation;

    // Update full_name for compatibility
    if (data.firstName !== undefined || data.lastName !== undefined) {
      const firstName = data.firstName || '';
      const lastName = data.lastName || '';
      profileUpdates.full_name = `${firstName} ${lastName}`.trim();
    }

    // Update profiles table
    const { error: updateProfileError } = await supabase
      .from('profiles')
      .update(profileUpdates)
      .eq('id', user.id);

    if (updateProfileError) {
      return NextResponse.json(
        { error: `Failed to update profile: ${updateProfileError.message}` },
        { status: 500 }
      );
    }

    // Update role-specific tables
    // Note: job_seeker and talent are both stored as 'candidate' in profiles.role
    if (role === 'job_seeker' || (profile.role === 'candidate' && role !== 'talent')) {
      const jobSeekerUpdates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (data.resumeUrl !== undefined) jobSeekerUpdates.resume_url = data.resumeUrl;
      if (data.locationInterests !== undefined) jobSeekerUpdates.location_interests = data.locationInterests;

      if (Object.keys(jobSeekerUpdates).length > 1) {
        const { error } = await supabase
          .from('job_seeker_profiles')
          .update(jobSeekerUpdates)
          .eq('user_id', user.id);

        if (error) {
          console.error('job_seeker_profiles update error:', error);
        }
      }
    } else if (role === 'talent') {
      const talentUpdates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (data.resumeUrl !== undefined) talentUpdates.resume_url = data.resumeUrl;
      if (data.locationInterests !== undefined) talentUpdates.location_interests = data.locationInterests;
      if (data.schoolName !== undefined) talentUpdates.school_name = data.schoolName;
      if (data.graduationYear !== undefined) talentUpdates.graduation_year = data.graduationYear;
      if (data.fieldOfStudy !== undefined) talentUpdates.field_of_study = data.fieldOfStudy;
      if (data.skills !== undefined) talentUpdates.skills = data.skills;

      if (Object.keys(talentUpdates).length > 1) {
        const { error } = await supabase
          .from('talent_profiles')
          .update(talentUpdates)
          .eq('user_id', user.id);

        if (error) {
          console.error('talent_profiles update error:', error);
        }
      }
    } else if (role === 'recruiter') {
      const recruiterUpdates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (data.recruiterType !== undefined) recruiterUpdates.recruiter_type = data.recruiterType;
      if (data.companyName !== undefined) recruiterUpdates.company_name = data.companyName;
      if (data.companyLogoUrl !== undefined) recruiterUpdates.company_logo_url = data.companyLogoUrl;
      if (data.contactEmail !== undefined) recruiterUpdates.contact_email = data.contactEmail;

      if (Object.keys(recruiterUpdates).length > 1) {
        const { error } = await supabase
          .from('recruiter_profiles')
          .update(recruiterUpdates)
          .eq('user_id', user.id);

        if (error) {
          console.error('recruiter_profiles update error:', error);
        }
      }

      // Also update the legacy recruiters table for FK compatibility
      if (data.companyName !== undefined) {
        await supabase
          .from('recruiters')
          .update({ company_name: data.companyName })
          .eq('id', user.id);
      }
    }

    return NextResponse.json({
      success: true,
      nextStep: step + 1,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

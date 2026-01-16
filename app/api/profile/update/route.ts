import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

export async function PUT(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Get user's role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const body = await request.json();

  // Update base profile fields
  const profileUpdate: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.firstName !== undefined) profileUpdate.first_name = body.firstName;
  if (body.lastName !== undefined) profileUpdate.last_name = body.lastName;
  if (body.phone !== undefined) profileUpdate.phone = body.phone;

  const { error: profileError } = await supabase
    .from('profiles')
    .update(profileUpdate)
    .eq('id', user.id);

  if (profileError) {
    return NextResponse.json(
      { error: `Failed to update profile: ${profileError.message}` },
      { status: 500 }
    );
  }

  // Update role-specific profile
  if (profile.role === 'recruiter') {
    const recruiterUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.companyName !== undefined) recruiterUpdate.company_name = body.companyName;
    if (body.companyDescription !== undefined)
      recruiterUpdate.company_description = body.companyDescription;
    if (body.contactEmail !== undefined) recruiterUpdate.contact_email = body.contactEmail;
    if (body.contactPhone !== undefined) recruiterUpdate.contact_phone = body.contactPhone;
    if (body.website !== undefined) recruiterUpdate.website = body.website;

    const { error } = await supabase
      .from('recruiter_profiles')
      .update(recruiterUpdate)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json(
        { error: `Failed to update recruiter profile: ${error.message}` },
        { status: 500 }
      );
    }
  } else if (profile.role === 'job_seeker') {
    const jobSeekerUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.location !== undefined) jobSeekerUpdate.location = body.location;
    if (body.headline !== undefined) jobSeekerUpdate.headline = body.headline;
    if (body.locationInterests !== undefined)
      jobSeekerUpdate.location_interests = body.locationInterests;

    const { error } = await supabase
      .from('job_seeker_profiles')
      .update(jobSeekerUpdate)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json(
        { error: `Failed to update job seeker profile: ${error.message}` },
        { status: 500 }
      );
    }
  } else if (profile.role === 'talent') {
    const talentUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.schoolName !== undefined) talentUpdate.school_name = body.schoolName;
    if (body.graduationYear !== undefined) talentUpdate.graduation_year = body.graduationYear;
    if (body.fieldOfStudy !== undefined) talentUpdate.field_of_study = body.fieldOfStudy;
    if (body.portfolio !== undefined) talentUpdate.portfolio = body.portfolio;
    if (body.skills !== undefined) talentUpdate.skills = body.skills;

    const { error } = await supabase
      .from('talent_profiles')
      .update(talentUpdate)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json(
        { error: `Failed to update talent profile: ${error.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true });
}

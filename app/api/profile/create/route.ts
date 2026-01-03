import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

/**
 * API route to create a profile and corresponding role‑specific row
 * immediately after a user account is created via Supabase Auth.  This
 * endpoint should be called from the client right after signUp.  It
 * expects a JSON payload containing the user ID, role and any
 * additional fields relevant to the role.  The service role client is
 * used here to bypass RLS for the initial insert; subsequent updates
 * are managed by normal RLS policies.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      userId,
      role,
      fullName,
      phone,
      companyName,
      contactEmail,
      contactPhone,
      institution,
      graduationYear,
      schoolStatus,
      resumeUrl,
      location,
      headline,
      profileImageUrl,
      sex,
    } = body;
    if (!userId || !role) {
      return NextResponse.json({ error: 'Missing userId or role' }, { status: 400 });
    }
    const supabase = createServiceSupabaseClient();
    // Insert or update the profiles row
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: userId,
          full_name: fullName,
          phone: phone ?? null,
          role,
          profile_image_url: profileImageUrl ?? null,
          sex: sex ?? null,
        },
        { onConflict: 'id' },
      );
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
    // Insert role‑specific data
    if (role === 'job_seeker') {
      const { error } = await supabase
        .from('job_seeker_profiles')
        .upsert(
          {
            user_id: userId,
            resume_url: resumeUrl ?? null,
            career_info: null,
            location: location ?? null,
            headline: headline ?? null,
          },
          { onConflict: 'user_id' },
        );
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (role === 'talent') {
      const { error } = await supabase
        .from('talent_profiles')
        .upsert(
          {
            user_id: userId,
            school_status: schoolStatus ?? null,
            portfolio: null,
            internship_eligible: true,
          },
          { onConflict: 'user_id' },
        );
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (role === 'recruiter') {
      // recruiter_type must be provided by client; default to company_hr if missing
      const recruiterType = body.recruiterType ?? 'company_hr';
      const { error } = await supabase
        .from('recruiter_profiles')
        .upsert(
          {
            user_id: userId,
            recruiter_type: recruiterType,
            company_name: companyName ?? null,
            contact_email: contactEmail ?? null,
            contact_phone: contactPhone ?? null,
            // id_document_metadata remains null until upload
          },
          { onConflict: 'user_id' },
        );
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
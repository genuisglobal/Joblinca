import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { NextResponse, type NextRequest } from 'next/server';
import { RESUME_MAX_BYTES, storeResumeForUser } from '@/lib/profile/store-resume';

// POST: Upload resume file
export async function POST(request: NextRequest) {
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

  // Only job seekers and talents can upload resumes
  if (profile.role !== 'job_seeker' && profile.role !== 'talent') {
    return NextResponse.json(
      { error: 'Only job seekers and talents can upload resumes.' },
      { status: 403 }
    );
  }

  // Parse form data
  const formData = await request.formData();
  const file = formData.get('resume') as File | null;

  if (!file) {
    return NextResponse.json(
      { error: 'No file uploaded. Please select a resume file.' },
      { status: 400 }
    );
  }

  // Reject before reading the body into memory.
  if (file.size > RESUME_MAX_BYTES) {
    return NextResponse.json(
      { error: 'Resume file is too large. Maximum size is 5MB.' },
      { status: 400 }
    );
  }

  try {
    const result = await storeResumeForUser(createServiceSupabaseClient(), {
      userId: user.id,
      role: profile.role,
      buffer: await file.arrayBuffer(),
      mimeType: file.type,
      filename: file.name,
    });

    switch (result.status) {
      case 'stored':
        return NextResponse.json({
          message: 'Resume uploaded successfully',
          resumeUrl: result.resumeUrl,
        });
      case 'too_large':
        return NextResponse.json(
          { error: 'Resume file is too large. Maximum size is 5MB.' },
          { status: 400 }
        );
      case 'bad_type':
        return NextResponse.json(
          { error: 'Invalid file format. Please upload a PDF or Word document (.doc, .docx).' },
          { status: 400 }
        );
      case 'bad_content':
        return NextResponse.json(
          { error: 'File content does not match its declared type. Upload rejected.' },
          { status: 400 }
        );
      case 'not_seeker':
        return NextResponse.json(
          { error: 'Only job seekers and talents can upload resumes.' },
          { status: 403 }
        );
      default:
        console.error('Resume upload error:', result.message);
        return NextResponse.json(
          { error: 'Failed to upload resume. Please try again.' },
          { status: 500 }
        );
    }
  } catch (err) {
    console.error('Resume upload error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}

// DELETE: Remove resume
export async function DELETE() {
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

  try {
    // Update the appropriate profile table
    if (profile.role === 'job_seeker') {
      const { error: updateError } = await supabase
        .from('job_seeker_profiles')
        .update({
          resume_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (updateError) {
        return NextResponse.json(
          { error: 'Failed to remove resume.' },
          { status: 500 }
        );
      }
    } else if (profile.role === 'talent') {
      const { error: updateError } = await supabase
        .from('talent_profiles')
        .update({
          resume_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (updateError) {
        return NextResponse.json(
          { error: 'Failed to remove resume.' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ message: 'Resume removed successfully' });
  } catch (err) {
    console.error('Resume delete error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}

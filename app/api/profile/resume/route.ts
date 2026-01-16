import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

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

  // Validate file size (max 5MB)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    return NextResponse.json(
      { error: 'Resume file is too large. Maximum size is 5MB.' },
      { status: 400 }
    );
  }

  // Validate file type
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: 'Invalid file format. Please upload a PDF or Word document (.doc, .docx).' },
      { status: 400 }
    );
  }

  try {
    // Generate unique file name
    const ext = file.name.split('.').pop() || 'pdf';
    const filePath = `resumes/${user.id}/resume-${Date.now()}.${ext}`;

    // Upload to Supabase Storage
    const buffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Resume upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload resume. Please try again.' },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from('resumes').getPublicUrl(filePath);
    const resumeUrl = urlData.publicUrl;

    // Update the appropriate profile table
    if (profile.role === 'job_seeker') {
      const { error: updateError } = await supabase
        .from('job_seeker_profiles')
        .update({
          resume_url: resumeUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Job seeker profile update error:', updateError);
        return NextResponse.json(
          { error: 'Failed to update profile with new resume.' },
          { status: 500 }
        );
      }
    } else if (profile.role === 'talent') {
      const { error: updateError } = await supabase
        .from('talent_profiles')
        .update({
          resume_url: resumeUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Talent profile update error:', updateError);
        return NextResponse.json(
          { error: 'Failed to update profile with new resume.' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      message: 'Resume uploaded successfully',
      resumeUrl,
    });
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

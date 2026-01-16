import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

// POST: Upload company logo image
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

  // Only recruiters can upload company logos
  if (profile.role !== 'recruiter') {
    return NextResponse.json(
      { error: 'Only recruiters can upload company logos.' },
      { status: 403 }
    );
  }

  // Parse form data
  const formData = await request.formData();
  const file = formData.get('logo') as File | null;

  if (!file) {
    return NextResponse.json(
      { error: 'No file uploaded. Please select an image.' },
      { status: 400 }
    );
  }

  // Validate file size (max 2MB for logos)
  const maxSize = 2 * 1024 * 1024;
  if (file.size > maxSize) {
    return NextResponse.json(
      { error: 'Image is too large. Maximum size is 2MB.' },
      { status: 400 }
    );
  }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: 'Invalid file format. Please upload a JPEG, PNG, WebP, or GIF image.' },
      { status: 400 }
    );
  }

  try {
    // Generate unique file name
    const ext = file.name.split('.').pop() || 'jpg';
    const filePath = `logos/${user.id}/logo-${Date.now()}.${ext}`;

    // Upload to Supabase Storage
    const buffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Logo upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload logo. Please try again.' },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
    const logoUrl = urlData.publicUrl;

    // Update recruiter profile with new logo URL
    const { error: updateError } = await supabase
      .from('recruiter_profiles')
      .update({
        company_logo_url: logoUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Profile update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update profile with new logo.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Company logo uploaded successfully',
      logoUrl,
    });
  } catch (err) {
    console.error('Logo upload error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}

// DELETE: Remove company logo
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

  if (!profile || profile.role !== 'recruiter') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  try {
    // Update recruiter profile to remove logo URL
    const { error: updateError } = await supabase
      .from('recruiter_profiles')
      .update({
        company_logo_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to remove logo.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Company logo removed successfully' });
  } catch (err) {
    console.error('Logo delete error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}

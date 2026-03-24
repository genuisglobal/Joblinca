import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { NextResponse, type NextRequest } from 'next/server';
import { validateUploadedFile, validateFileBuffer } from '@/lib/file-validation';

// POST: Upload avatar image
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Parse form data
  const formData = await request.formData();
  const file = formData.get('avatar') as File | null;

  if (!file) {
    return NextResponse.json(
      { error: 'No file uploaded. Please select an image.' },
      { status: 400 }
    );
  }

  // Validate file size (max 2MB for avatars)
  const maxSize = 2 * 1024 * 1024;
  if (file.size > maxSize) {
    return NextResponse.json(
      { error: 'Image is too large. Maximum size is 2MB.' },
      { status: 400 }
    );
  }

  // Validate file type — extension whitelist
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: 'Invalid file format. Please upload a JPEG, PNG, WebP, or GIF image.' },
      { status: 400 }
    );
  }

  // Validate extension against whitelist (not just MIME)
  const fileCheck = validateUploadedFile(file, 'avatar');
  if (!fileCheck.valid) {
    return NextResponse.json({ error: fileCheck.error }, { status: 400 });
  }

  try {
    const ext = fileCheck.ext;
    const filePath = `avatars/${user.id}/avatar-${Date.now()}.${ext}`;

    // Use service-role client for storage so RLS never blocks the upload
    const serviceClient = createServiceSupabaseClient();

    const buffer = await file.arrayBuffer();

    // Validate magic bytes match declared MIME type
    const bufferCheck = validateFileBuffer(buffer, file.type);
    if (!bufferCheck.valid) {
      return NextResponse.json({ error: bufferCheck.error }, { status: 400 });
    }

    const { error: uploadError } = await serviceClient.storage
      .from('avatars')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Avatar upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload avatar. Please try again.' },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = serviceClient.storage.from('avatars').getPublicUrl(filePath);
    const avatarUrl = urlData.publicUrl;

    // Update profile with new avatar URL
    const { error: updateError } = await serviceClient
      .from('profiles')
      .update({
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Profile update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update profile with new avatar.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Avatar uploaded successfully',
      avatarUrl,
    });
  } catch (err) {
    console.error('Avatar upload error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}

// DELETE: Remove avatar
export async function DELETE() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    // Update profile to remove avatar URL
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        avatar_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to remove avatar.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Avatar removed successfully' });
  } catch (err) {
    console.error('Avatar delete error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}

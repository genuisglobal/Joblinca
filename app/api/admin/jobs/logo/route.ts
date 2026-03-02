import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAdmin();
    const formData = await request.formData();
    const file = formData.get('logo') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded. Please select an image.' },
        { status: 400 }
      );
    }

    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'Image is too large. Maximum size is 2MB.' },
        { status: 400 }
      );
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file format. Please upload a JPEG, PNG, WebP, or GIF image.' },
        { status: 400 }
      );
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const filePath = `job-logos/${userId}/logo-${Date.now()}.${ext}`;
    const serviceClient = createServiceSupabaseClient();
    const buffer = await file.arrayBuffer();

    const { error: uploadError } = await serviceClient.storage
      .from('avatars')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Admin logo upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload logo. Please try again.' },
        { status: 500 }
      );
    }

    const { data: urlData } = serviceClient.storage.from('avatars').getPublicUrl(filePath);

    return NextResponse.json({
      logoUrl: urlData.publicUrl,
    });
  } catch (err) {
    console.error('Admin logo route error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unauthorized' },
      { status: 401 }
    );
  }
}

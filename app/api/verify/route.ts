import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

// GET: Fetch current user's verification status
export async function GET() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data: verification, error } = await supabase
    .from('verifications')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(verification || { status: null });
}

// POST: Submit verification documents
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Check if user is a recruiter
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'recruiter') {
    return NextResponse.json(
      { error: 'Only recruiters can submit verification documents' },
      { status: 403 }
    );
  }

  // Check if already has pending or approved verification
  const { data: existingVerification } = await supabase
    .from('verifications')
    .select('status')
    .eq('user_id', user.id)
    .single();

  if (existingVerification?.status === 'pending') {
    return NextResponse.json(
      { error: 'You already have a pending verification request. Please wait for it to be reviewed.' },
      { status: 400 }
    );
  }

  if (existingVerification?.status === 'approved') {
    return NextResponse.json(
      { error: 'Your account is already verified.' },
      { status: 400 }
    );
  }

  // Parse form data
  const formData = await request.formData();
  const idDocument = formData.get('idDocument') as File | null;
  const selfie = formData.get('selfie') as File | null;
  const employerReference = formData.get('employerReference') as string | null;

  // Validate required files
  if (!idDocument) {
    return NextResponse.json(
      { error: 'ID document is required. Please upload a government-issued ID.' },
      { status: 400 }
    );
  }

  if (!selfie) {
    return NextResponse.json(
      { error: 'Selfie is required. Please upload a photo of yourself holding your ID.' },
      { status: 400 }
    );
  }

  // Validate file sizes (max 5MB)
  const maxSize = 5 * 1024 * 1024;
  if (idDocument.size > maxSize) {
    return NextResponse.json(
      { error: 'ID document file is too large. Maximum size is 5MB.' },
      { status: 400 }
    );
  }

  if (selfie.size > maxSize) {
    return NextResponse.json(
      { error: 'Selfie file is too large. Maximum size is 5MB.' },
      { status: 400 }
    );
  }

  // Validate file types
  const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const allowedDocTypes = [...allowedImageTypes, 'application/pdf'];

  if (!allowedDocTypes.includes(idDocument.type)) {
    return NextResponse.json(
      { error: 'Invalid ID document format. Please upload a PDF, PNG, or JPG file.' },
      { status: 400 }
    );
  }

  if (!allowedImageTypes.includes(selfie.type)) {
    return NextResponse.json(
      { error: 'Invalid selfie format. Please upload a PNG, JPG, or WebP image.' },
      { status: 400 }
    );
  }

  try {
    // Generate unique file names
    const timestamp = Date.now();
    const idDocExt = idDocument.name.split('.').pop() || 'pdf';
    const selfieExt = selfie.name.split('.').pop() || 'jpg';
    const idDocPath = `verifications/${user.id}/id-document-${timestamp}.${idDocExt}`;
    const selfiePath = `verifications/${user.id}/selfie-${timestamp}.${selfieExt}`;

    // Upload ID document
    const idDocBuffer = await idDocument.arrayBuffer();
    const { error: idUploadError } = await supabase.storage
      .from('documents')
      .upload(idDocPath, idDocBuffer, {
        contentType: idDocument.type,
        upsert: true,
      });

    if (idUploadError) {
      console.error('ID document upload error:', idUploadError);
      return NextResponse.json(
        { error: 'Failed to upload ID document. Please try again.' },
        { status: 500 }
      );
    }

    // Upload selfie
    const selfieBuffer = await selfie.arrayBuffer();
    const { error: selfieUploadError } = await supabase.storage
      .from('documents')
      .upload(selfiePath, selfieBuffer, {
        contentType: selfie.type,
        upsert: true,
      });

    if (selfieUploadError) {
      console.error('Selfie upload error:', selfieUploadError);
      // Clean up the ID document that was uploaded
      await supabase.storage.from('documents').remove([idDocPath]);
      return NextResponse.json(
        { error: 'Failed to upload selfie. Please try again.' },
        { status: 500 }
      );
    }

    // Get public URLs
    const { data: idDocUrl } = supabase.storage
      .from('documents')
      .getPublicUrl(idDocPath);

    const { data: selfieUrl } = supabase.storage
      .from('documents')
      .getPublicUrl(selfiePath);

    // Create or update verification record
    const verificationData = {
      user_id: user.id,
      id_document_url: idDocUrl.publicUrl,
      selfie_url: selfieUrl.publicUrl,
      employer_reference: employerReference || null,
      status: 'pending',
      updated_at: new Date().toISOString(),
    };

    if (existingVerification) {
      // Update existing record (for rejected users resubmitting)
      const { error: updateError } = await supabase
        .from('verifications')
        .update(verificationData)
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Verification update error:', updateError);
        return NextResponse.json(
          { error: 'Failed to update verification request. Please try again.' },
          { status: 500 }
        );
      }
    } else {
      // Insert new record
      const { error: insertError } = await supabase
        .from('verifications')
        .insert({
          ...verificationData,
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('Verification insert error:', insertError);
        return NextResponse.json(
          { error: 'Failed to submit verification request. Please try again.' },
          { status: 500 }
        );
      }
    }

    // Update recruiter_profiles verification_status to pending
    await supabase
      .from('recruiter_profiles')
      .update({ verification_status: 'pending' })
      .eq('user_id', user.id);

    return NextResponse.json({
      message: 'Verification documents submitted successfully. We will review them within 1-3 business days.',
      status: 'pending',
    });
  } catch (err) {
    console.error('Verification submission error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 }
    );
  }
}

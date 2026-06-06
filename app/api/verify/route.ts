import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { submitRecruiterVerification } from '@/lib/recruiter-verifications/service';
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

  // Parse form data
  const formData = await request.formData();
  const idDocument = formData.get('idDocument') as File | null;
  const selfie = formData.get('selfie') as File | null;
  const businessRegistration = formData.get('businessRegistration') as File | null;
  const employerReference = formData.get('employerReference') as string | null;

  try {
    const serviceClient = createServiceSupabaseClient();
    await submitRecruiterVerification(serviceClient, {
      recruiterUserId: user.id,
      actorUserId: user.id,
      source: 'self_service',
      idDocument,
      selfie,
      businessRegistration,
      employerReference,
    });

    return NextResponse.json({
      message: 'Verification documents submitted successfully. We will review them within 1-3 business days.',
      status: 'pending',
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'An unexpected error occurred.';
    const status =
      message.includes('already has a pending')
        ? 400
        : message.includes('already verified')
          ? 400
          : message.includes('required') || message.includes('Invalid')
            ? 400
            : message.includes('not found')
              ? 404
              : 500;
    console.error('Verification submission error:', err);
    return NextResponse.json(
      { error: message || 'An unexpected error occurred. Please try again later.' },
      { status }
    );
  }
}

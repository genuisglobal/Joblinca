import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const formData = await request.formData();
  // Expect files: id_document, selfie; optionally certificates and references
  // TODO: upload files to Supabase Storage bucket and store their URLs in the verifications table
  return NextResponse.json({ message: 'Verification submission not implemented' }, { status: 501 });
}
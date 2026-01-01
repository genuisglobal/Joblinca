import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * API Route: /api/resume/save
 *
 * Persists a resume to the database.  The request body must be
 * JSON containing the structured resume data.  The authenticated
 * user's ID is used as the owner of the resume.  Optionally a
 * `pdfUrl` property can be provided to link the generated PDF.
 * On success the newly created resume ID is returned.
 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  // Validate the current session.  getUser() returns a user or null.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    // Insert resume row.  We store arbitrary JSON data; pdfUrl may
    // be undefined.
    const { data, error } = await supabase
      .from('resumes')
      .insert({
        user_id: user.id,
        data: body,
        pdf_url: body.pdfUrl ?? null,
      })
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ id: data.id });
  } catch (error) {
    console.error('Error saving resume', error);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
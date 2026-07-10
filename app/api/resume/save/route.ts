import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    // resumeId is a routing hint, not resume content — strip it before storing
    const { resumeId, ...resumeData } = body;

    if (resumeId && typeof resumeId === 'string') {
      const { data, error } = await supabase
        .from('resumes')
        .update({
          data: resumeData,
          pdf_url: resumeData.pdfUrl ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', resumeId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error || !data) {
        return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
      }

      return NextResponse.json({ id: data.id });
    }

    const { data, error } = await supabase
      .from('resumes')
      .insert({
        user_id: user.id,
        data: resumeData,
        pdf_url: resumeData.pdfUrl ?? null,
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

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { renderResumePdf } from '@/lib/resume-templates';
import type { ResumeData } from '@/lib/resume';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let resumeData: ResumeData;
  try {
    resumeData = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const pdfBytes = await renderResumePdf(resumeData);
    const base64 = Buffer.from(pdfBytes).toString('base64');
    return NextResponse.json({ dataUrl: `data:application/pdf;base64,${base64}` });
  } catch (err) {
    console.error('PDF generation failed', err);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { renderResumePdf } from '@/lib/resume-templates';
import { APPLICATION_CV_BUCKET } from '@/lib/storage/resume-links';
import { rateLimit } from '@/lib/rate-limit';
import type { ResumeData } from '@/lib/resume';

export const runtime = 'nodejs';

interface RouteContext {
  params: {
    id: string;
  };
}

/**
 * Renders a saved CV Builder resume to PDF and uploads it to the
 * application CV bucket, so it can be attached to a job application
 * exactly like an uploaded file.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = await rateLimit(`resume-attach:user:${user.id}`, { requests: 20, window: '1h' });
  if (!limit.allowed) return limit.response!;

  const { data: resume, error } = await supabase
    .from('resumes')
    .select('id, data')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (error || !resume) {
    return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
  }

  try {
    const resumeData = resume.data as ResumeData;
    const pdfBytes = await renderResumePdf(resumeData);

    const filePath = `${user.id}/${Date.now()}-cv-builder.pdf`;
    const { error: uploadError } = await supabase.storage
      .from(APPLICATION_CV_BUCKET)
      .upload(filePath, Buffer.from(pdfBytes), {
        cacheControl: '3600',
        upsert: true,
        contentType: 'application/pdf',
      });

    if (uploadError) {
      console.error('Saved resume attach upload failed', uploadError);
      return NextResponse.json({ error: 'Failed to attach resume' }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from(APPLICATION_CV_BUCKET).getPublicUrl(filePath);

    return NextResponse.json({
      path: filePath,
      url: urlData.publicUrl || filePath,
      fileName: `${resumeData.fullName || 'resume'}.pdf`,
    });
  } catch (err) {
    console.error('Saved resume attach failed', err);
    return NextResponse.json({ error: 'Failed to attach resume' }, { status: 500 });
  }
}

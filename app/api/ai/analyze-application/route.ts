import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { NextResponse, type NextRequest } from 'next/server';
import { analyzeApplication, extractTextFromResume } from '@/lib/ai/applicationAnalysis';

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await request.json();
  const { applicationId } = body;

  if (!applicationId) {
    return NextResponse.json({ error: 'applicationId is required' }, { status: 400 });
  }

  // Fetch the application with job details
  const { data: application, error: appError } = await supabase
    .from('applications')
    .select(
      `
      id,
      cover_letter,
      resume_url,
      answers,
      jobs:job_id (
        id,
        title,
        description,
        location,
        recruiter_id
      )
    `
    )
    .eq('id', applicationId)
    .single();

  if (appError || !application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  // Verify ownership
  const job = application.jobs as any;
  if (job?.recruiter_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  // Use service client for AI insights (bypasses RLS)
  const serviceClient = createServiceSupabaseClient();

  // Check if analysis already exists and is recent (within 24 hours)
  const { data: existingInsight } = await serviceClient
    .from('ai_application_insights')
    .select('*')
    .eq('application_id', applicationId)
    .single();

  if (existingInsight?.status === 'processing') {
    return NextResponse.json({
      message: 'Analysis already in progress',
      status: 'processing'
    });
  }

  // Update or create insights record with 'processing' status
  if (existingInsight) {
    await serviceClient
      .from('ai_application_insights')
      .update({
        status: 'processing',
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('application_id', applicationId);
  } else {
    await serviceClient.from('ai_application_insights').insert({
      application_id: applicationId,
      status: 'processing',
    });
  }

  try {
    // Extract resume text if available
    let resumeText: string | null = null;
    if (application.resume_url) {
      resumeText = await extractTextFromResume(application.resume_url);
    }

    // Perform AI analysis
    const result = await analyzeApplication({
      applicationId,
      coverLetter: application.cover_letter,
      resumeUrl: application.resume_url,
      resumeText,
      answers: application.answers as unknown[] | null,
      jobTitle: job.title,
      jobDescription: job.description,
      jobLocation: job.location,
    });

    // Store the results
    await serviceClient
      .from('ai_application_insights')
      .update({
        parsed_profile: result.parsedProfile,
        match_score: result.matchScore,
        strengths: result.strengths,
        gaps: result.gaps,
        reasoning: result.reasoning,
        status: 'completed',
        model_used: result.modelUsed,
        tokens_used: result.tokensUsed,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('application_id', applicationId);

    // Log activity
    await supabase.from('application_activity').insert({
      application_id: applicationId,
      actor_id: user.id,
      action: 'ai_analyzed',
      metadata: {
        match_score: result.matchScore,
        model_used: result.modelUsed,
      },
    });

    // Update ranking score to include AI component
    await serviceClient.rpc('compute_application_ranking', { p_application_id: applicationId });

    return NextResponse.json({
      success: true,
      matchScore: result.matchScore,
      status: 'completed',
    });
  } catch (error) {
    console.error('AI analysis error:', error);

    // Update status to failed
    await serviceClient
      .from('ai_application_insights')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        updated_at: new Date().toISOString(),
      })
      .eq('application_id', applicationId);

    return NextResponse.json(
      { error: 'AI analysis failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

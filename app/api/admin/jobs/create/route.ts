import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';

export async function POST(request: Request) {
  try {
    const { userId, adminType } = await requireAdmin();

    const body = await request.json();
    const {
      title,
      companyName,
      companyLogoUrl,
      location,
      salary,
      workType,
      jobType,
      visibility,
      description,
      autoApprove = true,
      published = true,
      customQuestions,
    } = body;

    // Validate required fields
    if (!title || !description || !companyName) {
      return NextResponse.json(
        { error: 'Title, company name, and description are required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Admin-created jobs need a recruiter_id, but admins may not be recruiters
    // We'll use the admin's own ID as the recruiter_id, or create without it
    // For now, we'll use the admin's ID and handle the constraint

    // First check if admin has a recruiter profile
    const { data: recruiterProfile } = await supabase
      .from('recruiters')
      .select('id')
      .eq('id', userId)
      .single();

    // If admin doesn't have a recruiter profile, create a minimal one
    if (!recruiterProfile) {
      await supabase.from('recruiters').insert({
        id: userId,
        company_name: companyName,
        verified: true,
      });
    }

    // Create the job
    const { data: job, error } = await supabase
      .from('jobs')
      .insert({
        recruiter_id: userId,
        title,
        description,
        location: location || null,
        salary: salary || null,
        company_name: companyName,
        company_logo_url: companyLogoUrl || null,
        work_type: workType || 'onsite',
        job_type: jobType || 'job',
        visibility: visibility || 'public',
        custom_questions: customQuestions || null,
        published: autoApprove ? published : false,
        approval_status: autoApprove ? 'approved' : 'pending',
        approved_at: autoApprove ? new Date().toISOString() : null,
        approved_by: autoApprove ? userId : null,
        posted_by: userId,
        posted_by_role: `admin_${adminType}`,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating job:', error);
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: job.id, job });
  } catch (err) {
    console.error('Admin error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unauthorized' },
      { status: 401 }
    );
  }
}

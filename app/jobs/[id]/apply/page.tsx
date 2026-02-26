import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import ApplyForm from './ApplyForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ApplyPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?redirect=/jobs/${id}/apply`);
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, first_name, last_name, email, role')
    .eq('id', user.id)
    .single();

  if (!profile) {
    redirect('/onboarding');
  }

  // Only job seekers can apply
  if (profile.role !== 'job_seeker') {
    redirect(`/jobs/${id}`);
  }

  // Fetch job seeker profile for contact info
  const { data: jobSeekerProfile } = await supabase
    .from('job_seeker_profiles')
    .select('phone, location, resume_url')
    .eq('user_id', user.id)
    .single();

  // Fetch job details (use * to avoid issues with missing columns)
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (jobError || !job) {
    console.error('Job fetch error:', jobError);
    notFound();
  }

  // Check if job is accepting applications
  // Handle cases where approval_status might not exist (migration not applied)
  const isApproved = job.approval_status === 'approved' || job.approval_status === undefined || job.approval_status === null;
  const isPublished = job.published !== false; // Default to true if not set
  const isNotClosed = !job.closes_at || new Date(job.closes_at) > new Date();

  const isAcceptingApplications = isApproved && isPublished && isNotClosed;

  if (!isAcceptingApplications) {
    redirect(`/jobs/${id}?error=not_accepting`);
  }

  // Check if job uses JobLinca apply method (default to joblinca if not set)
  const applyMethod = job.apply_method || 'joblinca';
  if (applyMethod !== 'joblinca' && applyMethod !== 'multiple') {
    redirect(`/jobs/${id}`);
  }

  // Check if user already applied
  const { data: existingApplication } = await supabase
    .from('applications')
    .select('id, is_draft, contact_info, resume_url, cover_letter, answers')
    .eq('job_id', id)
    .eq('applicant_id', user.id)
    .single();

  // If already submitted (not draft), redirect to job page
  if (existingApplication && !existingApplication.is_draft) {
    redirect(`/jobs/${id}?already_applied=true`);
  }

  // Prepare initial contact info
  const draftContactInfo = existingApplication?.is_draft
    ? (existingApplication.contact_info as { fullName?: string; email?: string; phone?: string; location?: string })
    : null;

  const initialContactInfo = {
    fullName:
      draftContactInfo?.fullName ||
      profile.full_name ||
      `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
    email: draftContactInfo?.email || profile.email || user.email || '',
    phone: draftContactInfo?.phone || jobSeekerProfile?.phone || '',
    location: draftContactInfo?.location || jobSeekerProfile?.location || '',
  };

  const initialResumeUrl =
    (existingApplication?.is_draft && existingApplication.resume_url) ||
    jobSeekerProfile?.resume_url ||
    null;

  const initialCoverLetter =
    existingApplication?.is_draft ? (existingApplication.cover_letter as string | null) || '' : '';

  const initialAnswers =
    existingApplication?.is_draft && Array.isArray(existingApplication.answers)
      ? (existingApplication.answers as { questionId: string; answer: string | string[] | boolean }[])
      : [];

  return (
    <div className="min-h-screen bg-gray-900">
      <ApplyForm
        job={job}
        initialContactInfo={initialContactInfo}
        existingResumeUrl={initialResumeUrl}
        initialCoverLetter={initialCoverLetter}
        draftApplicationId={existingApplication?.id || null}
        initialAnswers={initialAnswers}
      />
    </div>
  );
}

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

  // Fetch job details
  const { data: job } = await supabase
    .from('jobs')
    .select(`
      id,
      title,
      company_name,
      location,
      employment_type,
      salary_min,
      salary_max,
      salary_currency,
      description,
      requirements,
      published,
      approval_status,
      apply_method,
      closes_at,
      recruiter_id
    `)
    .eq('id', id)
    .single();

  if (!job) {
    notFound();
  }

  // Check if job is accepting applications
  const isAcceptingApplications =
    job.published &&
    job.approval_status === 'approved' &&
    (!job.closes_at || new Date(job.closes_at) > new Date());

  if (!isAcceptingApplications) {
    redirect(`/jobs/${id}?error=not_accepting`);
  }

  // Check if job uses JobLinca apply method
  if (job.apply_method !== 'joblinca' && job.apply_method !== 'multiple') {
    redirect(`/jobs/${id}`);
  }

  // Check if user already applied
  const { data: existingApplication } = await supabase
    .from('applications')
    .select('id, is_draft')
    .eq('job_id', id)
    .eq('applicant_id', user.id)
    .single();

  // If already submitted (not draft), redirect to job page
  if (existingApplication && !existingApplication.is_draft) {
    redirect(`/jobs/${id}?already_applied=true`);
  }

  // Prepare initial contact info
  const initialContactInfo = {
    fullName: profile.full_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
    email: profile.email || user.email || '',
    phone: jobSeekerProfile?.phone || '',
    location: jobSeekerProfile?.location || '',
  };

  return (
    <div className="min-h-screen bg-gray-900">
      <ApplyForm
        job={job}
        initialContactInfo={initialContactInfo}
        existingResumeUrl={jobSeekerProfile?.resume_url || null}
        draftApplicationId={existingApplication?.id || null}
      />
    </div>
  );
}

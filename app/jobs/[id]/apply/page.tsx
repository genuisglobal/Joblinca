import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import ApplyForm from './ApplyForm';
import { canRoleApplyToOpportunity } from '@/lib/opportunities';
import { loadJobOpportunityMetadata } from '@/lib/opportunities-server';
import { normalizeApplicantRole } from '@/lib/applications/server';
import { isJobAcceptingApplications } from '@/lib/jobs/lifecycle';

interface PageProps {
  params: Promise<{ id: string }>;
}

function extractPortfolioUrl(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const candidateKeys = ['url', 'link', 'website', 'portfolioUrl'];

    for (const key of candidateKeys) {
      if (typeof record[key] === 'string' && record[key]) {
        return record[key] as string;
      }
    }
  }

  return '';
}

export default async function ApplyPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?redirect=/jobs/${id}/apply`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, first_name, last_name, email, role, phone')
    .eq('id', user.id)
    .single();

  if (!profile) {
    redirect('/onboarding');
  }

  const applicantRole = normalizeApplicantRole(profile.role);

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (jobError || !job) {
    console.error('Job fetch error:', jobError);
    notFound();
  }

  if (
    !canRoleApplyToOpportunity(
      applicantRole,
      job.eligible_roles,
      job.job_type,
      job.internship_track,
      job.visibility
    )
  ) {
    redirect(`/jobs/${id}`);
  }

  const jobSeekerProfile =
    applicantRole === 'job_seeker'
      ? (
          await supabase
            .from('job_seeker_profiles')
            .select('phone, location, resume_url')
            .eq('user_id', user.id)
            .single()
        ).data
      : null;

  const [talentProfile, projectsCountResult, badgeCountResult, internshipMetadataResult] =
    applicantRole === 'talent'
      ? await Promise.all([
          supabase
            .from('talent_profiles')
            .select(
              'school_name, graduation_year, field_of_study, portfolio, skills, resume_url, school_status'
            )
            .eq('user_id', user.id)
            .single(),
          supabase
            .from('projects')
            .select('id', { count: 'exact', head: true })
            .eq('candidate_id', user.id),
          supabase
            .from('user_badges')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),
          job.job_type === 'internship'
            ? loadJobOpportunityMetadata(supabase as any, id)
            : Promise.resolve({ data: null, error: null }),
        ])
      : await Promise.all([
          Promise.resolve({ data: null }),
          Promise.resolve({ count: 0 }),
          Promise.resolve({ count: 0 }),
          job.job_type === 'internship'
            ? loadJobOpportunityMetadata(supabase as any, id)
            : Promise.resolve({ data: null, error: null }),
        ]);

  if (!isJobAcceptingApplications(job)) {
    redirect(`/jobs/${id}?error=not_accepting`);
  }

  const applyMethod = job.apply_method || 'joblinca';
  if (applyMethod !== 'joblinca' && applyMethod !== 'multiple') {
    redirect(`/jobs/${id}`);
  }

  const { data: existingApplication } = await supabase
    .from('applications')
    .select('id, is_draft, contact_info, resume_url, cover_letter, answers, candidate_snapshot')
    .eq('job_id', id)
    .eq('applicant_id', user.id)
    .single();

  if (existingApplication && !existingApplication.is_draft) {
    redirect(`/jobs/${id}?already_applied=true`);
  }

  const candidateSnapshot =
    existingApplication?.is_draft &&
    existingApplication.candidate_snapshot &&
    typeof existingApplication.candidate_snapshot === 'object' &&
    !Array.isArray(existingApplication.candidate_snapshot)
      ? (existingApplication.candidate_snapshot as Record<string, any>)
      : null;

  const draftContactInfo = existingApplication?.is_draft
    ? (existingApplication.contact_info as {
        fullName?: string;
        email?: string;
        phone?: string;
        location?: string;
      })
    : null;

  const talentProfileData = talentProfile?.data || null;
  const initialContactInfo = {
    fullName:
      draftContactInfo?.fullName ||
      profile.full_name ||
      `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
    email: draftContactInfo?.email || profile.email || user.email || '',
    phone: draftContactInfo?.phone || jobSeekerProfile?.phone || profile.phone || '',
    location: draftContactInfo?.location || jobSeekerProfile?.location || '',
  };

  const initialResumeUrl =
    (existingApplication?.is_draft && existingApplication.resume_url) ||
    jobSeekerProfile?.resume_url ||
    talentProfileData?.resume_url ||
    null;

  const initialResumePath =
    typeof candidateSnapshot?.resumePath === 'string' ? candidateSnapshot.resumePath : null;

  const initialCoverLetter =
    existingApplication?.is_draft ? (existingApplication.cover_letter as string | null) || '' : '';

  const initialAnswers =
    existingApplication?.is_draft && Array.isArray(existingApplication.answers)
      ? (existingApplication.answers as {
          questionId: string;
          answer: string | string[] | boolean;
        }[])
      : [];

  return (
    <div className="min-h-screen bg-gray-900">
      <ApplyForm
        job={job}
        applicantRole={applicantRole || profile.role}
        internshipRequirements={internshipMetadataResult.data}
        profileReadiness={{
          projectCount: projectsCountResult.count || 0,
          badgeCount: badgeCountResult.count || 0,
          portfolioUrl: extractPortfolioUrl(talentProfileData?.portfolio),
        }}
        initialEducationDetails={{
          schoolName:
            candidateSnapshot?.educationDetails?.schoolName || talentProfileData?.school_name || '',
          fieldOfStudy:
            candidateSnapshot?.educationDetails?.fieldOfStudy ||
            talentProfileData?.field_of_study ||
            '',
          schoolYear: candidateSnapshot?.educationDetails?.schoolYear || '',
          graduationYear:
            candidateSnapshot?.educationDetails?.graduationYear ||
            (talentProfileData?.graduation_year
              ? String(talentProfileData.graduation_year)
              : ''),
          needsCredit: Boolean(candidateSnapshot?.educationDetails?.needsCredit),
          hasSchoolConvention: Boolean(
            candidateSnapshot?.educationDetails?.hasSchoolConvention
          ),
          academicSupervisor:
            candidateSnapshot?.educationDetails?.academicSupervisor || '',
        }}
        initialProfessionalDetails={{
          portfolioUrl:
            candidateSnapshot?.professionalDetails?.portfolioUrl ||
            extractPortfolioUrl(talentProfileData?.portfolio),
          projectHighlights:
            candidateSnapshot?.professionalDetails?.projectHighlights || '',
          weeklyAvailability:
            candidateSnapshot?.professionalDetails?.weeklyAvailability || '',
          experienceSummary:
            candidateSnapshot?.professionalDetails?.experienceSummary || '',
        }}
        initialContactInfo={initialContactInfo}
        existingResumeUrl={initialResumeUrl}
        existingResumePath={initialResumePath}
        initialCoverLetter={initialCoverLetter}
        draftApplicationId={existingApplication?.id || null}
        initialAnswers={initialAnswers}
      />
    </div>
  );
}

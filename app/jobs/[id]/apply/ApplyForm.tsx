'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { ApplicationEligibilityPreview } from '@/lib/applications/eligibility';
import { getOpportunityTypeLabel } from '@/lib/opportunities';

type CustomQuestion = {
  id: string;
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'yesno';
  question: string;
  required: boolean;
  options?: string[];
};

type QuestionAnswer = {
  questionId: string;
  answer: string | string[] | boolean;
};

type InternshipTrack = 'education' | 'professional' | 'unspecified' | null;

type InternshipRequirements = {
  schoolRequired?: boolean;
  allowedSchools?: string[];
  allowedFieldsOfStudy?: string[];
  allowedSchoolYears?: string[];
  graduationYearMin?: number | null;
  graduationYearMax?: number | null;
  creditBearing?: boolean;
  requiresSchoolConvention?: boolean;
  academicCalendar?: string | null;
  academicSupervisorRequired?: boolean;
  portfolioRequired?: boolean;
  minimumProjectCount?: number | null;
  minimumBadgeCount?: number | null;
  conversionPossible?: boolean;
  expectedWeeklyAvailability?: string | null;
  stipendType?: string | null;
};

type EducationDetails = {
  schoolName: string;
  fieldOfStudy: string;
  schoolYear: string;
  graduationYear: string;
  needsCredit: boolean;
  hasSchoolConvention: boolean;
  academicSupervisor: string;
};

type ProfessionalDetails = {
  portfolioUrl: string;
  projectHighlights: string;
  weeklyAvailability: string;
  experienceSummary: string;
};

type ProfileReadiness = {
  projectCount: number;
  badgeCount: number;
  portfolioUrl: string;
};

type Job = {
  id: string;
  title: string;
  company_name: string;
  location: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  description: string | null;
  requirements: string | null;
  custom_questions: CustomQuestion[] | null;
  job_type: string | null;
  internship_track: InternshipTrack;
};

type ContactInfo = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
};

type ApplyFormProps = {
  job: Job;
  applicantRole: string;
  internshipRequirements: InternshipRequirements | null;
  profileReadiness: ProfileReadiness;
  initialEducationDetails: EducationDetails;
  initialProfessionalDetails: ProfessionalDetails;
  initialContactInfo: ContactInfo;
  existingResumeUrl: string | null;
  initialCoverLetter: string;
  draftApplicationId: string | null;
  initialAnswers: QuestionAnswer[];
};

type ApplicationSubmitResponse = {
  error?: string;
  code?: string;
  eligibilityPreview?: ApplicationEligibilityPreview;
};

type Step = 'contact' | 'education' | 'experience' | 'resume' | 'questions' | 'review';
type CompletionAction =
  | {
      key: string;
      label: string;
      description: string;
      kind: 'step';
      step: Step;
    }
  | {
      key: string;
      label: string;
      description: string;
      kind: 'href';
      href: string;
    };

// Correct bucket id (matches your Supabase bucket + policies)
const CV_BUCKET = 'application-cvs';

function formatList(values: string[] | undefined) {
  if (!values || values.length === 0) {
    return 'No specific restriction';
  }

  return values.join(', ');
}

function getCandidateProfileHref(role: string) {
  return role === 'talent' ? '/dashboard/talent/profile' : '/dashboard/job-seeker/profile';
}

function getApplicationSubmitErrorMessage(
  response: ApplicationSubmitResponse | null,
  status: number
) {
  switch (response?.code) {
    case 'application_draft_out_of_sync':
      return 'Your saved application draft needs to be refreshed before it can be submitted. Reload the page and try again.';
    case 'application_duplicate':
      return 'You have already applied to this opportunity.';
    case 'job_not_accepting_applications':
      return 'This opportunity is no longer accepting applications.';
    case 'application_submission_blocked':
      return 'Your application could not be submitted right now. Please try again in a moment.';
    case 'application_submit_failed':
      return 'We could not submit your application right now. Please refresh the page and try again. If the problem continues, contact support.';
    case 'application_ineligible':
      return response.error || 'Your profile is not eligible for this opportunity yet.';
    default:
      break;
  }

  if (status === 401) {
    return 'Your session has expired. Please sign in again and resubmit your application.';
  }

  if (status === 403) {
    return 'This account is not permitted to apply for opportunities.';
  }

  if (status === 422 && response?.error) {
    return response.error;
  }

  if (status >= 500) {
    return 'We could not submit your application right now. Please refresh the page and try again. If the problem continues, contact support.';
  }

  return response?.error || 'We could not submit your application right now. Please refresh the page and try again.';
}

function buildCompletionActions(input: {
  role: string;
  isEducationInternship: boolean;
  isProfessionalInternship: boolean;
  preview: ApplicationEligibilityPreview | null;
}): CompletionAction[] {
  if (!input.preview) {
    return [];
  }

  const actions = new Map<string, CompletionAction>();
  const issues = [
    ...input.preview.blockingReasons,
    ...input.preview.missingProfileFields,
    ...input.preview.recommendedProfileUpdates,
  ];

  const addAction = (action: CompletionAction) => {
    if (!actions.has(action.key)) {
      actions.set(action.key, action);
    }
  };

  const profileHref = getCandidateProfileHref(input.role);

  for (const issue of issues) {
    const normalized = issue.toLowerCase();

    if (
      normalized.includes('phone') ||
      normalized.includes('email') ||
      normalized.includes('contact')
    ) {
      addAction({
        key: 'step-contact',
        label: 'Edit contact info',
        description: 'Fix phone or contact details in this application.',
        kind: 'step',
        step: 'contact',
      });
      addAction({
        key: 'profile-contact',
        label: 'Open profile',
        description: 'Update saved contact details in your dashboard profile.',
        kind: 'href',
        href: profileHref,
      });
    }

    if (normalized.includes('resume') || normalized.includes('cv')) {
      addAction({
        key: 'step-resume',
        label: 'Review resume',
        description: 'Upload or replace the resume attached to this application.',
        kind: 'step',
        step: 'resume',
      });
      addAction({
        key: 'profile-resume',
        label: 'Open profile',
        description: 'Update the saved resume in your dashboard profile.',
        kind: 'href',
        href: profileHref,
      });
    }

    if (
      input.isEducationInternship &&
      (normalized.includes('school') ||
        normalized.includes('institution') ||
        normalized.includes('field of study') ||
        normalized.includes('graduation') ||
        normalized.includes('school year') ||
        normalized.includes('academic supervisor') ||
        normalized.includes('convention'))
    ) {
      addAction({
        key: 'step-education',
        label: 'Edit education details',
        description: 'Fix academic details in this internship application.',
        kind: 'step',
        step: 'education',
      });
      if (input.role === 'talent') {
        addAction({
          key: 'profile-education',
          label: 'Update talent profile',
          description: 'Refresh school, graduation, or field of study on your profile.',
          kind: 'href',
          href: '/dashboard/talent/profile',
        });
      }
    }

    if (
      input.isProfessionalInternship &&
      (normalized.includes('portfolio') ||
        normalized.includes('availability') ||
        normalized.includes('experience') ||
        normalized.includes('work sample'))
    ) {
      addAction({
        key: 'step-experience',
        label: 'Edit experience details',
        description: 'Update portfolio, availability, or experience details in this application.',
        kind: 'step',
        step: 'experience',
      });
      if (input.role === 'talent' && normalized.includes('portfolio')) {
        addAction({
          key: 'profile-portfolio',
          label: 'Update talent profile',
          description: 'Refresh your saved portfolio link in your talent profile.',
          kind: 'href',
          href: '/dashboard/talent/profile',
        });
      }
    }

    if (input.role === 'talent' && normalized.includes('project')) {
      addAction({
        key: 'projects-new',
        label: 'Add projects',
        description: 'Open your projects area and add stronger portfolio work.',
        kind: 'href',
        href: '/dashboard/talent/projects/new',
      });
    }

    if (normalized.includes('badge')) {
      addAction({
        key: 'skillup',
        label: 'Earn badges',
        description: 'Open Skill Up to strengthen verification and learning badges.',
        kind: 'href',
        href: '/dashboard/skillup',
      });
    }
  }

  if (actions.size === 0 && issues.length > 0) {
    addAction({
      key: 'profile-general',
      label: 'Open profile',
      description: 'Review your saved profile details before submitting.',
      kind: 'href',
      href: profileHref,
    });
  }

  return Array.from(actions.values());
}

export default function ApplyForm({
  job,
  applicantRole,
  internshipRequirements,
  profileReadiness,
  initialEducationDetails,
  initialProfessionalDetails,
  initialContactInfo,
  existingResumeUrl,
  initialCoverLetter,
  draftApplicationId,
  initialAnswers,
}: ApplyFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const hasQuestions = Array.isArray(job.custom_questions) && job.custom_questions.length > 0;
  const isEducationInternship =
    job.job_type === 'internship' && job.internship_track === 'education';
  const isProfessionalInternship =
    job.job_type === 'internship' && job.internship_track === 'professional';
  const opportunityLabel = getOpportunityTypeLabel(job.job_type, job.internship_track);

  const STEPS: { key: Step; label: string }[] = [
    { key: 'contact', label: 'Contact Info' },
    ...(isEducationInternship ? [{ key: 'education' as Step, label: 'Education' }] : []),
    ...(isProfessionalInternship ? [{ key: 'experience' as Step, label: 'Experience' }] : []),
    { key: 'resume', label: 'Resume' },
    ...(hasQuestions ? [{ key: 'questions' as Step, label: 'Questions' }] : []),
    { key: 'review', label: 'Review & Submit' },
  ];

  const [currentStep, setCurrentStep] = useState<Step>('contact');
  const [contactInfo, setContactInfo] = useState<ContactInfo>(initialContactInfo);
  const [educationDetails, setEducationDetails] = useState<EducationDetails>(
    initialEducationDetails
  );
  const [professionalDetails, setProfessionalDetails] = useState<ProfessionalDetails>(
    initialProfessionalDetails
  );
  const [resumeUrl, setResumeUrl] = useState<string | null>(existingResumeUrl);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumePath, setResumePath] = useState<string | null>(null);
  const [coverLetter, setCoverLetter] = useState(initialCoverLetter);
  const [answers, setAnswers] = useState<QuestionAnswer[]>(initialAnswers);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(draftApplicationId);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [eligibilityPreview, setEligibilityPreview] =
    useState<ApplicationEligibilityPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewSignature, setPreviewSignature] = useState<string | null>(null);

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep);

  const getAnswer = (questionId: string): string | string[] | boolean => {
    const found = answers.find((a) => a.questionId === questionId);
    return found?.answer ?? '';
  };

  const setAnswer = (questionId: string, value: string | string[] | boolean) => {
    setAnswers((prev) => {
      const existing = prev.findIndex((a) => a.questionId === questionId);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { questionId, answer: value };
        return updated;
      }
      return [...prev, { questionId, answer: value }];
    });
  };

  const buildCandidateSnapshot = useCallback(
    () => ({
      role: applicantRole,
      contactInfo,
      hasResume: Boolean(resumeUrl),
      resumePath,
      internshipTrack: job.internship_track || null,
      educationDetails: isEducationInternship ? educationDetails : null,
      professionalDetails: isProfessionalInternship ? professionalDetails : null,
      profileReadiness,
    }),
    [
      applicantRole,
      contactInfo,
      resumeUrl,
      resumePath,
      job.internship_track,
      isEducationInternship,
      isProfessionalInternship,
      educationDetails,
      professionalDetails,
      profileReadiness,
    ]
  );

  const buildApplicationPayload = useCallback(
    () => ({
      jobId: job.id,
      draftApplicationId: draftId,
      contactInfo,
      resumeUrl,
      resumePath,
      coverLetter: coverLetter || null,
      answers: answers.length > 0 ? answers : null,
      applicationChannel: 'native_apply',
      educationDetails: isEducationInternship ? educationDetails : null,
      professionalDetails: isProfessionalInternship ? professionalDetails : null,
      profileReadiness,
    }),
    [
      job.id,
      draftId,
      contactInfo,
      resumeUrl,
      resumePath,
      coverLetter,
      answers,
      isEducationInternship,
      isProfessionalInternship,
      educationDetails,
      professionalDetails,
      profileReadiness,
    ]
  );

  const buildPreviewSignature = useCallback(
    () => JSON.stringify(buildApplicationPayload()),
    [buildApplicationPayload]
  );

  // Autosave draft
  const saveDraft = useCallback(async () => {
    try {
      // Get user for applicant_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const applicationData = {
        job_id: job.id,
        applicant_id: user.id,
        contact_info: contactInfo,
        resume_url: resumeUrl,
        cover_letter: coverLetter || null,
        answers: answers.length > 0 ? answers : null,
        status: 'submitted',
        is_draft: true,
        applicant_role: applicantRole,
        application_source: 'joblinca',
        application_channel: 'native_apply',
        started_at: draftId ? undefined : new Date().toISOString(),
        submitted_at: null,
        candidate_snapshot: buildCandidateSnapshot(),
      };

      if (draftId) {
        // Don't update applicant_id on existing draft
        const { applicant_id, ...updateData } = applicationData;
        await supabase
          .from('applications')
          .update(updateData)
          .eq('id', draftId);
      } else {
        const { data } = await supabase
          .from('applications')
          .insert(applicationData)
          .select('id')
          .single();
        if (data) {
          setDraftId(data.id);
        }
      }
      setLastSaved(new Date());
    } catch (err) {
      console.error('Failed to save draft:', err);
    }
  }, [
    job.id,
    contactInfo,
    resumeUrl,
    coverLetter,
    answers,
    draftId,
    supabase,
    applicantRole,
    buildCandidateSnapshot,
  ]);

  // Autosave every 30 seconds if there are changes
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentStep !== 'review') {
        saveDraft();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [saveDraft, currentStep]);

  const handleContactChange = (field: keyof ContactInfo, value: string) => {
    setContactInfo((prev) => ({ ...prev, [field]: value }));
  };

  // Resume upload handler
  const handleResumeUpload = async (file: File) => {
    setIsUploading(true);
    setError(null);

    try {
      // 1) Verify the user is authenticated
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('Please log in to upload your resume');
      }

      // 2) Build path: <user_id>/<filename>
      const fileExt = file.name.split('.').pop();
      const safeExt = fileExt ? fileExt.toLowerCase() : 'pdf';
      const filePath = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${safeExt}`;

      // 3) Upload to storage bucket
      const { error: uploadError } = await supabase.storage
        .from(CV_BUCKET)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);

        if (uploadError.message.includes('bucket') || uploadError.message.includes('not found')) {
          throw new Error('Resume upload is temporarily unavailable. You can continue without a resume, or try again later.');
        } else if (uploadError.message.includes('permission') || uploadError.message.includes('policy')) {
          throw new Error('Upload permission denied. You can continue without a resume, or try logging in again.');
        } else {
          throw new Error(`Upload failed: ${uploadError.message}. You can continue without a resume.`);
        }
      }

      // 4) Save resume_path in state
      setResumePath(filePath);

      // 5) Get URL for UI preview - try signed URL first, fallback to public
      const { data: signed, error: signedErr } = await supabase.storage
        .from(CV_BUCKET)
        .createSignedUrl(filePath, 60 * 60); // 1 hour

      if (!signedErr && signed?.signedUrl) {
        setResumeUrl(signed.signedUrl);
      } else {
        const { data: urlData } = supabase.storage.from(CV_BUCKET).getPublicUrl(filePath);
        setResumeUrl(urlData.publicUrl || null);
      }

      setResumeFile(file);
    } catch (err) {
      console.error('Resume upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload resume');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];
      if (!validTypes.includes(file.type)) {
        setError('Please upload a PDF or Word document');
        return;
      }
      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB');
        return;
      }
      handleResumeUpload(file);
    }
  };

  const validateStep = (step: Step): boolean => {
    switch (step) {
      case 'contact':
        return !!(
          contactInfo.fullName.trim() &&
          contactInfo.email.trim() &&
          contactInfo.phone.trim()
        );
      case 'education':
        return !!(
          educationDetails.schoolName.trim() &&
          educationDetails.fieldOfStudy.trim() &&
          educationDetails.graduationYear.trim() &&
          (!internshipRequirements?.allowedSchoolYears?.length || educationDetails.schoolYear.trim())
        );
      case 'experience':
        return !!(
          professionalDetails.experienceSummary.trim() &&
          professionalDetails.weeklyAvailability.trim() &&
          (!internshipRequirements?.portfolioRequired || professionalDetails.portfolioUrl.trim())
        );
      case 'resume':
        return true;
      case 'questions':
        if (!hasQuestions) return true;
        for (const q of job.custom_questions!) {
          if (q.required) {
            const ans = getAnswer(q.id);
            if (ans === '' || ans === undefined || ans === null) return false;
            if (Array.isArray(ans) && ans.length === 0) return false;
          }
        }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (!validateStep(currentStep)) {
      setError('Please fill in all required fields');
      return;
    }
    setError(null);
    saveDraft();

    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].key);
    }
  };

  const handleBack = () => {
    setError(null);
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].key);
    }
  };

  const runEligibilityPreview = useCallback(
    async (force = false) => {
      const signature = buildPreviewSignature();
      if (!force && eligibilityPreview && previewSignature === signature) {
        return eligibilityPreview;
      }

      setIsPreviewLoading(true);
      setPreviewError(null);

      try {
        const response = await fetch(`/api/jobs/${job.id}/eligibility-preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildApplicationPayload()),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to check application eligibility');
        }

        setEligibilityPreview(data as ApplicationEligibilityPreview);
        setPreviewSignature(signature);
        return data as ApplicationEligibilityPreview;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to check application eligibility';
        setPreviewError(message);
        throw err;
      } finally {
        setIsPreviewLoading(false);
      }
    },
    [
      buildApplicationPayload,
      buildPreviewSignature,
      eligibilityPreview,
      job.id,
      previewSignature,
    ]
  );

  useEffect(() => {
    if (currentStep === 'review') {
      void runEligibilityPreview();
    }
  }, [currentStep, runEligibilityPreview]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    setPreviewError(null);

    try {
      const preview = await runEligibilityPreview();
      if (preview.eligibilityStatus === 'ineligible') {
        throw new Error(
          preview.blockingReasons[0] || 'This profile is not eligible for the opportunity'
        );
      }

      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildApplicationPayload()),
      });

      const data = (await response.json().catch(() => null)) as ApplicationSubmitResponse | null;
      if (!response.ok) {
        if (data?.eligibilityPreview) {
          setEligibilityPreview(data.eligibilityPreview as ApplicationEligibilityPreview);
          setPreviewSignature(buildPreviewSignature());
        }
        throw new Error(getApplicationSubmitErrorMessage(data, response.status));
      }

      router.push(`/jobs/${job.id}/apply/success`);
    } catch (err: unknown) {
      console.error('Submit error:', err);
      const errorMessage = err instanceof Error ? err.message :
        (typeof err === 'object' && err !== null && 'message' in err) ? String((err as {message: string}).message) :
        'Failed to submit application';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewDescription = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    await saveDraft();
    router.push(`/jobs/${job.id}`);
  };

  const formatSalary = () => {
    if (!job.salary_min && !job.salary_max) return null;
    const currency = job.salary_currency || 'USD';
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    });

    if (job.salary_min && job.salary_max) {
      return `${formatter.format(job.salary_min)} - ${formatter.format(job.salary_max)}`;
    }
    if (job.salary_min) return `From ${formatter.format(job.salary_min)}`;
    if (job.salary_max) return `Up to ${formatter.format(job.salary_max)}`;
    return null;
  };

  const profileAlerts = [
    internshipRequirements?.minimumProjectCount &&
    profileReadiness.projectCount < internshipRequirements.minimumProjectCount
      ? `This internship expects at least ${internshipRequirements.minimumProjectCount} projects. Your profile currently shows ${profileReadiness.projectCount}.`
      : null,
    internshipRequirements?.minimumBadgeCount &&
    profileReadiness.badgeCount < internshipRequirements.minimumBadgeCount
      ? `This internship expects at least ${internshipRequirements.minimumBadgeCount} badges. Your profile currently shows ${profileReadiness.badgeCount}.`
      : null,
  ].filter(Boolean) as string[];
  const previewStatusTone =
    !eligibilityPreview
      ? 'border-gray-700 bg-gray-700/40 text-gray-200'
      : eligibilityPreview.eligibilityStatus === 'eligible'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
      : eligibilityPreview.eligibilityStatus === 'needs_review'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
        : 'border-red-500/30 bg-red-500/10 text-red-100';
  const previewStatusLabel =
    !eligibilityPreview
      ? 'Checking eligibility'
      : eligibilityPreview.eligibilityStatus === 'eligible'
      ? 'Eligible to submit'
      : eligibilityPreview.eligibilityStatus === 'needs_review'
        ? 'Eligible, with profile updates recommended'
        : 'Not eligible yet';
  const completionActions = buildCompletionActions({
    role: applicantRole,
    isEducationInternship,
    isProfessionalInternship,
    preview: eligibilityPreview,
  });

  const handleCompletionAction = async (action: CompletionAction) => {
    if (action.kind === 'step') {
      setCurrentStep(action.step);
      return;
    }

    await saveDraft();
    router.push(action.href);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`/jobs/${job.id}`}
          className="text-blue-400 hover:text-blue-300 text-sm mb-4 inline-flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to job
        </Link>
        <h1 className="text-2xl font-bold text-white">Apply for {job.title}</h1>
        <p className="text-gray-400">{job.company_name} - {opportunityLabel}</p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between max-w-md">
          {STEPS.map((step, index) => (
            <div key={step.key} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    index < currentStepIndex
                      ? 'bg-green-600 text-white'
                      : index === currentStepIndex
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {index < currentStepIndex ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`mt-2 text-xs ${
                    index === currentStepIndex ? 'text-white' : 'text-gray-500'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`w-16 h-0.5 mx-2 ${
                    index < currentStepIndex ? 'bg-green-600' : 'bg-gray-700'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Section */}
        <div className="lg:col-span-2">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            {error && (
              <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-400">
                {error}
              </div>
            )}

            {/* Contact Info Step */}
            {currentStep === 'contact' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-white mb-4">Contact Information</h2>
                <p className="text-gray-400 text-sm mb-6">
                  This information will be shared with the employer
                </p>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Full Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={contactInfo.fullName}
                    onChange={(e) => handleContactChange('fullName', e.target.value)}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Your full name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Email Address <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    value={contactInfo.email}
                    onChange={(e) => handleContactChange('email', e.target.value)}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="your@email.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Phone Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    value={contactInfo.phone}
                    onChange={(e) => handleContactChange('phone', e.target.value)}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Location
                  </label>
                  <input
                    type="text"
                    value={contactInfo.location}
                    onChange={(e) => handleContactChange('location', e.target.value)}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="City, Country"
                  />
                </div>
              </div>
            )}

            {currentStep === 'education' && isEducationInternship && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-white mb-4">Educational Internship Details</h2>
                <p className="text-gray-400 text-sm mb-6">
                  Provide academic information so the recruiter can confirm school and placement fit.
                </p>

                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <p>Target schools: {formatList(internshipRequirements?.allowedSchools)}</p>
                    <p>School years: {formatList(internshipRequirements?.allowedSchoolYears)}</p>
                    <p>Fields of study: {formatList(internshipRequirements?.allowedFieldsOfStudy)}</p>
                    <p>Academic calendar: {internshipRequirements?.academicCalendar || 'Not specified'}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    School / Institution <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={educationDetails.schoolName}
                    onChange={(e) => setEducationDetails((prev) => ({ ...prev, schoolName: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Your university or school"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Field of Study <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={educationDetails.fieldOfStudy}
                    onChange={(e) => setEducationDetails((prev) => ({ ...prev, fieldOfStudy: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Computer science, accounting, law..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      School Year{internshipRequirements?.allowedSchoolYears?.length ? ' *' : ''}
                    </label>
                    <input
                      type="text"
                      value={educationDetails.schoolYear}
                      onChange={(e) => setEducationDetails((prev) => ({ ...prev, schoolYear: e.target.value }))}
                      className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Year 3, final year, masters..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Graduation Year <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="number"
                      value={educationDetails.graduationYear}
                      onChange={(e) => setEducationDetails((prev) => ({ ...prev, graduationYear: e.target.value }))}
                      className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="2027"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setEducationDetails((prev) => ({ ...prev, needsCredit: !prev.needsCredit }))}
                    className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                      educationDetails.needsCredit
                        ? 'border-blue-500 bg-blue-600/20 text-white'
                        : 'border-gray-600 bg-gray-700 text-gray-300'
                    }`}
                  >
                    <p className="font-medium">Credit-bearing placement</p>
                    <p className="mt-1 text-sm opacity-80">{educationDetails.needsCredit ? 'Yes' : 'No'}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEducationDetails((prev) => ({ ...prev, hasSchoolConvention: !prev.hasSchoolConvention }))}
                    className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                      educationDetails.hasSchoolConvention
                        ? 'border-blue-500 bg-blue-600/20 text-white'
                        : 'border-gray-600 bg-gray-700 text-gray-300'
                    }`}
                  >
                    <p className="font-medium">School convention available</p>
                    <p className="mt-1 text-sm opacity-80">{educationDetails.hasSchoolConvention ? 'Yes' : 'No'}</p>
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Academic Supervisor</label>
                  <input
                    type="text"
                    value={educationDetails.academicSupervisor}
                    onChange={(e) => setEducationDetails((prev) => ({ ...prev, academicSupervisor: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Supervisor name or email"
                  />
                </div>
              </div>
            )}

            {currentStep === 'experience' && isProfessionalInternship && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-white mb-4">Professional Internship Details</h2>
                <p className="text-gray-400 text-sm mb-6">
                  Show your work readiness, project strength, and weekly availability.
                </p>

                <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-100">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <p>Portfolio required: {internshipRequirements?.portfolioRequired ? 'Yes' : 'No'}</p>
                    <p>Weekly availability: {internshipRequirements?.expectedWeeklyAvailability || 'Not specified'}</p>
                    <p>Minimum projects: {internshipRequirements?.minimumProjectCount ?? 'Not specified'}</p>
                    <p>Minimum badges: {internshipRequirements?.minimumBadgeCount ?? 'Not specified'}</p>
                  </div>
                </div>

                {profileAlerts.length > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                    {profileAlerts.map((alert) => (
                      <p key={alert}>{alert}</p>
                    ))}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Portfolio URL{internshipRequirements?.portfolioRequired ? ' *' : ''}
                  </label>
                  <input
                    type="url"
                    value={professionalDetails.portfolioUrl}
                    onChange={(e) => setProfessionalDetails((prev) => ({ ...prev, portfolioUrl: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="https://yourportfolio.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Weekly Availability <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={professionalDetails.weeklyAvailability}
                    onChange={(e) => setProfessionalDetails((prev) => ({ ...prev, weeklyAvailability: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Example: 25 hours per week"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Project Highlights</label>
                  <textarea
                    value={professionalDetails.projectHighlights}
                    onChange={(e) => setProfessionalDetails((prev) => ({ ...prev, projectHighlights: e.target.value }))}
                    rows={4}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    placeholder="Describe the projects or shipped work most relevant to this internship."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Experience Summary <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={professionalDetails.experienceSummary}
                    onChange={(e) => setProfessionalDetails((prev) => ({ ...prev, experienceSummary: e.target.value }))}
                    rows={5}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    placeholder="Summarize your practical experience, tools used, and outcomes."
                  />
                </div>
              </div>
            )}

            {/* Resume Step */}
            {currentStep === 'resume' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-white">Resume</h2>
                  <span className="text-sm text-gray-500">(Optional)</span>
                </div>
                <p className="text-gray-400 text-sm mb-6">
                  Upload your resume to strengthen your application, or continue without one
                </p>

                <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center">
                  {resumeUrl ? (
                    <div className="space-y-4">
                      <div className="inline-flex items-center justify-center w-16 h-16 bg-green-900/50 rounded-full">
                        <svg
                          className="w-8 h-8 text-green-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="text-white font-medium">
                          {resumeFile?.name || 'Resume uploaded'}
                        </p>
                        <p className="text-gray-400 text-sm">
                          {resumeFile
                            ? `${(resumeFile.size / 1024).toFixed(1)} KB`
                            : 'Using existing resume'}
                        </p>
                      </div>
                      <div className="flex items-center justify-center gap-3">
                        <label className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg cursor-pointer transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                            />
                          </svg>
                          Replace
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx"
                            onChange={handleFileChange}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setResumeUrl(null);
                            setResumeFile(null);
                            setResumePath(null); // clear resume_path too
                          }}
                          className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-700 rounded-full">
                        <svg
                          className="w-8 h-8 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="text-white font-medium">Upload your resume</p>
                        <p className="text-gray-400 text-sm">PDF or Word document, max 5MB</p>
                      </div>
                      <label className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors">
                        {isUploading ? (
                          <>
                            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              />
                            </svg>
                            Uploading...
                          </>
                        ) : (
                          <>
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                              />
                            </svg>
                            Choose File
                          </>
                        )}
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx"
                          onChange={handleFileChange}
                          className="hidden"
                          disabled={isUploading}
                        />
                      </label>
                      <p className="text-gray-500 text-xs mt-2">
                        You can also continue without a resume
                      </p>
                    </div>
                  )}
                </div>

                {/* Optional Cover Letter */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Cover Letter (Optional)
                  </label>
                  <textarea
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    rows={6}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    placeholder="Tell the employer why you're a great fit for this role..."
                  />
                </div>
              </div>
            )}

            {/* Questions Step */}
            {currentStep === 'questions' && hasQuestions && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-white mb-4">Screening Questions</h2>
                <p className="text-gray-400 text-sm mb-6">
                  Please answer the following questions from the employer
                </p>

                {job.custom_questions!.map((q) => (
                  <div key={q.id}>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {q.question}
                      {q.required && <span className="text-red-400 ml-1">*</span>}
                    </label>

                    {q.type === 'text' && (
                      <input
                        type="text"
                        value={(getAnswer(q.id) as string) || ''}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Your answer"
                      />
                    )}

                    {q.type === 'textarea' && (
                      <textarea
                        value={(getAnswer(q.id) as string) || ''}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                        rows={4}
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                        placeholder="Your answer"
                      />
                    )}

                    {q.type === 'yesno' && (
                      <div className="flex gap-4">
                        <button
                          type="button"
                          onClick={() => setAnswer(q.id, true)}
                          className={`px-6 py-2.5 rounded-lg font-medium transition-colors ${
                            getAnswer(q.id) === true
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnswer(q.id, false)}
                          className={`px-6 py-2.5 rounded-lg font-medium transition-colors ${
                            getAnswer(q.id) === false
                              ? 'bg-red-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          No
                        </button>
                      </div>
                    )}

                    {q.type === 'select' && q.options && (
                      <select
                        value={(getAnswer(q.id) as string) || ''}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select an option</option>
                        {q.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}

                    {q.type === 'multiselect' && q.options && (
                      <div className="space-y-2">
                        {q.options.map((opt) => {
                          const currentVal = (getAnswer(q.id) as string[]) || [];
                          const isChecked = currentVal.includes(opt);
                          return (
                            <label
                              key={opt}
                              className="flex items-center gap-3 px-4 py-2.5 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-600 transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  const updated = isChecked
                                    ? currentVal.filter((v) => v !== opt)
                                    : [...currentVal, opt];
                                  setAnswer(q.id, updated);
                                }}
                                className="w-4 h-4 text-blue-600 bg-gray-600 border-gray-500 rounded focus:ring-blue-500"
                              />
                              <span className="text-white text-sm">{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Review Step */}
            {currentStep === 'review' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-white mb-4">Review Your Application</h2>
                <p className="text-gray-400 text-sm mb-6">
                  Please review your information before submitting this {opportunityLabel.toLowerCase()} application
                </p>

                <div className="space-y-6">
                  {/* Contact Info Summary */}
                  <div className="bg-gray-700/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-white font-medium">Contact Information</h3>
                      <button
                        onClick={() => setCurrentStep('contact')}
                        className="text-blue-400 hover:text-blue-300 text-sm"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">Name:</span>
                        <p className="text-white">{contactInfo.fullName}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Email:</span>
                        <p className="text-white">{contactInfo.email}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Phone:</span>
                        <p className="text-white">{contactInfo.phone}</p>
                      </div>
                      {contactInfo.location && (
                        <div>
                          <span className="text-gray-400">Location:</span>
                          <p className="text-white">{contactInfo.location}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {isEducationInternship && (
                    <div className="bg-gray-700/50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-white font-medium">Educational Details</h3>
                        <button
                          onClick={() => setCurrentStep('education')}
                          className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                          Edit
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-400">School:</span>
                          <p className="text-white">{educationDetails.schoolName}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Field of study:</span>
                          <p className="text-white">{educationDetails.fieldOfStudy}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">School year:</span>
                          <p className="text-white">{educationDetails.schoolYear || 'Not provided'}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Graduation year:</span>
                          <p className="text-white">{educationDetails.graduationYear}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {isProfessionalInternship && (
                    <div className="bg-gray-700/50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-white font-medium">Professional Details</h3>
                        <button
                          onClick={() => setCurrentStep('experience')}
                          className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                          Edit
                        </button>
                      </div>
                      <div className="space-y-3 text-sm">
                        <div>
                          <span className="text-gray-400">Portfolio:</span>
                          <p className="text-white">{professionalDetails.portfolioUrl || 'Not provided'}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Weekly availability:</span>
                          <p className="text-white">{professionalDetails.weeklyAvailability}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Project highlights:</span>
                          <p className="text-white whitespace-pre-wrap">{professionalDetails.projectHighlights || 'Not provided'}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Experience summary:</span>
                          <p className="text-white whitespace-pre-wrap">{professionalDetails.experienceSummary}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Resume Summary */}
                  <div className="bg-gray-700/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-white font-medium">Resume</h3>
                      <button
                        onClick={() => setCurrentStep('resume')}
                        className="text-blue-400 hover:text-blue-300 text-sm"
                      >
                        Edit
                      </button>
                    </div>
                    {resumeUrl ? (
                      <div className="flex items-center gap-3">
                        <svg
                          className="w-8 h-8 text-blue-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        <div>
                          <p className="text-white">{resumeFile?.name || 'Resume'}</p>
                          <p className="text-gray-400 text-sm">Uploaded and ready</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <svg
                          className="w-8 h-8 text-gray-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        <div>
                          <p className="text-gray-400">No resume attached</p>
                          <p className="text-gray-500 text-sm">You can add one before submitting</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Cover Letter Summary */}
                  {coverLetter && (
                    <div className="bg-gray-700/50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-white font-medium">Cover Letter</h3>
                        <button
                          onClick={() => setCurrentStep('resume')}
                          className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                          Edit
                        </button>
                      </div>
                      <p className="text-gray-300 text-sm whitespace-pre-wrap line-clamp-4">
                        {coverLetter}
                      </p>
                    </div>
                  )}

                  {/* Screening Questions Summary */}
                  {hasQuestions && answers.length > 0 && (
                    <div className="bg-gray-700/50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-white font-medium">Screening Questions</h3>
                        <button
                          onClick={() => setCurrentStep('questions')}
                          className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                          Edit
                        </button>
                      </div>
                      <div className="space-y-3">
                        {job.custom_questions!.map((q) => {
                          const ans = getAnswer(q.id);
                          const displayAnswer =
                            ans === true ? 'Yes' :
                            ans === false ? 'No' :
                            Array.isArray(ans) ? ans.join(', ') :
                            (ans as string) || '-';
                          return (
                            <div key={q.id} className="text-sm">
                              <span className="text-gray-400">{q.question}</span>
                              <p className="text-white mt-0.5">{displayAnswer}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className={`rounded-lg border p-4 ${previewStatusTone}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-medium text-white">Eligibility Preview</h3>
                      <p className="mt-1 text-sm">
                        {isEducationInternship || isProfessionalInternship
                          ? 'This pre-check uses your current profile, internship requirements, and the details in this application.'
                          : 'This pre-check uses your current profile and the details in this application.'}
                      </p>
                    </div>
                    {eligibilityPreview && (
                      <span className="rounded-full bg-black/20 px-3 py-1 text-xs font-medium text-white">
                        {previewStatusLabel}
                      </span>
                    )}
                  </div>

                  {isPreviewLoading && (
                    <p className="mt-4 text-sm text-white/80">Checking your application details...</p>
                  )}

                  {previewError && !isPreviewLoading && (
                    <p className="mt-4 text-sm text-white/80">{previewError}</p>
                  )}

                  {eligibilityPreview && !isPreviewLoading && (
                    <div className="mt-4 space-y-4 text-sm">
                      {eligibilityPreview.blockingReasons.length > 0 && (
                        <div>
                          <p className="font-medium text-white">Blocking reasons</p>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-white/85">
                            {eligibilityPreview.blockingReasons.map((reason) => (
                              <li key={reason}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {eligibilityPreview.missingProfileFields.length > 0 && (
                        <div>
                          <p className="font-medium text-white">Missing profile fields</p>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-white/85">
                            {eligibilityPreview.missingProfileFields.map((field) => (
                              <li key={field}>{field}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {eligibilityPreview.recommendedProfileUpdates.length > 0 && (
                        <div>
                          <p className="font-medium text-white">Recommended updates</p>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-white/85">
                            {eligibilityPreview.recommendedProfileUpdates.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {eligibilityPreview.matchedSignals.length > 0 && (
                        <div>
                          <p className="font-medium text-white">Matched signals</p>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-white/85">
                            {eligibilityPreview.matchedSignals.map((signal) => (
                              <li key={signal}>{signal}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {completionActions.length > 0 && (
                        <div className="rounded-lg border border-white/10 bg-black/10 p-4">
                          <p className="font-medium text-white">Profile completion shortcuts</p>
                          <p className="mt-1 text-white/75">
                            Use these shortcuts to fix profile or application gaps before submitting.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {completionActions.map((action) => (
                              <button
                                key={action.key}
                                type="button"
                                onClick={() => void handleCompletionAction(action)}
                                className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/10"
                                title={action.description}
                              >
                                {action.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-6 p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
                  <p className="text-blue-300 text-sm">
                    By clicking Submit, you agree to share your application information with{' '}
                    {job.company_name}. Your resume and contact details will be visible to the
                    employer.
                  </p>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-700">
              <div>
                {currentStepIndex > 0 && (
                  <button
                    onClick={handleBack}
                    className="px-6 py-2.5 text-gray-300 hover:text-white transition-colors"
                  >
                    Back
                  </button>
                )}
              </div>

              <div className="flex items-center gap-4">
                {lastSaved && (
                  <span className="text-gray-500 text-sm">
                    Saved {lastSaved.toLocaleTimeString()}
                  </span>
                )}

                {currentStep === 'review' ? (
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || isPreviewLoading}
                    className="px-8 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors inline-flex items-center gap-2"
                  >
                    {isSubmitting || isPreviewLoading ? (
                      <>
                        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        {isSubmitting ? 'Submitting...' : 'Checking eligibility...'}
                      </>
                    ) : (
                      <>Submit Application</>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                  >
                    Continue
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Job Summary Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 sticky top-6">
            <h3 className="text-lg font-semibold text-white mb-4">Opportunity Summary</h3>

            <div className="space-y-4">
              <div>
                <h4 className="text-white font-medium">{job.title}</h4>
                <p className="text-gray-400">{job.company_name}</p>
              </div>

              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4 text-sm text-gray-300">
                <p className="font-medium text-white">{opportunityLabel}</p>
                {isEducationInternship && (
                  <p className="mt-2">
                    Academic fit matters here. Make sure your school, field of study, and graduation window are accurate.
                  </p>
                )}
                {isProfessionalInternship && (
                  <p className="mt-2">
                    Practical experience matters here. Highlight portfolio work, projects, and availability clearly.
                  </p>
                )}
              </div>

              {job.location && (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  {job.location}
                </div>
              )}

              {job.employment_type && (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  {job.employment_type.replace(/_/g, ' ')}
                </div>
              )}

              {formatSalary() && (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {formatSalary()}
                </div>
              )}

              {isEducationInternship && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-100">
                  <p>Schools: {formatList(internshipRequirements?.allowedSchools)}</p>
                  <p className="mt-1">
                    Graduation window: {internshipRequirements?.graduationYearMin || internshipRequirements?.graduationYearMax
                      ? `${internshipRequirements?.graduationYearMin || 'Any'} - ${internshipRequirements?.graduationYearMax || 'Any'}`
                      : 'Not specified'}
                  </p>
                </div>
              )}

              {isProfessionalInternship && (
                <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-4 text-sm text-sky-100">
                  <p>Profile projects: {profileReadiness.projectCount}</p>
                  <p className="mt-1">Profile badges: {profileReadiness.badgeCount}</p>
                  <p className="mt-1">Conversion possible: {internshipRequirements?.conversionPossible ? 'Yes' : 'No'}</p>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-700">
              <Link
                href={`/jobs/${job.id}`}
                onClick={handleViewDescription}
                className="text-blue-400 hover:text-blue-300 text-sm"
              >
                View full opportunity description
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}










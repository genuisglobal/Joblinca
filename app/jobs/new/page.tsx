"use client";

import { useState, ChangeEvent, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CustomQuestion } from '@/lib/questions';
import QuestionBuilder from './QuestionBuilder';
import AIQuestionGenerator from './AIQuestionGenerator';
import InternshipConfigurationFields, {
  applyInternshipTrackPreset,
  buildInternshipRequirementsPayload,
  createEmptyInternshipRequirementsFormState,
} from '@/components/jobs/InternshipConfigurationFields';
import {
  getInternshipTrackPostingPreset,
  getOpportunityPostingLabel,
} from '@/lib/internship-posting';
import { type InternshipTrack } from '@/lib/opportunities';

import { ACTIVE_ADMIN_TYPES } from '@/lib/admin-types';

type ApplyMethod = 'joblinca' | 'external_url' | 'email' | 'phone' | 'whatsapp' | 'multiple';

type RecruiterOption = {
  id: string;
  label: string;
  companyName: string | null;
  companyLogoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

type RecruiterProfileDefaults = {
  companyName: string | null;
  companyLogoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

type RecruiterDefaultSnapshot = {
  companyName: string;
  companyLogoUrl: string;
  applyEmail: string;
  applyPhone: string;
  applyWhatsapp: string;
};

function formatRecruiterLabel(profile: {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
}, companyName?: string | null): string {
  const name =
    profile.first_name || profile.last_name
      ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
      : profile.full_name || profile.email || 'Unknown recruiter';

  return companyName ? `${name} (${companyName})` : name;
}

function buildRecruiterDefaultSnapshot(
  defaults: RecruiterProfileDefaults | null
): RecruiterDefaultSnapshot | null {
  if (!defaults) {
    return null;
  }

  const contactPhone = defaults.contactPhone?.trim() || '';

  return {
    companyName: defaults.companyName?.trim() || '',
    companyLogoUrl: defaults.companyLogoUrl?.trim() || '',
    applyEmail: defaults.contactEmail?.trim() || '',
    applyPhone: contactPhone,
    applyWhatsapp: contactPhone,
  };
}

function shouldSyncUneditedField(currentValue: string, previousValue: string) {
  return !currentValue.trim() || currentValue === previousValue;
}

export default function NewJobPage() {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [salary, setSalary] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState('XAF');
  const [salaryPeriod, setSalaryPeriod] = useState<'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'>('MONTH');
  const [error, setError] = useState<string | null>(null);

  // Additional fields for enhanced job posting
  const [companyName, setCompanyName] = useState('');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const [workType, setWorkType] = useState('onsite');
  const [jobType, setJobType] = useState('job');
  const [visibility, setVisibility] = useState('public');
  const [internshipTrack, setInternshipTrack] = useState('');
  const [internshipRequirements, setInternshipRequirements] = useState(
    createEmptyInternshipRequirementsFormState()
  );
  const [uploading, setUploading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Apply method fields
  const [applyMethod, setApplyMethod] = useState<ApplyMethod>('joblinca');
  const [externalApplyUrl, setExternalApplyUrl] = useState('');
  const [applyEmail, setApplyEmail] = useState('');
  const [applyPhone, setApplyPhone] = useState('');
  const [applyWhatsapp, setApplyWhatsapp] = useState('');
  const [closesAt, setClosesAt] = useState('');

  // Custom screening questions
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([]);
  const [showAIGenerator, setShowAIGenerator] = useState(false);

  // AI description generation
  const [generatingDescription, setGeneratingDescription] = useState(false);

  // Gate access based on role. Recruiters and active admins can post jobs.
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [postingMode, setPostingMode] = useState<'recruiter' | 'admin' | null>(null);
  const [postingTarget, setPostingTarget] = useState<'joblinca' | 'recruiter'>('joblinca');
  const [recruiterOptions, setRecruiterOptions] = useState<RecruiterOption[]>([]);
  const [selectedRecruiterId, setSelectedRecruiterId] = useState('');
  const [loadingRecruiters, setLoadingRecruiters] = useState(false);
  const [recruiterProfileDefaults, setRecruiterProfileDefaults] = useState<RecruiterProfileDefaults | null>(null);
  const [fieldEdited, setFieldEdited] = useState({
    companyName: false,
    companyLogoUrl: false,
    applyEmail: false,
    applyPhone: false,
    applyWhatsapp: false,
  });
  const lastAppliedDefaultsRef = useRef<RecruiterDefaultSnapshot | null>(null);

  function markFieldEdited(
    field: 'companyName' | 'companyLogoUrl' | 'applyEmail' | 'applyPhone' | 'applyWhatsapp'
  ) {
    setFieldEdited((current) =>
      current[field] ? current : { ...current, [field]: true }
    );
  }

  function buildDefaultDeadline(daysFromNow: number) {
    const next = new Date();
    next.setDate(next.getDate() + daysFromNow);
    return next.toISOString().split('T')[0];
  }

  function applyPostingStarter(
    starter:
      | 'standard_job'
      | 'remote_job'
      | 'education_internship'
      | 'professional_internship'
  ) {
    setError(null);

    switch (starter) {
      case 'standard_job':
        handleJobTypeChange('job');
        setWorkType('onsite');
        setVisibility('public');
        setApplyMethod('joblinca');
        setSalaryPeriod('MONTH');
        setClosesAt(buildDefaultDeadline(30));
        break;
      case 'remote_job':
        handleJobTypeChange('job');
        setWorkType('remote');
        setVisibility('public');
        setApplyMethod('joblinca');
        setSalaryPeriod('MONTH');
        setClosesAt(buildDefaultDeadline(30));
        break;
      case 'education_internship':
        handleJobTypeChange('internship');
        handleInternshipTrackChange('education');
        setWorkType('onsite');
        setVisibility('public');
        setApplyMethod('joblinca');
        setSalaryPeriod('MONTH');
        setClosesAt(buildDefaultDeadline(21));
        break;
      case 'professional_internship':
        handleJobTypeChange('internship');
        handleInternshipTrackChange('professional');
        setWorkType('onsite');
        setVisibility('public');
        setApplyMethod('joblinca');
        setSalaryPeriod('MONTH');
        setClosesAt(buildDefaultDeadline(21));
        break;
    }
  }

  useEffect(() => {
    async function checkRole() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          // redirect unauthenticated users to login with redirect back to this page
          router.replace('/auth/login?redirect=/jobs/new');
          return;
        }
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, admin_type')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('Profile fetch error:', profileError);
          setError('Unable to verify your account. Please try logging in again.');
          setLoading(false);
          return;
        }

        const isActiveAdmin = Boolean(
          profile?.admin_type && ACTIVE_ADMIN_TYPES.includes(profile.admin_type)
        );

        if (profile && (profile.role === 'recruiter' || isActiveAdmin)) {
          setPostingMode(isActiveAdmin ? 'admin' : 'recruiter');
          setAllowed(true);

          if (profile.role === 'recruiter') {
            const { data: recruiterProfile, error: recruiterProfileError } = await supabase
              .from('recruiter_profiles')
              .select('company_name, company_logo_url, contact_email, contact_phone')
              .eq('user_id', user.id)
              .maybeSingle();

            if (recruiterProfileError) {
              console.error('Recruiter profile fetch error:', recruiterProfileError);
            } else if (recruiterProfile) {
              setRecruiterProfileDefaults({
                companyName: recruiterProfile.company_name || null,
                companyLogoUrl: recruiterProfile.company_logo_url || null,
                contactEmail: recruiterProfile.contact_email || null,
                contactPhone: recruiterProfile.contact_phone || null,
              });
            }
          }

          if (isActiveAdmin) {
            setLoadingRecruiters(true);

            const [{ data: recruiters, error: recruitersError }, { data: recruiterProfiles, error: recruiterProfilesError }] =
              await Promise.all([
                supabase
                  .from('profiles')
                  .select('id, full_name, first_name, last_name, email')
                  .eq('role', 'recruiter')
                  .order('created_at', { ascending: false }),
                supabase
                  .from('recruiter_profiles')
                  .select('user_id, company_name, company_logo_url, contact_email, contact_phone'),
              ]);

            if (recruitersError || recruiterProfilesError) {
              console.error('Recruiter list fetch error:', recruitersError || recruiterProfilesError);
              setError('Unable to load recruiters for delegation. You can still post as Joblinca.');
            } else {
              const recruiterProfileByUserId = new Map<
                string,
                {
                  companyName: string | null;
                  companyLogoUrl: string | null;
                  contactEmail: string | null;
                  contactPhone: string | null;
                }
              >();
              (recruiterProfiles || []).forEach((row: any) => {
                recruiterProfileByUserId.set(row.user_id, {
                  companyName: row.company_name || null,
                  companyLogoUrl: row.company_logo_url || null,
                  contactEmail: row.contact_email || null,
                  contactPhone: row.contact_phone || null,
                });
              });

              const options = (recruiters || []).map((recruiter: any) => ({
                id: recruiter.id,
                label: formatRecruiterLabel(
                  recruiter,
                  recruiterProfileByUserId.get(recruiter.id)?.companyName || null
                ),
                companyName: recruiterProfileByUserId.get(recruiter.id)?.companyName || null,
                companyLogoUrl:
                  recruiterProfileByUserId.get(recruiter.id)?.companyLogoUrl || null,
                contactEmail: recruiterProfileByUserId.get(recruiter.id)?.contactEmail || null,
                contactPhone: recruiterProfileByUserId.get(recruiter.id)?.contactPhone || null,
              }));

              setRecruiterOptions(options);
              setSelectedRecruiterId(options[0]?.id || '');
            }

            setLoadingRecruiters(false);
          }
        } else {
          // Redirect non‑recruiters to dashboard with message
          console.log('User role/admin:', profile?.role, profile?.admin_type, '- cannot post jobs');
          router.replace('/dashboard');
        }
      } catch (err) {
        console.error('Role check error:', err);
        // On error, show error instead of redirecting
        setError('Unable to verify your permissions. Please try again.');
        setLoadingRecruiters(false);
      } finally {
        setLoading(false);
      }
    }
    checkRole();
  }, [supabase, router]);

  const selectedRecruiterProfile =
    postingMode === 'admin' && postingTarget === 'recruiter'
      ? recruiterOptions.find((option) => option.id === selectedRecruiterId) || null
      : null;

  const selectedRecruiterMissingFields =
    selectedRecruiterProfile
      ? [
          !selectedRecruiterProfile.companyName ? 'company name' : null,
          !selectedRecruiterProfile.contactEmail ? 'contact email' : null,
          !selectedRecruiterProfile.contactPhone ? 'contact phone or WhatsApp' : null,
        ].filter(Boolean)
      : [];

  useEffect(() => {
    const activeProfileDefaults: RecruiterProfileDefaults | null = selectedRecruiterProfile
      ? {
          companyName: selectedRecruiterProfile.companyName,
          companyLogoUrl: selectedRecruiterProfile.companyLogoUrl,
          contactEmail: selectedRecruiterProfile.contactEmail,
          contactPhone: selectedRecruiterProfile.contactPhone,
        }
      : recruiterProfileDefaults;
    const activeDefaults = buildRecruiterDefaultSnapshot(activeProfileDefaults);
    const previousDefaults = lastAppliedDefaultsRef.current;

    if (!activeDefaults) {
      lastAppliedDefaultsRef.current = null;
      return;
    }

    if (
      !fieldEdited.companyName &&
      shouldSyncUneditedField(companyName, previousDefaults?.companyName || '') &&
      companyName !== activeDefaults.companyName
    ) {
      setCompanyName(activeDefaults.companyName);
    }

    if (
      !fieldEdited.companyLogoUrl &&
      shouldSyncUneditedField(companyLogoUrl, previousDefaults?.companyLogoUrl || '') &&
      companyLogoUrl !== activeDefaults.companyLogoUrl
    ) {
      setCompanyLogoUrl(activeDefaults.companyLogoUrl);
    }

    if (
      !fieldEdited.applyEmail &&
      shouldSyncUneditedField(applyEmail, previousDefaults?.applyEmail || '') &&
      applyEmail !== activeDefaults.applyEmail
    ) {
      setApplyEmail(activeDefaults.applyEmail);
    }

    if (
      !fieldEdited.applyPhone &&
      shouldSyncUneditedField(applyPhone, previousDefaults?.applyPhone || '') &&
      applyPhone !== activeDefaults.applyPhone
    ) {
      setApplyPhone(activeDefaults.applyPhone);
    }

    if (
      !fieldEdited.applyWhatsapp &&
      shouldSyncUneditedField(applyWhatsapp, previousDefaults?.applyWhatsapp || '') &&
      applyWhatsapp !== activeDefaults.applyWhatsapp
    ) {
      setApplyWhatsapp(activeDefaults.applyWhatsapp);
    }

    lastAppliedDefaultsRef.current = activeDefaults;
  }, [
    selectedRecruiterProfile,
    recruiterProfileDefaults,
    fieldEdited,
    companyName,
    companyLogoUrl,
    applyEmail,
    applyPhone,
    applyWhatsapp,
  ]);

  const internshipPreset = getInternshipTrackPostingPreset(internshipTrack as InternshipTrack | '');
  const opportunityLabel = getOpportunityPostingLabel(jobType, internshipTrack as InternshipTrack | '');
  const titlePlaceholder =
    internshipPreset?.titlePlaceholder ||
    (jobType === 'gig' ? 'e.g. Contract Graphic Designer' : 'e.g. Software Engineer');
  const descriptionPrompt =
    internshipPreset?.descriptionPrompt ||
    'Describe the responsibilities, team context, and success expectations for this opportunity.';
  const postingTrustSignals = [
    {
      key: 'companyName',
      label: 'Company name added',
      done: Boolean(companyName.trim()),
    },
    {
      key: 'companyLogo',
      label: 'Company logo uploaded',
      done: Boolean(companyLogoUrl),
    },
    {
      key: 'salaryRange',
      label: 'Salary range disclosed',
      done: Boolean(salaryMin || salaryMax),
    },
    {
      key: 'deadline',
      label: 'Application deadline set',
      done: Boolean(closesAt),
    },
    {
      key: 'nativeApply',
      label: 'Joblinca apply enabled',
      done: applyMethod === 'joblinca',
    },
    {
      key: 'description',
      label: 'Clear description written',
      done: description.trim().length >= 160,
    },
  ];
  const completedTrustSignals = postingTrustSignals.filter((signal) => signal.done).length;

  function handleJobTypeChange(nextJobType: string) {
    setJobType(nextJobType);

    if (nextJobType !== 'internship') {
      setInternshipTrack('');
      setInternshipRequirements(createEmptyInternshipRequirementsFormState());
    }
  }

  function handleInternshipTrackChange(nextTrack: InternshipTrack | '') {
    setInternshipTrack(nextTrack);
    setInternshipRequirements((current) => applyInternshipTrackPreset(current, nextTrack));
  }

  /**
   * Handle file upload and invoke the parse API.  When a file is selected
   * the file is uploaded via FormData to /api/parse-job.  The response
   * is used to prefill the title and description fields.  Parsing
   * failures are silently ignored to avoid disrupting the form flow.
   */
  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setUploading(true);
    try {
      const res = await fetch('/api/parse-job', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.title) setTitle(data.title);
        if (data.description) setDescription(data.description);
      }
    } catch {
      // ignore parse errors
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerateDescription() {
    if (!title) {
      setError('Please enter a job title first');
      return;
    }
    setGeneratingDescription(true);
    setError(null);
    try {
      const res = await fetch('/api/jobs/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: title,
          companyName: companyName || undefined,
          seedDescription: description || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.description) {
          setDescription(data.description);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || 'Failed to generate description');
      }
    } catch {
      setError('Failed to generate description. Please try again.');
    } finally {
      setGeneratingDescription(false);
    }
  }

  async function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !postingMode) {
      return;
    }

    setUploadingLogo(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('logo', file);

      const res = await fetch(
        postingMode === 'admin' ? '/api/admin/jobs/logo' : '/api/profile/logo',
        {
          method: 'POST',
          body: formData,
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload logo');
      }

      setCompanyLogoUrl((data.logoUrl as string) || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (uploadingLogo) {
      setError('Please wait for the logo upload to finish.');
      return;
    }

    // Validate apply method fields
    if (applyMethod === 'external_url' && !externalApplyUrl) {
      setError('Please provide an external application URL');
      return;
    }
    if (applyMethod === 'email' && !applyEmail) {
      setError('Please provide an email address for applications');
      return;
    }
    if (applyMethod === 'phone' && !applyPhone) {
      setError('Please provide a phone number for applications');
      return;
    }
    if (applyMethod === 'whatsapp' && !applyWhatsapp) {
      setError('Please provide a WhatsApp number for applications');
      return;
    }
    if (
      applyMethod === 'multiple' &&
      !externalApplyUrl.trim() &&
      !applyEmail.trim() &&
      !applyPhone.trim() &&
      !applyWhatsapp.trim()
    ) {
      setError('Add at least one application method when using multiple methods.');
      return;
    }

    if (
      postingMode === 'admin' &&
      postingTarget === 'recruiter' &&
      !selectedRecruiterId
    ) {
      setError('Please select a recruiter to delegate job management.');
      return;
    }

    if (jobType === 'internship' && !internshipTrack) {
      setError('Select whether this internship is educational or professional.');
      return;
    }

    if (
      salaryMin.trim() &&
      salaryMax.trim() &&
      Number(salaryMin) > Number(salaryMax)
    ) {
      setError('Salary max must be greater than or equal to salary min.');
      return;
    }

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          description,
          location,
          salary,
          salaryMin: salaryMin || undefined,
          salaryMax: salaryMax || undefined,
          salaryCurrency,
          salaryPeriod,
          companyName: companyName || undefined,
          companyLogoUrl: companyLogoUrl || undefined,
          workType,
          jobType,
          visibility,
          internshipTrack: jobType === 'internship' ? internshipTrack : undefined,
          internshipRequirements:
            jobType === 'internship'
              ? buildInternshipRequirementsPayload(internshipRequirements)
              : undefined,
          customQuestions: customQuestions.length > 0 ? customQuestions : undefined,
          applyMethod,
          externalApplyUrl: externalApplyUrl || undefined,
          applyEmail: applyEmail || undefined,
          applyPhone: applyPhone || undefined,
          applyWhatsapp: applyWhatsapp || undefined,
          closesAt: closesAt || undefined,
          recruiterId:
            postingMode === 'admin' && postingTarget === 'recruiter'
              ? selectedRecruiterId
              : undefined,
        }),
      });
      if (res.ok) {
        const { id } = await res.json();
        if (postingMode === 'recruiter') {
          router.push(`/dashboard/recruiter/jobs/${id}?created=1`);
        } else {
          router.push(`/jobs/${id}`);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || 'Unable to create job');
      }
    } catch (err) {
      setError('Unexpected error. Please try again.');
    }
  }

  // Show loading spinner while checking access
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg
            className="animate-spin w-12 h-12 text-blue-500"
            fill="none"
            viewBox="0 0 24 24"
          >
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
          <p className="text-gray-400">Loading...</p>
        </div>
      </main>
    );
  }

  // Show error if permission check failed
  if (error && !allowed) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-100 mb-2">
            Access Error
          </h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => router.push('/auth/login?redirect=/jobs/new')}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Log In
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Redirect handled in useEffect - show nothing briefly while redirecting
  if (!allowed) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg
            className="animate-spin w-12 h-12 text-blue-500"
            fill="none"
            viewBox="0 0 24 24"
          >
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
          <p className="text-gray-400">Redirecting...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-6 text-gray-100">
      <h1 className="text-2xl font-bold mb-4">Post a New {opportunityLabel}</h1>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      {postingMode === 'recruiter' && (
        <div className="mb-4 space-y-3">
          <div className="rounded-lg border border-yellow-700/50 bg-yellow-900/20 p-4 text-sm text-yellow-200">
            Recruiter-posted jobs are reviewed before they appear on the public jobs page. After submission, you will be taken to your dashboard while the post is pending approval.
          </div>
          <div className="rounded-lg border border-green-700/50 bg-green-900/20 p-4 text-sm text-green-200">
            Your first job post is free — no subscription required. After that, activate a recruiter plan to continue posting.
          </div>
        </div>
      )}
      {postingMode === 'admin' && (
        <div className="mb-4 rounded-lg border border-blue-700/50 bg-blue-900/20 p-4">
          <p className="text-sm text-blue-200 mb-3">
            Choose who should manage this job after posting.
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-200">
              <input
                type="radio"
                name="postingTarget"
                value="joblinca"
                checked={postingTarget === 'joblinca'}
                onChange={() => setPostingTarget('joblinca')}
                className="h-4 w-4"
              />
              Post for Joblinca (managed by me)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-200">
              <input
                type="radio"
                name="postingTarget"
                value="recruiter"
                checked={postingTarget === 'recruiter'}
                onChange={() => setPostingTarget('recruiter')}
                className="h-4 w-4"
              />
              Post on behalf of a recruiter
            </label>
          </div>
          {postingTarget === 'recruiter' && (
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Recruiter Manager
              </label>
              <select
                value={selectedRecruiterId}
                onChange={(e) => setSelectedRecruiterId(e.target.value)}
                disabled={loadingRecruiters}
                className="w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
              >
                <option value="">
                  {loadingRecruiters ? 'Loading recruiters...' : 'Select recruiter'}
                </option>
                {recruiterOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                The selected recruiter can manage the job and applications.
              </p>
              {selectedRecruiterProfile && (
                <div className="mt-3 rounded-lg border border-gray-700 bg-gray-800/70 p-3 text-sm text-gray-200">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-gray-400">Company</p>
                      <p className="mt-1 text-white">
                        {selectedRecruiterProfile.companyName || 'Not set on recruiter profile'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-gray-400">Primary contact</p>
                      <p className="mt-1 text-white">
                        {selectedRecruiterProfile.contactEmail || selectedRecruiterProfile.contactPhone || 'Not set on recruiter profile'}
                      </p>
                    </div>
                  </div>
                  {selectedRecruiterMissingFields.length > 0 && (
                    <p className="mt-3 text-xs text-amber-300">
                      Missing on this recruiter profile: {selectedRecruiterMissingFields.join(', ')}. Fill the fields below so the post still looks complete to candidates.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* Use lighter card and input backgrounds for better readability */}
      <form onSubmit={handleSubmit} className="space-y-4 bg-gray-700 p-6 rounded-lg shadow-md">
        <div className="rounded-xl border border-blue-700/50 bg-blue-900/20 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Quick setup</h2>
              <p className="mt-1 text-sm text-blue-200">
                Start from a recommended template to fill the most important defaults in one click.
              </p>
            </div>
            <p className="text-xs uppercase tracking-[0.18em] text-blue-200/70">
              Recommended path
            </p>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {[
              {
                key: 'standard_job',
                title: 'Standard Job',
                description: 'Onsite or hybrid hiring with Joblinca apply and a 30-day deadline.',
              },
              {
                key: 'remote_job',
                title: 'Remote Job',
                description: 'Remote-ready posting with Joblinca apply and monthly salary defaults.',
              },
              {
                key: 'education_internship',
                title: 'Educational Internship',
                description: 'Academic placement with the structured education track and native apply.',
              },
              {
                key: 'professional_internship',
                title: 'Professional Internship',
                description: 'Portfolio-driven internship with structured screening and native apply.',
              },
            ].map((starter) => (
              <button
                key={starter.key}
                type="button"
                onClick={() => applyPostingStarter(starter.key as Parameters<typeof applyPostingStarter>[0])}
                className="rounded-lg border border-gray-600 bg-gray-800/70 p-4 text-left transition-colors hover:border-blue-400 hover:bg-gray-800"
              >
                <p className="font-medium text-white">{starter.title}</p>
                <p className="mt-1 text-sm text-gray-300">{starter.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white">Trust and conversion checklist</h2>
              <p className="mt-1 text-sm text-emerald-100/80">
                Posts with clearer employer identity, compensation, and native apply usually convert better.
              </p>
            </div>
            <span className="rounded-full bg-black/20 px-3 py-1 text-xs font-medium text-white">
              {completedTrustSignals}/{postingTrustSignals.length} complete
            </span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
            {postingTrustSignals.map((signal) => (
              <div
                key={signal.key}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  signal.done
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                    : 'border-gray-600 bg-gray-800/60 text-gray-300'
                }`}
              >
                <span className="mr-2 inline-block w-4 text-center">
                  {signal.done ? '✓' : '•'}
                </span>
                {signal.label}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300">Upload Job Description (PDF/DOCX/TXT)</label>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            onChange={handleFileChange}
            className="mt-1 w-full text-gray-100"
          />
          {uploading && <p className="text-sm text-gray-400 mt-1">Parsing file…</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">{opportunityLabel} Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder={titlePlaceholder}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Company Name</label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => {
              markFieldEdited('companyName');
              setCompanyName(e.target.value);
            }}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder="e.g. Acme Corp"
          />
          <p className="text-xs text-gray-500 mt-2">
            Use the exact employer name candidates should recognize in search results and alerts.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Company Logo (optional)</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleLogoChange}
            disabled={uploadingLogo}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
          />
          <p className="text-xs text-gray-400 mt-2">
            Upload a JPEG, PNG, WebP, or GIF image up to 2MB.
          </p>
          {uploadingLogo && <p className="text-sm text-blue-400 mt-2">Uploading logo...</p>}
          {companyLogoUrl && (
            <div className="mt-3 flex items-center gap-4 rounded-lg border border-gray-600 bg-gray-800/60 p-3">
              <Image
                src={companyLogoUrl}
                alt="Company logo preview"
                width={56}
                height={56}
                className="h-14 w-14 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">Logo ready</p>
                <p className="truncate text-xs text-gray-400">{companyLogoUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  markFieldEdited('companyLogoUrl');
                  setCompanyLogoUrl('');
                }}
                className="px-3 py-1.5 text-sm text-gray-300 hover:text-white transition-colors"
              >
                Remove
              </button>
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder="City / Region"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">
            Salary range
            <span className="text-gray-500 font-normal"> — boosts visibility on Google for Jobs</span>
          </label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <input
              type="number"
              value={salaryMin}
              onChange={(e) => setSalaryMin(e.target.value)}
              className="px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
              min="0"
              placeholder="Min"
            />
            <input
              type="number"
              value={salaryMax}
              onChange={(e) => setSalaryMax(e.target.value)}
              className="px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
              min="0"
              placeholder="Max"
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select
              value={salaryCurrency}
              onChange={(e) => setSalaryCurrency(e.target.value)}
              className="px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
            >
              <option value="XAF">XAF (FCFA)</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="NGN">NGN</option>
            </select>
            <select
              value={salaryPeriod}
              onChange={(e) => setSalaryPeriod(e.target.value as typeof salaryPeriod)}
              className="px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
            >
              <option value="HOUR">per hour</option>
              <option value="DAY">per day</option>
              <option value="WEEK">per week</option>
              <option value="MONTH">per month</option>
              <option value="YEAR">per year</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Work Type</label>
          <select
            value={workType}
            onChange={(e) => setWorkType(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
          >
            <option value="onsite">Onsite</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Opportunity Type</label>
          <select
            value={jobType}
            onChange={(e) => handleJobTypeChange(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
          >
            <option value="job">Job</option>
            <option value="internship">Internship</option>
            <option value="gig">Gig</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Visibility</label>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
          >
            <option value="public">Public</option>
            <option value="talent_only">Talent Only</option>
          </select>
        </div>
        <InternshipConfigurationFields
          jobType={jobType}
          visibility={visibility}
          internshipTrack={internshipTrack}
          requirements={internshipRequirements}
          onInternshipTrackChange={handleInternshipTrackChange}
          onRequirementsChange={setInternshipRequirements}
        />
        {jobType === 'internship' && internshipPreset && (
          <div className="rounded-lg border border-emerald-700/50 bg-emerald-900/20 p-4 text-sm text-emerald-100">
            Native Joblinca apply is recommended here so eligibility checks, ATS stages, and matching stay structured for this {internshipPreset.label.toLowerCase()}.
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-300">{opportunityLabel} Description</label>
            <button
              type="button"
              onClick={handleGenerateDescription}
              disabled={generatingDescription}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-md transition-colors"
            >
              {generatingDescription ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate with AI
                </>
              )}
            </button>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder={descriptionPrompt}
            rows={8}
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            Tip: Enter the job title above, then click &quot;Generate with AI&quot; to auto-create a description. You can also type a brief sentence first and AI will expand it.
          </p>
        </div>

        {/* Application Method Section */}
        <div className="border-t border-gray-600 pt-4 mt-4">
          <h3 className="text-lg font-medium text-gray-200 mb-4">Application Method</h3>
          <p className="text-sm text-gray-400 mb-4">
            Choose how candidates will apply for this position
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-300">Apply Method</label>
            <select
              value={applyMethod}
              onChange={(e) => setApplyMethod(e.target.value as ApplyMethod)}
              className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
            >
              <option value="joblinca">JobLinca Apply (Recommended)</option>
              <option value="external_url">External Company Website</option>
              <option value="email">Email Application</option>
              <option value="phone">Phone Application</option>
              <option value="whatsapp">WhatsApp Application</option>
              <option value="multiple">Multiple Methods</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {applyMethod === 'joblinca' && 'Candidates apply directly through JobLinca with their profile and resume'}
              {applyMethod === 'external_url' && 'Redirect candidates to your company\'s application page'}
              {applyMethod === 'email' && 'Candidates will email their applications to the provided address'}
              {applyMethod === 'phone' && 'Candidates will call the provided number to apply'}
              {applyMethod === 'whatsapp' && 'Candidates will contact you via WhatsApp to apply'}
              {applyMethod === 'multiple' && 'Offer multiple ways for candidates to apply'}
            </p>
            {applyMethod === 'joblinca' && (
              <p className="text-xs text-emerald-300 mt-2">
                Recommended for faster review, structured ATS handling, and stronger matching on Joblinca.
              </p>
            )}
          </div>

          {/* Conditional Fields Based on Apply Method */}
          {(applyMethod === 'external_url' || applyMethod === 'multiple') && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-300">
                External Application URL {applyMethod === 'external_url' && <span className="text-red-400">*</span>}
              </label>
              <input
                type="url"
                value={externalApplyUrl}
                onChange={(e) => setExternalApplyUrl(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
                placeholder="https://yourcompany.com/careers/apply"
                required={applyMethod === 'external_url'}
              />
            </div>
          )}

          {(applyMethod === 'email' || applyMethod === 'multiple') && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-300">
                Application Email {applyMethod === 'email' && <span className="text-red-400">*</span>}
              </label>
              <input
                type="email"
                value={applyEmail}
                onChange={(e) => {
                  markFieldEdited('applyEmail');
                  setApplyEmail(e.target.value);
                }}
                className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
                placeholder="careers@yourcompany.com"
                required={applyMethod === 'email'}
              />
            </div>
          )}

          {(applyMethod === 'phone' || applyMethod === 'multiple') && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-300">
                Application Phone Number {applyMethod === 'phone' && <span className="text-red-400">*</span>}
              </label>
              <input
                type="tel"
                value={applyPhone}
                onChange={(e) => {
                  markFieldEdited('applyPhone');
                  setApplyPhone(e.target.value);
                }}
                className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
                placeholder="+237 6XX XXX XXX"
                required={applyMethod === 'phone'}
              />
            </div>
          )}

          {(applyMethod === 'whatsapp' || applyMethod === 'multiple') && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-300">
                WhatsApp Number {applyMethod === 'whatsapp' && <span className="text-red-400">*</span>}
              </label>
              <input
                type="tel"
                value={applyWhatsapp}
                onChange={(e) => {
                  markFieldEdited('applyWhatsapp');
                  setApplyWhatsapp(e.target.value);
                }}
                className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
                placeholder="+237 6XX XXX XXX (with country code)"
                required={applyMethod === 'whatsapp'}
              />
              <p className="text-xs text-gray-500 mt-1">Include country code (e.g., +237 for Cameroon)</p>
            </div>
          )}

          {applyMethod === 'multiple' && (
            <div className="mt-4 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
              <p className="text-sm text-blue-300">
                Fill in the application methods you want to offer. Candidates will be able to choose from the provided options.
              </p>
            </div>
          )}

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-300">Application Deadline (Optional)</label>
            <input
              type="date"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
              min={new Date().toISOString().split('T')[0]}
            />
            <p className="text-xs text-gray-500 mt-1">Leave empty for no deadline</p>
          </div>
        </div>

        {/* Custom Screening Questions */}
        <QuestionBuilder
          questions={customQuestions}
          onChange={setCustomQuestions}
          onOpenAIGenerator={() => setShowAIGenerator(true)}
        />

        <button
          type="submit"
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors"
        >
          {postingMode === 'recruiter' ? 'Submit for Review' : 'Create Job'}
        </button>
      </form>

      {/* AI Question Generator Modal */}
      {showAIGenerator && (
        <AIQuestionGenerator
          jobTitle={title}
          jobDescription={description}
          onClose={() => setShowAIGenerator(false)}
          onAddQuestions={(questions) => {
            setCustomQuestions((prev) => [...prev, ...questions]);
          }}
        />
      )}
    </main>
  );
}

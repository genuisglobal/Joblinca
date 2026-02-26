'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

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
};

type ContactInfo = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
};

type ApplyFormProps = {
  job: Job;
  initialContactInfo: ContactInfo;
  existingResumeUrl: string | null;
  initialCoverLetter: string;
  draftApplicationId: string | null;
  initialAnswers: QuestionAnswer[];
};

type Step = 'contact' | 'resume' | 'questions' | 'review';

// ✅ Correct bucket id (matches your Supabase bucket + policies)
const CV_BUCKET = 'application-cvs';


export default function ApplyForm({
  job,
  initialContactInfo,
  existingResumeUrl,
  initialCoverLetter,
  draftApplicationId,
  initialAnswers,
}: ApplyFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const hasQuestions = Array.isArray(job.custom_questions) && job.custom_questions.length > 0;

  const STEPS: { key: Step; label: string }[] = [
    { key: 'contact', label: 'Contact Info' },
    { key: 'resume', label: 'Resume' },
    ...(hasQuestions ? [{ key: 'questions' as Step, label: 'Questions' }] : []),
    { key: 'review', label: 'Review & Submit' },
  ];

  const [currentStep, setCurrentStep] = useState<Step>('contact');
  const [contactInfo, setContactInfo] = useState<ContactInfo>(initialContactInfo);
  const [resumeUrl, setResumeUrl] = useState<string | null>(existingResumeUrl);
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  // Track resume_path so it can be saved in drafts/submission
  const [resumePath, setResumePath] = useState<string | null>(null);

  const [coverLetter, setCoverLetter] = useState(initialCoverLetter);
  const [answers, setAnswers] = useState<QuestionAnswer[]>(initialAnswers);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(draftApplicationId);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

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
        status: 'draft',
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
  }, [job.id, contactInfo, resumeUrl, coverLetter, answers, draftId, supabase]);

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

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Get user for applicant_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Please log in to submit your application');
      }

      // Core application data
      const applicationData: Record<string, unknown> = {
        job_id: job.id,
        applicant_id: user.id,
        contact_info: contactInfo,
        resume_url: resumeUrl,
        cover_letter: coverLetter || null,
        answers: answers.length > 0 ? answers : null,
        status: 'submitted',
      };

      if (draftId) {
        // Don't update applicant_id or job_id on existing application
        const { applicant_id, job_id, ...updateData } = applicationData;
        const { error: updateError } = await supabase
          .from('applications')
          .update(updateData)
          .eq('id', draftId);

        if (updateError) {
          console.error('Update error details:', updateError);
          throw updateError;
        }
      } else {
        const { error: insertError } = await supabase
          .from('applications')
          .insert(applicationData);

        if (insertError) {
          console.error('Insert error details:', insertError);
          throw insertError;
        }
      }

      router.push(`/jobs/${job.id}/apply/success`);
    } catch (err: unknown) {
      console.error('Submit error:', err);
      const errorMessage = err instanceof Error ? err.message :
        (typeof err === 'object' && err !== null && 'message' in err) ? String((err as {message: string}).message) :
        'Failed to submit application';
      setError(errorMessage);
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
        <p className="text-gray-400">{job.company_name}</p>
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
                            setResumePath(null); // ✅ clear resume_path too
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
                  Please review your information before submitting
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
                            (ans as string) || '—';
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
                    disabled={isSubmitting}
                    className="px-8 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors inline-flex items-center gap-2"
                  >
                    {isSubmitting ? (
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
                        Submitting...
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
            <h3 className="text-lg font-semibold text-white mb-4">Job Summary</h3>

            <div className="space-y-4">
              <div>
                <h4 className="text-white font-medium">{job.title}</h4>
                <p className="text-gray-400">{job.company_name}</p>
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
            </div>

            <div className="mt-6 pt-4 border-t border-gray-700">
              <Link
                href={`/jobs/${job.id}`}
                onClick={handleViewDescription}
                className="text-blue-400 hover:text-blue-300 text-sm"
              >
                View full job description
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, ChangeEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CustomQuestion } from '@/lib/questions';
import QuestionBuilder from './QuestionBuilder';
import AIQuestionGenerator from './AIQuestionGenerator';

type ApplyMethod = 'joblinca' | 'external_url' | 'email' | 'phone' | 'whatsapp' | 'multiple';

export default function NewJobPage() {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [salary, setSalary] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Additional fields for enhanced job posting
  const [companyName, setCompanyName] = useState('');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const [workType, setWorkType] = useState('onsite');
  const [jobType, setJobType] = useState('job');
  const [visibility, setVisibility] = useState('public');
  const [uploading, setUploading] = useState(false);

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

  // Gate access based on role.  We only allow recruiters to post jobs.
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

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
          .select('role')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('Profile fetch error:', profileError);
          setError('Unable to verify your account. Please try logging in again.');
          setLoading(false);
          return;
        }

        if (profile && profile.role === 'recruiter') {
          setAllowed(true);
        } else {
          // Redirect non‑recruiters to dashboard with message
          console.log('User role:', profile?.role, '- not a recruiter');
          router.replace('/dashboard');
        }
      } catch (err) {
        console.error('Role check error:', err);
        // On error, show error instead of redirecting
        setError('Unable to verify your permissions. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    checkRole();
  }, [supabase, router]);

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

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
          companyName: companyName || undefined,
          companyLogoUrl: companyLogoUrl || undefined,
          workType,
          jobType,
          visibility,
          customQuestions: customQuestions.length > 0 ? customQuestions : undefined,
          applyMethod,
          externalApplyUrl: externalApplyUrl || undefined,
          applyEmail: applyEmail || undefined,
          applyPhone: applyPhone || undefined,
          applyWhatsapp: applyWhatsapp || undefined,
          closesAt: closesAt || undefined,
        }),
      });
      if (res.ok) {
        const { id } = await res.json();
        router.push(`/jobs/${id}`);
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
      <h1 className="text-2xl font-bold mb-4">Post a New Job</h1>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      {/* Use lighter card and input backgrounds for better readability */}
      <form onSubmit={handleSubmit} className="space-y-4 bg-gray-700 p-6 rounded-lg shadow-md">
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
          <label className="block text-sm font-medium text-gray-300">Job Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder="e.g. Software Engineer"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Company Name</label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder="e.g. Acme Corp"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Company Logo URL (optional)</label>
          <input
            type="url"
            value={companyLogoUrl}
            onChange={(e) => setCompanyLogoUrl(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder="https://example.com/logo.png"
          />
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
          <label className="block text-sm font-medium text-gray-300">Salary (XAF)</label>
          <input
            type="number"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            min="0"
            placeholder="Optional"
          />
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
          <label className="block text-sm font-medium text-gray-300">Job Type</label>
          <select
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
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
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-300">Description</label>
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
            placeholder="Describe the role, or type a brief sentence and click 'Generate with AI' to create a full description"
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
                onChange={(e) => setApplyEmail(e.target.value)}
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
                onChange={(e) => setApplyPhone(e.target.value)}
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
                onChange={(e) => setApplyWhatsapp(e.target.value)}
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
          Create Job
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
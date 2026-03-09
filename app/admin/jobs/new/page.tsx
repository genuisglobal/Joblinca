'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
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

type RecruiterOption = {
  id: string;
  label: string;
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

export default function AdminCreateJobPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [loadingRecruiters, setLoadingRecruiters] = useState(false);
  const [recruiterOptions, setRecruiterOptions] = useState<RecruiterOption[]>([]);
  const [postingTarget, setPostingTarget] = useState<'joblinca' | 'recruiter'>('joblinca');
  const [selectedRecruiterId, setSelectedRecruiterId] = useState('');

  // Form fields
  const [title, setTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const [location, setLocation] = useState('');
  const [salary, setSalary] = useState('');
  const [workType, setWorkType] = useState('onsite');
  const [jobType, setJobType] = useState('job');
  const [visibility, setVisibility] = useState('public');
  const [internshipTrack, setInternshipTrack] = useState('');
  const [internshipRequirements, setInternshipRequirements] = useState(
    createEmptyInternshipRequirementsFormState()
  );
  const [description, setDescription] = useState('');
  const [autoApprove, setAutoApprove] = useState(true);
  const [published, setPublished] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadRecruiters() {
      setLoadingRecruiters(true);

      try {
        const [{ data: recruiters, error: recruitersError }, { data: recruiterProfiles, error: recruiterProfilesError }] =
          await Promise.all([
            supabase
              .from('profiles')
              .select('id, full_name, first_name, last_name, email')
              .eq('role', 'recruiter')
              .order('created_at', { ascending: false }),
            supabase
              .from('recruiter_profiles')
              .select('user_id, company_name'),
          ]);

        if (!mounted) {
          return;
        }

        if (recruitersError || recruiterProfilesError) {
          console.error('Recruiter list load error:', recruitersError || recruiterProfilesError);
          setError('Unable to load recruiters. You can still post for Joblinca.');
          setLoadingRecruiters(false);
          return;
        }

        const companyByUserId = new Map<string, string | null>();
        (recruiterProfiles || []).forEach((row: any) => {
          companyByUserId.set(row.user_id, row.company_name || null);
        });

        const options = (recruiters || []).map((recruiter: any) => ({
          id: recruiter.id,
          label: formatRecruiterLabel(recruiter, companyByUserId.get(recruiter.id)),
        }));

        setRecruiterOptions(options);
        setSelectedRecruiterId(options[0]?.id || '');
      } catch (err) {
        console.error('Recruiter list load error:', err);
        if (mounted) {
          setError('Unable to load recruiters. You can still post for Joblinca.');
        }
      } finally {
        if (mounted) {
          setLoadingRecruiters(false);
        }
      }
    }

    loadRecruiters();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  const internshipPreset = getInternshipTrackPostingPreset(internshipTrack as InternshipTrack | '');
  const opportunityLabel = getOpportunityPostingLabel(jobType, internshipTrack as InternshipTrack | '');
  const titlePlaceholder =
    internshipPreset?.titlePlaceholder ||
    (jobType === 'gig' ? 'e.g. Contract Graphic Designer' : 'e.g. Software Engineer');
  const descriptionPrompt =
    internshipPreset?.descriptionPrompt ||
    'Describe the responsibilities, expectations, and team context for this opportunity.';

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

  const handleLogoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    setUploadingLogo(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('logo', file);

      const res = await fetch('/api/admin/jobs/logo', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload logo');
      }

      setCompanyLogoUrl(data.logoUrl || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (uploadingLogo) {
      setError('Please wait for the logo upload to finish.');
      return;
    }

    if (postingTarget === 'recruiter' && !selectedRecruiterId) {
      setError('Please select a recruiter to delegate this job.');
      return;
    }

    if (jobType === 'internship' && !internshipTrack) {
      setError('Select whether this internship is educational or professional.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          companyName,
          companyLogoUrl: companyLogoUrl || undefined,
          location,
          salary: salary ? parseFloat(salary) : undefined,
          workType,
          jobType,
          visibility,
          internshipTrack: jobType === 'internship' ? internshipTrack : undefined,
          internshipRequirements:
            jobType === 'internship'
              ? buildInternshipRequirementsPayload(internshipRequirements)
              : undefined,
          description,
          autoApprove,
          published,
          recruiterId: postingTarget === 'recruiter' ? selectedRecruiterId : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create job');
      }

      const { id } = await res.json();
      router.push(`/admin/jobs/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/jobs" className="text-blue-400 hover:text-blue-300 text-sm mb-2 inline-block">
          &larr; Back to Jobs
        </Link>
        <h1 className="text-2xl font-bold text-white">Create {opportunityLabel}</h1>
        <p className="text-gray-400 mt-1">Create a new opportunity posting as an administrator</p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-gray-800 rounded-xl p-6 space-y-6">
        {/* Basic Info */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white border-b border-gray-700 pb-2">Basic Information</h2>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {opportunityLabel} Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder={titlePlaceholder}
              className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Company Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              placeholder="e.g. Acme Corp"
              className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Company Logo</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleLogoChange}
              disabled={uploadingLogo}
              className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-2">
              Upload a JPEG, PNG, WebP, or GIF image up to 2MB.
            </p>
            {uploadingLogo && (
              <p className="text-sm text-blue-400 mt-2">Uploading logo...</p>
            )}
            {companyLogoUrl && (
              <div className="mt-3 flex items-center gap-4 rounded-lg border border-gray-700 bg-gray-700/50 p-3">
                <img
                  src={companyLogoUrl}
                  alt="Company logo preview"
                  className="h-14 w-14 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">Logo uploaded</p>
                  <p className="truncate text-xs text-gray-400">{companyLogoUrl}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCompanyLogoUrl('')}
                  className="px-3 py-1.5 text-sm text-gray-300 hover:text-white transition-colors"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Location & Type */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white border-b border-gray-700 pb-2">Location & Type</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Douala, Cameroon"
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Salary (XAF)</label>
              <input
                type="number"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="Optional"
                min="0"
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Work Type</label>
              <select
                value={workType}
                onChange={(e) => setWorkType(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="onsite">Onsite</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Opportunity Type</label>
              <select
                value={jobType}
                onChange={(e) => handleJobTypeChange(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="job">Job</option>
                <option value="internship">Internship</option>
                <option value="gig">Gig</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Visibility</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="public">Public</option>
                <option value="talent_only">Talent Only</option>
              </select>
            </div>
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
              This {internshipPreset.label.toLowerCase()} will use the corresponding ATS pipeline and matching policy once posted.
            </div>
          )}
        </div>

        {/* Description */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white border-b border-gray-700 pb-2">Description</h2>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {opportunityLabel} Description <span className="text-red-400">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              placeholder={descriptionPrompt}
              rows={8}
              className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Admin Options */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white border-b border-gray-700 pb-2">Admin Options</h2>

          <div className="rounded-lg border border-gray-700 bg-gray-700/30 p-4">
            <p className="text-sm text-gray-300 mb-3">Job management ownership</p>
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
                  className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => setAutoApprove(e.target.checked)}
                className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="text-white font-medium">Auto-approve</span>
                <p className="text-sm text-gray-400">Skip the approval process (recommended for admin-created jobs)</p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
                className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="text-white font-medium">Published</span>
                <p className="text-sm text-gray-400">Make the job immediately visible to users</p>
              </div>
            </label>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-700">
          <Link
            href="/admin/jobs"
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading || uploadingLogo}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating...' : uploadingLogo ? 'Uploading Logo...' : 'Create Job'}
          </button>
        </div>
      </form>
    </div>
  );
}

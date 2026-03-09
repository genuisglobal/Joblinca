'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import InternshipConfigurationFields, {
  applyInternshipTrackPreset,
  buildInternshipRequirementsPayload,
  createEmptyInternshipRequirementsFormState,
  internshipRequirementsFormStateFromPayload,
} from '@/components/jobs/InternshipConfigurationFields';
import {
  getInternshipTrackPostingPreset,
  getOpportunityPostingLabel,
} from '@/lib/internship-posting';
import { type InternshipTrack } from '@/lib/opportunities';

interface EditableJob {
  id: string;
  posted_by: string | null;
  recruiter_id: string;
  title: string;
  company_name: string | null;
  company_logo_url: string | null;
  location: string | null;
  salary: number | null;
  work_type: string | null;
  job_type: string | null;
  internship_track?: string | null;
  eligible_roles?: string[] | null;
  apply_intake_mode?: string | null;
  visibility: string | null;
  description: string | null;
  internship_requirements?: Record<string, unknown> | null;
}

interface ViewerState {
  backHref: string;
  isAdminUser: boolean;
  logoUploadEndpoint: string;
}

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

export default function EditJobPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [form, setForm] = useState<EditableJob | null>(null);
  const [internshipTrack, setInternshipTrack] = useState('');
  const [internshipRequirements, setInternshipRequirements] = useState(
    createEmptyInternshipRequirementsFormState()
  );
  const [recruiterOptions, setRecruiterOptions] = useState<RecruiterOption[]>([]);
  const [loadingRecruiters, setLoadingRecruiters] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadEditState() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (!mounted) {
          return;
        }

        if (authError || !user) {
          router.replace(`/auth/login?redirect=${pathname}`);
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('admin_type')
          .eq('id', user.id)
          .maybeSingle();

        const isAdminUser = Boolean(profile?.admin_type);
        setViewer({
          backHref: isAdminUser
            ? `/admin/jobs/${params.id}`
            : `/dashboard/recruiter/jobs/${params.id}`,
          isAdminUser,
          logoUploadEndpoint: isAdminUser ? '/api/admin/jobs/logo' : '/api/profile/logo',
        });

        if (isAdminUser) {
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
                .select('user_id, company_name'),
            ]);

          if (recruitersError || recruiterProfilesError) {
            console.error('Recruiter list load error:', recruitersError || recruiterProfilesError);
            setError('Unable to load recruiter delegation list.');
          } else {
            const companyByUserId = new Map<string, string | null>();
            (recruiterProfiles || []).forEach((row: any) => {
              companyByUserId.set(row.user_id, row.company_name || null);
            });

            const options: RecruiterOption[] = [
              { id: user.id, label: 'Joblinca (managed by me)' },
              ...(recruiters || [])
                .filter((recruiter: any) => recruiter.id !== user.id)
                .map((recruiter: any) => ({
                  id: recruiter.id,
                  label: formatRecruiterLabel(
                    recruiter,
                    companyByUserId.get(recruiter.id)
                  ),
                })),
            ];

            setRecruiterOptions(options);
          }

          setLoadingRecruiters(false);
        }

        const res = await fetch(`/api/jobs/${params.id}`, {
          cache: 'no-store',
        });

        if (!mounted) {
          return;
        }

        if (res.status === 401) {
          router.replace(`/auth/login?redirect=${pathname}`);
          return;
        }

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(data.error || 'Unable to load this job for editing.');
          setLoading(false);
          return;
        }

        const loadedJob = data.job as EditableJob;
        setForm(loadedJob);
        setInternshipTrack(
          loadedJob.job_type === 'internship' && loadedJob.internship_track !== 'unspecified'
            ? loadedJob.internship_track || ''
            : ''
        );
        setInternshipRequirements(
          internshipRequirementsFormStateFromPayload(loadedJob.internship_requirements)
        );
      } catch (err) {
        console.error('Edit job load error:', err);
        if (mounted) {
          setError('Unable to load this job for editing.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
          setLoadingRecruiters(false);
        }
      }
    }

    loadEditState();

    return () => {
      mounted = false;
    };
  }, [supabase, router, pathname, params.id]);

  const internshipPreset = getInternshipTrackPostingPreset(internshipTrack as InternshipTrack | '');
  const opportunityLabel = getOpportunityPostingLabel(
    form?.job_type || 'job',
    internshipTrack as InternshipTrack | ''
  );

  function handleJobTypeChange(nextJobType: string) {
    setForm((current) =>
      current
        ? {
            ...current,
            job_type: nextJobType,
          }
        : current
    );

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
    if (!file || !viewer) {
      return;
    }

    setUploadingLogo(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('logo', file);

      const res = await fetch(viewer.logoUploadEndpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload logo');
      }

      setForm((current) =>
        current
          ? {
              ...current,
              company_logo_url: (data.logoUrl as string) || null,
            }
          : current
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!form || !viewer) {
      return;
    }

    if (uploadingLogo) {
      setError('Please wait for the logo upload to finish.');
      return;
    }

    if (form.job_type === 'internship' && !internshipTrack) {
      setError('Select whether this internship is educational or professional.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/jobs/${params.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: form.title,
          companyName: form.company_name,
          companyLogoUrl: form.company_logo_url,
          location: form.location,
          salary: form.salary,
          workType: form.work_type,
          jobType: form.job_type,
          internshipTrack: form.job_type === 'internship' ? internshipTrack : undefined,
          internshipRequirements:
            form.job_type === 'internship'
              ? buildInternshipRequirementsPayload(internshipRequirements)
              : undefined,
          visibility: form.visibility,
          description: form.description,
          recruiterId: viewer.isAdminUser ? form.recruiter_id : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update job');
      }

      router.push(viewer.backHref);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update job');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-400">Loading job editor...</p>
        </div>
      </main>
    );
  }

  if (!form) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-white mb-3">Unable to edit this job</h1>
          <p className="text-gray-400 mb-6">{error || 'This job could not be loaded.'}</p>
          <Link
            href={viewer?.backHref || '/dashboard'}
            className="inline-flex items-center justify-center px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Go Back
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link
          href={viewer?.backHref || '/dashboard'}
          className="text-blue-400 hover:text-blue-300 text-sm mb-2 inline-block"
        >
          &larr; Back to Job
        </Link>
        <h1 className="text-2xl font-bold text-white">Edit {opportunityLabel}</h1>
        <p className="text-gray-400 mt-1">Update your opportunity details and track-specific ATS setup</p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-gray-800 rounded-xl p-6 space-y-6">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white border-b border-gray-700 pb-2">Basic Information</h2>

          <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                {opportunityLabel} Title <span className="text-red-400">*</span>
              </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Company Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.company_name || ''}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              required
              className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {viewer?.isAdminUser && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Recruiter Manager
              </label>
              <select
                value={form.recruiter_id}
                onChange={(e) => setForm({ ...form, recruiter_id: e.target.value })}
                disabled={loadingRecruiters}
                required
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">
                  {loadingRecruiters ? 'Loading recruiters...' : 'Select recruiter manager'}
                </option>
                {recruiterOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
                {form.recruiter_id &&
                  !recruiterOptions.some((option) => option.id === form.recruiter_id) && (
                    <option value={form.recruiter_id}>
                      Current assignment ({form.recruiter_id})
                    </option>
                  )}
              </select>
              <p className="text-xs text-gray-400 mt-2">
                The selected recruiter can manage this job and its applications.
              </p>
            </div>
          )}

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
            {form.company_logo_url && (
              <div className="mt-3 flex items-center gap-4 rounded-lg border border-gray-700 bg-gray-700/50 p-3">
                <img
                  src={form.company_logo_url}
                  alt="Company logo preview"
                  className="h-14 w-14 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">Logo ready</p>
                  <p className="truncate text-xs text-gray-400">{form.company_logo_url}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, company_logo_url: null })}
                  className="px-3 py-1.5 text-sm text-gray-300 hover:text-white transition-colors"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white border-b border-gray-700 pb-2">Location & Type</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Location</label>
              <input
                type="text"
                value={form.location || ''}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Salary (XAF)</label>
              <input
                type="number"
                value={form.salary ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    salary: e.target.value ? Number(e.target.value) : null,
                  })
                }
                min="0"
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Work Type</label>
              <select
                value={form.work_type || 'onsite'}
                onChange={(e) => setForm({ ...form, work_type: e.target.value })}
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
                value={form.job_type || 'job'}
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
                value={form.visibility || 'public'}
                onChange={(e) => setForm({ ...form, visibility: e.target.value })}
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="public">Public</option>
                <option value="talent_only">Talent Only</option>
              </select>
            </div>
          </div>

          <InternshipConfigurationFields
            jobType={form.job_type || 'job'}
            visibility={form.visibility || 'public'}
            internshipTrack={internshipTrack}
            requirements={internshipRequirements}
            onInternshipTrackChange={handleInternshipTrackChange}
            onRequirementsChange={setInternshipRequirements}
          />
          {form.job_type === 'internship' && internshipPreset && (
            <div className="rounded-lg border border-emerald-700/50 bg-emerald-900/20 p-4 text-sm text-emerald-100">
              This job now follows the {internshipPreset.label.toLowerCase()} ATS path. Keep native apply enabled if you want structured screening, matching, and stage reporting.
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white border-b border-gray-700 pb-2">Description</h2>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {opportunityLabel} Description <span className="text-red-400">*</span>
            </label>
            <textarea
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
              rows={8}
              className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-700">
          <Link
            href={viewer?.backHref || '/dashboard'}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving || uploadingLogo}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : uploadingLogo ? 'Uploading Logo...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </main>
  );
}

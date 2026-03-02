'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface EditableJob {
  id: string;
  posted_by: string | null;
  title: string;
  company_name: string | null;
  company_logo_url: string | null;
  location: string | null;
  salary: number | null;
  work_type: string | null;
  job_type: string | null;
  visibility: string | null;
  description: string | null;
}

interface ViewerState {
  backHref: string;
  isAdminUser: boolean;
  logoUploadEndpoint: string;
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

        setForm(data.job as EditableJob);
      } catch (err) {
        console.error('Edit job load error:', err);
        if (mounted) {
          setError('Unable to load this job for editing.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadEditState();

    return () => {
      mounted = false;
    };
  }, [supabase, router, pathname, params.id]);

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
          visibility: form.visibility,
          description: form.description,
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
        <h1 className="text-2xl font-bold text-white">Edit Job</h1>
        <p className="text-gray-400 mt-1">Update your job posting details</p>
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
              Job Title <span className="text-red-400">*</span>
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
              <label className="block text-sm font-medium text-gray-300 mb-1">Job Type</label>
              <select
                value={form.job_type || 'job'}
                onChange={(e) => setForm({ ...form, job_type: e.target.value })}
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
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white border-b border-gray-700 pb-2">Description</h2>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Job Description <span className="text-red-400">*</span>
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

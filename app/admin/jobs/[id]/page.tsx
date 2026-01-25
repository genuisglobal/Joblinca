import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import JobActions from './JobActions';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminJobDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const { data: job, error } = await supabase
    .from('jobs')
    .select(`
      *,
      poster:posted_by (
        id,
        full_name,
        first_name,
        last_name,
        email,
        role
      ),
      recruiter:recruiter_id (
        id,
        full_name,
        first_name,
        last_name,
        email
      ),
      approver:approved_by (
        id,
        full_name,
        first_name,
        last_name,
        email
      )
    `)
    .eq('id', id)
    .single();

  if (error || !job) {
    notFound();
  }

  // Get application count
  const { count: applicationCount } = await supabase
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', id);

  const getName = (profile: { first_name?: string | null; last_name?: string | null; full_name?: string | null; email?: string | null } | null) => {
    if (!profile) return 'Unknown';
    const { first_name, last_name, full_name, email } = profile;
    if (first_name || last_name) {
      return `${first_name || ''} ${last_name || ''}`.trim();
    }
    return full_name || email || 'Unknown';
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/admin/jobs" className="text-blue-400 hover:text-blue-300 text-sm mb-2 inline-block">
            &larr; Back to Jobs
          </Link>
          <h1 className="text-2xl font-bold text-white">{job.title}</h1>
          <p className="text-gray-400 mt-1">{job.company_name || 'No company specified'}</p>
        </div>
        <StatusBadge status={job.approval_status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Job Details Card */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Job Details</h2>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <DetailItem label="Location" value={job.location || 'Not specified'} />
              <DetailItem label="Work Type" value={job.work_type || 'Not specified'} />
              <DetailItem label="Job Type" value={job.job_type || 'job'} />
              <DetailItem label="Visibility" value={job.visibility || 'public'} />
              <DetailItem label="Salary" value={job.salary ? `${job.salary} XAF` : 'Not specified'} />
              <DetailItem label="Applications" value={applicationCount?.toString() || '0'} />
            </div>

            <div className="border-t border-gray-700 pt-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Description</h3>
              <div className="text-gray-300 whitespace-pre-wrap">{job.description}</div>
            </div>

            {job.custom_questions && job.custom_questions.length > 0 && (
              <div className="border-t border-gray-700 pt-4 mt-4">
                <h3 className="text-sm font-medium text-gray-400 mb-2">Screening Questions</h3>
                <ul className="space-y-2">
                  {job.custom_questions.map((q: { question: string }, i: number) => (
                    <li key={i} className="text-gray-300 text-sm">
                      {i + 1}. {q.question}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Rejection Reason (if rejected) */}
          {job.approval_status === 'rejected' && job.rejection_reason && (
            <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-red-400 mb-2">Rejection Reason</h2>
              <p className="text-gray-300">{job.rejection_reason}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions Card */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Actions</h2>
            <JobActions job={job} />
          </div>

          {/* Meta Info Card */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Information</h2>
            <div className="space-y-4">
              <MetaItem label="Posted By" value={getName(job.poster)} />
              <MetaItem label="Recruiter" value={getName(job.recruiter)} />
              <MetaItem label="Created" value={new Date(job.created_at).toLocaleString()} />
              <MetaItem label="Published" value={job.published ? 'Yes' : 'No'} />
              {job.approved_at && (
                <>
                  <MetaItem
                    label={job.approval_status === 'approved' ? 'Approved At' : 'Rejected At'}
                    value={new Date(job.approved_at).toLocaleString()}
                  />
                  <MetaItem
                    label={job.approval_status === 'approved' ? 'Approved By' : 'Rejected By'}
                    value={getName(job.approver)}
                  />
                </>
              )}
            </div>
          </div>

          {/* Links */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Links</h2>
            <div className="space-y-2">
              <Link
                href={`/jobs/${job.id}`}
                target="_blank"
                className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View Public Page
              </Link>
              {job.image_url && (
                <Link
                  href={job.image_url}
                  target="_blank"
                  className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  View Share Image
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    pending: {
      bg: 'bg-yellow-900/50 border-yellow-700',
      text: 'text-yellow-400',
      label: 'Pending Approval',
    },
    approved: {
      bg: 'bg-green-900/50 border-green-700',
      text: 'text-green-400',
      label: 'Approved',
    },
    rejected: {
      bg: 'bg-red-900/50 border-red-700',
      text: 'text-red-400',
      label: 'Rejected',
    },
  };

  const { bg, text, label } = config[status] || config.pending;

  return (
    <span className={`inline-flex items-center px-3 py-1 text-sm font-medium rounded-full border ${bg} ${text}`}>
      {label}
    </span>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase">{label}</p>
      <p className="text-gray-300 capitalize">{value}</p>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-gray-300 text-sm">{value}</p>
    </div>
  );
}

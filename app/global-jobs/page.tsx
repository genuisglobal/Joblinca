import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface ExternalJob {
  id: string;
  external_id: string;
  source: string;
  title: string;
  company_name?: string | null;
  company_logo?: string | null;
  location?: string | null;
  salary?: string | null;
  job_type?: string | null;
  category?: string | null;
  description?: string | null;
  url: string;
  fetched_at?: string | null;
}

export const dynamic = 'force-dynamic';

/**
 * Global Jobs Page
 *
 * Displays a list of job opportunities aggregated from external providers.
 * Users can browse jobs by category or search.  Applications are
 * redirected to the original provider site; we do not host the
 * application form for external jobs.  The jobs are stored in the
 * `external_jobs` table via scheduled refreshes.
 */
export default async function GlobalJobsPage() {
  const supabase = createServerSupabaseClient();
  // Fetch the 50 most recently fetched external jobs.  Filtering and
  // searching can be added via query params or a client component.
  const { data: jobs, error } = await supabase
    .from('external_jobs')
    .select('*')
    .order('fetched_at', { ascending: false })
    .limit(50);
  return (
    <main className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Global Opportunities</h1>
      <p className="mb-6">
        Discover job opportunities beyond Cameroon.  These roles are sourced
        from trusted partner platforms and include remote, freelance,
        teaching and sponsorship positions.  When applying, you will be
        redirected to the original listing.
      </p>
      {error && <p className="text-red-600 mb-4">{error.message}</p>}
      {!jobs || jobs.length === 0 ? (
        <p>No global opportunities available at the moment. Please check back later.</p>
      ) : (
        <ul className="space-y-4">
          {jobs.map((job: any) => (
            <li key={`${job.source}-${job.external_id}`} className="border rounded p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-semibold">{job.title}</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {job.company_name || 'Unknown company'}
                    {job.location ? ` • ${job.location}` : ''}
                  </p>
                </div>
                {job.job_type && (
                  <span className="inline-block bg-indigo-600 text-white text-xs px-2 py-1 rounded">
                    {job.job_type}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                {job.category || job.source}
                {job.salary ? ` • ${job.salary}` : ''}
              </p>
              <div className="mt-4 flex justify-between items-center">
                <Link
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Apply on {job.source.charAt(0).toUpperCase() + job.source.slice(1)}
                </Link>
                {job.fetched_at && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Fetched on {new Date(job.fetched_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
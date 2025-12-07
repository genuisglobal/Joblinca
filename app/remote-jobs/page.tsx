import Link from 'next/link';

interface RemoteJobSummary {
  id: number;
  title: string;
  company_name: string;
  category: string;
  tags: string[];
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  url: string;
  source: string;
}

import { fetchRemoteJobs } from '@/lib/remoteJobs';

async function getRemoteJobs(): Promise<RemoteJobSummary[]> {
  try {
    const data = await fetchRemoteJobs();
    return data.jobs.map((job) => ({
      id: job.id,
      title: job.title,
      company_name: job.company_name,
      category: job.category,
      tags: job.tags,
      job_type: job.job_type,
      publication_date: job.publication_date,
      candidate_required_location: job.candidate_required_location,
      salary: job.salary,
      url: job.url,
      source: 'Remotive',
    }));
  } catch {
    return [];
  }
}

export default async function RemoteJobsPage() {
  const jobs = await getRemoteJobs();
  return (
    <main className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">International Remote Jobs</h1>
      <p className="mb-6">
        Browse verified global remote job opportunities curated from Remotive.  These jobs are
        posted by international employers and allow you to work from Cameroon or
        anywhere in the world.  When applying, you will be redirected to the
        external job listing.  Remember to mention Remotive as the source
        according to their terms of service【32704738240961†L16-L31】.
      </p>
      {jobs.length === 0 ? (
        <p>No remote jobs available at the moment. Please check back later.</p>
      ) : (
        <ul className="space-y-4">
          {jobs.map((job) => (
            <li key={job.id} className="border rounded p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-semibold">
                    {job.title}
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {job.company_name} • {job.candidate_required_location}
                  </p>
                </div>
                <span className="inline-block bg-indigo-600 text-white text-xs px-2 py-1 rounded">
                  Remote
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                {job.category} • {job.job_type} {job.salary ? `• ${job.salary}` : ''}
              </p>
              <div className="mt-4 flex justify-between items-center">
                <Link
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Apply on {job.source}
                </Link>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Posted on {new Date(job.publication_date).toLocaleDateString()}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
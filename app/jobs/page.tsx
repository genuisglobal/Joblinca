import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface Job {
  id: string;
  title: string;
  description: string;
  location: string | null;
  salary: number | null;
  created_at: string;
}

export default async function JobsPage() {
  const supabase = createServerSupabaseClient();
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('published', true)
    .order('created_at', { ascending: false });
  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Available Jobs</h1>
      {error && <p className="text-red-600">{error.message}</p>}
      {!jobs || jobs.length === 0 ? (
        <p>No jobs found.</p>
      ) : (
        <ul className="space-y-4">
          {jobs.map((job: Job) => (
            <li
              key={job.id}
              className="border rounded p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              <h2 className="text-xl font-semibold">
                <Link href={`/jobs/${job.id}`}>{job.title}</Link>
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {job.location}
              </p>
              <p className="mt-2 line-clamp-2">{job.description}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
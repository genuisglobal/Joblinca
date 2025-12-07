import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', params.id)
    .single();
  if (error || !job) {
    notFound();
  }
  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">{job.title}</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-4">
        {job.location} • {job.salary ? `${job.salary.toLocaleString()} XAF` : 'Salary negotiable'}
      </p>
      <article className="prose dark:prose-invert">
        {job.description}
      </article>
    </main>
  );
}
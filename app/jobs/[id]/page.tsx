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
      {job.image_url && (
        <img
          src={job.image_url as string}
          alt="Job share card"
          className="w-full mb-6 rounded shadow"
        />
      )}
      <h1 className="text-3xl font-bold mb-2">{job.title}</h1>
      {job.company_name && (
        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {job.company_name}
        </p>
      )}
      <p className="text-gray-600 dark:text-gray-400 mb-4">
        {job.location || 'Location unspecified'}
        {job.work_type ? ` • ${job.work_type.charAt(0).toUpperCase() + job.work_type.slice(1)}` : ''}
        {job.salary ? ` • ${job.salary.toLocaleString()} XAF` : ''}
      </p>
      <article className="prose dark:prose-invert">
        {job.description}
      </article>
    </main>
  );
}
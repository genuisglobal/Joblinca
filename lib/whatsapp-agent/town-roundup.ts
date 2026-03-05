import { createServiceSupabaseClient } from '@/lib/supabase/service';

const roundupDb = createServiceSupabaseClient();

export interface TownRoundupJob {
  id: string;
  public_id: string | null;
  title: string | null;
  company_name: string | null;
  location: string | null;
  salary: number | null;
  created_at: string;
}

function formatSalary(value: number | null): string {
  if (value === null || Number.isNaN(value)) return 'N/A';
  return `${Math.round(value).toLocaleString('en-US')} XAF`;
}

export async function generateTownRoundup(params: {
  town: string;
  days?: number;
  limit?: number;
}): Promise<{
  town: string;
  sinceIso: string;
  jobs: TownRoundupJob[];
  message: string;
}> {
  const town = params.town.trim();
  const days = Math.max(1, Math.min(30, Math.floor(params.days || 7)));
  const limit = Math.max(1, Math.min(50, Math.floor(params.limit || 15)));
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await roundupDb
    .from('jobs')
    .select('id, public_id, title, company_name, location, salary, created_at')
    .eq('published', true)
    .eq('approval_status', 'approved')
    .ilike('location', `%${town}%`)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`generateTownRoundup failed: ${error.message}`);
  }

  const jobs = (data || []) as TownRoundupJob[];
  const lines: string[] = [];
  lines.push(`JobLinca Weekly Roundup - ${town}`);
  lines.push(`Last ${days} day(s)`);
  lines.push('');

  if (jobs.length === 0) {
    lines.push('No new jobs this week for this town.');
  } else {
    for (const job of jobs) {
      lines.push(
        `${job.public_id || 'N/A'} | ${job.title || 'Untitled'} | ${job.company_name || 'Company'} | ${formatSalary(job.salary)}`
      );
    }
  }

  lines.push('');
  lines.push('Apply: https://joblinca.com/jobs');

  return {
    town,
    sinceIso,
    jobs,
    message: lines.join('\n'),
  };
}


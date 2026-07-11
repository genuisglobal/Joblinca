/**
 * Language-based job roundup for the WhatsApp group strategy.
 *
 * The community groups are split by language (English / French) rather than
 * by town at this stage. The WhatsApp Business API cannot post into groups,
 * so the daily cron composes one ready-to-forward digest per language and
 * sends it to the admin forwarders — one tap forwards it into the matching
 * group.
 */

import { createServiceSupabaseClient } from '@/lib/supabase/service';

export type RoundupLanguage = 'en' | 'fr';

export interface LanguageRoundupJob {
  id: string;
  title: string | null;
  company_name: string | null;
  location: string | null;
  created_at: string;
}

export interface LanguageRoundup {
  language: RoundupLanguage;
  sinceIso: string;
  jobs: LanguageRoundupJob[];
  message: string;
}

const COPY: Record<
  RoundupLanguage,
  { header: string; empty: string; footer: string }
> = {
  en: {
    header: '💼 Joblinca — New jobs',
    empty: 'No new jobs in this period.',
    footer: 'All jobs: https://joblinca.com/jobs',
  },
  fr: {
    header: '💼 Joblinca — Nouvelles offres',
    empty: "Pas de nouvelles offres sur cette période.",
    footer: 'Toutes les offres : https://joblinca.com/jobs',
  },
};

export async function generateLanguageRoundup(params: {
  language: RoundupLanguage;
  days?: number;
  limit?: number;
}): Promise<LanguageRoundup> {
  const supabase = createServiceSupabaseClient();
  const { language } = params;
  const days = Math.max(1, Math.min(30, Math.floor(params.days || 1)));
  const limit = Math.max(1, Math.min(25, Math.floor(params.limit || 10)));
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('jobs')
    .select('id, title, company_name, location, created_at')
    .eq('published', true)
    .eq('approval_status', 'approved')
    .eq('visibility', 'public')
    .eq('language', language)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`generateLanguageRoundup failed: ${error.message}`);
  }

  const jobs = (data || []) as LanguageRoundupJob[];
  const copy = COPY[language];
  const lines: string[] = [copy.header, ''];

  if (jobs.length === 0) {
    lines.push(copy.empty);
  } else {
    for (const job of jobs) {
      const meta = [job.company_name, job.location].filter(Boolean).join(' · ');
      lines.push(`• ${job.title || 'Untitled'}${meta ? ` — ${meta}` : ''}`);
      lines.push(`  https://joblinca.com/jobs/${job.id}`);
    }
  }

  lines.push('');
  lines.push(copy.footer);

  return {
    language,
    sinceIso,
    jobs,
    message: lines.join('\n'),
  };
}

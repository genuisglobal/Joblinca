import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequestLocale } from '@/lib/i18n/server';
import { getServerT } from '@/lib/i18n/server-t';
import SalaryInsightsClient from './SalaryInsightsClient';

export function generateMetadata(): Metadata {
  const locale = getRequestLocale();
  const t = getServerT(locale);

  return {
    title: t('salary.metadataTitle'),
    description: t('salary.metadataDescription'),
  };
}

interface SalaryStats {
  count: number;
  min: number;
  max: number;
  median: number;
  avg: number;
  p25: number;
  p75: number;
}

export default async function SalaryInsightsPage() {
  const supabase = createServerSupabaseClient();

  const { data: jobs } = await supabase
    .from('jobs')
    .select('title, location, salary, work_type')
    .eq('published', true)
    .eq('approval_status', 'approved')
    .not('salary', 'is', null)
    .gt('salary', 0)
    .limit(1000);

  const allJobs = jobs || [];
  const categories = new Map<string, number[]>();
  const locations = new Map<string, number[]>();

  for (const job of allJobs) {
    const salary = Number(job.salary);
    if (!salary || salary <= 0) continue;

    const category = categorizeJob(job.title);
    if (!categories.has(category)) categories.set(category, []);
    categories.get(category)!.push(salary);

    const loc = normalizeLocation(job.location);
    if (loc) {
      if (!locations.has(loc)) locations.set(loc, []);
      locations.get(loc)!.push(salary);
    }
  }

  const categoryStats = Array.from(categories.entries())
    .filter(([, s]) => s.length >= 2)
    .map(([category, salaries]) => ({ category, ...computeStats(salaries) }))
    .sort((a, b) => b.count - a.count);

  const locationStats = Array.from(locations.entries())
    .filter(([, s]) => s.length >= 2)
    .map(([location, salaries]) => ({ location, ...computeStats(salaries) }))
    .sort((a, b) => b.count - a.count);

  const allSalaries = allJobs.map((j) => Number(j.salary)).filter((s) => s > 0);
  const overall = allSalaries.length >= 2 ? computeStats(allSalaries) : null;

  return (
    <SalaryInsightsClient
      overall={overall}
      byCategory={categoryStats}
      byLocation={locationStats}
      totalJobs={allSalaries.length}
    />
  );
}

function computeStats(salaries: number[]): SalaryStats {
  const sorted = [...salaries].sort((a, b) => a - b);
  const count = sorted.length;
  const min = sorted[0];
  const max = sorted[count - 1];
  const median =
    count % 2 === 0
      ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
      : sorted[Math.floor(count / 2)];
  const avg = Math.round(salaries.reduce((a, b) => a + b, 0) / count);
  const p25 = sorted[Math.floor(count * 0.25)];
  const p75 = sorted[Math.floor(count * 0.75)];

  return { count, min, max, median: Math.round(median), avg, p25, p75 };
}

function categorizeJob(title: string): string {
  const value = title.toLowerCase();
  if (/engineer|developer|programm|software|fullstack|full.stack|backend|frontend/.test(value)) {
    return 'software_engineering';
  }
  if (/design|ui|ux|graphic/.test(value)) return 'design';
  if (/market|seo|content|social media|digital/.test(value)) return 'marketing';
  if (/sales|business dev|account exec/.test(value)) return 'sales';
  if (/data|analyst|analytics|machine learn|ai|ml/.test(value)) return 'data_analytics';
  if (/product|project|scrum|agile/.test(value)) return 'product_project';
  if (/finance|account|audit|tax/.test(value)) return 'finance_accounting';
  if (/admin|assistant|secretary|office/.test(value)) return 'administration';
  if (/hr|human resource|recruit|talent/.test(value)) return 'human_resources';
  if (/customer|support|service/.test(value)) return 'customer_support';
  if (/teach|tutor|education|instruct/.test(value)) return 'education';
  if (/health|medical|nurs|doctor|pharm/.test(value)) return 'healthcare';
  return 'other';
}

function normalizeLocation(location: string | null): string | null {
  if (!location) return null;
  const value = location.toLowerCase().trim();
  if (/douala/.test(value)) return 'Douala';
  if (/yaound/.test(value)) return 'Yaounde';
  if (/bamenda/.test(value)) return 'Bamenda';
  if (/buea/.test(value)) return 'Buea';
  if (/limb/.test(value)) return 'Limbe';
  if (/bafoussam/.test(value)) return 'Bafoussam';
  if (/garoua/.test(value)) return 'Garoua';
  if (/maroua/.test(value)) return 'Maroua';
  if (/kribi/.test(value)) return 'Kribi';
  if (/bertoua/.test(value)) return 'Bertoua';
  if (/remote/.test(value)) return 'Remote';
  return location.split(',')[0].trim();
}

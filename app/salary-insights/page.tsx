import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Metadata } from 'next';
import SalaryInsightsClient from './SalaryInsightsClient';

export const metadata: Metadata = {
  title: 'Salary Insights — Cameroon Job Market',
  description:
    'Explore salary ranges across industries and cities in Cameroon. Transparent salary data from real job postings on Joblinca.',
};

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

  // Fetch published jobs with salary
  const { data: jobs } = await supabase
    .from('jobs')
    .select('title, location, salary, work_type')
    .eq('published', true)
    .eq('approval_status', 'approved')
    .not('salary', 'is', null)
    .gt('salary', 0)
    .limit(1000);

  const allJobs = jobs || [];

  // Categorize
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
  const t = title.toLowerCase();
  if (/engineer|developer|programm|software|fullstack|full.stack|backend|frontend/.test(t))
    return 'Software Engineering';
  if (/design|ui|ux|graphic/.test(t)) return 'Design';
  if (/market|seo|content|social media|digital/.test(t)) return 'Marketing';
  if (/sales|business dev|account exec/.test(t)) return 'Sales';
  if (/data|analyst|analytics|machine learn|ai|ml/.test(t)) return 'Data & Analytics';
  if (/product|project|scrum|agile/.test(t)) return 'Product & Project Management';
  if (/finance|account|audit|tax/.test(t)) return 'Finance & Accounting';
  if (/admin|assistant|secretary|office/.test(t)) return 'Administration';
  if (/hr|human resource|recruit|talent/.test(t)) return 'Human Resources';
  if (/customer|support|service/.test(t)) return 'Customer Support';
  if (/teach|tutor|education|instruct/.test(t)) return 'Education';
  if (/health|medical|nurs|doctor|pharm/.test(t)) return 'Healthcare';
  return 'Other';
}

function normalizeLocation(location: string | null): string | null {
  if (!location) return null;
  const l = location.toLowerCase().trim();
  if (/douala/.test(l)) return 'Douala';
  if (/yaound/.test(l)) return 'Yaoundé';
  if (/bamenda/.test(l)) return 'Bamenda';
  if (/buea/.test(l)) return 'Buea';
  if (/limb/.test(l)) return 'Limbé';
  if (/bafoussam/.test(l)) return 'Bafoussam';
  if (/garoua/.test(l)) return 'Garoua';
  if (/maroua/.test(l)) return 'Maroua';
  if (/kribi/.test(l)) return 'Kribi';
  if (/bertoua/.test(l)) return 'Bertoua';
  if (/remote/.test(l)) return 'Remote';
  return location.split(',')[0].trim();
}

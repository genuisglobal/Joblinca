import { Suspense } from 'react';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  ArrowRight,
  Briefcase,
  Building2,
  Clock,
  Globe,
  GraduationCap,
  MapPin,
  Rocket,
} from 'lucide-react';
import {
  describeEligibleRoles,
  getOpportunityTypeLabel,
  matchesOpportunityBrowseFilter,
  resolveOpportunityBrowseFilter,
  type OpportunityBrowseFilter,
} from '@/lib/opportunities';
import { isJobPubliclyListable } from '@/lib/jobs/lifecycle';
import JobSearchBar from './JobSearchBar';

interface Job {
  id: string;
  title: string;
  company_name: string | null;
  recruiter_id: string | null;
  description: string | null;
  location: string | null;
  job_type: string | null;
  internship_track: string | null;
  eligible_roles: string[] | null;
  visibility: string | null;
  salary: number | null;
  created_at: string;
  work_type: string | null;
  closes_at: string | null;
  lifecycle_status: string | null;
}

interface JobsPageProps {
  searchParams: Promise<{ type?: string; q?: string; location?: string; remote?: string }>;
}

const FILTERS: Array<{
  key: OpportunityBrowseFilter;
  label: string;
}> = [
  { key: 'all', label: 'All Opportunities' },
  { key: 'job', label: 'Jobs' },
  { key: 'internship_education', label: 'Educational Internships' },
  { key: 'internship_professional', label: 'Professional Internships' },
  { key: 'gig', label: 'Gigs' },
];

export const metadata = {
  title: 'Find Jobs - Joblinca',
  description:
    'Browse jobs, educational internships, professional internships, and remote opportunities on Joblinca.',
};

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return 'Today';
  if (diffDays === 2) return 'Yesterday';
  if (diffDays <= 7) return `${diffDays} days ago`;
  if (diffDays <= 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatCompensation(job: Job) {
  if (!job.salary) {
    return 'Compensation not disclosed';
  }

  const formatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  });

  return `${formatter.format(job.salary)} XAF`;
}

function badgeClasses(label: string) {
  if (label === 'Educational Internship') {
    return 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30';
  }

  if (label === 'Professional Internship') {
    return 'bg-sky-500/10 text-sky-300 border border-sky-500/30';
  }

  if (label === 'Gig') {
    return 'bg-amber-500/10 text-amber-300 border border-amber-500/30';
  }

  return 'bg-primary-600/10 text-primary-300 border border-primary-600/30';
}

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const query = await searchParams;
  const activeFilter = resolveOpportunityBrowseFilter(query.type);
  const searchQuery = (query.q || '').trim();
  const locationQuery = (query.location || '').trim();
  const remoteOnly = query.remote === '1';
  const supabase = createServerSupabaseClient();

  let dbQuery = supabase
    .from('jobs')
    .select(
      `
      id,
      title,
      company_name,
      recruiter_id,
      description,
      location,
      job_type,
      internship_track,
      eligible_roles,
      visibility,
      salary,
      created_at,
      work_type,
      closes_at,
      lifecycle_status
    `
    )
    .eq('published', true)
    .eq('approval_status', 'approved');

  if (searchQuery) {
    dbQuery = dbQuery.or(
      `title.ilike.%${searchQuery}%,company_name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`
    );
  }

  if (locationQuery) {
    dbQuery = dbQuery.ilike('location', `%${locationQuery}%`);
  }

  if (remoteOnly) {
    dbQuery = dbQuery.eq('work_type', 'remote');
  }

  const { data: jobs, error } = await dbQuery.order('created_at', { ascending: false });

  const allJobs = ((jobs || []) as Job[]).filter((job) => isJobPubliclyListable(job));
  const filteredJobs = allJobs.filter((job) =>
    matchesOpportunityBrowseFilter(activeFilter, job.job_type, job.internship_track)
  );
  const counts = {
    all: allJobs.length,
    job: allJobs.filter((job) => matchesOpportunityBrowseFilter('job', job.job_type, job.internship_track)).length,
    internship_education: allJobs.filter((job) =>
      matchesOpportunityBrowseFilter('internship_education', job.job_type, job.internship_track)
    ).length,
    internship_professional: allJobs.filter((job) =>
      matchesOpportunityBrowseFilter('internship_professional', job.job_type, job.internship_track)
    ).length,
    gig: allJobs.filter((job) => matchesOpportunityBrowseFilter('gig', job.job_type, job.internship_track)).length,
  };

  return (
    <main className="min-h-screen bg-neutral-950">
      <section className="border-b border-neutral-800 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_30%),linear-gradient(180deg,_#101826_0%,_#09090b_100%)]">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900/70 px-3 py-1 text-xs uppercase tracking-[0.22em] text-neutral-300">
                <Rocket className="h-3.5 w-3.5" />
                Opportunity marketplace
              </p>
              <h1 className="text-3xl font-bold text-white sm:text-4xl">Find the right opportunity</h1>
              <p className="mt-3 text-neutral-300">
                Browse jobs, educational internships, professional internships, and gigs with clearer role targeting and intake paths.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:w-auto w-full">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 px-4 py-3 min-w-0">
                <p className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 truncate">Jobs</p>
                <p className="mt-1 text-2xl font-semibold text-white">{counts.job}</p>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 min-w-0">
                <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-300 truncate">Internships (Edu)</p>
                <p className="mt-1 text-2xl font-semibold text-white">{counts.internship_education}</p>
              </div>
              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 min-w-0">
                <p className="text-[10px] uppercase tracking-[0.15em] text-sky-300 truncate">Internships (Pro)</p>
                <p className="mt-1 text-2xl font-semibold text-white">{counts.internship_professional}</p>
              </div>
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 min-w-0">
                <p className="text-[10px] uppercase tracking-[0.15em] text-amber-300 truncate">Gigs</p>
                <p className="mt-1 text-2xl font-semibold text-white">{counts.gig}</p>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            {FILTERS.map((filter) => {
              const isActive = activeFilter === filter.key;
              // Preserve existing search params when switching type tabs
              const tabParams = new URLSearchParams();
              if (filter.key !== 'all') tabParams.set('type', filter.key);
              if (searchQuery) tabParams.set('q', searchQuery);
              if (locationQuery) tabParams.set('location', locationQuery);
              if (remoteOnly) tabParams.set('remote', '1');
              const href = tabParams.toString() ? `/jobs?${tabParams.toString()}` : '/jobs';
              const count = counts[filter.key];

              return (
                <Link
                  key={filter.key}
                  href={href}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border border-primary-500/40 bg-primary-600/15 text-primary-200'
                      : 'border border-neutral-700 bg-neutral-900/80 text-neutral-400 hover:border-neutral-500 hover:text-white'
                  }`}
                >
                  <span>{filter.label}</span>
                  <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs">{count}</span>
                </Link>
              );
            })}
          </div>

          <Suspense>
            <JobSearchBar />
          </Suspense>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-10">
        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-red-400">{error.message}</p>
          </div>
        )}

        {!filteredJobs.length ? (
          <div className="py-20 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-neutral-800">
              <Briefcase className="h-10 w-10 text-neutral-600" />
            </div>
            <h2 className="mb-3 text-2xl font-bold text-white">No matching opportunities right now</h2>
            <p className="mx-auto mb-8 max-w-md text-neutral-400">
              Try another opportunity type or create your profile so Joblinca can alert you when matching roles are published.
            </p>
            <Link
              href="/auth/register?role=candidate"
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-3 font-semibold text-white transition-all hover:bg-primary-700"
            >
              Get Job Alerts
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredJobs.map((job) => {
              const opportunityLabel = getOpportunityTypeLabel(job.job_type, job.internship_track);
              const eligibleRoleSummary = describeEligibleRoles(
                job.eligible_roles,
                job.job_type,
                job.internship_track,
                job.visibility
              );

              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="group block rounded-2xl border border-neutral-800 bg-neutral-900 p-6 transition-all hover:border-primary-600/40 hover:bg-neutral-900/90"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start">
                    <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-800">
                      {opportunityLabel === 'Educational Internship' ? (
                        <GraduationCap className="h-7 w-7 text-emerald-300" />
                      ) : (
                        <Building2 className="h-7 w-7 text-primary-400" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${badgeClasses(opportunityLabel)}`}>
                          {opportunityLabel}
                        </span>
                        {job.work_type === 'remote' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-400">
                            <Globe className="h-3 w-3" />
                            Remote
                          </span>
                        )}
                      </div>

                      <h2 className="text-xl font-semibold text-white transition-colors group-hover:text-primary-300">
                        {job.title}
                      </h2>
                      {job.company_name && (
                        <p className="mt-1 font-medium text-neutral-300">{job.company_name}</p>
                      )}

                      <p className="mt-3 line-clamp-2 text-sm text-neutral-400">
                        {job.description || 'No description provided yet.'}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-neutral-500">
                        {job.location && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-4 w-4" />
                            <span>{job.location}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Briefcase className="h-4 w-4" />
                          <span>{eligibleRoleSummary}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4" />
                          <span>{formatDate(job.created_at)}</span>
                        </div>
                      </div>

                      <p className="mt-4 text-sm font-medium text-neutral-300">{formatCompensation(job)}</p>
                    </div>

                    <div className="flex-shrink-0 md:text-right">
                      <span className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 font-medium text-white transition-all group-hover:bg-primary-500">
                        View Opportunity
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

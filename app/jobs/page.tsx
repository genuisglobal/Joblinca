import { Suspense } from 'react';
import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import {
  ArrowRight,
  Briefcase,
  Building2,
  Clock,
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
import { getRequestBaseUrl } from '@/lib/app-url';
import { checkAdminStatus } from '@/lib/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequestLocale } from '@/lib/i18n/server';
import { getServerT } from '@/lib/i18n/server-t';
import { addLocalePrefix, normalizeLocale, type Locale } from '@/lib/i18n/locale';
import ContentJobActions from '@/app/admin/content-jobs/ContentJobActions';
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
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  created_at: string;
  work_type: string | null;
  language: Locale | null;
  closes_at: string | null;
  lifecycle_status: string | null;
  published?: boolean;
  approval_status?: string | null;
  origin_type: string | null;
  source_attribution_json: {
    source_name?: string;
    trust_score?: number;
  } | null;
}

type ContentStatus = 'not_started' | 'in_progress' | 'created' | 'skipped';

interface JobsPageProps {
  searchParams: Promise<{
    type?: string;
    q?: string;
    search?: string;
    title?: string;
    location?: string;
    remote?: string;
    work_type?: string;
    language?: string;
    date_posted?: string;
    salary_min?: string;
    salary_max?: string;
    page?: string;
  }>;
}

interface JobsApiPayload {
  jobs?: Job[];
  total?: number;
  counts?: {
    all?: number;
    job?: number;
    internship_education?: number;
    internship_professional?: number;
    gig?: number;
  };
}

const FILTERS: OpportunityBrowseFilter[] = [
  'all',
  'job',
  'internship_education',
  'internship_professional',
  'gig',
];

type PostedDateFilter = '24h' | '3d' | '1w' | '1m' | 'anytime';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function generateMetadata() {
  const locale = getRequestLocale();
  const t = getServerT(locale);

  return {
    title: t('jobs.metadataTitle'),
    description: t('jobs.metadataDescription'),
  };
}

function formatDate(
  dateString: string,
  locale: Locale,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return t('common.today');
  if (diffDays === 2) return t('common.yesterday');
  if (diffDays <= 7) return t('common.daysAgo', { count: diffDays });
  if (diffDays <= 30) return t('common.weeksAgo', { count: Math.ceil(diffDays / 7) });
  return date.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatCompensation(
  job: Job,
  locale: Locale,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  const currency = job.salary_currency || 'XAF';
  const min = job.salary_min ?? job.salary ?? null;
  const max = job.salary_max ?? job.salary_min ?? job.salary ?? null;

  if (min === null && max === null) {
    return t('jobs.compensationUndisclosed');
  }

  const formatter = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    maximumFractionDigits: 0,
  });

  const formatAmount = (value: number) => `${formatter.format(value)} ${currency}`;

  if (min !== null && max !== null && min !== max) {
    return `${formatAmount(Math.min(min, max))} - ${formatAmount(Math.max(min, max))}`;
  }

  if (min !== null && max !== null && min === max) {
    return formatAmount(min);
  }

  if (min !== null) {
    return t('common.from', { value: formatAmount(min) });
  }

  if (max !== null) {
    return t('common.upTo', { value: formatAmount(max) });
  }

  return t('jobs.compensationUndisclosed');
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

function getLanguageBadge(locale: Locale | null, preferredLocale: Locale) {
  if (!locale) {
    return null;
  }

  const matchesPreference = locale === preferredLocale;

  return {
    label: locale.toUpperCase(),
    descriptionKey: locale === 'fr' ? 'jobs.postingFrench' : 'jobs.postingEnglish',
    className: matchesPreference
      ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : 'border border-neutral-700 bg-neutral-800 text-neutral-300',
  };
}

function normalizePostedDateFilter(value: string | undefined): PostedDateFilter {
  switch (value) {
    case '24h':
    case '3d':
    case '1w':
    case '1m':
      return value;
    default:
      return 'anytime';
  }
}

function normalizeWorkTypeQuery(value: string | undefined, legacyRemote: string | undefined) {
  const normalized = value?.trim().toLowerCase();

  if (normalized === 'remote' || normalized === 'onsite' || normalized === 'hybrid') {
    return normalized;
  }

  if (legacyRemote === '1') {
    return 'remote';
  }

  return '';
}

function translateOpportunityLabel(
  label: string,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  switch (label) {
    case 'Educational Internship':
      return t('common.opportunity.internshipEducation');
    case 'Professional Internship':
      return t('common.opportunity.internshipProfessional');
    case 'Internship':
      return t('common.opportunity.internship');
    case 'Gig':
      return t('common.opportunity.gig');
    default:
      return t('common.opportunity.job');
  }
}

function translateEligibleRoleSummary(
  summary: string,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  switch (summary) {
    case 'Talent profiles':
      return t('common.talentProfiles');
    case 'Job seeker profiles':
      return t('common.jobSeekerProfiles');
    default:
      return t('common.jobSeekerAndTalentProfiles');
  }
}

function getFilterLabel(
  filter: OpportunityBrowseFilter,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  switch (filter) {
    case 'job':
      return t('jobs.filter.jobs');
    case 'internship_education':
      return t('jobs.filter.educationalInternships');
    case 'internship_professional':
      return t('jobs.filter.professionalInternships');
    case 'gig':
      return t('jobs.filter.gigs');
    default:
      return t('jobs.filter.allOpportunities');
  }
}

function getWorkTypeLabel(
  workType: string | null,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  switch (workType) {
    case 'remote':
      return t('common.remote');
    case 'hybrid':
      return t('common.hybrid');
    case 'onsite':
      return t('common.onSite');
    default:
      return t('common.notSpecified');
  }
}

function getWorkTypeBadgeClasses(workType: string | null) {
  switch (workType) {
    case 'remote':
      return 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'hybrid':
      return 'border border-amber-500/30 bg-amber-500/10 text-amber-300';
    case 'onsite':
      return 'border border-neutral-700 bg-neutral-800 text-neutral-300';
    default:
      return 'border border-neutral-700 bg-neutral-800 text-neutral-300';
  }
}

function normalizeContentStatus(value: unknown): ContentStatus {
  if (
    value === 'in_progress' ||
    value === 'created' ||
    value === 'skipped' ||
    value === 'not_started'
  ) {
    return value;
  }

  return 'not_started';
}

function contentStatusLabel(status: ContentStatus) {
  switch (status) {
    case 'created':
      return 'Content created';
    case 'in_progress':
      return 'Content in progress';
    case 'skipped':
      return 'Content skipped';
    default:
      return 'No content yet';
  }
}

function contentStatusClassName(status: ContentStatus) {
  switch (status) {
    case 'created':
      return 'border-green-500/30 bg-green-500/10 text-green-300';
    case 'in_progress':
      return 'border-blue-500/30 bg-blue-500/10 text-blue-300';
    case 'skipped':
      return 'border-neutral-700 bg-neutral-800 text-neutral-300';
    default:
      return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300';
  }
}

export default async function JobsPage({ searchParams }: JobsPageProps) {
  noStore();

  const query = await searchParams;
  const preferredLocale = getRequestLocale();
  const t = getServerT(preferredLocale);
  const activeFilter = resolveOpportunityBrowseFilter(query.type);
  const { isAdmin, adminType } = await checkAdminStatus();
  const canManageContent = isAdmin && ['content', 'operations', 'super'].includes(adminType || '');
  const activeLanguageFilter = normalizeLocale(query.language);
  const searchQuery = (query.title || query.q || query.search || '').trim();
  const locationQuery = (query.location || '').trim();
  const workTypeQuery = normalizeWorkTypeQuery(query.work_type, query.remote);
  const datePostedQuery = normalizePostedDateFilter(query.date_posted);
  const salaryMinQuery = (query.salary_min || '').trim();
  const salaryMaxQuery = (query.salary_max || '').trim();
  const currentPage = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const PAGE_SIZE = 24;

  function buildJobsHref(overrides: Record<string, string | null>) {
    const params = new URLSearchParams();
    const nextValues: Record<string, string | null> = {
      type: activeFilter !== 'all' ? activeFilter : null,
      q: searchQuery || null,
      location: locationQuery || null,
      work_type: workTypeQuery || null,
      language: activeLanguageFilter || null,
      date_posted: datePostedQuery !== 'anytime' ? datePostedQuery : null,
      salary_min: salaryMinQuery || null,
      salary_max: salaryMaxQuery || null,
      ...overrides,
    };

    for (const [key, value] of Object.entries(nextValues)) {
      if (value) {
        params.set(key, value);
      }
    }

    const queryString = params.toString();
    return addLocalePrefix(queryString ? `/jobs?${queryString}` : '/jobs', preferredLocale);
  }

  let jobs: Job[] = [];
  let totalCount = 0;
  let counts = {
    all: 0,
    job: 0,
    internship_education: 0,
    internship_professional: 0,
    gig: 0,
  };
  let error: { message: string } | null = null;

  try {
    const jobsParams = new URLSearchParams({
      preferred_language: preferredLocale,
      limit: String(PAGE_SIZE),
      offset: String((currentPage - 1) * PAGE_SIZE),
    });
    if (activeLanguageFilter) {
      jobsParams.set('language', activeLanguageFilter);
    }
    if (searchQuery) {
      jobsParams.set('search', searchQuery);
    }
    if (locationQuery) {
      jobsParams.set('location', locationQuery);
    }
    if (workTypeQuery) {
      jobsParams.set('work_type', workTypeQuery);
    }
    if (datePostedQuery !== 'anytime') {
      jobsParams.set('date_posted', datePostedQuery);
    }
    if (salaryMinQuery) {
      jobsParams.set('salary_min', salaryMinQuery);
    }
    if (salaryMaxQuery) {
      jobsParams.set('salary_max', salaryMaxQuery);
    }
    if (activeFilter !== 'all') {
      jobsParams.set('browse_type', activeFilter);
    }

    const response = await fetch(`${getRequestBaseUrl()}/api/jobs?${jobsParams.toString()}`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      error = {
        message:
          preferredLocale === 'fr'
            ? `Impossible de charger les offres (${response.status})`
            : `Failed to load jobs (${response.status})`,
      };
    } else {
      const rawPayload = await response.json();
      const payload =
        !Array.isArray(rawPayload) && rawPayload && typeof rawPayload === 'object'
          ? (rawPayload as JobsApiPayload)
          : null;

      jobs = payload && Array.isArray(payload.jobs)
        ? payload.jobs
        : Array.isArray(rawPayload)
          ? (rawPayload as Job[])
          : [];
      totalCount = payload && typeof payload.total === 'number' ? payload.total : jobs.length;
      counts = {
        all: typeof payload?.counts?.all === 'number' ? payload.counts.all : jobs.length,
        job: typeof payload?.counts?.job === 'number' ? payload.counts.job : 0,
        internship_education:
          typeof payload?.counts?.internship_education === 'number'
            ? payload.counts.internship_education
            : 0,
        internship_professional:
          typeof payload?.counts?.internship_professional === 'number'
            ? payload.counts.internship_professional
            : 0,
        gig: typeof payload?.counts?.gig === 'number' ? payload.counts.gig : 0,
      };
    }
  } catch (fetchError) {
    error = {
      message:
        fetchError instanceof Error
          ? fetchError.message
          : preferredLocale === 'fr'
            ? 'Impossible de charger les offres'
            : 'Failed to load jobs',
    };
  }

  const allJobs = jobs
    .filter((job) => job.visibility === 'public' && isJobPubliclyListable(job));
  const filteredJobs = allJobs.filter((job) =>
    matchesOpportunityBrowseFilter(activeFilter, job.job_type, job.internship_track)
  );
  const contentStatusByJobId = new Map<string, ContentStatus>();

  if (canManageContent && filteredJobs.length > 0) {
    const supabase = createServerSupabaseClient();
    const { data: contentRows, error: contentStatusError } = await supabase
      .from('jobs')
      .select('id, content_status')
      .in('id', filteredJobs.map((job) => job.id));

    if (contentStatusError) {
      console.error('Failed to load public job content statuses', contentStatusError);
    }

    (contentRows || []).forEach((row: any) => {
      contentStatusByJobId.set(row.id, normalizeContentStatus(row.content_status));
    });
  }

  return (
    <main className="min-h-screen bg-neutral-950">
      <section className="border-b border-neutral-800 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_30%),linear-gradient(180deg,_#101826_0%,_#09090b_100%)]">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900/70 px-3 py-1 text-xs uppercase tracking-[0.22em] text-neutral-300">
                <Rocket className="h-3.5 w-3.5" />
                {t('jobs.marketplaceBadge')}
              </p>
              <h1 className="text-3xl font-bold text-white sm:text-4xl">{t('jobs.marketplaceTitle')}</h1>
              <p className="mt-3 text-neutral-300">
                {t('jobs.marketplaceSubtitle')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:w-auto w-full">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 px-4 py-3 min-w-0">
                <p className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 truncate">{t('jobs.stats.jobs')}</p>
                <p className="mt-1 text-2xl font-semibold text-white">{counts.job}</p>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 min-w-0">
                <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-300 truncate">{t('jobs.stats.internshipsEdu')}</p>
                <p className="mt-1 text-2xl font-semibold text-white">{counts.internship_education}</p>
              </div>
              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 min-w-0">
                <p className="text-[10px] uppercase tracking-[0.15em] text-sky-300 truncate">{t('jobs.stats.internshipsPro')}</p>
                <p className="mt-1 text-2xl font-semibold text-white">{counts.internship_professional}</p>
              </div>
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 min-w-0">
                <p className="text-[10px] uppercase tracking-[0.15em] text-amber-300 truncate">{t('jobs.stats.gigs')}</p>
                <p className="mt-1 text-2xl font-semibold text-white">{counts.gig}</p>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            {FILTERS.map((filter) => {
              const isActive = activeFilter === filter;
              const href = buildJobsHref({
                type: filter !== 'all' ? filter : null,
                page: null,
              });
              const count = counts[filter];

              return (
                <Link
                  key={filter}
                  href={href}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border border-primary-500/40 bg-primary-600/15 text-primary-200'
                      : 'border border-neutral-700 bg-neutral-900/80 text-neutral-400 hover:border-neutral-500 hover:text-white'
                  }`}
                >
                  <span>{getFilterLabel(filter, t)}</span>
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
            <h2 className="mb-3 text-2xl font-bold text-white">{t('jobs.noMatchesTitle')}</h2>
            <p className="mx-auto mb-8 max-w-md text-neutral-400">
              {t('jobs.noMatchesDescription')}
            </p>
            <Link
              href={addLocalePrefix('/auth/register?role=candidate', preferredLocale)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-3 font-semibold text-white transition-all hover:bg-primary-700"
            >
              {t('jobs.getAlerts')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {filteredJobs.map((job) => {
                const opportunityLabel = getOpportunityTypeLabel(job.job_type, job.internship_track);
                const eligibleRoleSummary = describeEligibleRoles(
                  job.eligible_roles,
                  job.job_type,
                  job.internship_track,
                  job.visibility
                );
                const localizedOpportunityLabel = translateOpportunityLabel(opportunityLabel, t);
                const localizedEligibleRoleSummary = translateEligibleRoleSummary(
                  eligibleRoleSummary,
                  t
                );
                const languageBadge = getLanguageBadge(job.language, preferredLocale);

                const jobHref = addLocalePrefix(`/jobs/${job.id}`, preferredLocale);
                const contentStatus = contentStatusByJobId.get(job.id) || 'not_started';

                return (
                  <div
                    key={job.id}
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
                            {localizedOpportunityLabel}
                          </span>
                          {languageBadge && (
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${languageBadge.className}`}
                              title={t(languageBadge.descriptionKey)}
                            >
                              {languageBadge.label}
                            </span>
                          )}
                          {job.work_type && (
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getWorkTypeBadgeClasses(job.work_type)}`}>
                              {getWorkTypeLabel(job.work_type, t)}
                            </span>
                          )}
                          {/* Origin badge: Joblinca vs External */}
                          {job.origin_type === 'admin_import' || job.origin_type === 'claimed_discovered' ? (
                            <>
                              <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2.5 py-1 text-xs font-medium text-orange-300 border border-orange-500/20">
                                {t('jobs.external')}
                              </span>
                              {(() => {
                                const trust = job.source_attribution_json?.trust_score;
                                if (trust == null) return null;
                                if (trust >= 80) return (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-400 border border-green-500/20">
                                    {t('jobs.highTrust')}
                                  </span>
                                );
                                if (trust >= 60) return (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2.5 py-1 text-xs font-medium text-yellow-400 border border-yellow-500/20">
                                    {t('jobs.moderateTrust')}
                                  </span>
                                );
                                return (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 border border-red-500/20">
                                    {t('jobs.lowTrust')}
                                  </span>
                                );
                              })()}
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-300 border border-blue-500/20">
                              {t('jobs.joblinca')}
                            </span>
                          )}
                        </div>

                        <Link href={jobHref} className="inline-block">
                          <h2 className="text-xl font-semibold text-white transition-colors hover:text-primary-300">
                            {job.title}
                          </h2>
                        </Link>
                        {job.company_name && (
                          <p className="mt-1 font-medium text-neutral-300">{job.company_name}</p>
                        )}

                        <p className="mt-3 line-clamp-2 text-sm text-neutral-400">
                          {job.description || t('jobs.noDescriptionYet')}
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
                            <span>{localizedEligibleRoleSummary}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4" />
                            <span>{formatDate(job.created_at, preferredLocale, t)}</span>
                          </div>
                        </div>

                        <p className="mt-4 text-sm font-medium text-neutral-300">
                          {formatCompensation(job, preferredLocale, t)}
                        </p>
                      </div>

                      <div className="flex-shrink-0 md:text-right">
                        <Link
                          href={jobHref}
                          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 font-medium text-white transition-all hover:bg-primary-500"
                        >
                          {t('jobs.viewOpportunity')}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>

                    {canManageContent && (
                      <div className="mt-5 flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-950/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
                            Content workflow
                          </p>
                          <span
                            className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${contentStatusClassName(contentStatus)}`}
                          >
                            {contentStatusLabel(contentStatus)}
                          </span>
                        </div>
                        <ContentJobActions jobId={job.id} currentStatus={contentStatus} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {(() => {
              const totalPages = Math.ceil(totalCount / PAGE_SIZE);
              if (totalPages <= 1) return null;

              function buildPageUrl(page: number) {
                return buildJobsHref({
                  page: page > 1 ? String(page) : null,
                });
              }

              return (
                <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Pagination">
                  {currentPage > 1 && (
                    <Link
                      href={buildPageUrl(currentPage - 1)}
                      className="px-4 py-2 rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 text-sm"
                    >
                      {t('jobs.previous')}
                    </Link>
                  )}
                  <span className="px-3 py-2 text-sm text-neutral-400">
                    {preferredLocale === 'fr'
                      ? `Page ${currentPage} sur ${totalPages}`
                      : `Page ${currentPage} of ${totalPages}`}
                  </span>
                  {currentPage < totalPages && (
                    <Link
                      href={buildPageUrl(currentPage + 1)}
                      className="px-4 py-2 rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 text-sm"
                    >
                      {t('jobs.next')}
                    </Link>
                  )}
                </nav>
              );
            })()}
          </>
        )}
      </section>
    </main>
  );
}

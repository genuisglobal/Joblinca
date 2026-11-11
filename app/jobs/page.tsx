import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight, Briefcase, Rocket } from 'lucide-react';
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
import JobCard, { type JobCardBadge } from '@/components/jobs/JobCard';
import EmptyState from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';
import type { BadgeTone } from '@/components/ui/Badge';
import { summarizeDescription } from '@/lib/jobs/summary';

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

// The page is still rendered per request (searchParams, admin cookies), but
// it no longer forces every fetch to skip the cache: fetches default to
// no-store, and only the public /api/jobs listing below opts into a 60s cache
// (keyed by its full URL, i.e. per search/filter/page/language).
export const fetchCache = 'default-no-store';
const PUBLIC_JOBS_REVALIDATE_SECONDS = 60;

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

function opportunityTone(label: string): BadgeTone {
  if (label === 'Educational Internship') return 'success';
  if (label === 'Gig') return 'warning';
  return 'primary';
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
      next: { revalidate: PUBLIC_JOBS_REVALIDATE_SECONDS },
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
    <main className="min-h-screen bg-surface">
      <section className="border-b border-line bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_30%),linear-gradient(180deg,_#101826_0%,_#09090b_100%)]">
        <div className="mx-auto max-w-6xl px-4 pb-4 pt-5 sm:px-6 sm:pb-6 sm:pt-10">
          <div className="max-w-2xl">
            <p className="mb-3 hidden items-center gap-2 rounded-full border border-line-strong bg-surface-raised/70 px-3 py-1 text-xs uppercase tracking-[0.22em] text-fg-muted sm:inline-flex">
              <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
              {t('jobs.marketplaceBadge')}
            </p>
            <h1 className="text-2xl font-bold text-fg sm:text-4xl">{t('jobs.marketplaceTitle')}</h1>
            <p className="mt-3 hidden text-fg-muted sm:block">{t('jobs.marketplaceSubtitle')}</p>
          </div>

          {/* One row of browse tabs with counts (replaces the count tiles,
              which repeated the same numbers). Scrolls sideways on phones. */}
          <nav aria-label={t('jobs.browseTabsLabel')} className="-mx-4 mt-4 sm:mx-0 sm:mt-6">
            <ul className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
              {FILTERS.map((filter) => {
                const isActive = activeFilter === filter;
                const href = buildJobsHref({
                  type: filter !== 'all' ? filter : null,
                  page: null,
                });

                return (
                  <li key={filter} className="shrink-0">
                    <Link
                      href={href}
                      aria-current={isActive ? 'page' : undefined}
                      className={`inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors ${
                        isActive
                          ? 'border border-primary-500/40 bg-primary-600/15 text-primary-200'
                          : 'border border-line-strong bg-surface-raised/80 text-fg-muted hover:border-fg-subtle hover:text-fg'
                      }`}
                    >
                      <span>{getFilterLabel(filter, t)}</span>
                      <span className="rounded-full bg-black/25 px-2 py-0.5 text-xs tabular-nums">{counts[filter]}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <Suspense>
            <JobSearchBar />
          </Suspense>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-10">
        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4" role="alert">
            <p className="text-red-400">{error.message}</p>
          </div>
        )}

        {!filteredJobs.length ? (
          <EmptyState
            className="my-6"
            icon={<Briefcase className="h-6 w-6" />}
            title={t('jobs.noMatchesTitle')}
            description={t('jobs.noMatchesDescription')}
            action={
              <ButtonLink
                href={addLocalePrefix('/auth/register?role=candidate', preferredLocale)}
                rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
              >
                {t('jobs.getAlerts')}
              </ButtonLink>
            }
          />
        ) : (
          <>
            <p className="mb-3 text-sm text-fg-subtle">
              {t('jobs.resultsCount', { count: totalCount })}
            </p>
            <div className="space-y-3 sm:space-y-4">
              {filteredJobs.map((job) => {
                const opportunityLabel = getOpportunityTypeLabel(job.job_type, job.internship_track);
                const eligibleRoleSummary = describeEligibleRoles(
                  job.eligible_roles,
                  job.job_type,
                  job.internship_track,
                  job.visibility
                );
                const languageBadge = getLanguageBadge(job.language, preferredLocale);
                const isExternal = job.origin_type === 'admin_import' || job.origin_type === 'claimed_discovered';
                const trust = job.source_attribution_json?.trust_score;
                const compensation = formatCompensation(job, preferredLocale, t);
                const contentStatus = contentStatusByJobId.get(job.id) || 'not_started';

                const badges: JobCardBadge[] = [
                  { label: translateOpportunityLabel(opportunityLabel, t), tone: opportunityTone(opportunityLabel) },
                  isExternal
                    ? {
                        label:
                          trust == null
                            ? t('jobs.external')
                            : `${t('jobs.external')} · ${t(trust >= 80 ? 'jobs.highTrust' : trust >= 60 ? 'jobs.moderateTrust' : 'jobs.lowTrust')}`,
                        tone: trust == null ? 'warning' : trust >= 80 ? 'success' : trust >= 60 ? 'warning' : 'danger',
                      }
                    : { label: t('jobs.joblinca'), tone: 'primary' },
                ];
                if (languageBadge) {
                  badges.push({
                    label: languageBadge.label,
                    title: t(languageBadge.descriptionKey),
                    tone: 'neutral',
                    desktopOnly: true,
                  });
                }

                return (
                  <JobCard
                    key={job.id}
                    href={addLocalePrefix(`/jobs/${job.id}`, preferredLocale)}
                    title={job.title}
                    company={job.company_name}
                    location={job.location}
                    workType={job.work_type ? getWorkTypeLabel(job.work_type, t) : null}
                    postedLabel={formatDate(job.created_at, preferredLocale, t)}
                    compensation={compensation === t('jobs.compensationUndisclosed') ? null : compensation}
                    summary={summarizeDescription(job.description)}
                    secondaryMeta={translateEligibleRoleSummary(eligibleRoleSummary, t)}
                    icon={opportunityLabel === 'Educational Internship' ? 'education' : 'company'}
                    badges={badges}
                    actions={
                      canManageContent ? (
                        <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">
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
                      ) : undefined
                    }
                  />
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

              const pagerLink =
                'inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-surface-raised px-4 text-sm text-fg-muted transition-colors hover:bg-surface-overlay hover:text-fg';

              return (
                <nav className="mt-8 flex items-center justify-between gap-2 sm:mt-10 sm:justify-center" aria-label="Pagination">
                  {currentPage > 1 ? (
                    <Link href={buildPageUrl(currentPage - 1)} className={pagerLink} rel="prev">
                      {t('jobs.previous')}
                    </Link>
                  ) : (
                    <span aria-hidden="true" />
                  )}
                  <span className="px-3 py-2 text-sm text-fg-muted">
                    {preferredLocale === 'fr'
                      ? `Page ${currentPage} sur ${totalPages}`
                      : `Page ${currentPage} of ${totalPages}`}
                  </span>
                  {currentPage < totalPages ? (
                    <Link href={buildPageUrl(currentPage + 1)} className={pagerLink} rel="next">
                      {t('jobs.next')}
                    </Link>
                  ) : (
                    <span aria-hidden="true" />
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

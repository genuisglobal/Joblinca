import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequestLocale } from '@/lib/i18n/server';
import { getServerT } from '@/lib/i18n/server-t';
import {
  addLocalePrefix,
  detectContentLanguage,
  normalizeLocale,
  type Locale,
} from '@/lib/i18n/locale';
import ApplyOptions from './ApplyOptions';
import {
  describeEligibleRoles,
  getOpportunityTypeLabel,
} from '@/lib/opportunities';
import {
  isJobAcceptingApplications,
  isJobPubliclyListable,
  isJobPubliclyVisible,
} from '@/lib/jobs/lifecycle';
import { buildJobPostingJsonLd } from '@/lib/seo/job-posting-jsonld';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumb-jsonld';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; already_applied?: string }>;
}

interface InternshipRequirements {
  school_required: boolean | null;
  allowed_schools: string[] | null;
  allowed_fields_of_study: string[] | null;
  allowed_school_years: string[] | null;
  graduation_year_min: number | null;
  graduation_year_max: number | null;
  credit_bearing: boolean | null;
  requires_school_convention: boolean | null;
  academic_calendar: string | null;
  academic_supervisor_required: boolean | null;
  portfolio_required: boolean | null;
  minimum_project_count: number | null;
  minimum_badge_count: number | null;
  conversion_possible: boolean | null;
  expected_weekly_availability: string | null;
  stipend_type: string | null;
}

function formatDate(dateStr: string, locale: Locale) {
  return new Date(dateStr).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatSalary(
  job: Record<string, any>,
  locale: Locale,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  const min = job.salary_min ?? null;
  const max = job.salary_max ?? null;
  const legacy = job.salary ?? null;
  if (!min && !max && !legacy) return null;
  const currency = job.salary_currency || 'XAF';
  const formatter = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
  const periodLabel: Record<string, string> = locale === 'fr' ? {
    HOUR: '/heure',
    DAY: '/jour',
    WEEK: '/semaine',
    MONTH: '/mois',
    YEAR: '/an',
  } : {
    HOUR: '/hour',
    DAY: '/day',
    WEEK: '/week',
    MONTH: '/month',
    YEAR: '/year',
  };
  const suffix = periodLabel[(job.salary_period || 'MONTH').toUpperCase()] || '';

  let amount: string | null = null;
  if (min && max && min !== max) amount = `${formatter.format(min)} – ${formatter.format(max)}`;
  else if (min && max) amount = formatter.format(min);
  else if (min) amount = t('common.from', { value: formatter.format(min) });
  else if (max) amount = t('common.upTo', { value: formatter.format(max) });
  else if (legacy) amount = formatter.format(legacy);

  return amount ? `${amount} ${suffix}`.trim() : null;
}

function renderList(
  values: string[] | null | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  if (!values || values.length === 0) {
    return t('common.noSpecificRestriction');
  }

  return values.join(', ');
}

function opportunityBadgeClasses(opportunityLabel: string) {
  if (opportunityLabel === 'Educational Internship') {
    return 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  }

  if (opportunityLabel === 'Professional Internship') {
    return 'border border-sky-500/30 bg-sky-500/10 text-sky-300';
  }

  if (opportunityLabel === 'Gig') {
    return 'border border-amber-500/30 bg-amber-500/10 text-amber-300';
  }

  return 'border border-blue-500/30 bg-blue-500/10 text-blue-300';
}

function getJobLanguageBadge(language: Locale | null, preferredLocale: Locale) {
  if (!language) {
    return null;
  }

  return {
    labelKey: language === 'fr' ? 'jobs.postingFrench' : 'jobs.postingEnglish',
    shortLabel: language.toUpperCase(),
    className:
      language === preferredLocale
        ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
        : 'border border-neutral-700 bg-neutral-800 text-neutral-300',
  };
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

function translateWorkType(value: string, locale: Locale) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'remote') {
    return locale === 'fr' ? 'A distance' : 'Remote';
  }
  if (normalized === 'hybrid') {
    return locale === 'fr' ? 'Hybride' : 'Hybrid';
  }
  if (normalized === 'on_site' || normalized === 'onsite') {
    return locale === 'fr' ? 'Sur site' : 'On-site';
  }
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const locale = getRequestLocale();
  const t = getServerT(locale);
  const supabase = createServerSupabaseClient();
  const { data: job } = await supabase
    .from('jobs')
    .select(
      'title, company_name, location, job_type, work_type, description, image_url, company_logo_url, published, approval_status, lifecycle_status, closes_at, closed_at, archived_at, filled_at, removed_at'
    )
    .eq('id', id)
    .maybeSingle();

  if (!job) return { title: t('jobDetail.metadataNotFound'), robots: { index: false, follow: false } };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com';
  const jobUrl = `${appUrl}${addLocalePrefix(`/jobs/${id}`, locale)}`;
  const englishJobUrl = `${appUrl}${addLocalePrefix(`/jobs/${id}`, 'en')}`;
  const frenchJobUrl = `${appUrl}${addLocalePrefix(`/jobs/${id}`, 'fr')}`;
  const locationText = job.work_type === 'remote' ? t('common.remote') : job.location || 'Cameroon';
  const title = `${job.title}${job.company_name ? ` at ${job.company_name}` : ''} - ${locationText}`;
  const baseDesc = job.description
    ? job.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 155)
    : `Apply for ${job.title}${job.company_name ? ` at ${job.company_name}` : ''} in ${locationText}. Find jobs on Joblinca.`;

  // Pages for jobs that are no longer publicly listable shouldn't get indexed —
  // keeps Google for Jobs from surfacing expired/removed roles.
  const companyText = job.company_name
    ? locale === 'fr'
      ? ` chez ${job.company_name}`
      : ` at ${job.company_name}`
    : '';
  const localizedTitle =
    locale === 'fr' ? `${job.title}${companyText} â€” ${locationText}` : title;
  const localizedTitlePlain =
    locale === 'fr' ? `${job.title}${companyText} - ${locationText}` : title;
  const localizedBaseDesc = job.description
    ? baseDesc
    : t('jobDetail.metadataDescription', {
        title: job.title,
        company: companyText,
        location: locationText,
      });
  const indexable = isJobPubliclyListable(job);

  // Note: we deliberately omit openGraph.images / twitter.images here so that
  // Next.js uses the dynamic image from app/jobs/[id]/opengraph-image.tsx.
  return {
    title: localizedTitlePlain,
    description: localizedBaseDesc,
    alternates: {
      canonical: jobUrl,
      languages: {
        'en-CM': englishJobUrl,
        'fr-CM': frenchJobUrl,
        'x-default': englishJobUrl,
      },
    },
    robots: indexable
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: {
      type: 'article',
      url: jobUrl,
      siteName: 'Joblinca',
      title: localizedTitlePlain,
      description: localizedBaseDesc,
      locale: locale === 'fr' ? 'fr_CM' : 'en_CM',
    },
    twitter: {
      card: 'summary_large_image',
      title: localizedTitlePlain,
      description: localizedBaseDesc,
    },
  };
}

export default async function JobDetailPage({ params, searchParams }: PageProps) {
  noStore();

  const { id } = await params;
  const query = await searchParams;
  const preferredLocale = getRequestLocale();
  const t = getServerT(preferredLocale);
  const supabase = createServerSupabaseClient();

  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !job) {
    notFound();
  }

  const opportunityLabel = getOpportunityTypeLabel(job.job_type, job.internship_track);
  const jobLanguage =
    normalizeLocale(job.language) ||
    detectContentLanguage(`${job.title} ${job.description || ''}`);
  const languageBadge = getJobLanguageBadge(jobLanguage, preferredLocale);
  const eligibleRoleSummary = describeEligibleRoles(
    job.eligible_roles,
    job.job_type,
    job.internship_track,
    job.visibility
  );
  const localizedOpportunityLabel = translateOpportunityLabel(opportunityLabel, t);
  const localizedEligibleRoleSummary = translateEligibleRoleSummary(eligibleRoleSummary, t);
  const localizedJobLanguage = jobLanguage === 'fr'
    ? t('jobDetail.frenchLanguage')
    : t('jobDetail.englishLanguage');

  const isPubliclyVisible = isJobPubliclyVisible(job);
  const isAcceptingApplications = isJobAcceptingApplications(job);
  const isClosed = !isAcceptingApplications;

  let internshipRequirements: InternshipRequirements | null = null;
  if (job.job_type === 'internship') {
    try {
      const { data } = await supabase
        .from('job_internship_requirements')
        .select(
          `
          school_required,
          allowed_schools,
          allowed_fields_of_study,
          allowed_school_years,
          graduation_year_min,
          graduation_year_max,
          credit_bearing,
          requires_school_convention,
          academic_calendar,
          academic_supervisor_required,
          portfolio_required,
          minimum_project_count,
          minimum_badge_count,
          conversion_possible,
          expected_weekly_availability,
          stipend_type
        `
        )
        .eq('job_id', id)
        .maybeSingle();

      internshipRequirements = (data as InternshipRequirements | null) || null;
    } catch {
      internshipRequirements = null;
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let existingApplication = null;
  let isSaved = false;
  let userRole = null;

  if (user) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      userRole = profile?.role || null;
    } catch {
      // Ignore missing profile metadata.
    }

    try {
      const { data: application } = await supabase
        .from('applications')
        .select('id, status, is_draft, created_at')
        .eq('job_id', id)
        .eq('applicant_id', user.id)
        .single();

      existingApplication = application;
    } catch {
      // Ignore missing application row.
    }

    try {
      const { data: savedJob } = await supabase
        .from('saved_jobs')
        .select('id')
        .eq('job_id', id)
        .eq('user_id', user.id)
        .single();

      isSaved = !!savedJob;
    } catch {
      // Ignore if save feature is unavailable.
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com';
  const jobUrl = `${appUrl}${addLocalePrefix(`/jobs/${id}`, preferredLocale)}`;
  const jobPostingJsonLd = buildJobPostingJsonLd(job, { appUrl });
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: preferredLocale === 'fr' ? 'Accueil' : 'Home', url: `${appUrl}${addLocalePrefix('/', preferredLocale)}` },
    { name: preferredLocale === 'fr' ? 'Emplois' : 'Jobs', url: `${appUrl}${addLocalePrefix('/jobs', preferredLocale)}` },
    ...(job.location && job.work_type !== 'remote'
      ? [{
          name: job.location,
          url: `${appUrl}${addLocalePrefix(`/jobs-in/${job.location.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, preferredLocale)}`,
        }]
      : []),
    { name: job.title, url: jobUrl },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    <div className="min-h-screen bg-gray-900">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link
          href={addLocalePrefix('/jobs', preferredLocale)}
          className="mb-6 inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('jobDetail.backToJobs')}
        </Link>

        {query.error === 'not_accepting' && (
          <div className="mb-6 rounded-lg border border-yellow-700 bg-yellow-900/50 p-4 text-yellow-400">
            {t('jobDetail.notAccepting')}
          </div>
        )}

        {query.already_applied === 'true' && (
          <div className="mb-6 rounded-lg border border-blue-700 bg-blue-900/50 p-4 text-blue-400">
            {t('jobDetail.alreadyApplied')}
          </div>
        )}

        {!isPubliclyVisible && (
          <div className="mb-6 rounded-lg border border-yellow-700 bg-yellow-900/50 p-4 text-yellow-400">
            {t('jobDetail.notVisible')}
          </div>
        )}

        {isClosed && (
          <div className="mb-6 rounded-lg border border-red-700 bg-red-900/50 p-4 text-red-400">
            {t('jobDetail.closed')}
          </div>
        )}

        {jobLanguage && jobLanguage !== preferredLocale && (
          <div className="mb-6 rounded-lg border border-cyan-700 bg-cyan-900/40 p-4 text-cyan-200">
            {t('jobDetail.languageNotice', { language: localizedJobLanguage })}
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-6 rounded-lg border border-gray-700 bg-gray-800 p-6">
              {job.image_url && (
                <div className="relative mb-6 h-48 w-full overflow-hidden rounded-lg">
                  <Image
                    src={job.image_url}
                    alt={`${job.title} at ${job.company_name}`}
                    fill
                    sizes="(max-width: 1024px) 100vw, 768px"
                    unoptimized
                    className="object-cover"
                  />
                </div>
              )}

              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${opportunityBadgeClasses(opportunityLabel)}`}>
                  {localizedOpportunityLabel}
                </span>
                {languageBadge && (
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${languageBadge.className}`}
                    title={t(languageBadge.labelKey)}
                  >
                    {languageBadge.shortLabel}
                  </span>
                )}
                {job.work_type === 'remote' && (
                  <span className="inline-flex rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-300">
                    {t('jobDetail.remoteFriendly')}
                  </span>
                )}
                {job.visibility === 'talent_only' && (
                  <span className="inline-flex rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-1 text-xs font-medium text-fuchsia-300">
                    {t('jobDetail.talentOnly')}
                  </span>
                )}
                {/* Origin badge */}
                {job.origin_type === 'admin_import' || job.origin_type === 'claimed_discovered' ? (
                  <span className="inline-flex rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-300">
                    {t('jobDetail.externalSource')}
                  </span>
                ) : (
                  <span className="inline-flex rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
                    {t('jobs.joblinca')}
                  </span>
                )}
              </div>

              <h1 className="mb-2 text-2xl font-bold text-white">{job.title}</h1>
              {job.recruiter_id ? (
                <Link href={addLocalePrefix(`/companies/${job.recruiter_id}`, preferredLocale)} className="mb-4 block text-lg text-gray-300 hover:text-primary-300 transition-colors">
                  {job.company_name}
                </Link>
              ) : (
                <p className="mb-4 text-lg text-gray-300">{job.company_name}</p>
              )}

              <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                {job.location && (
                  <div className="flex items-center gap-1.5">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    {job.location}
                  </div>
                )}

                {job.employment_type && (
                  <div className="flex items-center gap-1.5">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    {job.employment_type.replace(/_/g, ' ')}
                  </div>
                )}

                {job.work_type && (
                  <div className="flex items-center gap-1.5">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                      />
                    </svg>
                    {translateWorkType(job.work_type, preferredLocale)}
                  </div>
                )}

                {formatSalary(job, preferredLocale, t) && (
                  <div className="flex items-center gap-1.5">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {formatSalary(job, preferredLocale, t)}
                  </div>
                )}
              </div>

              {job.created_at && (
                <p className="mt-4 text-sm text-gray-500">
                  {t('jobDetail.posted', { date: formatDate(job.created_at, preferredLocale) })}
                  {job.closes_at && isAcceptingApplications && (
                    <span className="ml-2">| {t('jobDetail.closes', { date: formatDate(job.closes_at, preferredLocale) })}</span>
                  )}
                </p>
              )}
            </div>

            <div className="mb-6 rounded-lg border border-gray-700 bg-gray-800 p-6">
              <h2 className="mb-4 text-lg font-semibold text-white">{t('jobDetail.description')}</h2>
              <div className="prose prose-invert max-w-none text-gray-300">
                {job.description ? (
                  <div className="whitespace-pre-wrap">{job.description}</div>
                ) : (
                  <p className="italic text-gray-500">{t('jobDetail.noDescription')}</p>
                )}
              </div>
            </div>

            {/* External source attribution + trust indicator */}
            {(job.origin_type === 'admin_import' || job.origin_type === 'claimed_discovered') && job.source_attribution_json && (
              <div className="mb-6 rounded-lg border border-orange-500/20 bg-orange-500/5 p-5">
                <div className="flex items-start gap-3">
                  <svg className="h-5 w-5 text-orange-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-orange-300">{t('jobDetail.externalListing')}</p>
                    <p className="text-sm text-gray-400 mt-1">
                      {t('jobDetail.externalListingDescription', {
                        source:
                          (job.source_attribution_json as any)?.source_name ||
                          t('jobDetail.sourceNameFallback'),
                      })}
                    </p>
                    {(() => {
                      const trust = (job.source_attribution_json as any)?.trust_score;
                      if (trust == null) return null;
                      const level =
                        trust >= 80
                          ? t('jobDetail.highTrust')
                          : trust >= 60
                            ? t('jobDetail.moderateTrust')
                            : t('jobDetail.lowTrust');
                      const color = trust >= 80 ? 'text-green-400' : trust >= 60 ? 'text-yellow-400' : 'text-red-400';
                      const barColor = trust >= 80 ? 'bg-green-500' : trust >= 60 ? 'bg-yellow-500' : 'bg-red-500';
                      return (
                        <div className="mt-3 flex items-center gap-3">
                          <span className="text-xs text-gray-500">{t('jobDetail.trustLevel')}:</span>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 rounded-full bg-gray-700">
                              <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${trust}%` }} />
                            </div>
                            <span className={`text-xs font-medium ${color}`}>{level} ({trust}/100)</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {job.requirements && (
              <div className="mb-6 rounded-lg border border-gray-700 bg-gray-800 p-6">
                <h2 className="mb-4 text-lg font-semibold text-white">{t('jobDetail.requirements')}</h2>
                <div className="prose prose-invert max-w-none text-gray-300">
                  <div className="whitespace-pre-wrap">{job.requirements}</div>
                </div>
              </div>
            )}

            {job.job_type === 'internship' && internshipRequirements && (
              <div className="mb-6 rounded-lg border border-gray-700 bg-gray-800 p-6">
                <h2 className="mb-4 text-lg font-semibold text-white">{t('jobDetail.internshipDetails')}</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm text-gray-400">{t('jobDetail.track')}</p>
                    <p className="text-white">{localizedOpportunityLabel}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">{t('jobDetail.eligibleProfiles')}</p>
                    <p className="text-white">{localizedEligibleRoleSummary}</p>
                  </div>

                  {job.internship_track === 'education' ? (
                    <>
                      <div>
                        <p className="text-sm text-gray-400">{t('jobDetail.targetSchools')}</p>
                        <p className="text-white">{renderList(internshipRequirements.allowed_schools, t)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">{t('jobDetail.fieldsOfStudy')}</p>
                        <p className="text-white">{renderList(internshipRequirements.allowed_fields_of_study, t)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">{t('jobDetail.schoolYears')}</p>
                        <p className="text-white">{renderList(internshipRequirements.allowed_school_years, t)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">{t('jobDetail.academicCalendar')}</p>
                        <p className="text-white">{internshipRequirements.academic_calendar || t('common.notSpecified')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">{t('jobDetail.schoolRequired')}</p>
                        <p className="text-white">{internshipRequirements.school_required ? t('common.yes') : t('common.no')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">{t('jobDetail.creditBearing')}</p>
                        <p className="text-white">{internshipRequirements.credit_bearing ? t('common.yes') : t('common.no')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">{t('jobDetail.schoolConventionRequired')}</p>
                        <p className="text-white">{internshipRequirements.requires_school_convention ? t('common.yes') : t('common.no')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">{t('jobDetail.academicSupervisorRequired')}</p>
                        <p className="text-white">{internshipRequirements.academic_supervisor_required ? t('common.yes') : t('common.no')}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-sm text-gray-400">{t('jobDetail.fieldsOfStudy')}</p>
                        <p className="text-white">{renderList(internshipRequirements.allowed_fields_of_study, t)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">{t('jobDetail.weeklyAvailability')}</p>
                        <p className="text-white">{internshipRequirements.expected_weekly_availability || t('common.notSpecified')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">{t('jobDetail.portfolioRequired')}</p>
                        <p className="text-white">{internshipRequirements.portfolio_required ? t('common.yes') : t('common.no')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">{t('jobDetail.conversionPossible')}</p>
                        <p className="text-white">{internshipRequirements.conversion_possible ? t('common.yes') : t('common.no')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">{t('jobDetail.minimumProjects')}</p>
                        <p className="text-white">{internshipRequirements.minimum_project_count ?? t('common.notSpecified')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">{t('jobDetail.minimumBadges')}</p>
                        <p className="text-white">{internshipRequirements.minimum_badge_count ?? t('common.notSpecified')}</p>
                      </div>
                    </>
                  )}

                  <div>
                    <p className="text-sm text-gray-400">{t('jobDetail.graduationWindow')}</p>
                    <p className="text-white">
                      {internshipRequirements.graduation_year_min || internshipRequirements.graduation_year_max
                        ? `${internshipRequirements.graduation_year_min || t('common.any')} - ${internshipRequirements.graduation_year_max || t('common.any')}`
                        : t('common.notSpecified')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">{t('jobDetail.stipendCompensation')}</p>
                    <p className="text-white">{internshipRequirements.stipend_type || t('common.notSpecified')}</p>
                  </div>
                </div>
              </div>
            )}

            {job.benefits && (
              <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
                <h2 className="mb-4 text-lg font-semibold text-white">{t('jobDetail.benefits')}</h2>
                <div className="prose prose-invert max-w-none text-gray-300">
                  <div className="whitespace-pre-wrap">{job.benefits}</div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-6 space-y-6">
              <div className="rounded-lg border border-gray-700 bg-gray-800 p-5">
                <h2 className="mb-4 text-base font-semibold text-white">{t('jobDetail.opportunitySummary')}</h2>
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="text-gray-400">{t('jobDetail.type')}</p>
                    <p className="text-white">{localizedOpportunityLabel}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">{t('jobDetail.eligibleProfiles')}</p>
                    <p className="text-white">{localizedEligibleRoleSummary}</p>
                  </div>
                  {job.job_type === 'internship' && (
                    <div>
                      <p className="text-gray-400">{t('jobDetail.trackIntent')}</p>
                      <p className="text-white">
                        {job.internship_track === 'education'
                          ? t('jobDetail.trackIntentEducation')
                          : job.internship_track === 'professional'
                            ? t('jobDetail.trackIntentProfessional')
                            : t('jobDetail.trackIntentPending')}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <ApplyOptions
                job={{
                  id: job.id,
                  title: job.title,
                  company_name: job.company_name,
                  recruiter_id: job.recruiter_id ?? null,
                  job_type: job.job_type,
                  internship_track: job.internship_track,
                  visibility: job.visibility,
                  eligible_roles: job.eligible_roles,
                  apply_method: job.apply_method || 'joblinca',
                  external_apply_url: job.external_apply_url,
                  apply_email: job.apply_email,
                  apply_phone: job.apply_phone,
                  apply_whatsapp: job.apply_whatsapp,
                  closes_at: job.closes_at,
                  origin_type: job.origin_type ?? null,
                  source_name: (job.source_attribution_json as any)?.source_name ?? null,
                }}
                isAuthenticated={!!user}
                userRole={userRole}
                existingApplication={existingApplication}
                isSaved={isSaved}
                isClosed={!!isClosed}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import {
  ArrowRight,
  Briefcase,
  Building2,
  Clock,
  Globe,
  GraduationCap,
  MapPin,
} from 'lucide-react';
import { getOpportunityTypeLabel } from '@/lib/opportunities';
import { isJobPubliclyListable } from '@/lib/jobs/lifecycle';
import { getRequestBaseUrl } from '@/lib/app-url';
import { getRequestLocale } from '@/lib/i18n/server';
import { getServerT } from '@/lib/i18n/server-t';
import { addLocalePrefix, type Locale } from '@/lib/i18n/locale';
import { CITIES, getCityBySlug } from '@/lib/seo/cities';

interface CityPageProps {
  params: Promise<{ city: string }>;
}

interface Job {
  id: string;
  title: string;
  company_name: string | null;
  description: string | null;
  location: string | null;
  job_type: string | null;
  internship_track: string | null;
  visibility: string | null;
  work_type: string | null;
  created_at: string;
  closes_at: string | null;
  lifecycle_status: string | null;
  published?: boolean;
  approval_status?: string | null;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function formatDate(
  dateString: string,
  locale: Locale,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.ceil(
    Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 1) return t('common.today');
  if (diffDays === 2) return t('common.yesterday');
  if (diffDays <= 7) return t('common.daysAgo', { count: diffDays });
  return date.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
  });
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

function translateCategorySlug(
  slug: string,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  switch (slug) {
    case 'developer':
      return t('cityJobs.category.developer');
    case 'marketing':
      return t('cityJobs.category.marketing');
    case 'sales':
      return t('cityJobs.category.sales');
    case 'accounting':
      return t('cityJobs.category.accounting');
    case 'customer-service':
      return t('cityJobs.category.customerService');
    case 'design':
      return t('cityJobs.category.design');
    case 'finance':
      return t('cityJobs.category.finance');
    case 'hr':
      return t('cityJobs.category.hr');
    case 'operations':
      return t('cityJobs.category.operations');
    case 'engineering':
      return t('cityJobs.category.engineering');
    case 'education':
      return t('cityJobs.category.education');
    case 'healthcare':
      return t('cityJobs.category.healthcare');
    default:
      return slug;
  }
}

export async function generateMetadata({
  params,
}: CityPageProps): Promise<Metadata> {
  const locale = getRequestLocale();
  const t = getServerT(locale);
  const { city } = await params;
  const data = getCityBySlug(city);
  if (!data) return { title: t('cityJobs.metadataNotFound') };

  const langKey = locale === 'fr' ? 'fr' : 'en';

  return {
    title: t('cityJobs.metadataTitle', { city: data.name }),
    description: t('cityJobs.metadataDescription', {
      city: data.name,
      region: data.region[langKey],
      description: data.description[langKey],
    }),
    openGraph: {
      title: t('cityJobs.metadataOgTitle', { city: data.name }),
      description: t('cityJobs.metadataOgDescription', { city: data.name }),
    },
  };
}

export default async function CityJobsPage({ params }: CityPageProps) {
  noStore();

  const locale = getRequestLocale();
  const t = getServerT(locale);
  const { city } = await params;
  const cityKey = city.toLowerCase();
  const data = getCityBySlug(cityKey);
  const langKey = locale === 'fr' ? 'fr' : 'en';

  if (!data) notFound();

  let jobs: Job[] = [];

  try {
    const response = await fetch(`${getRequestBaseUrl()}/api/jobs`, {
      cache: 'no-store',
    });

    if (response.ok) {
      const payload = await response.json();
      jobs = Array.isArray(payload.jobs)
        ? (payload.jobs as Job[])
        : Array.isArray(payload)
          ? (payload as Job[])
          : [];
    }
  } catch {
    jobs = [];
  }

  const publicJobs = jobs.filter(
    (job) => job.visibility === 'public' && isJobPubliclyListable(job)
  );
  const allJobs = publicJobs.filter((job) =>
    job.location?.toLowerCase().includes(data.name.toLowerCase())
  );
  const remoteCount = publicJobs.filter((job) => job.work_type === 'remote').length;
  const jobsCountLabel =
    allJobs.length === 1
      ? t('cityJobs.jobCountSingular', { count: allJobs.length })
      : t('cityJobs.jobCountPlural', { count: allJobs.length });

  const categories = [
    'developer',
    'marketing',
    'sales',
    'accounting',
    'customer-service',
    'design',
    'finance',
    'hr',
    'operations',
    'engineering',
    'education',
    'healthcare',
  ] as const;

  return (
    <main className="min-h-screen bg-neutral-950">
      <section className="border-b border-neutral-800 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.15),_transparent_30%),linear-gradient(180deg,_#101826_0%,_#09090b_100%)]">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <div className="flex items-center gap-2 text-sm text-neutral-400 mb-4">
            <Link
              href={addLocalePrefix('/jobs', locale)}
              className="hover:text-white transition-colors"
            >
              {t('cityJobs.allJobs')}
            </Link>
            <span>/</span>
            <span className="text-white">{data.name}</span>
          </div>

          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            {t('cityJobs.heroTitle', { city: data.name })}
          </h1>
          <p className="mt-3 text-lg text-neutral-300 max-w-2xl">
            {data.description[langKey]}
          </p>

          <div className="mt-6 flex flex-wrap gap-4">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-neutral-500">
                {t('cityJobs.localJobs')}
              </p>
              <p className="text-2xl font-semibold text-white mt-1">
                {allJobs.length}
              </p>
            </div>
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-green-300">
                {t('cityJobs.remoteJobsPlus')}
              </p>
              <p className="text-2xl font-semibold text-white mt-1">
                {remoteCount}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-neutral-500">
                {t('cityJobs.region')}
              </p>
              <p className="text-2xl font-semibold text-white mt-1">
                {data.region[langKey]}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-neutral-800 bg-neutral-900/30">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <p className="text-xs uppercase tracking-wider text-neutral-500 mb-4">
            {t('cityJobs.browseByCategory', { city: data.name })}
          </p>
          <div className="flex flex-wrap gap-2">
            {categories.map((slug) => {
              const categoryLabel = translateCategorySlug(slug, t);
              return (
                <Link
                  key={slug}
                  href={addLocalePrefix(`/jobs-in/${cityKey}/${slug}`, locale)}
                  className="rounded-full border border-neutral-800 bg-neutral-900/60 px-4 py-2 text-sm text-neutral-300 hover:border-primary-600/40 hover:text-white transition"
                >
                  {t('cityJobs.categoryPill', {
                    category: categoryLabel,
                    city: data.name,
                  })}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-10">
        {allJobs.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-800">
              <Briefcase className="h-8 w-8 text-neutral-600" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              {t('cityJobs.noJobsTitle', { city: data.name })}
            </h2>
            <p className="text-neutral-400 mb-6 max-w-md mx-auto">
              {t('cityJobs.noJobsDescription', { city: data.name })}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href={addLocalePrefix('/auth/register?role=candidate', locale)}
                className="rounded-lg bg-primary-600 px-5 py-2.5 font-semibold text-white hover:bg-primary-500 transition-colors"
              >
                {t('cityJobs.getAlerts')}
              </Link>
              <Link
                href={addLocalePrefix('/remote-jobs', locale)}
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-5 py-2.5 font-medium text-neutral-300 hover:bg-neutral-800 transition-colors"
              >
                {t('cityJobs.browseRemoteJobs')}
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-400 mb-4">
              {t('cityJobs.jobsCount', {
                count: jobsCountLabel,
                city: data.name,
              })}
            </p>
            {allJobs.map((job) => {
              const label = translateOpportunityLabel(
                getOpportunityTypeLabel(job.job_type, job.internship_track),
                t
              );

              return (
                <Link
                  key={job.id}
                  href={addLocalePrefix(`/jobs/${job.id}`, locale)}
                  className="group block rounded-xl border border-neutral-800 bg-neutral-900 p-5 transition-all hover:border-primary-600/40"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-800">
                      {label === t('common.opportunity.internshipEducation') ? (
                        <GraduationCap className="h-6 w-6 text-emerald-300" />
                      ) : (
                        <Building2 className="h-6 w-6 text-primary-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-white group-hover:text-primary-300 transition-colors">
                        {job.title}
                      </h3>
                      {job.company_name && (
                        <p className="text-sm text-neutral-400">
                          {job.company_name}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                        <span className="font-medium text-neutral-400">
                          {label}
                        </span>
                        {job.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {job.location}
                          </span>
                        )}
                        {job.work_type === 'remote' && (
                          <span className="flex items-center gap-1 text-green-400">
                            <Globe className="h-3 w-3" />
                            {t('common.remote')}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(job.created_at, locale, t)}
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 flex-shrink-0 text-neutral-600 group-hover:text-primary-400 transition-colors" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div className="mt-12 pt-8 border-t border-neutral-800">
          <h2 className="text-lg font-semibold text-white mb-4">
            {t('cityJobs.otherCities')}
          </h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CITIES)
              .filter(([key]) => key !== cityKey)
              .map(([key, cityInfo]) => (
                <Link
                  key={key}
                  href={addLocalePrefix(`/jobs-in/${key}`, locale)}
                  className="rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-300 hover:border-primary-600/40 hover:text-white transition-colors"
                >
                  {cityInfo.name}
                </Link>
              ))}
          </div>
        </div>
      </section>
    </main>
  );
}

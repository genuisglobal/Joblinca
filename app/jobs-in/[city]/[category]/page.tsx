import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Briefcase, Building2, Clock, MapPin } from 'lucide-react';

import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { getRequestLocale } from '@/lib/i18n/server';
import { getServerT } from '@/lib/i18n/server-t';
import { addLocalePrefix, type Locale } from '@/lib/i18n/locale';
import { isJobPubliclyListable } from '@/lib/jobs/lifecycle';
import { getCityBySlug, CITIES, CITY_SLUGS } from '@/lib/seo/cities';
import {
  getCategoryBySlug,
  JOB_CATEGORIES,
  CATEGORY_SLUGS,
  type JobCategory,
} from '@/lib/seo/job-categories';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumb-jsonld';
import { buildJobPostingJsonLd } from '@/lib/seo/job-posting-jsonld';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com';

interface PageProps {
  params: Promise<{ city: string; category: string }>;
}

interface JobRow {
  id: string;
  title: string;
  description: string | null;
  company_name: string | null;
  company_logo_url: string | null;
  location: string | null;
  job_type: string | null;
  work_type: string | null;
  salary: number | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  closes_at: string | null;
  created_at: string;
  lifecycle_status: string | null;
  approval_status: string | null;
  published: boolean | null;
  image_url: string | null;
  apply_method: string | null;
  external_apply_url: string | null;
  language: string | null;
  visibility: string | null;
}

export const revalidate = 1800;

export async function generateStaticParams() {
  return CITY_SLUGS.flatMap((city) =>
    CATEGORY_SLUGS.map((category) => ({ city, category }))
  );
}

function buildKeywordOrClause(category: JobCategory): string {
  return category.keywords
    .map((keyword) => keyword.replace(/,/g, ' ').replace(/[%]/g, ''))
    .map((keyword) => `title.ilike.%${keyword}%`)
    .join(',');
}

async function loadJobs(city: { name: string }, category: JobCategory): Promise<JobRow[]> {
  try {
    const supabase = createServiceSupabaseClient();
    const { data } = await supabase
      .from('jobs')
      .select(
        'id, title, description, company_name, company_logo_url, location, job_type, work_type, salary, salary_min, salary_max, salary_currency, salary_period, closes_at, created_at, lifecycle_status, approval_status, published, image_url, apply_method, external_apply_url, language, visibility'
      )
      .eq('published', true)
      .eq('approval_status', 'approved')
      .or(`location.ilike.%${city.name}%,work_type.eq.remote`)
      .or(buildKeywordOrClause(category))
      .order('created_at', { ascending: false })
      .limit(60);

    return (data || []).filter(
      (job): job is JobRow =>
        job.visibility === 'public' && isJobPubliclyListable(job as JobRow)
    );
  } catch {
    return [];
  }
}

function formatJobType(value: string | null, locale: Locale) {
  if (!value) {
    return locale === 'fr' ? 'offre' : 'job';
  }

  const normalized = value.replace(/_/g, ' ');
  return locale === 'fr' ? normalized.toLowerCase() : normalized;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = getRequestLocale();
  const t = getServerT(locale);
  const { city, category } = await params;
  const cityInfo = getCityBySlug(city);
  const categoryInfo = getCategoryBySlug(category);
  if (!cityInfo || !categoryInfo) {
    return { title: t('cityCategory.pageNotFound'), robots: { index: false, follow: false } };
  }

  const langKey = locale === 'fr' ? 'fr' : 'en';
  const categoryName = categoryInfo.name[langKey];
  const relativePath = addLocalePrefix(
    `/jobs-in/${cityInfo.slug}/${categoryInfo.slug}`,
    locale
  );
  const englishPath = addLocalePrefix(
    `/jobs-in/${cityInfo.slug}/${categoryInfo.slug}`,
    'en'
  );
  const frenchPath = addLocalePrefix(
    `/jobs-in/${cityInfo.slug}/${categoryInfo.slug}`,
    'fr'
  );
  const title = t('cityCategory.metadataTitle', {
    category: categoryName,
    city: cityInfo.name,
  });
  const description = t('cityCategory.metadataDescription', {
    category: categoryName,
    city: cityInfo.name,
    region: cityInfo.region[langKey],
    description: categoryInfo.description[langKey],
  });

  return {
    title,
    description,
    alternates: {
      canonical: `${APP_URL}${relativePath}`,
      languages: {
        'en-CM': `${APP_URL}${englishPath}`,
        'fr-CM': `${APP_URL}${frenchPath}`,
        'x-default': `${APP_URL}${englishPath}`,
      },
    },
    openGraph: {
      type: 'website',
      url: `${APP_URL}${relativePath}`,
      siteName: 'Joblinca',
      title,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function CategoryCityJobsPage({ params }: PageProps) {
  const locale = getRequestLocale();
  const t = getServerT(locale);
  const { city, category } = await params;
  const cityInfo = getCityBySlug(city);
  const categoryInfo = getCategoryBySlug(category);
  if (!cityInfo || !categoryInfo) notFound();

  const langKey = locale === 'fr' ? 'fr' : 'en';
  const categoryName = categoryInfo.name[langKey];
  const pagePath = addLocalePrefix(
    `/jobs-in/${cityInfo.slug}/${categoryInfo.slug}`,
    locale
  );
  const pageUrl = `${APP_URL}${pagePath}`;

  const jobs = await loadJobs(cityInfo, categoryInfo);
  const localCount = jobs.filter((job) =>
    (job.location || '').toLowerCase().includes(cityInfo.name.toLowerCase())
  ).length;
  const remoteCount = jobs.filter((job) => job.work_type === 'remote').length;

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: t('nav.home'), url: `${APP_URL}${addLocalePrefix('/', locale)}` },
    { name: t('nav.jobs'), url: `${APP_URL}${addLocalePrefix('/jobs', locale)}` },
    { name: cityInfo.name, url: `${APP_URL}${addLocalePrefix(`/jobs-in/${cityInfo.slug}`, locale)}` },
    { name: `${categoryName} ${t('cityCategory.jobsSuffix')}`, url: pageUrl },
  ]);

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: t('cityCategory.metadataTitle', { category: categoryName, city: cityInfo.name }),
    numberOfItems: jobs.length,
    itemListElement: jobs.slice(0, 25).map((job, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${APP_URL}${addLocalePrefix(`/jobs/${job.id}`, locale)}`,
      name: job.title,
    })),
  };

  const jobPostingsJsonLd = jobs.slice(0, 10).map((job) =>
    buildJobPostingJsonLd(job, { appUrl: APP_URL })
  );

  const otherCategories = JOB_CATEGORIES.filter((item) => item.slug !== categoryInfo.slug);
  const otherCities = Object.values(CITIES).filter((item) => item.slug !== cityInfo.slug);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      {jobPostingsJsonLd.map((item, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}

      <section className="border-b border-neutral-800 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_30%),linear-gradient(180deg,_#101826_0%,_#09090b_100%)]">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <nav className="flex items-center gap-2 text-sm text-neutral-400 mb-4" aria-label="Breadcrumb">
            <Link
              href={addLocalePrefix('/jobs', locale)}
              className="hover:text-white transition-colors"
            >
              {t('cityCategory.allJobs')}
            </Link>
            <span>/</span>
            <Link
              href={addLocalePrefix(`/jobs-in/${cityInfo.slug}`, locale)}
              className="hover:text-white transition-colors"
            >
              {cityInfo.name}
            </Link>
            <span>/</span>
            <span className="text-white">{categoryName}</span>
          </nav>

          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            {t('cityCategory.metadataTitle', {
              category: categoryName,
              city: cityInfo.name,
            })}
          </h1>
          <p className="mt-3 text-lg text-neutral-300 max-w-2xl">
            {categoryInfo.description[langKey]} {cityInfo.description[langKey]}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-neutral-500">
                {t('cityCategory.local')}
              </p>
              <p className="text-2xl font-semibold text-white mt-1">{localCount}</p>
            </div>
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-green-300">
                {t('cityCategory.remotePlus')}
              </p>
              <p className="text-2xl font-semibold text-white mt-1">{remoteCount}</p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-neutral-500">
                {t('cityCategory.region')}
              </p>
              <p className="text-2xl font-semibold text-white mt-1">
                {cityInfo.region[langKey]}
              </p>
            </div>
          </div>

          {categoryInfo.skills && categoryInfo.skills.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-neutral-500">{t('cityCategory.commonSkills')}</span>
              {categoryInfo.skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full border border-neutral-700/50 bg-neutral-800/50 px-3 py-1 text-neutral-300"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <h2 className="text-xl font-semibold text-white mb-6">
          {t('cityCategory.openPositions', {
            category: categoryName,
            city: cityInfo.name,
          })}
        </h2>

        {jobs.length === 0 ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-10 text-center">
            <Briefcase className="mx-auto h-10 w-10 text-neutral-600 mb-3" />
            <p className="text-neutral-300 mb-3">
              {t('cityCategory.noPositions', {
                category: categoryName,
                city: cityInfo.name,
              })}
            </p>
            <div className="flex flex-wrap justify-center gap-2 text-sm">
              <Link
                href={addLocalePrefix(`/jobs-in/${cityInfo.slug}`, locale)}
                className="rounded-full border border-neutral-700 bg-neutral-800 px-4 py-2 text-neutral-200 hover:bg-neutral-700 transition"
              >
                {t('cityCategory.allJobsInCity', { city: cityInfo.name })}
              </Link>
              <Link
                href={addLocalePrefix('/remote-jobs', locale)}
                className="rounded-full border border-green-500/30 bg-green-500/10 px-4 py-2 text-green-300 hover:bg-green-500/20 transition"
              >
                {t('cityCategory.remoteCategoryJobs', { category: categoryName })}
              </Link>
            </div>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={addLocalePrefix(`/jobs/${job.id}`, locale)}
                  className="group block rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 hover:border-primary-600/50 hover:bg-neutral-800/50 transition-colors"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-800">
                      <Briefcase className="h-5 w-5 text-primary-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-white line-clamp-2 group-hover:text-primary-400">
                        {job.title}
                      </h3>
                      {job.company_name && (
                        <p className="text-sm text-neutral-400 mt-0.5 line-clamp-1">
                          <Building2 className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                          {job.company_name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-neutral-500">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {job.work_type === 'remote'
                        ? t('common.remote')
                        : job.location || cityInfo.name}
                    </span>
                    {job.job_type && (
                      <span className="inline-flex items-center gap-1 capitalize">
                        <Clock className="h-3.5 w-3.5" />
                        {formatJobType(job.job_type, locale)}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-neutral-800 bg-neutral-900/30">
        <div className="mx-auto max-w-5xl px-6 py-12 grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">
              {t('cityCategory.otherCategories', { city: cityInfo.name })}
            </h2>
            <ul className="grid grid-cols-2 gap-2">
              {otherCategories.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={addLocalePrefix(`/jobs-in/${cityInfo.slug}/${item.slug}`, locale)}
                    className="block rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-sm text-neutral-300 hover:border-primary-600/40 hover:text-white transition"
                  >
                    {item.name[langKey]} {t('cityCategory.jobsSuffix')}
                    <ArrowRight className="inline ml-1 h-3 w-3 -mt-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">
              {t('cityCategory.otherCities', { category: categoryName })}
            </h2>
            <ul className="grid grid-cols-2 gap-2">
              {otherCities.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={addLocalePrefix(`/jobs-in/${item.slug}/${categoryInfo.slug}`, locale)}
                    className="block rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-sm text-neutral-300 hover:border-primary-600/40 hover:text-white transition"
                  >
                    {t('cityCategory.inCity', {
                      category: categoryName,
                      city: item.name,
                    })}
                    <ArrowRight className="inline ml-1 h-3 w-3 -mt-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}

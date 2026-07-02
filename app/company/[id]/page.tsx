import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { isJobPubliclyListable } from '@/lib/jobs/lifecycle';
import { getOpportunityTypeLabel } from '@/lib/opportunities';
import { getRequestLocale } from '@/lib/i18n/server';
import { getServerT } from '@/lib/i18n/server-t';
import { addLocalePrefix, type Locale } from '@/lib/i18n/locale';
import {
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle,
  Globe,
  MapPin,
} from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
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

function formatAmount(amount: number, locale: Locale) {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(amount);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = getRequestLocale();
  const t = getServerT(locale);
  const { id } = await params;
  const supabase = createServiceSupabaseClient();
  const { data: recruiter } = await supabase
    .from('recruiters')
    .select('company_name')
    .eq('id', id)
    .maybeSingle();

  if (!recruiter) {
    return { title: t('company.notFound') };
  }

  const title = t('company.metadataTitle', { name: recruiter.company_name });
  const description = t('company.metadataBrowseDescription', {
    name: recruiter.company_name,
  });

  return {
    title,
    description,
    openGraph: { title, description, type: 'profile' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function CompanyPage({ params }: PageProps) {
  noStore();
  const locale = getRequestLocale();
  const t = getServerT(locale);
  const { id } = await params;
  const supabase = createServiceSupabaseClient();

  const { data: recruiter, error } = await supabase
    .from('recruiters')
    .select('id, company_name, company_description, website, verified, created_at')
    .eq('id', id)
    .maybeSingle();

  if (error || !recruiter) {
    notFound();
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('avatar_url, full_name')
    .eq('id', id)
    .maybeSingle();

  const { data: jobs } = await supabase
    .from('jobs')
    .select(
      'id, title, location, work_type, job_type, internship_track, salary, created_at, closes_at, lifecycle_status, visibility, published, approval_status'
    )
    .eq('recruiter_id', id)
    .eq('published', true)
    .eq('approval_status', 'approved')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(50);

  const activeJobs = (jobs || []).filter((job) => isJobPubliclyListable(job));
  const openPositionsLabel =
    activeJobs.length === 1
      ? t('company.openPositionSingular', { count: activeJobs.length })
      : t('company.openPositionPlural', { count: activeJobs.length });
  const memberSince = new Date(recruiter.created_at).toLocaleDateString(
    locale === 'fr' ? 'fr-FR' : 'en-US',
    {
      month: 'long',
      year: 'numeric',
    }
  );

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: recruiter.company_name,
    ...(recruiter.website && { url: recruiter.website }),
    ...(profile?.avatar_url && { logo: profile.avatar_url }),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="min-h-screen bg-neutral-950">
        <section className="border-b border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950">
          <div className="mx-auto max-w-5xl px-6 py-12">
            <div className="flex items-start gap-6">
              {profile?.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={recruiter.company_name}
                  width={80}
                  height={80}
                  unoptimized
                  className="h-20 w-20 rounded-2xl border border-neutral-700 object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-neutral-700 bg-neutral-800">
                  <Building2 className="h-10 w-10 text-neutral-500" />
                </div>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-white sm:text-3xl">
                    {recruiter.company_name}
                  </h1>
                  {recruiter.verified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-300">
                      <CheckCircle className="h-3.5 w-3.5" />
                      {t('company.verified')}
                    </span>
                  )}
                </div>
                {recruiter.company_description && (
                  <p className="mt-2 max-w-2xl text-neutral-400">
                    {recruiter.company_description}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-neutral-500">
                  {recruiter.website && (
                    <a
                      href={recruiter.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 hover:text-blue-400 transition-colors"
                    >
                      <Globe className="h-4 w-4" />
                      {t('company.website')}
                    </a>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4" />
                    {openPositionsLabel}
                  </span>
                  <span>{t('company.memberSince', { date: memberSince })}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-10">
          <h2 className="mb-6 text-xl font-semibold text-white">
            {t('company.openPositions')}
          </h2>

          {activeJobs.length === 0 ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-12 text-center">
              <Briefcase className="mx-auto h-10 w-10 text-neutral-600" />
              <p className="mt-3 text-neutral-400">
                {t('company.noOpenPositionsShort')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeJobs.map((job) => {
                const opportunityLabel = translateOpportunityLabel(
                  getOpportunityTypeLabel(job.job_type, job.internship_track),
                  t
                );

                return (
                  <Link
                    key={job.id}
                    href={addLocalePrefix(`/jobs/${job.id}`, locale)}
                    className="group flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 transition-all hover:border-neutral-600 hover:bg-neutral-800/60"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-medium text-white group-hover:text-blue-400 transition-colors">
                        {job.title}
                      </h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-neutral-400">
                        <span className="rounded-full border border-neutral-700 bg-neutral-800 px-2.5 py-0.5 text-xs">
                          {opportunityLabel}
                        </span>
                        {job.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {job.location}
                          </span>
                        )}
                        {job.work_type === 'remote' && (
                          <span className="flex items-center gap-1 text-emerald-400">
                            <Globe className="h-3.5 w-3.5" />
                            {t('common.remote')}
                          </span>
                        )}
                        {job.salary && (
                          <span>{formatAmount(job.salary, locale)} XAF</span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 flex-shrink-0 text-neutral-600 group-hover:text-blue-400 transition-colors" />
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequestLocale } from '@/lib/i18n/server';
import { getServerT } from '@/lib/i18n/server-t';
import { addLocalePrefix, type Locale } from '@/lib/i18n/locale';
import {
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle,
  Clock,
  Globe,
  MapPin,
} from 'lucide-react';
import { getOpportunityTypeLabel } from '@/lib/opportunities';
import { isJobPubliclyListable } from '@/lib/jobs/lifecycle';
import CompanyReviews from './CompanyReviews';

interface CompanyPageProps {
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
  if (diffDays <= 30) return t('common.weeksAgo', { count: Math.ceil(diffDays / 7) });
  return date.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export async function generateMetadata({ params }: CompanyPageProps) {
  const locale = getRequestLocale();
  const t = getServerT(locale);
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('recruiters')
    .select('company_name')
    .eq('id', id)
    .maybeSingle();

  if (!data?.company_name) {
    return {
      title: t('company.notFound'),
    };
  }

  const name = data.company_name;
  return {
    title: t('company.metadataTitle', { name }),
    description: t('company.metadataDescription', { name }),
  };
}

export default async function CompanyProfilePage({ params }: CompanyPageProps) {
  const locale = getRequestLocale();
  const t = getServerT(locale);
  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const { data: recruiter, error } = await supabase
    .from('recruiters')
    .select(
      'id, company_name, company_description, website, verified, created_at'
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !recruiter) {
    notFound();
  }

  // Load company logo from recruiter_profiles if available
  const { data: recruiterProfile } = await supabase
    .from('recruiter_profiles')
    .select('company_logo_url')
    .eq('user_id', id)
    .maybeSingle();

  const logoUrl = recruiterProfile?.company_logo_url || null;

  // Load active jobs from this recruiter
  const { data: jobs } = await supabase
    .from('jobs')
    .select(
      'id, title, location, job_type, internship_track, eligible_roles, visibility, work_type, created_at, closes_at, lifecycle_status'
    )
    .eq('recruiter_id', id)
    .eq('published', true)
    .eq('approval_status', 'approved')
    .order('created_at', { ascending: false });

  const activeJobs = (jobs || []).filter((job) => isJobPubliclyListable(job));
  const memberSince = new Date(recruiter.created_at).toLocaleDateString(
    locale === 'fr' ? 'fr-FR' : 'en-US',
    { month: 'long', year: 'numeric' }
  );
  const activeJobsLabel =
    activeJobs.length === 1
      ? t('company.activeJobSingular', { count: activeJobs.length })
      : t('company.activeJobPlural', { count: activeJobs.length });

  return (
    <main className="min-h-screen bg-neutral-950">
      {/* Company Header */}
      <section className="border-b border-neutral-800 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_30%),linear-gradient(180deg,_#101826_0%,_#09090b_100%)]">
        <div className="mx-auto max-w-4xl px-6 py-12">
          <div className="flex items-start gap-6">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={recruiter.company_name}
                className="h-20 w-20 rounded-2xl border border-neutral-700 bg-neutral-800 object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-neutral-700 bg-neutral-800">
                <Building2 className="h-10 w-10 text-neutral-500" />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-white">
                  {recruiter.company_name}
                </h1>
                {recruiter.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-400">
                    <CheckCircle className="h-3.5 w-3.5" />
                    {t('company.verified')}
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-neutral-400">
                <span>{t('company.memberSince', { date: memberSince })}</span>
                <span>{activeJobsLabel}</span>
                {recruiter.website && (
                  <a
                    href={recruiter.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300 transition-colors"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    {t('company.website')}
                  </a>
                )}
              </div>

              {recruiter.company_description && (
                <p className="mt-4 text-neutral-300 leading-relaxed">
                  {recruiter.company_description}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Active Jobs */}
      <section className="mx-auto max-w-4xl px-6 py-10">
        <h2 className="mb-6 text-xl font-semibold text-white">
          {t('company.openPositionsWithCount', { count: activeJobs.length })}
        </h2>

        {activeJobs.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-800">
              <Briefcase className="h-8 w-8 text-neutral-600" />
            </div>
            <p className="text-neutral-400">
              {t('company.noOpenPositions')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeJobs.map((job) => {
              const label = translateOpportunityLabel(
                getOpportunityTypeLabel(job.job_type, job.internship_track),
                t
              );

              return (
                <Link
                  key={job.id}
                  href={addLocalePrefix(`/jobs/${job.id}`, locale)}
                  className="group flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900 p-5 transition-all hover:border-primary-600/40"
                >
                  <div className="min-w-0">
                    <h3 className="font-semibold text-white group-hover:text-primary-300 transition-colors">
                      {job.title}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-neutral-500">
                      <span className="text-xs font-medium text-neutral-400">
                        {label}
                      </span>
                      {job.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {job.location}
                        </span>
                      )}
                      {job.work_type === 'remote' && (
                        <span className="flex items-center gap-1 text-green-400">
                          <Globe className="h-3.5 w-3.5" />
                          {t('common.remote')}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDate(job.created_at, locale, t)}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 flex-shrink-0 text-neutral-600 group-hover:text-primary-400 transition-colors" />
                </Link>
              );
            })}
          </div>
        )}

        {/* Reviews Section */}
        <div className="mt-12">
          <h2 className="mb-6 text-xl font-semibold text-white">{t('company.reviews')}</h2>
          <CompanyReviews companyId={recruiter.id} />
        </div>

        {/* Back link */}
        <div className="mt-10 text-center">
          <Link
            href={addLocalePrefix('/jobs', locale)}
            className="text-sm text-neutral-400 hover:text-white transition-colors"
          >
            {t('company.browseAllJobs')}
          </Link>
        </div>
      </section>
    </main>
  );
}

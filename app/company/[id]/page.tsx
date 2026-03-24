import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { isJobPubliclyListable } from '@/lib/jobs/lifecycle';
import { getOpportunityTypeLabel } from '@/lib/opportunities';
import {
  ArrowRight,
  Briefcase,
  Building2,
  Globe,
  MapPin,
  CheckCircle,
} from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServiceSupabaseClient();
  const { data: recruiter } = await supabase
    .from('recruiters')
    .select('company_name')
    .eq('id', id)
    .maybeSingle();

  if (!recruiter) return { title: 'Company Not Found' };

  const title = `${recruiter.company_name} — Jobs on Joblinca`;
  const description = `Browse open positions at ${recruiter.company_name} on Joblinca.`;

  return {
    title,
    description,
    openGraph: { title, description, type: 'profile' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function CompanyPage({ params }: PageProps) {
  noStore();
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

  // Also fetch profile for avatar
  const { data: profile } = await supabase
    .from('profiles')
    .select('avatar_url, full_name')
    .eq('id', id)
    .maybeSingle();

  // Fetch active jobs
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title, location, work_type, job_type, internship_track, salary, created_at, closes_at, lifecycle_status, visibility, published, approval_status')
    .eq('recruiter_id', id)
    .eq('published', true)
    .eq('approval_status', 'approved')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(50);

  const activeJobs = (jobs || []).filter((job) => isJobPubliclyListable(job));

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
        {/* Company Header */}
        <section className="border-b border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950">
          <div className="mx-auto max-w-5xl px-6 py-12">
            <div className="flex items-start gap-6">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={recruiter.company_name}
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
                    <CheckCircle className="h-5 w-5 text-blue-400" />
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
                      Website
                    </a>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4" />
                    {activeJobs.length} open position{activeJobs.length !== 1 ? 's' : ''}
                  </span>
                  <span>
                    Member since{' '}
                    {new Date(recruiter.created_at).toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Job Listings */}
        <section className="mx-auto max-w-5xl px-6 py-10">
          <h2 className="mb-6 text-xl font-semibold text-white">
            Open Positions
          </h2>

          {activeJobs.length === 0 ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-12 text-center">
              <Briefcase className="mx-auto h-10 w-10 text-neutral-600" />
              <p className="mt-3 text-neutral-400">
                No open positions at the moment.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeJobs.map((job) => {
                const opportunityLabel = getOpportunityTypeLabel(
                  job.job_type,
                  job.internship_track
                );
                return (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
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
                            Remote
                          </span>
                        )}
                        {job.salary && (
                          <span>
                            {new Intl.NumberFormat('en-US', {
                              maximumFractionDigits: 0,
                            }).format(job.salary)}{' '}
                            XAF
                          </span>
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

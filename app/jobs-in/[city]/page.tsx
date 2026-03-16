import type { Metadata } from 'next';
import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  ArrowRight,
  Briefcase,
  Building2,
  Clock,
  Globe,
  GraduationCap,
  MapPin,
} from 'lucide-react';
import {
  getOpportunityTypeLabel,
  describeEligibleRoles,
} from '@/lib/opportunities';
import { isJobPubliclyListable } from '@/lib/jobs/lifecycle';

const CITY_DATA: Record<
  string,
  { name: string; region: string; description: string }
> = {
  douala: {
    name: 'Douala',
    region: 'Littoral',
    description:
      'Cameroon\'s economic capital and largest city. Hub for finance, logistics, industry, and tech startups.',
  },
  yaounde: {
    name: 'Yaoundé',
    region: 'Centre',
    description:
      'The political capital of Cameroon. Home to government institutions, universities, and a growing tech scene.',
  },
  bafoussam: {
    name: 'Bafoussam',
    region: 'West',
    description:
      'Capital of the West Region. A commercial hub known for agriculture, trade, and entrepreneurship.',
  },
  limbe: {
    name: 'Limbé',
    region: 'South-West',
    description:
      'Coastal city with a strong oil & gas sector, tourism, and marine industries.',
  },
  buea: {
    name: 'Buea',
    region: 'South-West',
    description:
      'Known as "Silicon Mountain" — Cameroon\'s tech startup capital at the foot of Mount Cameroon.',
  },
  kribi: {
    name: 'Kribi',
    region: 'South',
    description:
      'Emerging port city with opportunities in logistics, construction, and hospitality.',
  },
  bamenda: {
    name: 'Bamenda',
    region: 'North-West',
    description:
      'Capital of the North-West Region. Education hub with universities and growing service sector.',
  },
  garoua: {
    name: 'Garoua',
    region: 'North',
    description:
      'Third-largest city in Cameroon. Key center for agriculture, cotton, and cross-border trade.',
  },
  maroua: {
    name: 'Maroua',
    region: 'Far North',
    description:
      'Capital of the Far North. Important for NGO operations, agriculture, and public administration.',
  },
  bertoua: {
    name: 'Bertoua',
    region: 'East',
    description:
      'Gateway to the East Region. Growing opportunities in forestry, mining, and development projects.',
  },
};

interface CityPageProps {
  params: Promise<{ city: string }>;
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.ceil(
    Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 1) return 'Today';
  if (diffDays === 2) return 'Yesterday';
  if (diffDays <= 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export async function generateStaticParams() {
  return Object.keys(CITY_DATA).map((city) => ({ city }));
}

export async function generateMetadata({
  params,
}: CityPageProps): Promise<Metadata> {
  const { city } = await params;
  const data = CITY_DATA[city.toLowerCase()];
  if (!data) return { title: 'City Not Found' };

  return {
    title: `Jobs in ${data.name}, Cameroon`,
    description: `Find jobs, internships, and gigs in ${data.name}, ${data.region} Region. ${data.description}`,
    openGraph: {
      title: `Jobs in ${data.name} — Joblinca`,
      description: `Browse open positions in ${data.name}, Cameroon.`,
    },
  };
}

export default async function CityJobsPage({ params }: CityPageProps) {
  noStore();

  const { city } = await params;
  const cityKey = city.toLowerCase();
  const data = CITY_DATA[cityKey];

  if (!data) notFound();

  const supabase = createServiceSupabaseClient();

  const { data: jobs } = await supabase
    .from('jobs')
    .select(
      'id, title, company_name, description, location, job_type, internship_track, eligible_roles, visibility, work_type, created_at, closes_at, lifecycle_status'
    )
    .eq('published', true)
    .eq('approval_status', 'approved')
    .eq('visibility', 'public')
    .in('lifecycle_status', ['live', 'closed_reviewing'])
    .ilike('location', `%${data.name}%`)
    .order('created_at', { ascending: false });

  const allJobs = (jobs || []).filter((job) => isJobPubliclyListable(job));

  // Also count remote jobs accessible from this city
  const { count: remoteCount } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('published', true)
    .eq('approval_status', 'approved')
    .eq('visibility', 'public')
    .eq('lifecycle_status', 'live')
    .eq('work_type', 'remote');

  return (
    <main className="min-h-screen bg-neutral-950">
      {/* Hero */}
      <section className="border-b border-neutral-800 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.15),_transparent_30%),linear-gradient(180deg,_#101826_0%,_#09090b_100%)]">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <div className="flex items-center gap-2 text-sm text-neutral-400 mb-4">
            <Link href="/jobs" className="hover:text-white transition-colors">
              All Jobs
            </Link>
            <span>/</span>
            <span className="text-white">{data.name}</span>
          </div>

          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            Jobs in {data.name}, Cameroon
          </h1>
          <p className="mt-3 text-lg text-neutral-300 max-w-2xl">
            {data.description}
          </p>

          <div className="mt-6 flex flex-wrap gap-4">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-neutral-500">
                Local Jobs
              </p>
              <p className="text-2xl font-semibold text-white mt-1">
                {allJobs.length}
              </p>
            </div>
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-green-300">
                + Remote Jobs
              </p>
              <p className="text-2xl font-semibold text-white mt-1">
                {remoteCount ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-neutral-500">
                Region
              </p>
              <p className="text-2xl font-semibold text-white mt-1">
                {data.region}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Job listings */}
      <section className="mx-auto max-w-5xl px-6 py-10">
        {allJobs.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-800">
              <Briefcase className="h-8 w-8 text-neutral-600" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              No jobs in {data.name} right now
            </h2>
            <p className="text-neutral-400 mb-6 max-w-md mx-auto">
              New jobs are posted daily. Create your profile to get notified
              when matching roles appear in {data.name}.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/auth/register?role=candidate"
                className="rounded-lg bg-primary-600 px-5 py-2.5 font-semibold text-white hover:bg-primary-500 transition-colors"
              >
                Get Job Alerts
              </Link>
              <Link
                href="/remote-jobs"
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-5 py-2.5 font-medium text-neutral-300 hover:bg-neutral-800 transition-colors"
              >
                Browse Remote Jobs
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-400 mb-4">
              {allJobs.length} {allJobs.length === 1 ? 'job' : 'jobs'} in{' '}
              {data.name}
            </p>
            {allJobs.map((job) => {
              const label = getOpportunityTypeLabel(
                job.job_type,
                job.internship_track
              );
              const roles = describeEligibleRoles(
                job.eligible_roles,
                job.job_type,
                job.internship_track,
                job.visibility
              );

              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="group block rounded-xl border border-neutral-800 bg-neutral-900 p-5 transition-all hover:border-primary-600/40"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-800">
                      {label === 'Educational Internship' ? (
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
                            Remote
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(job.created_at)}
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

        {/* Other cities */}
        <div className="mt-12 pt-8 border-t border-neutral-800">
          <h2 className="text-lg font-semibold text-white mb-4">
            Jobs in other cities
          </h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CITY_DATA)
              .filter(([key]) => key !== cityKey)
              .map(([key, c]) => (
                <Link
                  key={key}
                  href={`/jobs-in/${key}`}
                  className="rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-300 hover:border-primary-600/40 hover:text-white transition-colors"
                >
                  {c.name}
                </Link>
              ))}
          </div>
        </div>
      </section>
    </main>
  );
}

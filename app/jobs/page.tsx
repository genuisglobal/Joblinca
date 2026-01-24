import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Briefcase, MapPin, Clock, Building2, Search, Filter, Globe, ArrowRight } from 'lucide-react';

interface Job {
  id: string;
  title: string;
  company: string | null;
  description: string;
  location: string | null;
  job_type: string | null;
  salary: number | null;
  created_at: string;
  is_remote: boolean | null;
}

export const metadata = {
  title: 'Find Jobs - Joblinca',
  description: 'Browse job opportunities in Cameroon and remote positions worldwide. Find your next career opportunity today.',
};

export default async function JobsPage() {
  const supabase = createServerSupabaseClient();
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('published', true)
    .order('created_at', { ascending: false });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays} days ago`;
    if (diffDays <= 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <main className="min-h-screen bg-neutral-950">
      {/* Page Header */}
      <section className="bg-neutral-900 border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold mb-2">Find Jobs</h1>
              <p className="text-neutral-400">
                {jobs ? `${jobs.length} opportunities available` : 'Discover your next career move'}
              </p>
            </div>

            {/* Search Bar */}
            <div className="flex gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                <input
                  type="text"
                  placeholder="Search jobs..."
                  className="w-full md:w-80 pl-10 pr-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100 placeholder-neutral-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
                />
              </div>
              <button
                type="button"
                className="flex items-center gap-2 px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-300 hover:bg-neutral-700 transition-colors"
              >
                <Filter className="w-5 h-5" />
                <span className="hidden sm:inline">Filters</span>
              </button>
            </div>
          </div>

          {/* Filter Tags */}
          <div className="flex flex-wrap gap-2 mt-6">
            <button className="px-4 py-2 bg-primary-600/10 border border-primary-600/30 text-primary-400 rounded-full text-sm font-medium hover:bg-primary-600/20 transition-colors">
              All Jobs
            </button>
            <button className="px-4 py-2 bg-neutral-800 border border-neutral-700 text-neutral-400 rounded-full text-sm font-medium hover:bg-neutral-700 hover:text-white transition-colors">
              Remote
            </button>
            <button className="px-4 py-2 bg-neutral-800 border border-neutral-700 text-neutral-400 rounded-full text-sm font-medium hover:bg-neutral-700 hover:text-white transition-colors">
              Cameroon
            </button>
            <button className="px-4 py-2 bg-neutral-800 border border-neutral-700 text-neutral-400 rounded-full text-sm font-medium hover:bg-neutral-700 hover:text-white transition-colors">
              Full-Time
            </button>
            <button className="px-4 py-2 bg-neutral-800 border border-neutral-700 text-neutral-400 rounded-full text-sm font-medium hover:bg-neutral-700 hover:text-white transition-colors">
              Tech
            </button>
          </div>
        </div>
      </section>

      {/* Job Listings */}
      <section className="max-w-6xl mx-auto px-6 py-10">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error.message}</p>
          </div>
        )}

        {!jobs || jobs.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-2xl bg-neutral-800 flex items-center justify-center mx-auto mb-6">
              <Briefcase className="w-10 h-10 text-neutral-600" />
            </div>
            <h2 className="text-2xl font-bold mb-3">No jobs available yet</h2>
            <p className="text-neutral-400 mb-8 max-w-md mx-auto">
              We're working with employers to bring you great opportunities.
              Sign up to get notified when new jobs are posted.
            </p>
            <Link
              href="/auth/register?role=candidate"
              className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-semibold transition-all"
            >
              Get Job Alerts
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job: Job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="group block bg-neutral-900 border border-neutral-800 rounded-xl p-6 hover:border-primary-600/50 hover:bg-neutral-800/50 transition-all"
              >
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  {/* Company Icon */}
                  <div className="w-14 h-14 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-7 h-7 text-primary-400" />
                  </div>

                  {/* Job Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <h2 className="text-xl font-semibold group-hover:text-primary-400 transition-colors">
                        {job.title}
                      </h2>
                      {job.is_remote && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-500/10 text-green-400 rounded-full text-xs font-medium">
                          <Globe className="w-3 h-3" />
                          Remote
                        </span>
                      )}
                    </div>

                    {job.company && (
                      <p className="text-neutral-300 font-medium mb-2">{job.company}</p>
                    )}

                    <p className="text-neutral-400 text-sm line-clamp-2 mb-4">
                      {job.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-500">
                      {job.location && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-4 h-4" />
                          <span>{job.location}</span>
                        </div>
                      )}
                      {job.job_type && (
                        <div className="flex items-center gap-1.5">
                          <Briefcase className="w-4 h-4" />
                          <span>{job.job_type}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        <span>{formatDate(job.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Apply Button */}
                  <div className="flex-shrink-0 md:text-right">
                    <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-all group-hover:shadow-lg group-hover:shadow-primary-600/20">
                      Apply Now
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination placeholder */}
        {jobs && jobs.length > 0 && (
          <div className="flex justify-center mt-10">
            <div className="flex items-center gap-2">
              <button className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors disabled:opacity-50" disabled>
                Previous
              </button>
              <span className="px-4 py-2 text-neutral-400">Page 1</span>
              <button className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors disabled:opacity-50" disabled>
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {/* CTA Section */}
      <section className="bg-neutral-900 border-t border-neutral-800">
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Not finding what you're looking for?
          </h2>
          <p className="text-neutral-400 mb-8 max-w-lg mx-auto">
            Create your profile and let employers find you. Get matched with opportunities that fit your skills.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth/register?role=candidate"
              className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-semibold transition-all"
            >
              Create Your Profile
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/cv-builder"
              className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 font-medium"
            >
              Build Your CV First
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

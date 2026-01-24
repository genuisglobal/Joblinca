import Link from 'next/link';
import { fetchRemoteJobs } from '@/lib/remoteJobs';
import { Globe, MapPin, Briefcase, Clock, ExternalLink, DollarSign, Tag, ArrowRight } from 'lucide-react';

interface RemoteJobSummary {
  id: number;
  title: string;
  company_name: string;
  category: string;
  tags: string[];
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  url: string;
  source: string;
}

export const metadata = {
  title: 'Remote Jobs - Work From Anywhere | Joblinca',
  description: 'Browse verified global remote job opportunities. Work from Cameroon or anywhere in the world with international employers.',
};

async function getRemoteJobs(): Promise<RemoteJobSummary[]> {
  try {
    const data = await fetchRemoteJobs();
    return data.jobs.map((job) => ({
      id: job.id,
      title: job.title,
      company_name: job.company_name,
      category: job.category,
      tags: job.tags || [],
      job_type: job.job_type,
      publication_date: job.publication_date,
      candidate_required_location: job.candidate_required_location,
      salary: job.salary,
      url: job.url,
      source: 'Remotive',
    }));
  } catch {
    return [];
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return 'Today';
  if (diffDays === 2) return 'Yesterday';
  if (diffDays <= 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default async function RemoteJobsPage() {
  const jobs = await getRemoteJobs();

  return (
    <main className="min-h-screen bg-neutral-950">
      {/* Page Header */}
      <section className="bg-gradient-to-b from-primary-600/10 to-neutral-950 border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary-600/20 flex items-center justify-center">
              <Globe className="w-6 h-6 text-primary-400" />
            </div>
            <span className="px-3 py-1 bg-green-500/10 text-green-400 rounded-full text-sm font-medium">
              Work from anywhere
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold mb-4">
            Remote Jobs Worldwide
          </h1>
          <p className="text-neutral-400 max-w-2xl text-lg mb-6">
            Browse verified global remote job opportunities from international employers.
            Work from Cameroon or anywhere in the world.
          </p>

          <div className="flex items-center gap-4 text-sm text-neutral-500">
            <span className="flex items-center gap-2">
              <Briefcase className="w-4 h-4" />
              {jobs.length} opportunities
            </span>
            <span className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Curated from Remotive
            </span>
          </div>
        </div>
      </section>

      {/* Job Listings */}
      <section className="max-w-6xl mx-auto px-6 py-10">
        {jobs.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-2xl bg-neutral-800 flex items-center justify-center mx-auto mb-6">
              <Globe className="w-10 h-10 text-neutral-600" />
            </div>
            <h2 className="text-2xl font-bold mb-3">No remote jobs available</h2>
            <p className="text-neutral-400 mb-8 max-w-md mx-auto">
              We're fetching remote opportunities. Please check back later or browse local jobs.
            </p>
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-semibold transition-all"
            >
              Browse Local Jobs
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="group bg-neutral-900 border border-neutral-800 rounded-xl p-6 hover:border-primary-600/50 hover:bg-neutral-800/50 transition-all"
              >
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  {/* Company Icon */}
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-600/20 to-accent-500/20 border border-primary-600/30 flex items-center justify-center flex-shrink-0">
                    <Globe className="w-7 h-7 text-primary-400" />
                  </div>

                  {/* Job Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <h2 className="text-xl font-semibold text-white">
                        {job.title}
                      </h2>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-500/10 text-green-400 rounded-full text-xs font-medium">
                        <Globe className="w-3 h-3" />
                        Remote
                      </span>
                    </div>

                    <p className="text-neutral-300 font-medium mb-3">
                      {job.company_name}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-500 mb-4">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4" />
                        <span>{job.candidate_required_location || 'Worldwide'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-4 h-4" />
                        <span>{job.category}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Briefcase className="w-4 h-4" />
                        <span>{job.job_type}</span>
                      </div>
                      {job.salary && (
                        <div className="flex items-center gap-1.5">
                          <DollarSign className="w-4 h-4" />
                          <span>{job.salary}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        <span>{formatDate(job.publication_date)}</span>
                      </div>
                    </div>

                    {/* Tags */}
                    {job.tags && job.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {job.tags.slice(0, 5).map((tag, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-neutral-800 text-neutral-400 rounded text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Apply Button */}
                  <div className="flex-shrink-0">
                    <Link
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-all group-hover:shadow-lg group-hover:shadow-primary-600/20"
                    >
                      Apply on {job.source}
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Attribution Notice */}
        {jobs.length > 0 && (
          <div className="mt-10 p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg text-center">
            <p className="text-sm text-neutral-500">
              Remote job listings are curated from{' '}
              <a
                href="https://remotive.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-400 hover:text-primary-300 transition-colors"
              >
                Remotive
              </a>
              . When applying, you will be redirected to the external job listing.
            </p>
          </div>
        )}
      </section>

      {/* CTA Section */}
      <section className="bg-neutral-900 border-t border-neutral-800">
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Looking for local opportunities?
          </h2>
          <p className="text-neutral-400 mb-8 max-w-lg mx-auto">
            Browse jobs from Cameroonian employers or create your profile to get matched with opportunities.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-semibold transition-all"
            >
              Browse Local Jobs
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/auth/register?role=candidate"
              className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 font-medium"
            >
              Create Your Profile
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

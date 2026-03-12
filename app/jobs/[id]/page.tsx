import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import ApplyOptions from './ApplyOptions';
import {
  describeEligibleRoles,
  getOpportunityTypeLabel,
} from '@/lib/opportunities';
import {
  isJobAcceptingApplications,
  isJobPubliclyVisible,
} from '@/lib/jobs/lifecycle';

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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatSalary(job: Record<string, any>) {
  if (!job.salary_min && !job.salary_max) return null;
  const currency = job.salary_currency || 'XAF';
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });

  if (job.salary_min && job.salary_max) {
    return `${formatter.format(job.salary_min)} - ${formatter.format(job.salary_max)}`;
  }
  if (job.salary_min) return `From ${formatter.format(job.salary_min)}`;
  if (job.salary_max) return `Up to ${formatter.format(job.salary_max)}`;
  return null;
}

function renderList(values: string[] | null | undefined) {
  if (!values || values.length === 0) {
    return 'No specific restriction';
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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const { data: job } = await supabase
    .from('jobs')
    .select('title, company_name, location, job_type, work_type')
    .eq('id', id)
    .maybeSingle();

  if (!job) return { title: 'Job Not Found' };

  const locationText = job.work_type === 'remote' ? 'Remote' : job.location || 'Cameroon';
  const title = `${job.title}${job.company_name ? ` at ${job.company_name}` : ''} — ${locationText}`;
  const description = `Apply for ${job.title}${job.company_name ? ` at ${job.company_name}` : ''} in ${locationText}. Find jobs on Joblinca.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
    },
  };
}

export default async function JobDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
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
  const eligibleRoleSummary = describeEligibleRoles(
    job.eligible_roles,
    job.job_type,
    job.internship_track,
    job.visibility
  );

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

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link
          href="/jobs"
          className="mb-6 inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to jobs
        </Link>

        {query.error === 'not_accepting' && (
          <div className="mb-6 rounded-lg border border-yellow-700 bg-yellow-900/50 p-4 text-yellow-400">
            This job is no longer accepting applications.
          </div>
        )}

        {query.already_applied === 'true' && (
          <div className="mb-6 rounded-lg border border-blue-700 bg-blue-900/50 p-4 text-blue-400">
            You have already applied for this position. Check your applications dashboard for status updates.
          </div>
        )}

        {!isPubliclyVisible && (
          <div className="mb-6 rounded-lg border border-yellow-700 bg-yellow-900/50 p-4 text-yellow-400">
            This job is not publicly visible. It may be pending approval or unpublished.
          </div>
        )}

        {isClosed && (
          <div className="mb-6 rounded-lg border border-red-700 bg-red-900/50 p-4 text-red-400">
            This job posting has closed and is no longer accepting applications.
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-6 rounded-lg border border-gray-700 bg-gray-800 p-6">
              {job.image_url && (
                <img
                  src={job.image_url}
                  alt={`${job.title} at ${job.company_name}`}
                  className="mb-6 h-48 w-full rounded-lg object-cover"
                />
              )}

              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${opportunityBadgeClasses(opportunityLabel)}`}>
                  {opportunityLabel}
                </span>
                {job.work_type === 'remote' && (
                  <span className="inline-flex rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-300">
                    Remote-friendly
                  </span>
                )}
                {job.visibility === 'talent_only' && (
                  <span className="inline-flex rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-1 text-xs font-medium text-fuchsia-300">
                    Talent only
                  </span>
                )}
              </div>

              <h1 className="mb-2 text-2xl font-bold text-white">{job.title}</h1>
              {job.recruiter_id ? (
                <Link href={`/companies/${job.recruiter_id}`} className="mb-4 block text-lg text-gray-300 hover:text-primary-300 transition-colors">
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
                    {job.work_type.charAt(0).toUpperCase() + job.work_type.slice(1)}
                  </div>
                )}

                {formatSalary(job) && (
                  <div className="flex items-center gap-1.5">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {formatSalary(job)}
                  </div>
                )}
              </div>

              {job.created_at && (
                <p className="mt-4 text-sm text-gray-500">
                  Posted {formatDate(job.created_at)}
                  {job.closes_at && isAcceptingApplications && (
                    <span className="ml-2">| Closes {formatDate(job.closes_at)}</span>
                  )}
                </p>
              )}
            </div>

            <div className="mb-6 rounded-lg border border-gray-700 bg-gray-800 p-6">
              <h2 className="mb-4 text-lg font-semibold text-white">Description</h2>
              <div className="prose prose-invert max-w-none text-gray-300">
                {job.description ? (
                  <div className="whitespace-pre-wrap">{job.description}</div>
                ) : (
                  <p className="italic text-gray-500">No description provided</p>
                )}
              </div>
            </div>

            {job.requirements && (
              <div className="mb-6 rounded-lg border border-gray-700 bg-gray-800 p-6">
                <h2 className="mb-4 text-lg font-semibold text-white">Requirements</h2>
                <div className="prose prose-invert max-w-none text-gray-300">
                  <div className="whitespace-pre-wrap">{job.requirements}</div>
                </div>
              </div>
            )}

            {job.job_type === 'internship' && internshipRequirements && (
              <div className="mb-6 rounded-lg border border-gray-700 bg-gray-800 p-6">
                <h2 className="mb-4 text-lg font-semibold text-white">Internship Details</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm text-gray-400">Track</p>
                    <p className="text-white">{opportunityLabel}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Eligible profiles</p>
                    <p className="text-white">{eligibleRoleSummary}</p>
                  </div>

                  {job.internship_track === 'education' ? (
                    <>
                      <div>
                        <p className="text-sm text-gray-400">Target schools</p>
                        <p className="text-white">{renderList(internshipRequirements.allowed_schools)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Fields of study</p>
                        <p className="text-white">{renderList(internshipRequirements.allowed_fields_of_study)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">School years</p>
                        <p className="text-white">{renderList(internshipRequirements.allowed_school_years)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Academic calendar</p>
                        <p className="text-white">{internshipRequirements.academic_calendar || 'Not specified'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">School required</p>
                        <p className="text-white">{internshipRequirements.school_required ? 'Yes' : 'No'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Credit-bearing</p>
                        <p className="text-white">{internshipRequirements.credit_bearing ? 'Yes' : 'No'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">School convention required</p>
                        <p className="text-white">{internshipRequirements.requires_school_convention ? 'Yes' : 'No'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Academic supervisor required</p>
                        <p className="text-white">{internshipRequirements.academic_supervisor_required ? 'Yes' : 'No'}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-sm text-gray-400">Fields of study</p>
                        <p className="text-white">{renderList(internshipRequirements.allowed_fields_of_study)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Weekly availability</p>
                        <p className="text-white">{internshipRequirements.expected_weekly_availability || 'Not specified'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Portfolio required</p>
                        <p className="text-white">{internshipRequirements.portfolio_required ? 'Yes' : 'No'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Conversion possible</p>
                        <p className="text-white">{internshipRequirements.conversion_possible ? 'Yes' : 'No'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Minimum projects</p>
                        <p className="text-white">{internshipRequirements.minimum_project_count ?? 'Not specified'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Minimum badges</p>
                        <p className="text-white">{internshipRequirements.minimum_badge_count ?? 'Not specified'}</p>
                      </div>
                    </>
                  )}

                  <div>
                    <p className="text-sm text-gray-400">Graduation window</p>
                    <p className="text-white">
                      {internshipRequirements.graduation_year_min || internshipRequirements.graduation_year_max
                        ? `${internshipRequirements.graduation_year_min || 'Any'} - ${internshipRequirements.graduation_year_max || 'Any'}`
                        : 'Not specified'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Stipend / compensation</p>
                    <p className="text-white">{internshipRequirements.stipend_type || 'Not specified'}</p>
                  </div>
                </div>
              </div>
            )}

            {job.benefits && (
              <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
                <h2 className="mb-4 text-lg font-semibold text-white">Benefits</h2>
                <div className="prose prose-invert max-w-none text-gray-300">
                  <div className="whitespace-pre-wrap">{job.benefits}</div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-6 space-y-6">
              <div className="rounded-lg border border-gray-700 bg-gray-800 p-5">
                <h2 className="mb-4 text-base font-semibold text-white">Opportunity Summary</h2>
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="text-gray-400">Type</p>
                    <p className="text-white">{opportunityLabel}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Eligible profiles</p>
                    <p className="text-white">{eligibleRoleSummary}</p>
                  </div>
                  {job.job_type === 'internship' && (
                    <div>
                      <p className="text-gray-400">Track intent</p>
                      <p className="text-white">
                        {job.internship_track === 'education'
                          ? 'Academic placement and school-aligned experience'
                          : job.internship_track === 'professional'
                            ? 'Work-ready internship with professional delivery expectations'
                            : 'Internship requirements still being finalized'}
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
  );
}

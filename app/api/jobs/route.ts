import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { NextResponse, type NextRequest } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscriptions';
import { dispatchJobMatchNotifications } from '@/lib/matching-agent/dispatch';
import { validateOpportunityConfiguration } from '@/lib/opportunities';
import { persistJobOpportunityMetadata } from '@/lib/opportunities-server';
import { ACTIVE_ADMIN_TYPES } from '@/lib/admin';
import { checkJobForScam } from '@/lib/scam-detection';
import { isJobPubliclyListable, resolveJobLifecycleStatus } from '@/lib/jobs/lifecycle';
import { evaluateFastApproval } from '@/lib/jobs/posting-gate';
import { sendAdminWhatsAppAlert } from '@/lib/admin-alerts';
import {
  LOCALE_COOKIE_NAME,
  detectContentLanguage,
  normalizeLocale,
  resolveLocalePreference,
} from '@/lib/i18n/locale';

type JobBrowseFilter =
  | 'all'
  | 'job'
  | 'internship_education'
  | 'internship_professional'
  | 'gig';

type JobPostedWithinFilter = '24h' | '3d' | '1w' | '1m' | 'anytime';

interface PublicJobSearchRow {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  salary: number | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  company_name: string | null;
  company_logo_url: string | null;
  work_type: string | null;
  job_type: string | null;
  language: string | null;
  created_at: string;
  closes_at: string | null;
  lifecycle_status: string | null;
  visibility: string | null;
  published: boolean;
  approval_status: string | null;
  apply_method: string | null;
  external_apply_url: string | null;
  image_url: string | null;
  internship_track: string | null;
  boost_until: string | null;
  origin_type: string | null;
  source_attribution_json: Record<string, unknown> | null;
  relevance_score?: number | null;
}

interface PublicJobCountsRow {
  total_count: number | string | null;
  all_count: number | string | null;
  job_count: number | string | null;
  internship_education_count: number | string | null;
  internship_professional_count: number | string | null;
  gig_count: number | string | null;
}

interface JobsApiCounts {
  all: number;
  job: number;
  internship_education: number;
  internship_professional: number;
  gig: number;
}

interface PublicJobsResponsePayload {
  jobs: PublicJobSearchRow[];
  total: number;
  counts: JobsApiCounts;
}

interface PublicJobFilterOptions {
  languageFilter: 'en' | 'fr' | null;
  postedAfterTimestamp: number | null;
  minimumSalary: number | null;
  maximumSalary: number | null;
}

function normalizeOptionalId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveJobLanguage(input: unknown, title: unknown, description: unknown) {
  return (
    normalizeLocale(input) ||
    detectContentLanguage(
      [title, description].filter((value): value is string => typeof value === 'string').join(' ')
    )
  );
}

function isMissingJobLanguageColumnError(error: { message?: string | null } | null) {
  return Boolean(error?.message?.includes('column jobs.language does not exist'));
}

function normalizeBrowseType(value: string | null): JobBrowseFilter {
  switch (value) {
    case 'job':
    case 'internship_education':
    case 'internship_professional':
    case 'gig':
      return value;
    default:
      return 'all';
  }
}

function normalizeWorkTypeFilter(value: string | null): 'onsite' | 'remote' | 'hybrid' | null {
  const normalized = value?.trim().toLowerCase() || '';

  switch (normalized) {
    case 'onsite':
    case 'remote':
    case 'hybrid':
      return normalized;
    default:
      return null;
  }
}

function normalizePostedWithinFilter(value: string | null): JobPostedWithinFilter {
  const normalized = value?.trim().toLowerCase() || '';

  switch (normalized) {
    case '24h':
    case '3d':
    case '1w':
    case '1m':
      return normalized;
    default:
      return 'anytime';
  }
}

function normalizeFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeSalaryFilter(value: string | null): number | null {
  const parsed = normalizeFiniteNumber(value);

  if (parsed === null || parsed < 0) {
    return null;
  }

  return parsed;
}

function normalizeCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed));
    }
  }

  return 0;
}

function resolvePostedAfterDate(filter: JobPostedWithinFilter): Date | null {
  const now = Date.now();

  switch (filter) {
    case '24h':
      return new Date(now - 24 * 60 * 60 * 1000);
    case '3d':
      return new Date(now - 3 * 24 * 60 * 60 * 1000);
    case '1w':
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case '1m':
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

function createEmptyCounts(): JobsApiCounts {
  return {
    all: 0,
    job: 0,
    internship_education: 0,
    internship_professional: 0,
    gig: 0,
  };
}

function deriveCountsFromJobs(jobs: PublicJobSearchRow[]): JobsApiCounts {
  return jobs.reduce<JobsApiCounts>(
    (counts, job) => {
      counts.all += 1;

      if (job.job_type === 'internship' && job.internship_track === 'education') {
        counts.internship_education += 1;
        return counts;
      }

      if (job.job_type === 'internship' && job.internship_track === 'professional') {
        counts.internship_professional += 1;
        return counts;
      }

      if (job.job_type === 'gig') {
        counts.gig += 1;
        return counts;
      }

      counts.job += 1;
      return counts;
    },
    createEmptyCounts()
  );
}

function getTimestamp(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveSalaryBounds(job: Pick<PublicJobSearchRow, 'salary' | 'salary_min' | 'salary_max'>) {
  const min = normalizeFiniteNumber(job.salary_min);
  const max = normalizeFiniteNumber(job.salary_max);
  const legacy = normalizeFiniteNumber(job.salary);

  const lower = min ?? max ?? legacy;
  const upper = max ?? min ?? legacy;

  if (lower === null || upper === null) {
    return null;
  }

  return {
    min: Math.min(lower, upper),
    max: Math.max(lower, upper),
  };
}

function matchesSalaryFilter(
  job: Pick<PublicJobSearchRow, 'salary' | 'salary_min' | 'salary_max'>,
  minimumSalary: number | null,
  maximumSalary: number | null
) {
  if (minimumSalary === null && maximumSalary === null) {
    return true;
  }

  const bounds = resolveSalaryBounds(job);
  if (!bounds) {
    return false;
  }

  if (minimumSalary !== null && bounds.max < minimumSalary) {
    return false;
  }

  if (maximumSalary !== null && bounds.min > maximumSalary) {
    return false;
  }

  return true;
}

function matchesBrowseType(
  browseType: JobBrowseFilter,
  job: Pick<PublicJobSearchRow, 'job_type' | 'internship_track'>
) {
  if (browseType === 'all') {
    return true;
  }

  if (browseType === 'gig') {
    return job.job_type === 'gig';
  }

  if (browseType === 'internship_education') {
    return job.job_type === 'internship' && job.internship_track === 'education';
  }

  if (browseType === 'internship_professional') {
    return job.job_type === 'internship' && job.internship_track === 'professional';
  }

  return job.job_type !== 'gig' && job.job_type !== 'internship';
}

function sortPublicJobs(rows: PublicJobSearchRow[]) {
  return [...rows].sort((left, right) => getTimestamp(right.created_at) - getTimestamp(left.created_at));
}

function normalizeJobRows(
  rows: PublicJobSearchRow[],
  { languageFilter, postedAfterTimestamp, minimumSalary, maximumSalary }: PublicJobFilterOptions
) {
  return sortPublicJobs(
    rows
      .map((job) => ({
        ...job,
        language: resolveJobLanguage(job.language, job.title, job.description),
      }))
      .filter((job) => isJobPubliclyListable(job))
      .filter((job) => !languageFilter || job.language === languageFilter)
      .filter((job) => !postedAfterTimestamp || getTimestamp(job.created_at) >= postedAfterTimestamp)
      .filter((job) => matchesSalaryFilter(job, minimumSalary, maximumSalary))
  );
}

function sliceJobsForPage(rows: PublicJobSearchRow[], offset: number, limit: number) {
  return rows.slice(offset, offset + limit);
}

function selectPublicJobColumns(includeLanguage = true) {
  return [
    'id',
    'title',
    'description',
    'location',
    'salary',
    'salary_min',
    'salary_max',
    'salary_currency',
    'salary_period',
    'company_name',
    'company_logo_url',
    'work_type',
    'job_type',
    includeLanguage ? 'language' : null,
    'created_at',
    'closes_at',
    'lifecycle_status',
    'visibility',
    'published',
    'approval_status',
    'apply_method',
    'external_apply_url',
    'image_url',
    'internship_track',
    'boost_until',
    'origin_type',
    'source_attribution_json',
  ]
    .filter(Boolean)
    .join(', ');
}

// Handle GET /api/jobs and POST /api/jobs
export async function GET(request: NextRequest) {
  const supabase = createServiceSupabaseClient();
  const { searchParams } = request.nextUrl;
  const preferredLocale = resolveLocalePreference({
    queryLocale: searchParams.get('preferred_language'),
    cookieLocale: request.cookies.get(LOCALE_COOKIE_NAME)?.value,
    acceptLanguage: request.headers.get('accept-language'),
  });
  const languageFilter = normalizeLocale(searchParams.get('language'));
  const search =
    searchParams.get('title')?.trim() ||
    searchParams.get('q')?.trim() ||
    searchParams.get('search')?.trim() ||
    '';
  const locationFilter = searchParams.get('location')?.trim() || '';
  const workTypeFilter = normalizeWorkTypeFilter(
    searchParams.get('work_type') || (searchParams.get('remote') === '1' ? 'remote' : null)
  );
  const jobTypeFilter = searchParams.get('job_type')?.trim() || '';
  const browseType = normalizeBrowseType(searchParams.get('browse_type'));
  const postedWithinFilter = normalizePostedWithinFilter(searchParams.get('date_posted'));
  const postedAfterDate = resolvePostedAfterDate(postedWithinFilter);
  const postedAfterTimestamp = postedAfterDate?.getTime() ?? null;
  const postedAfterIso = postedAfterDate?.toISOString() ?? null;

  let minimumSalary = normalizeSalaryFilter(searchParams.get('salary_min'));
  let maximumSalary = normalizeSalaryFilter(searchParams.get('salary_max'));

  if (minimumSalary !== null && maximumSalary !== null && minimumSalary > maximumSalary) {
    [minimumSalary, maximumSalary] = [maximumSalary, minimumSalary];
  }

  const publicJobFilters: PublicJobFilterOptions = {
    languageFilter,
    postedAfterTimestamp,
    minimumSalary,
    maximumSalary,
  };

  // Pagination — default 50, max 200
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

  let payload: PublicJobsResponsePayload | null = null;

  const rpcParams = {
    p_search: search || null,
    p_location: locationFilter || null,
    p_work_type: workTypeFilter || null,
    p_job_type: jobTypeFilter || null,
    p_language: languageFilter,
    p_preferred_language: preferredLocale,
    p_browse_type: browseType,
    p_posted_after: postedAfterIso,
    p_salary_min: minimumSalary,
    p_salary_max: maximumSalary,
    p_limit: limit,
    p_offset: offset,
  };

  const [jobsRpcResult, countsRpcResult] = await Promise.all([
    supabase.rpc('search_public_jobs', rpcParams),
    supabase.rpc('search_public_job_counts', {
      p_search: search || null,
      p_location: locationFilter || null,
      p_work_type: workTypeFilter || null,
      p_job_type: jobTypeFilter || null,
      p_language: languageFilter,
      p_browse_type: browseType,
      p_posted_after: postedAfterIso,
      p_salary_min: minimumSalary,
      p_salary_max: maximumSalary,
    }),
  ]);

  const rpcJobsError = jobsRpcResult.error;
  const rpcCountsError = countsRpcResult.error;

  if (!rpcJobsError && !rpcCountsError) {
    const jobs = normalizeJobRows(
      ((jobsRpcResult.data as unknown as PublicJobSearchRow[] | null) || []),
      publicJobFilters
    );
    const countRow =
      ((countsRpcResult.data as unknown as PublicJobCountsRow[] | null) || [])[0] || null;

    payload = {
      jobs,
      total: normalizeCount(countRow?.total_count),
      counts: {
        all: normalizeCount(countRow?.all_count),
        job: normalizeCount(countRow?.job_count),
        internship_education: normalizeCount(countRow?.internship_education_count),
        internship_professional: normalizeCount(countRow?.internship_professional_count),
        gig: normalizeCount(countRow?.gig_count),
      },
    };
  } else {
    let legacyQuery = supabase
      .from('jobs')
      .select(selectPublicJobColumns())
      .eq('published', true)
      .eq('approval_status', 'approved')
      .eq('visibility', 'public')
      .eq('lifecycle_status', 'live')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (search) {
      legacyQuery = legacyQuery.or(
        `title.ilike.%${search}%,company_name.ilike.%${search}%,description.ilike.%${search}%`
      );
    }
    if (locationFilter) {
      legacyQuery = legacyQuery.ilike('location', `%${locationFilter}%`);
    }
    if (workTypeFilter) {
      legacyQuery = legacyQuery.eq('work_type', workTypeFilter);
    }
    if (jobTypeFilter) {
      legacyQuery = legacyQuery.eq('job_type', jobTypeFilter);
    }
    if (postedAfterIso) {
      legacyQuery = legacyQuery.gte('created_at', postedAfterIso);
    }

    const { data: legacyJobs, error: legacyError } = await legacyQuery;
    if (legacyError) {
      const errorMessage =
        rpcJobsError?.message ||
        rpcCountsError?.message ||
        legacyError.message;
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    const filteredJobs = normalizeJobRows(
      ((legacyJobs as unknown as PublicJobSearchRow[] | null) || []),
      publicJobFilters
    );
    const counts = deriveCountsFromJobs(filteredJobs);
    const browseFilteredJobs = filteredJobs.filter((job) => matchesBrowseType(browseType, job));

    payload = {
      jobs: sliceJobsForPage(browseFilteredJobs, offset, limit),
      total: browseFilteredJobs.length,
      counts,
    };

    if (
      (rpcJobsError && !isMissingJobLanguageColumnError(rpcJobsError)) ||
      (rpcCountsError && !isMissingJobLanguageColumnError(rpcCountsError))
    ) {
      console.error('Falling back to legacy public job query', {
        jobsRpcError: rpcJobsError,
        countsRpcError: rpcCountsError,
      });
    }
  }

  const response = NextResponse.json({
    jobs: payload.jobs,
    total: payload.total,
    limit,
    offset,
    counts: payload.counts,
  });
  response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  return response;
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  // Ensure the user is authenticated
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, admin_type')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Unable to verify posting permissions' }, { status: 403 });
  }

  const isRecruiter = profile.role === 'recruiter';
  const isActiveAdmin = Boolean(
    profile.admin_type && ACTIVE_ADMIN_TYPES.includes(profile.admin_type)
  );

  if (!isRecruiter && !isActiveAdmin) {
    return NextResponse.json({ error: 'Recruiter or admin access required' }, { status: 403 });
  }

  if (isRecruiter) {
    const { data: recruiterProfile, error: recruiterLookupError } = await supabase
      .from('recruiters')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (recruiterLookupError || !recruiterProfile) {
      return NextResponse.json(
        { error: 'Recruiter account profile required before posting jobs' },
        { status: 403 }
      );
    }

    // Free first job post: count existing jobs by this recruiter.
    // If they have 0 jobs, allow posting without a subscription.
    const { count: existingJobCount } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('recruiter_id', user.id);

    const hasFreePost = (existingJobCount ?? 0) === 0;

    if (!hasFreePost) {
      try {
        await requireActiveSubscription(user.id, 'recruiter');
      } catch {
        return NextResponse.json(
          {
            error:
              'You have used your free job post. Activate a recruiter plan in Billing to post more jobs.',
          },
          { status: 403 }
        );
      }
    }
  }

  // Parse request body
  const body = await request.json();
  const {
    title,
    description,
    location,
    salary,
    salaryMin,
    salaryMax,
    salaryCurrency,
    salaryPeriod,
    companyName,
    companyLogoUrl,
    workType,
    jobType,
    visibility,
    customQuestions,
    applyMethod,
    applyIntakeMode,
    externalApplyUrl,
    applyEmail,
    applyPhone,
    applyWhatsapp,
    closesAt,
    targetHireDate,
    waAiScreeningEnabled,
    recruiterId,
    internshipTrack,
    eligibleRoles,
    internshipRequirements,
  } = body;

  const requestedRecruiterId = normalizeOptionalId(recruiterId);

  if (!title || !description) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  let normalizedClosesAt: string | null = null;
  if (typeof closesAt === 'string' && closesAt.trim()) {
    const parsed = new Date(closesAt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Application deadline is invalid' }, { status: 400 });
    }
    if (parsed.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: 'Application deadline must be in the future' },
        { status: 400 }
      );
    }
    normalizedClosesAt = parsed.toISOString();
  }

  let normalizedTargetHireDate: string | null = null;
  if (typeof targetHireDate === 'string' && targetHireDate.trim()) {
    const parsed = new Date(targetHireDate);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Target hire date is invalid' }, { status: 400 });
    }
    normalizedTargetHireDate = targetHireDate.trim();
  }

  const opportunityValidation = validateOpportunityConfiguration({
    jobType,
    visibility,
    internshipTrack,
    eligibleRoles,
    applyMethod,
    applyIntakeMode,
    internshipRequirements,
  });

  if (!opportunityValidation.valid) {
    return NextResponse.json(
      { error: opportunityValidation.errors.join(' ') },
      { status: 400 }
    );
  }

  if (!isActiveAdmin && requestedRecruiterId && requestedRecruiterId !== user.id) {
    return NextResponse.json(
      { error: 'Only admins can post jobs on behalf of another recruiter' },
      { status: 403 }
    );
  }

  let assignedRecruiterId = user.id;

  if (isActiveAdmin && requestedRecruiterId && requestedRecruiterId !== user.id) {
    const { data: recruiterUser, error: recruiterUserError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', requestedRecruiterId)
      .maybeSingle();

    if (recruiterUserError || !recruiterUser || recruiterUser.role !== 'recruiter') {
      return NextResponse.json(
        { error: 'Selected recruiter is invalid or does not have a recruiter account' },
        { status: 400 }
      );
    }

    const { data: recruiterRecord, error: recruiterRecordError } = await supabase
      .from('recruiters')
      .select('id')
      .eq('id', requestedRecruiterId)
      .maybeSingle();

    if (recruiterRecordError || !recruiterRecord) {
      return NextResponse.json(
        { error: 'Selected recruiter must complete recruiter setup before being assigned jobs' },
        { status: 400 }
      );
    }

    assignedRecruiterId = requestedRecruiterId;
  }

  if (isActiveAdmin && assignedRecruiterId === user.id) {
    const { data: recruiterProfile } = await supabase
      .from('recruiters')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!recruiterProfile) {
      const { error: recruiterError } = await supabase.from('recruiters').insert({
        id: user.id,
        company_name: companyName || 'Joblinca',
        verified: true,
      });

      if (recruiterError) {
        return NextResponse.json(
          { error: recruiterError.message || 'Unable to prepare admin posting profile' },
          { status: 500 }
        );
      }
    }
  }

  // Scam detection: score the job content
  const scamResult = checkJobForScam(title, description || '', companyName || null);
  const language = resolveJobLanguage(body.language, title, description);

  // Fast approval path: clean posts from verified recruiters (or companies
  // with verified reputation) publish immediately instead of waiting in the
  // manual queue. Fails closed — errors route back to review.
  let recruiterFastApproved = false;
  if (isRecruiter && !isActiveAdmin) {
    recruiterFastApproved = await evaluateFastApproval(createServiceSupabaseClient(), {
      recruiterId: assignedRecruiterId,
      companyName: companyName || null,
      scamSuspicious: scamResult.isSuspicious,
    });
  }

  const shouldPublishImmediately =
    (isActiveAdmin && !scamResult.isSuspicious) || recruiterFastApproved;
  const approvalStatus = shouldPublishImmediately ? 'approved' : 'pending';
  const lifecycleStatus = resolveJobLifecycleStatus({
    published: shouldPublishImmediately,
    approval_status: approvalStatus,
    closes_at: normalizedClosesAt,
    removed_at: null,
    archived_at: null,
    filled_at: null,
  });

  const insertPayload = {
    title,
    description,
    language,
    location,
    salary: salary ? Number(salary) : (salaryMin ? Number(salaryMin) : null),
    salary_min: salaryMin ? Number(salaryMin) : null,
    salary_max: salaryMax ? Number(salaryMax) : null,
    salary_currency: (salaryCurrency || 'XAF').toString().toUpperCase(),
    salary_period: (() => {
      const p = (salaryPeriod || 'MONTH').toString().toUpperCase();
      return ['HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR'].includes(p) ? p : 'MONTH';
    })(),
    recruiter_id: assignedRecruiterId,
    published: shouldPublishImmediately,
    approval_status: approvalStatus,
    lifecycle_status: lifecycleStatus,
    scam_score: scamResult.score,
    approved_at: shouldPublishImmediately ? new Date().toISOString() : null,
    approved_by: isActiveAdmin ? user.id : null,
    posted_by: user.id,
    posted_by_role: isActiveAdmin ? `admin_${profile.admin_type}` : 'recruiter',
    company_name: companyName || null,
    company_logo_url: companyLogoUrl || null,
    work_type: workType || 'onsite',
    job_type: opportunityValidation.normalized.jobType,
    internship_track: opportunityValidation.normalized.internshipTrack,
    visibility: opportunityValidation.normalized.visibility,
    eligible_roles: opportunityValidation.normalized.eligibleRoles,
    custom_questions: customQuestions || null,
    apply_method: applyMethod || 'joblinca',
    apply_intake_mode: opportunityValidation.normalized.applyIntakeMode,
    external_apply_url: externalApplyUrl || null,
    apply_email: applyEmail || null,
    apply_phone: applyPhone || null,
    apply_whatsapp: applyWhatsapp || null,
    closes_at: normalizedClosesAt,
    target_hire_date: normalizedTargetHireDate,
    wa_ai_screening_enabled:
      typeof waAiScreeningEnabled === 'boolean' ? waAiScreeningEnabled : null,
  };

  let { data: insertedJob, error } = await supabase
    .from('jobs')
    .insert(insertPayload)
    .select('*')
    .single();

  if (isMissingJobLanguageColumnError(error)) {
    const { language: _language, ...fallbackInsertPayload } = insertPayload;
    const fallbackResult = await supabase
      .from('jobs')
      .insert(fallbackInsertPayload)
      .select('*')
      .single();

    insertedJob = fallbackResult.data;
    error = fallbackResult.error;
  }
  if (error || !insertedJob) {
    return NextResponse.json({ error: error?.message || 'Failed to create job' }, { status: 500 });
  }

  const metadataResult = await persistJobOpportunityMetadata(
    supabase as any,
    insertedJob.id,
    opportunityValidation.normalized
  );

  if (metadataResult.error) {
    console.error('Failed to persist opportunity metadata', metadataResult.error);
    return NextResponse.json(
      { error: metadataResult.error.message || 'Failed to save internship configuration' },
      { status: 500 }
    );
  }
  if (isJobPubliclyListable(insertedJob)) {
    try {
      await dispatchJobMatchNotifications({
        jobId: insertedJob.id,
        trigger: 'job_posted',
      });
    } catch (matchError) {
      console.error('Job matching dispatch failed after job create', matchError);
    }
  }

  // Tell admins a job is waiting instead of letting the queue rot silently
  if (approvalStatus === 'pending') {
    try {
      await sendAdminWhatsAppAlert(
        `📋 New job pending approval${scamResult.isSuspicious ? ' (⚠️ flagged by scam check)' : ''}:\n` +
          `"${title}" — ${companyName || 'no company stated'}\n` +
          `Review: ${new URL(request.url).origin}/admin/jobs`
      );
    } catch (alertError) {
      console.error('Pending-job admin alert failed (non-fatal)', alertError);
    }
  }

  return NextResponse.json({
    id: insertedJob.id,
    autoApproved: shouldPublishImmediately,
    ...(scamResult.isSuspicious && {
      warning: 'This job was flagged for review due to suspicious content. It will be visible once approved by an admin.',
    }),
  }, { status: 201 });
}
